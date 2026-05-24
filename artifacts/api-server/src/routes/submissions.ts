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

  // Always call the api-server on its loopback address — never go through the
  // external proxy (which uses TLS and would self-loop). This is identical to
  // what the wallet-detail page does via React Query: hit /api/wallets/:chain/:address/*
  // on the same process that already handles those routes.
  const apiBase = `http://127.0.0.1:${process.env["PORT"] ?? 8080}`;

  // ── Types matching the actual OpenAPI GetWalletTransactionsResponse fields ──
  type TxRow = {
    hash: string; from: string; to: string | null;
    value: string; valueUsd: number; fee: string; feeUsd: number;
    timestamp: string; blockNumber: number; status: string;
    direction: string; tokenSymbol: string | null; tokenName: string | null;
    memo?: string | null; destinationTag?: number | null;
  };
  type ChainResult = {
    chain: string; balance: string | null; balanceUsd: number | null; txCount: number;
    riskScore: number | null; tags: string[]; firstSeen: string | null; lastSeen: string | null;
    recentTxs: TxRow[]; error?: string;
  };
  type ConnNode = { address: string; label: string | null; balance: string; transactionCount: number; isContract: boolean; riskScore: number | null };
  type ConnEdge = { from: string; to: string; totalValue: string; totalValueUsd: number; transactionCount: number; lastSeen: string };
  type ConnectionGraph = { nodes: ConnNode[]; edges: ConnEdge[]; centerAddress: string } | null;

  // ── Reuse existing proven wallet info + transactions endpoints ─────────────
  async function fetchChain(address: string, chain: string): Promise<ChainResult> {
    try {
      const [infoRes, txRes] = await Promise.all([
        fetch(`${apiBase}/api/wallets/${encodeURIComponent(address)}?chain=${chain}`).then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch(`${apiBase}/api/wallets/${encodeURIComponent(address)}/transactions?chain=${chain}&limit=30`).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const info: any = infoRes;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txData: any = txRes;
      return {
        chain,
        balance: info?.balance ?? null,
        balanceUsd: info?.balanceUsd ?? null,
        txCount: info?.transactionCount ?? info?.txCount ?? 0,
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

  // ── Reuse existing connections endpoint for hop-by-hop tracing ─────────────
  // This is the SAME endpoint used by the Trace Graph and START TRAIL TRACE.
  // Path: /api/wallets/:address/connections?chain=:chain (no chain in path segment)
  async function fetchConnections(address: string, chain: string): Promise<ConnectionGraph> {
    try {
      const res = await fetch(`${apiBase}/api/wallets/${encodeURIComponent(address)}/connections?chain=${chain}`);
      if (!res.ok) return null;
      return await res.json() as ConnectionGraph;
    } catch { return null; }
  }

  // ── Run all fetches in parallel (same as trace buttons do concurrently) ─────
  const [victimChains, suspectChains, victimConnRaw, suspectConnRaw] = await Promise.all([
    Promise.all(chains.map((c) => fetchChain(sub.victimWallet, c))),
    Promise.all(chains.map((c) => fetchChain(sub.thiefWallet, c))),
    Promise.all(chains.map((c) => fetchConnections(sub.victimWallet, c).then((d) => ({ chain: c, data: d })))),
    Promise.all(chains.map((c) => fetchConnections(sub.thiefWallet, c).then((d) => ({ chain: c, data: d })))),
  ]);

  const victimConnections: Record<string, ConnectionGraph> = {};
  for (const { chain, data } of victimConnRaw) victimConnections[chain] = data;
  const suspectConnections: Record<string, ConnectionGraph> = {};
  for (const { chain, data } of suspectConnRaw) suspectConnections[chain] = data;

  // ── Auto-generate key findings using all data sources ─────────────────────
  const findings: string[] = [];

  const suspectHighRisk = suspectChains.find((c) => (c.riskScore ?? 0) > 60);
  if (suspectHighRisk) findings.push(`⚠️ Suspect wallet has elevated risk score (${suspectHighRisk.riskScore}/100) on ${suspectHighRisk.chain.toUpperCase()}.`);

  const exchangeTag = suspectChains.find((c) => c.tags.includes("exchange"));
  if (exchangeTag) findings.push(`🏦 Suspect wallet is flagged as an exchange-linked address on ${exchangeTag.chain.toUpperCase()}.`);

  const highActivity = suspectChains.find((c) => c.txCount > 500);
  if (highActivity) findings.push(`📊 Suspect wallet shows high transaction volume (${highActivity.txCount.toLocaleString()} txs) on ${highActivity.chain.toUpperCase()}.`);

  // Exchange flows detected via connections hop data
  for (const [chain, conn] of Object.entries(suspectConnections)) {
    if (!conn) continue;
    const exchangeNodes = conn.nodes.filter((n) => n.label && n.address !== sub.thiefWallet);
    if (exchangeNodes.length > 0) {
      findings.push(`🏦 Suspect wallet on ${chain.toUpperCase()} has direct connections to ${exchangeNodes.length} labelled exchange/known address(es): ${exchangeNodes.map((n) => n.label).join(", ")}.`);
      break;
    }
  }

  // Counterparty overlap between victim and suspect tx histories
  const victimCPs = new Set(
    victimChains.flatMap((c) => c.recentTxs.map((t) => t.direction === "in" ? t.from : (t.to ?? ""))).filter(Boolean)
  );
  const suspectCPs = suspectChains.flatMap((c) => c.recentTxs.map((t) => t.direction === "in" ? t.from : (t.to ?? ""))).filter(Boolean);
  const txOverlap = suspectCPs.filter((cp) => victimCPs.has(cp));

  // Also check connection graph overlap
  const victimConnNodes = new Set(
    Object.values(victimConnections).flatMap((g) => g ? g.nodes.map((n) => n.address) : [])
  );
  const suspectConnNodeAddrs = Object.values(suspectConnections).flatMap((g) => g ? g.nodes.map((n) => n.address) : []);
  const connOverlap = suspectConnNodeAddrs.filter((a) => victimConnNodes.has(a) && a !== sub.victimWallet && a !== sub.thiefWallet);

  const totalOverlap = new Set([...txOverlap, ...connOverlap]);
  if (totalOverlap.size > 0) findings.push(`🔗 Commingling detected: ${totalOverlap.size} shared address(es) appear in both victim and suspect transaction graphs.`);

  // Outbound from victim (using correct field names from GetWalletTransactionsResponse)
  const victimOutbound = victimChains.flatMap((c) => c.recentTxs.filter((t) => t.direction === "out" && t.valueUsd > 0));
  const totalStolenUsd = victimOutbound.reduce((acc, t) => acc + (t.valueUsd ?? 0), 0);
  if (totalStolenUsd > 0) findings.push(`💸 Victim wallet shows $${totalStolenUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} USD in outbound transfers across recent ${chains.join("/").toUpperCase()} activity.`);

  if (txHashes.length > 0) findings.push(`🔍 ${txHashes.length} transaction hash(es) flagged by submitter for direct verification.`);

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
    victimConnections,
    suspectConnections,
    keyFindings: findings,
  });
});

export default router;
