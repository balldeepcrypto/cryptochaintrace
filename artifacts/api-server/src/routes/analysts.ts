import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { db, analystsTable, activityLogsTable } from "@workspace/db";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Supabase anon client — used for JWT verification and OTP invites only.
// No admin/service-role key needed anywhere in this file.
// ---------------------------------------------------------------------------
function getSupabaseUrl(): string {
  const explicit = (process.env["SUPABASE_URL"] ?? "").replace(/\/+$/, "");
  if (explicit.startsWith("http")) return explicit;
  const a = process.env["VITE_SUPABASE_URL"] ?? "";
  const b = process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
  // In Replit the two vars are swapped — detect by which one starts with http
  if (b.replace(/\/+$/, "").startsWith("http")) return b.replace(/\/+$/, "");
  if (a.replace(/\/+$/, "").startsWith("http")) return a.replace(/\/+$/, "");
  return "";
}

function getAnonKey(): string {
  const a = process.env["VITE_SUPABASE_URL"] ?? "";
  const b = process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
  if (!a.startsWith("http") && a.length > 10) return a;
  if (!b.startsWith("http") && b.length > 10) return b;
  return "";
}

function getAnonClient() {
  const url = getSupabaseUrl();
  const key = getAnonKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ---------------------------------------------------------------------------
// Owner guard — verifies the JWT from Authorization header and checks that
// the caller's email matches ADMIN_EMAIL. Returns true if allowed.
// ---------------------------------------------------------------------------
async function requireOwner(req: Request, res: Response): Promise<boolean> {
  const adminEmail = (process.env["ADMIN_EMAIL"] ?? "").toLowerCase().trim();
  if (!adminEmail) {
    res.status(500).json({ error: "server_config", message: "ADMIN_EMAIL is not set on the server." });
    return false;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "No Bearer token provided." });
    return false;
  }

  const client = getAnonClient();
  if (!client) {
    res.status(500).json({ error: "server_config", message: "Supabase is not configured." });
    return false;
  }

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired token." });
    return false;
  }

  if ((data.user.email ?? "").toLowerCase() !== adminEmail) {
    res.status(403).json({ error: "forbidden", message: "Only the owner can manage analysts." });
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// GET /api/analysts — list from Supabase analysts table (simple, no join)
// ---------------------------------------------------------------------------
router.get("/analysts", async (req, res): Promise<void> => {
  if (!await requireOwner(req, res)) return;

  const supabase = getAnonClient();
  if (!supabase) {
    res.status(500).json({ error: "server_config", message: "Supabase is not configured." });
    return;
  }

  const { data, error } = await supabase
    .from("analysts")
    .select("id, email, department, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    req.log.error({ error }, "GET /analysts supabase query failed");
    res.status(500).json({ error: "db_error", message: error.message });
    return;
  }

  res.json(
    (data ?? []).map((r: { id: number; email: string; department: string; created_at: string }) => ({
      id: r.id,
      email: r.email,
      department: r.department,
      createdAt: r.created_at,
      lastLogin: null,
    }))
  );
});

// ---------------------------------------------------------------------------
// POST /api/analysts — add to allowlist via Supabase (simple insert)
// ---------------------------------------------------------------------------
router.post("/analysts", async (req, res): Promise<void> => {
  if (!await requireOwner(req, res)) return;

  const { email, department } = (req.body ?? {}) as { email?: string; department?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const supabase = getAnonClient();
  if (!supabase) {
    res.status(500).json({ error: "server_config", message: "Supabase is not configured." });
    return;
  }

  const { data, error } = await supabase
    .from("analysts")
    .insert({
      email: email.toLowerCase().trim(),
      department: (department ?? "").trim(),
    })
    .select()
    .single();

  if (error) {
    req.log.error({ error }, "POST /analysts supabase insert failed");
    if (error.code === "23505") {
      res.status(409).json({ error: "already_exists", message: "An analyst with that email already exists." });
      return;
    }
    res.status(500).json({ error: "db_error", message: error.message });
    return;
  }

  // Send magic-link invite using the same anon client (no admin key needed)
  const origin = (req.headers["origin"] as string | undefined)
    ?? (req.headers["referer"] as string | undefined)?.replace(/\/[^/]*$/, "")
    ?? "https://cryptochaintrace.com";

  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email: email.toLowerCase().trim(),
    options: { emailRedirectTo: `${origin}/dashboard` },
  });

  const inviteStatus = otpErr ? `otp_failed: ${otpErr.message}` : "invited";
  req.log.info({ email: (data as { email: string }).email, inviteStatus }, "Analyst added");

  res.status(201).json({
    id: (data as { id: number }).id,
    email: (data as { email: string }).email,
    department: (data as { department: string }).department,
    createdAt: (data as { created_at: string }).created_at,
    inviteStatus,
    message: otpErr
      ? `Analyst added successfully. (Email invite failed: ${otpErr.message})`
      : "Analyst added successfully. Magic link email has been sent.",
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/analysts/:id — remove from allowlist + activity logs; no Supabase admin
// ---------------------------------------------------------------------------
router.delete("/analysts/:id", async (req, res): Promise<void> => {
  if (!await requireOwner(req, res)) return;

  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }

  try {
    const [analyst] = await db
      .select()
      .from(analystsTable)
      .where(eq(analystsTable.id, id))
      .limit(1);

    if (!analyst) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    await db.delete(activityLogsTable).where(eq(activityLogsTable.userEmail, analyst.email));
    await db.delete(analystsTable).where(eq(analystsTable.id, id));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "DELETE /analysts/:id failed");
    res.status(500).json({ error: "db_error", message: String(err) });
  }
});

export default router;
