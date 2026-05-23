import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Derive Supabase URL using the same swap-detection as the frontend.
// In Replit, VITE_SUPABASE_ANON_KEY holds the URL and VITE_SUPABASE_URL holds the key.
function getSupabaseConfig(): { url: string; serviceKey: string } | null {
  const rawA = process.env["VITE_SUPABASE_URL"] ?? "";
  const rawB = process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
  const url = (rawA.startsWith("http") ? rawA : rawB).replace(/\/+$/, "");
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

function adminHeaders(serviceKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };
}

// GET /api/analysts — list all Supabase auth users
router.get("/analysts", async (req, res): Promise<void> => {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    res.status(503).json({
      error: "not_configured",
      message: "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to Replit Secrets.",
    });
    return;
  }

  try {
    const r = await fetch(`${cfg.url}/auth/v1/admin/users?per_page=200`, {
      headers: adminHeaders(cfg.serviceKey),
    });
    if (!r.ok) {
      const body = await r.text();
      req.log.warn({ status: r.status, body }, "Supabase admin listUsers failed");
      res.status(r.status).json({ error: "supabase_error", message: body });
      return;
    }
    const data = (await r.json()) as { users?: unknown[] };
    const users = (data.users ?? []) as Array<{
      id: string;
      email?: string;
      user_metadata?: { department?: string };
      app_metadata?: Record<string, unknown>;
      created_at?: string;
      last_sign_in_at?: string;
    }>;

    res.json(
      users.map((u) => ({
        id: u.id,
        email: u.email ?? "",
        department: (u.user_metadata?.department as string) ?? "",
        createdAt: u.created_at ?? null,
        lastSignIn: u.last_sign_in_at ?? null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "GET /analysts fetch failed");
    res.status(500).json({ error: "fetch_failed", message: String(err) });
  }
});

// POST /api/analysts — create user (invite by email with department metadata)
router.post("/analysts", async (req, res): Promise<void> => {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    res.status(503).json({
      error: "not_configured",
      message: "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to Replit Secrets.",
    });
    return;
  }

  const { email, department } = req.body ?? {};
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  try {
    const r = await fetch(`${cfg.url}/auth/v1/admin/users`, {
      method: "POST",
      headers: adminHeaders(cfg.serviceKey),
      body: JSON.stringify({
        email,
        email_confirm: true,
        user_metadata: { department: department ?? "" },
      }),
    });

    const body = await r.json() as Record<string, unknown>;
    if (!r.ok) {
      req.log.warn({ status: r.status, body }, "Supabase admin createUser failed");
      res.status(r.status).json({ error: "supabase_error", message: (body.msg ?? body.message ?? JSON.stringify(body)) as string });
      return;
    }

    const u = body as { id: string; email?: string; user_metadata?: { department?: string } };
    res.status(201).json({
      id: u.id,
      email: u.email ?? "",
      department: (u.user_metadata?.department as string) ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "POST /analysts fetch failed");
    res.status(500).json({ error: "fetch_failed", message: String(err) });
  }
});

// DELETE /api/analysts/:userId — delete user
router.delete("/analysts/:userId", async (req, res): Promise<void> => {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    res.status(503).json({
      error: "not_configured",
      message: "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to Replit Secrets.",
    });
    return;
  }

  try {
    const r = await fetch(`${cfg.url}/auth/v1/admin/users/${req.params.userId}`, {
      method: "DELETE",
      headers: adminHeaders(cfg.serviceKey),
    });

    if (!r.ok && r.status !== 404) {
      const body = await r.text();
      req.log.warn({ status: r.status, body }, "Supabase admin deleteUser failed");
      res.status(r.status).json({ error: "supabase_error", message: body });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "DELETE /analysts/:userId fetch failed");
    res.status(500).json({ error: "fetch_failed", message: String(err) });
  }
});

export default router;
