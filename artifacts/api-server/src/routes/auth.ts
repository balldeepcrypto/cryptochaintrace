import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/auth/dashboard", (req, res): void => {
  const { password } = req.body ?? {};
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) {
    res.status(503).json({ error: "not_configured", message: "DASHBOARD_PASSWORD is not set." });
    return;
  }

  if (!password || password !== expected) {
    res.status(401).json({ ok: false });
    return;
  }

  res.json({ ok: true });
});

export default router;
