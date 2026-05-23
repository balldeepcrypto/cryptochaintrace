import { Router, type IRouter } from "express";
import { db, pool, submissionsTable } from "@workspace/db";
import { sendSubmissionEmails } from "../lib/email.js";

const router: IRouter = Router();

// Ensure the table exists in production — runs once per process start.
// Wrapped in Promise.resolve().then() so any synchronous throw from the
// pool proxy (e.g. missing DATABASE_URL) becomes a handled rejection.
const ensureTable: Promise<void> = Promise.resolve()
  .then(() =>
    pool.query(`
      CREATE TABLE IF NOT EXISTS case_submissions (
        id            SERIAL PRIMARY KEY,
        name          TEXT,
        email         TEXT NOT NULL,
        victim_wallet TEXT NOT NULL,
        thief_wallet  TEXT NOT NULL,
        chains        TEXT NOT NULL,
        tx_hashes     TEXT,
        description   TEXT,
        submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status        TEXT NOT NULL DEFAULT 'pending'
      )
    `)
  )
  .then(() => {
    console.log("[submissions] case_submissions table ensured");
  })
  .catch((err: unknown) => {
    console.error("[submissions] Failed to ensure case_submissions table:", err);
  });

router.get("/submissions", async (req, res): Promise<void> => {
  await ensureTable;
  try {
    const rows = await db
      .select()
      .from(submissionsTable)
      .orderBy(submissionsTable.submittedAt);
    res.json(rows.reverse());
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    req.log.warn({ err }, "GET /submissions failed");
    res.status(503).json({ error: "db_unavailable", message: "Could not load submissions.", detail });
  }
});

router.post("/submissions", async (req, res): Promise<void> => {
  await ensureTable;

  const { name, email, victimWallet, thiefWallet, chains, txHashes, description } = req.body ?? {};

  if (!email || !victimWallet || !thiefWallet || !chains) {
    res.status(400).json({ error: "missing_fields", message: "email, victimWallet, thiefWallet, and chains are required." });
    return;
  }

  try {
    const [row] = await db
      .insert(submissionsTable)
      .values({
        name: name ?? null,
        email,
        victimWallet,
        thiefWallet,
        chains,
        txHashes: txHashes ?? null,
        description: description ?? null,
      })
      .returning();

    // Send emails — await so errors surface in structured logs
    try {
      await sendSubmissionEmails({
        id: row.id,
        name: row.name ?? null,
        email: row.email,
        victimWallet: row.victimWallet,
        thiefWallet: row.thiefWallet,
        chains: row.chains,
        txHashes: row.txHashes ?? null,
        description: row.description ?? null,
      });
      req.log.info({ caseId: row.id }, "[submissions] Emails sent successfully");
    } catch (emailErr) {
      req.log.error({ err: emailErr, caseId: row.id }, "[submissions] Email sending failed");
    }

    res.status(201).json({
      id: row.id,
      submittedAt: row.submittedAt.toISOString(),
      status: row.status,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[submissions] POST /submissions failed:", detail);
    req.log.warn({ err }, "POST /submissions failed");
    res.status(503).json({ error: "db_unavailable", message: "Could not save submission. Please try again.", detail });
  }
});

export default router;
