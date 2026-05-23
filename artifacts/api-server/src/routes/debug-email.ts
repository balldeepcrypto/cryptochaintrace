import { Router, type IRouter } from "express";
import { Resend } from "resend";

const router: IRouter = Router();

// Protected: requires DASHBOARD_PASSWORD query param
// GET /api/debug-email?pw=<DASHBOARD_PASSWORD>
// Returns full Resend API response so we can see exactly what's failing.
router.get("/debug-email", async (req, res): Promise<void> => {
  const pw = req.query["pw"];
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected || pw !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL ?? "cryptotheftvictim@proton.me";
  const from = "CryptoChainTrace <noreply@cryptochaintrace.com>";

  const info = {
    RESEND_API_KEY_set: !!apiKey,
    RESEND_API_KEY_prefix: apiKey ? apiKey.slice(0, 8) + "..." : null,
    ADMIN_EMAIL: adminEmail,
    FROM: from,
    NODE_ENV: process.env.NODE_ENV ?? null,
  };

  if (!apiKey) {
    res.json({ info, error: "RESEND_API_KEY is not set in this environment" });
    return;
  }

  const resend = new Resend(apiKey);

  let autoReplyResult: unknown = null;
  let adminResult: unknown = null;

  try {
    autoReplyResult = await resend.emails.send({
      from,
      to: adminEmail,
      subject: "[DEBUG] CryptoChainTrace email test — auto-reply path",
      text: "This is a test of the auto-reply email path from the debug endpoint.",
    });
  } catch (err) {
    autoReplyResult = { threw: true, message: err instanceof Error ? err.message : String(err) };
  }

  try {
    adminResult = await resend.emails.send({
      from,
      to: adminEmail,
      subject: "[DEBUG] CryptoChainTrace email test — admin notification path",
      text: "This is a test of the admin notification email path from the debug endpoint.",
    });
  } catch (err) {
    adminResult = { threw: true, message: err instanceof Error ? err.message : String(err) };
  }

  res.json({ info, autoReplyResult, adminResult });
});

export default router;
