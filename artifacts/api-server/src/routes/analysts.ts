import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { db, analystsTable, activityLogsTable } from "@workspace/db";

const router: IRouter = Router();

// Derive Supabase URL and anon key using the swap-detection pattern.
// In Replit, VITE_SUPABASE_ANON_KEY holds the URL and VITE_SUPABASE_URL holds the anon key.
// On Vercel/other hosts with normal setup, VITE_SUPABASE_URL holds the URL.
function getSupabaseUrl(): string {
  const explicit = (process.env["SUPABASE_URL"] ?? "").replace(/\/+$/, "");
  if (explicit.startsWith("http")) return explicit;
  const a = process.env["VITE_SUPABASE_URL"] ?? "";
  const b = process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
  const fromB = b.replace(/\/+$/, "");
  const fromA = a.replace(/\/+$/, "");
  if (fromB.startsWith("http")) return fromB;
  if (fromA.startsWith("http")) return fromA;
  return "";
}

function getAnonKey(): string {
  const a = process.env["VITE_SUPABASE_URL"] ?? "";
  const b = process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
  // Anon key is whichever one does NOT start with http
  if (!a.startsWith("http") && a.length > 10) return a;
  if (!b.startsWith("http") && b.length > 10) return b;
  return "";
}

function getServiceRoleKey(): string {
  return process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
}

// Anon client — used for sending OTP invites (no admin rights needed)
function getAnonClient() {
  const url = getSupabaseUrl();
  const key = getAnonKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Admin client — used ONLY for Supabase auth user deletion (optional)
function getAdminClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// GET /api/analysts — list analysts from our own Postgres DB (no Supabase admin needed)
router.get("/analysts", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: analystsTable.id,
        email: analystsTable.email,
        department: analystsTable.department,
        createdAt: sql<string>`${analystsTable.createdAt}::text`,
        lastLogin: sql<string | null>`max(case when ${activityLogsTable.action} = 'login' then ${activityLogsTable.timestamp} end)::text`,
      })
      .from(analystsTable)
      .leftJoin(
        activityLogsTable,
        eq(activityLogsTable.userEmail, analystsTable.email),
      )
      .groupBy(analystsTable.id)
      .orderBy(desc(analystsTable.createdAt));

    res.json(rows.map((r) => ({
      id: r.id,
      email: r.email,
      department: r.department,
      createdAt: r.createdAt,
      lastLogin: r.lastLogin ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "GET /analysts failed");
    res.status(500).json({ error: "db_error", message: String(err) });
  }
});

// POST /api/analysts — add analyst to allowlist + send magic-link invite
router.post("/analysts", async (req, res): Promise<void> => {
  const { email, department } = req.body ?? {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }

  try {
    // 1. Insert into our Postgres analysts table
    const [row] = await db
      .insert(analystsTable)
      .values({ email: email.trim().toLowerCase(), department: department ? String(department) : "" })
      .onConflictDoUpdate({
        target: analystsTable.email,
        set: { department: department ? String(department) : "" },
      })
      .returning();

    // 2. Send magic-link invite via Supabase anon client (no admin key needed)
    let inviteStatus = "not_sent";
    const anonClient = getAnonClient();
    if (anonClient) {
      const supabaseUrl = getSupabaseUrl();
      const redirectTo = supabaseUrl
        ? `${supabaseUrl.replace(/supabase\.co.*/, "")}`  // fallback
        : "";
      const { error: otpErr } = await anonClient.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: process.env["REPLIT_DOMAINS"]
            ? `https://${process.env["REPLIT_DOMAINS"]!.split(",")[0]}/dashboard`
            : "https://cryptochaintrace.com/dashboard",
        },
      });
      inviteStatus = otpErr ? `otp_failed: ${otpErr.message}` : "invited";
    }

    req.log.info({ email: row.email, inviteStatus }, "Analyst added");
    res.status(201).json({
      id: row.id,
      email: row.email,
      department: row.department,
      createdAt: row.createdAt.toISOString(),
      inviteStatus,
    });
  } catch (err) {
    req.log.error({ err }, "POST /analysts failed");
    const msg = String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "already_exists", message: "An analyst with that email already exists." });
      return;
    }
    res.status(500).json({ error: "db_error", message: msg });
  }
});

// DELETE /api/analysts/:id — remove from allowlist + clean up activity logs
router.delete("/analysts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }

  try {
    // 1. Look up the email first
    const [analyst] = await db
      .select()
      .from(analystsTable)
      .where(eq(analystsTable.id, id))
      .limit(1);

    if (!analyst) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // 2. Delete from our DB (activity logs + analysts table)
    await db.delete(activityLogsTable).where(eq(activityLogsTable.userEmail, analyst.email));
    await db.delete(analystsTable).where(eq(analystsTable.id, id));

    // 3. Optionally delete from Supabase auth (best-effort — only if service role key is set)
    const adminClient = getAdminClient();
    if (adminClient) {
      try {
        // Find the Supabase user ID by listing and matching email
        const listResult = await adminClient.auth.admin.listUsers({ perPage: 200 });
        if (!listResult.error && listResult.data) {
          const match = listResult.data.users.find((u) => u.email === analyst.email);
          if (match) await adminClient.auth.admin.deleteUser(match.id);
        }
      } catch {
        // Best-effort only — don't fail the whole request
      }
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "DELETE /analysts/:id failed");
    res.status(500).json({ error: "db_error", message: String(err) });
  }
});

export default router;
