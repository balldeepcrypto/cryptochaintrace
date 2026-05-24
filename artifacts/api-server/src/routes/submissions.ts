import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pool, submissionsTable } from "@workspace/db";
import { sendSubmissionEmails } from "../lib/email.js";

const router: IRouter = Router();

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

router.patch("/submissions/:id", async (req, res): Promise<void> => {
  await ensureTable;
  const id = Number(req.params["id"]);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const { status } = req.body ?? {};
  if (!status || typeof status !== "string") {
    res.status(400).json({ error: "missing_status" });
    return;
  }
  try {
    const [updated] = await db
      .update(submissionsTable)
      .set({ status })
      .where(eq(submissionsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    req.log.info({ caseId: id, status }, "PATCH /submissions/:id — status updated");
    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    req.log.warn({ err }, "PATCH /submissions/:id failed");
    res.status(503).json({ error: "db_unavailable", detail });
  }
});

router.delete("/submissions/:id", async (req, res): Promise<void> => {
  await ensureTable;
  const id = Number(req.params["id"]);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const [deleted] = await db
      .delete(submissionsTable)
      .where(eq(submissionsTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    req.log.info({ caseId: id }, "DELETE /submissions/:id — case deleted");
    res.json({ deleted: true, id });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    req.log.warn({ err }, "DELETE /submissions/:id failed");
    res.status(503).json({ error: "db_unavailable", detail });
  }
});

// ---------------------------------------------------------------------------
// GET /api/submissions/:id/report — generate full forensic package
// ---------------------------------------------------------------------------
router.get("/submissions/:id/report", async (req, res): Promise<void> => {
  await ensureTable;
  const id = Number(req.params["id"]);
  if (!id || isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }

  const [sub] = await db.select().from(submissionsTable).where(eq(submissionsTable.id, id)).limit(1);
  if (!sub) { res.status(404).json({ error: "not_found" }); return; }

  const chains = sub.chains.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const txHashes = (sub.txHashes ?? "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

  // Build base URL from the incoming request so this works locally and on Vercel
  const proto = (req.get("x-forwarded-proto") as string | undefined) ?? (req.secure ? "https" : "http");
  const host = req.get("host") ?? `localhost:${process.env["PORT"] ?? 8080}`;
  const apiBase = `${proto}://${host}`;

  type TxRow = {
    txHash: string; direction: string; amount: string; amountUsd: number | null;
    tokenSymbol: string | null; counterparty: string | null; timestamp: string | null; status: string;
  };
  type ChainResult = {
    chain: string; balance: string | null; balanceUsd: number | null; txCount: number;
    riskScore: number | null; tags: string[]; firstSeen: string | null; lastSeen: string | null;
    recentTxs: TxRow[]; error?: string;
  };

  async function fetchChain(address: string, chain: string): Promise<ChainResult> {
    try {
      const [infoRes, txRes] = await Promise.all([
        fetch(`${apiBase}/api/wallets/${chain}/${address}/info`).then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch(`${apiBase}/api/wallets/${chain}/${address}/transactions?limit=30`).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info: any = infoRes;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txData: any = txRes;
      return {
        chain,
        balance: info?.balance ?? null,
        balanceUsd: info?.balanceUsd ?? null,
        txCount: info?.txCount ?? 0,
        riskScore: info?.riskScore ?? null,
        tags: info?.tags ?? [],
        firstSeen: info?.firstSeen ?? null,
        lastSeen: info?.lastSeen ?? null,
        recentTxs: (txData?.transactions ?? []).slice(0, 20) as TxRow[],
      };
    } catch (err) {
      return { chain, balance: null, balanceUsd: null, txCount: 0, riskScore: null, tags: [], firstSeen: null, lastSeen: null, recentTxs: [], error: String(err) };
    }
  }

  const [victimChains, suspectChains] = await Promise.all([
    Promise.all(chains.map((c) => fetchChain(sub.victimWallet, c))),
    Promise.all(chains.map((c) => fetchChain(sub.thiefWallet, c))),
  ]);

  // Auto-generate key findings
  const findings: string[] = [];
  const suspectHighRisk = suspectChains.find((c) => (c.riskScore ?? 0) > 60);
  if (suspectHighRisk) findings.push(`⚠️ Suspect wallet has elevated risk score (${suspectHighRisk.riskScore}/100) on ${suspectHighRisk.chain.toUpperCase()}.`);

  const exchangeTag = suspectChains.find((c) => c.tags.includes("exchange"));
  if (exchangeTag) findings.push(`🏦 Suspect wallet is flagged as an exchange-linked address on ${exchangeTag.chain.toUpperCase()}.`);

  const highActivity = suspectChains.find((c) => c.txCount > 500);
  if (highActivity) findings.push(`📊 Suspect wallet shows high transaction volume (${highActivity.txCount.toLocaleString()} txs) on ${highActivity.chain.toUpperCase()}.`);

  // Counterparty overlap
  const victimCounterparties = new Set(victimChains.flatMap((c) => c.recentTxs.map((t) => t.counterparty)).filter(Boolean));
  const suspectCounterparties = suspectChains.flatMap((c) => c.recentTxs.map((t) => t.counterparty)).filter(Boolean);
  const overlap = suspectCounterparties.filter((cp) => victimCounterparties.has(cp));
  if (overlap.length > 0) findings.push(`🔗 Commingling detected: ${overlap.length} shared counterparty address(es) appear in both victim and suspect transaction histories.`);

  // Outbound from victim
  const victimOutbound = victimChains.flatMap((c) => c.recentTxs.filter((t) => t.direction === "out" && t.amountUsd));
  const totalStolenUsd = victimOutbound.reduce((acc, t) => acc + (t.amountUsd ?? 0), 0);
  if (totalStolenUsd > 0) findings.push(`💸 Victim wallet shows $${totalStolenUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} USD in outbound transfers (recent ${chains.join("/").toUpperCase()} activity).`);

  if (txHashes.length > 0) findings.push(`🔍 ${txHashes.length} specific transaction hash(es) flagged in this case for direct verification.`);

  if (findings.length === 0) findings.push("ℹ️ No high-confidence findings from automated analysis. Manual review recommended.");

  res.json({
    caseId: sub.id,
    generatedAt: new Date().toISOString(),
    caseSummary: {
      submitter: { name: sub.name ?? null, email: sub.email },
      chains,
      txHashes,
      description: sub.description ?? null,
      submittedAt: sub.submittedAt.toISOString(),
      status: sub.status,
    },
    victimProfile: { address: sub.victimWallet, role: "victim", chains: victimChains },
    suspectProfile: { address: sub.thiefWallet, role: "suspect", chains: suspectChains },
    keyFindings: findings,
  });
});

export default router;
