import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";

const router: IRouter = Router();

// Build a Supabase admin client using the service role key.
// URL resolution order:
//   1. SUPABASE_URL  (explicit server-only var — most reliable)
//   2. VITE_SUPABASE_ANON_KEY if it starts with "http" (Replit swap: anon slot holds the URL)
//   3. VITE_SUPABASE_URL if it starts with "http" (normal / non-swapped setup)
function getAdminClient() {
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  if (!serviceKey) return null;

  const explicit = process.env["SUPABASE_URL"] ?? "";
  const viteA = process.env["VITE_SUPABASE_URL"] ?? "";
  const viteB = process.env["VITE_SUPABASE_ANON_KEY"] ?? "";

  const url = (
    explicit.startsWith("http") ? explicit :
    viteB.startsWith("http") ? viteB :
    viteA.startsWith("http") ? viteA : ""
  ).replace(/\/+$/, "");

  if (!url) return null;

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// GET /api/analysts — list all Supabase auth users
router.get("/analysts", async (req, res): Promise<void> => {
  const supabase = getAdminClient();
  if (!supabase) {
    res.status(503).json({
      error: "not_configured",
      message: "SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL or VITE_SUPABASE_* vars) must be set.",
    });
    return;
  }

  try {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
    if (error) {
      req.log.warn({ err: error.message, code: error.status }, "Supabase admin listUsers failed");
      res.status(error.status ?? 500).json({ error: "supabase_error", message: error.message });
      return;
    }

    res.json(
      (data.users ?? []).map((u) => ({
        id: u.id,
        email: u.email ?? "",
        department: (u.user_metadata?.["department"] as string) ?? "",
        createdAt: u.created_at ?? null,
        lastSignIn: u.last_sign_in_at ?? null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "GET /analysts threw");
    res.status(500).json({ error: "fetch_failed", message: String(err) });
  }
});

// POST /api/analysts — create user with department metadata
router.post("/analysts", async (req, res): Promise<void> => {
  const supabase = getAdminClient();
  if (!supabase) {
    res.status(503).json({
      error: "not_configured",
      message: "SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL or VITE_SUPABASE_* vars) must be set.",
    });
    return;
  }

  const { email, department } = req.body ?? {};
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: String(email),
      email_confirm: true,
      user_metadata: { department: department ? String(department) : "" },
    });

    if (error) {
      req.log.warn({ err: error.message }, "Supabase admin createUser failed");
      res.status(error.status ?? 500).json({ error: "supabase_error", message: error.message });
      return;
    }

    res.status(201).json({
      id: data.user.id,
      email: data.user.email ?? "",
      department: (data.user.user_metadata?.["department"] as string) ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "POST /analysts threw");
    res.status(500).json({ error: "fetch_failed", message: String(err) });
  }
});

// DELETE /api/analysts/:userId — delete user
router.delete("/analysts/:userId", async (req, res): Promise<void> => {
  const supabase = getAdminClient();
  if (!supabase) {
    res.status(503).json({
      error: "not_configured",
      message: "SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL or VITE_SUPABASE_* vars) must be set.",
    });
    return;
  }

  try {
    const { error } = await supabase.auth.admin.deleteUser(req.params.userId);
    if (error && error.status !== 404) {
      req.log.warn({ err: error.message }, "Supabase admin deleteUser failed");
      res.status(error.status ?? 500).json({ error: "supabase_error", message: error.message });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "DELETE /analysts threw");
    res.status(500).json({ error: "fetch_failed", message: String(err) });
  }
});

export default router;
