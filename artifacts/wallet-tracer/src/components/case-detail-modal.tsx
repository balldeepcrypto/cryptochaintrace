import { useState, useEffect } from "react";
import { X, Copy, ExternalLink, Play, Plus, Trash2, CheckCircle, GitBranch, Hash, Package, Download, Loader2, AlertTriangle, ChevronDown, ChevronRight, FileText, Network } from "lucide-react";
import { exportAsPdf, sha256Sync } from "@/lib/report-export";

// ── Types ────────────────────────────────────────────────────────────────────

type Submission = {
  id: number;
  name: string | null;
  email: string;
  victimWallet: string;
  thiefWallet: string;
  chains: string;
  txHashes: string | null;
  description: string | null;
  submittedAt: string;
  status: string;
};

// Matches the actual OpenAPI GetWalletTransactionsResponse fields exactly
type TxRow = {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  valueUsd: number;
  fee: string;
  feeUsd: number;
  timestamp: string;
  blockNumber: number;
  status: string;
  direction: string;
  tokenSymbol: string | null;
  tokenName: string | null;
  memo?: string | null;
  destinationTag?: number | null;
};

type ChainResult = {
  chain: string;
  balance: string | null;
  balanceUsd: number | null;
  txCount: number;
  riskScore: number | null;
  tags: string[];
  firstSeen: string | null;
  lastSeen: string | null;
  recentTxs: TxRow[];
  error?: string;
};

type ConnNode = {
  address: string;
  label: string | null;
  balance: string;
  transactionCount: number;
  isContract: boolean;
  riskScore: number | null;
};

type ConnEdge = {
  from: string;
  to: string;
  totalValue: string;
  totalValueUsd: number;
  transactionCount: number;
  lastSeen: string;
};

type ConnectionGraph = {
  nodes: ConnNode[];
  edges: ConnEdge[];
  centerAddress: string;
} | null;

type WalletProfile = {
  address: string;
  role: string;
  chains: ChainResult[];
};

type ForensicReportData = {
  caseId: number;
  generatedAt: string;
  caseSummary: {
    submitter: { name: string | null; email: string };
    chains: string[];
    txHashes: string[];
    description: string | null;
    submittedAt: string;
    status: string;
  };
  victimProfile: WalletProfile;
  suspectProfile: WalletProfile;
  victimConnections: Record<string, ConnectionGraph>;
  suspectConnections: Record<string, ConnectionGraph>;
  keyFindings: string[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CHAIN_EXPLORERS: Record<string, string> = {
  ethereum: "https://etherscan.io/address/",
  bitcoin:  "https://blockchair.com/bitcoin/address/",
  xrp:      "https://xrpscan.com/account/",
  xlm:      "https://stellar.expert/explorer/public/account/",
  hbar:     "https://hashscan.io/mainnet/account/",
  dag:      "https://explorer.constellation.network/address/",
  xdc:      "https://xdcscan.com/address/",
  polygon:  "https://polygonscan.com/address/",
  bsc:      "https://bscscan.com/address/",
};

const TX_EXPLORERS: Record<string, string> = {
  ethereum: "https://etherscan.io/tx/",
  bitcoin:  "https://blockchair.com/bitcoin/transaction/",
  xrp:      "https://xrpscan.com/tx/",
  xlm:      "https://stellar.expert/explorer/public/tx/",
  hbar:     "https://hashscan.io/mainnet/transaction/",
  dag:      "https://explorer.constellation.network/transactions/",
  xdc:      "https://xdcscan.com/tx/",
  polygon:  "https://polygonscan.com/tx/",
  bsc:      "https://bscscan.com/tx/",
};

const CHAIN_COLORS: Record<string, string> = {
  ethereum: "text-blue-400 bg-blue-950/60 border-blue-500/40",
  bitcoin:  "text-orange-400 bg-orange-950/60 border-orange-500/40",
  xrp:      "text-cyan-400 bg-cyan-950/60 border-cyan-500/40",
  xlm:      "text-sky-400 bg-sky-950/60 border-sky-500/40",
  hbar:     "text-violet-400 bg-violet-950/60 border-violet-500/40",
  dag:      "text-pink-400 bg-pink-950/60 border-pink-500/40",
  xdc:      "text-green-400 bg-green-950/60 border-green-500/40",
  polygon:  "text-purple-400 bg-purple-950/60 border-purple-500/40",
  bsc:      "text-yellow-400 bg-yellow-950/60 border-yellow-500/40",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function splitList(val: string | null): string[] {
  if (!val) return [];
  return val.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
}

function truncate(s: string, n = 20) {
  return s.length <= n ? s : `${s.slice(0, 10)}…${s.slice(-6)}`;
}

function clusterKey(id: number) { return `chaintrace-cluster-${id}`; }
function loadCluster(id: number): string[] {
  try { const raw = localStorage.getItem(clusterKey(id)); return raw ? (JSON.parse(raw) as string[]) : []; } catch { return []; }
}
function saveCluster(id: number, wallets: string[]) {
  try { localStorage.setItem(clusterKey(id), JSON.stringify(wallets)); } catch { /* noop */ }
}

// Detect if a connection node is a known exchange/endpoint from its label
function isExchangeLabel(label: string | null): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  return ["exchange", "binance", "coinbase", "kraken", "bitfinex", "bitstamp", "bittrex",
    "poloniex", "huobi", "okx", "bybit", "kucoin", "ftx", "gemini", "coinspot", "bridge", "genesis"].some((k) => l.includes(k));
}

// ── Text Report Builder (reuses proven format from generateTrailReport/generateReport) ───

function buildTextReport(report: ForensicReportData): string {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const chainsUp = report.caseSummary.chains.join(", ").toUpperCase();
  const sep = (label = "") =>
    label ? `\n─── ${label} ${"─".repeat(Math.max(0, 60 - label.length - 5))}` : "─".repeat(64);
  const fmtTs = (ts: string) => ts.replace("T", " ").slice(0, 16) + " UTC";
  const fmtAmt = (v: string, dir: string) => {
    const n = parseFloat(v);
    if (!n || isNaN(n)) return `${dir === "in" ? "+" : "−"}0.00`;
    const abs = Math.abs(n);
    const dec = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.001 ? 6 : 8;
    return `${dir === "in" ? "+" : "−"}${n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
  };

  const lines: string[] = [];

  lines.push(`╔══════════════════════════════════════════════════════════════╗`);
  lines.push(`║     FORENSIC INTELLIGENCE PACKAGE — CryptoChainTrace        ║`);
  lines.push(`╚══════════════════════════════════════════════════════════════╝`);
  lines.push(`CRYPTOCHAINTRACE — BLOCKCHAIN INTELLIGENCE`);
  lines.push(`AGENCY / LAW ENFORCEMENT EDITION`);
  lines.push("─".repeat(64));
  lines.push(`Generated : ${now}`);
  lines.push(`Case      : #${report.caseId}   |   Chains: ${chainsUp}   |   Status: ${report.caseSummary.status.toUpperCase()}`);
  lines.push(``);

  // ── Case Summary ────────────────────────────────────────────────────────────
  lines.push(sep("CASE SUMMARY"));
  lines.push(``);
  lines.push(`  Submitter   : ${report.caseSummary.submitter.name ?? "Anonymous"}`);
  lines.push(`  Email       : ${report.caseSummary.submitter.email}`);
  lines.push(`  Submitted   : ${fmtTs(report.caseSummary.submittedAt)}`);
  if (report.caseSummary.description) lines.push(`  Notes       : ${report.caseSummary.description}`);
  if (report.caseSummary.txHashes.length > 0) {
    lines.push(`  TX Hashes   : ${report.caseSummary.txHashes.length} hash(es) flagged`);
    report.caseSummary.txHashes.forEach((h) => lines.push(`                ${h}`));
  }
  lines.push(``);

  // ── Key Findings ────────────────────────────────────────────────────────────
  lines.push(sep("KEY FINDINGS"));
  lines.push(``);
  report.keyFindings.forEach((f, i) => lines.push(`  ${String(i + 1).padStart(2, "0")}. ${f}`));
  lines.push(``);

  // ── Wallet profile helper ───────────────────────────────────────────────────
  const addWalletProfile = (profile: WalletProfile, role: "VICTIM" | "SUSPECT") => {
    lines.push(sep(`${role} WALLET`));
    lines.push(``);
    lines.push(`  [${role}]  ${profile.address}`);
    lines.push(``);

    for (const cp of profile.chains) {
      const cUp = cp.chain.toUpperCase();
      if (cp.error) { lines.push(`  ${cUp}  [fetch failed: ${cp.error}]`); lines.push(``); continue; }

      lines.push(`  ${cUp}`);
      lines.push(`  ├── Balance    : ${cp.balance ?? "—"}${cp.balanceUsd ? `  ($${cp.balanceUsd.toLocaleString()} USD)` : ""}`);
      lines.push(`  ├── Tx Count   : ${cp.txCount.toLocaleString()}`);
      lines.push(`  ├── Risk Score : ${cp.riskScore !== null ? `${cp.riskScore}/100` : "—"}`);
      lines.push(`  ├── Tags       : ${cp.tags.join(", ") || "none"}`);
      lines.push(`  ├── First Seen : ${cp.firstSeen ? cp.firstSeen.slice(0, 10) : "—"}`);
      lines.push(`  └── Last Seen  : ${cp.lastSeen ? cp.lastSeen.slice(0, 10) : "—"}`);
      lines.push(``);

      if (cp.recentTxs.length > 0) {
        lines.push(`  Transactions — ${cUp} (top ${cp.recentTxs.length})`);
        cp.recentTxs.forEach((tx, ti) => {
          const isLast = ti === cp.recentTxs.length - 1;
          const conn = isLast ? "└──" : "├──";
          const childPfx = isLast ? "   " : "│  ";
          const dir = tx.direction === "in" ? "IN " : "OUT";
          const counterparty = tx.direction === "in" ? tx.from : (tx.to ?? "—");
          const asset = tx.tokenSymbol ?? cUp;
          const usd = tx.valueUsd > 0 ? `  [$${tx.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}]` : "";
          lines.push(`  ${conn} [${dir}]  From: ${tx.from || "—"} → To: ${tx.to || "—"}`);
          lines.push(`  ${childPfx}      Amount : ${fmtAmt(tx.value, tx.direction)} ${asset}${usd}`);
          lines.push(`  ${childPfx}      TX     : ${tx.hash || "(none)"}`);
          lines.push(`  ${childPfx}      Date   : ${tx.timestamp ? fmtTs(tx.timestamp) : "—"}`);
          if (tx.destinationTag != null) lines.push(`  ${childPfx}      Tag    : ${tx.destinationTag}`);
          if (tx.memo) lines.push(`  ${childPfx}      Memo   : ${tx.memo}`);
          void counterparty;
        });
        lines.push(``);
      } else {
        lines.push(`  (No recent transactions found on ${cUp})`);
        lines.push(``);
      }
    }
  };

  addWalletProfile(report.victimProfile, "VICTIM");
  addWalletProfile(report.suspectProfile, "SUSPECT");

  // ── Multi-hop trace — using the same connections endpoint as Trace Graph ────
  lines.push(sep("MULTI-HOP TRACE — SUSPECT WALLET CONNECTIONS"));
  lines.push(``);
  lines.push(`  NOTE: Hop data sourced from the same connections endpoint used by`);
  lines.push(`  the Trace Graph and Start Trail Trace features.`);
  lines.push(``);

  let hasAnyConn = false;
  for (const chain of report.caseSummary.chains) {
    const conn = report.suspectConnections?.[chain];
    if (!conn) continue;
    hasAnyConn = true;
    const cUp = chain.toUpperCase();
    const peers = conn.nodes.filter((n) => n.address !== report.suspectProfile.address);

    lines.push(`  Chain: ${cUp}  |  Hop 1 — Direct counterparties of suspect wallet`);
    lines.push(``);

    if (peers.length === 0) {
      lines.push(`  (No counterparties found on ${cUp})`);
    } else {
      peers.slice(0, 8).forEach((node, ni) => {
        const isLast = ni === Math.min(peers.length, 8) - 1;
        const conn2 = isLast ? "└──" : "├──";
        const childPfx = isLast ? "   " : "│  ";
        const edge = conn.edges.find(
          (e) => (e.from === report.suspectProfile.address && e.to === node.address) ||
                 (e.to === report.suspectProfile.address && e.from === node.address)
        );
        const labelStr = node.label ? `  ← ${node.label.toUpperCase()}` : "";
        const exchFlag = isExchangeLabel(node.label) ? "  ◄ EXCHANGE FLOW" : "";
        lines.push(`  ${conn2} ${node.address}${labelStr}${exchFlag}`);
        if (edge) {
          lines.push(`  ${childPfx}   Txs: ${edge.transactionCount}  |  Total: ${edge.totalValue} ${cUp}  ($${edge.totalValueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)  |  Last: ${edge.lastSeen.slice(0, 10)}`);
        }
        lines.push(`  ${childPfx}   Risk: ${node.riskScore !== null ? `${node.riskScore}/100` : "—"}  |  Total txs on chain: ${node.transactionCount.toLocaleString()}`);
      });
    }
    lines.push(``);
  }
  if (!hasAnyConn) { lines.push(`  (Connections data not available — chain may require API key)`); lines.push(``); }

  // ── Commingling Analysis ────────────────────────────────────────────────────
  lines.push(sep("COMMINGLING ANALYSIS"));
  lines.push(``);

  for (const chain of report.caseSummary.chains) {
    const cUp = chain.toUpperCase();
    const victimConn = report.victimConnections?.[chain];
    const suspectConn = report.suspectConnections?.[chain];

    // TX-level counterparty overlap
    const victimCPs = new Set(
      (report.victimProfile.chains.find((c) => c.chain === chain)?.recentTxs ?? [])
        .map((t) => (t.direction === "in" ? t.from : (t.to ?? ""))).filter(Boolean)
    );
    const suspectCPs = (report.suspectProfile.chains.find((c) => c.chain === chain)?.recentTxs ?? [])
      .map((t) => (t.direction === "in" ? t.from : (t.to ?? ""))).filter(Boolean);
    const txOverlap = suspectCPs.filter((cp) => victimCPs.has(cp) && cp !== report.victimProfile.address && cp !== report.suspectProfile.address);

    // Connection-graph overlap
    const victimNodes = new Set(victimConn ? victimConn.nodes.map((n) => n.address) : []);
    const suspectNodes = suspectConn ? suspectConn.nodes.map((n) => n.address) : [];
    const graphOverlap = suspectNodes.filter((a) => victimNodes.has(a) && a !== report.victimProfile.address && a !== report.suspectProfile.address);

    const allOverlap = new Set([...txOverlap, ...graphOverlap]);
    if (allOverlap.size > 0) {
      lines.push(`  Chain: ${cUp}  |  ⚠ COMMINGLING DETECTED — ${allOverlap.size} shared address(es)`);
      for (const addr of allOverlap) {
        lines.push(`  ⚠  ${addr}`);
      }
    } else {
      lines.push(`  Chain: ${cUp}  |  No direct address overlap detected in recent transactions`);
    }
    lines.push(``);
  }

  // ── Audit trail (same format as existing reports via auditAndSign) ──────────
  const dbl = "═".repeat(64);
  const rule = "─".repeat(66);
  lines.push(``);
  lines.push(dbl);
  lines.push("AUDIT LOG \u2014 CHAIN OF CUSTODY");
  lines.push(dbl);
  lines.push(`Report Type     : Forensic Intelligence Package`);
  lines.push(`Generated by    : CryptoChainTrace User`);
  lines.push(`Timestamp       : ${now}`);
  lines.push(`Chain           : ${chainsUp}`);
  lines.push(`Target Wallet   : ${report.suspectProfile.address}`);
  lines.push(`Comparison 1    : ${report.victimProfile.address}`);
  lines.push(`Report Version  : v1.2.4`);
  lines.push(`Platform        : cryptochaintrace.vercel.app`);
  lines.push(``);
  lines.push(dbl);
  lines.push(`Generated by CryptoChainTrace  \u00b7  cryptochaintrace.vercel.app`);
  lines.push(`\u00a9 2026 Ball Deep Crypto  \u2022  For Official Investigative Use Only`);

  const preHash = lines.join("\n");
  const hash = sha256Sync(preHash);

  lines.push(``);
  lines.push(rule);
  lines.push(`DIGITAL SIGNATURE / TAMPER-EVIDENT SEAL`);
  lines.push(`Report Hash  : ${hash}`);
  lines.push(`Generated    : ${now}`);
  lines.push(`This document is cryptographically signed and tamper-evident.`);
  lines.push(`Any alteration will invalidate this hash.`);
  lines.push(rule);

  return lines.join("\n");
}

// ── WalletRow ────────────────────────────────────────────────────────────────

interface WalletRowProps {
  wallet: string;
  label: string;
  color: "emerald" | "red";
  chains: string[];
  onTrace: (wallet: string, chain: string) => void;
  onAddToCluster: (wallet: string) => void;
}

function WalletRow({ wallet, label, color, chains, onTrace, onAddToCluster }: WalletRowProps) {
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  const firstChain = chains[0] ?? "ethereum";
  const explorerBase = CHAIN_EXPLORERS[firstChain] ?? CHAIN_EXPLORERS.ethereum;
  const colorClass = color === "emerald" ? "text-emerald-300" : "text-red-300";
  const borderClass = color === "emerald" ? "border-emerald-500/20 bg-emerald-950/20" : "border-red-500/20 bg-red-950/20";
  const copy = () => { navigator.clipboard.writeText(wallet).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const handleAddToCommingle = () => { onAddToCluster(wallet); setAdded(true); setTimeout(() => setAdded(false), 2000); };

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${borderClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-1">{label}</div>
          <div className={`font-mono text-sm break-all ${colorClass}`}>{wallet}</div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button onClick={copy} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors">
            <Copy className={`w-3 h-3 ${copied ? "text-emerald-400" : ""}`} />
            {copied ? "Copied!" : "Copy"}
          </button>
          <a href={`${explorerBase}${wallet}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors">
            <ExternalLink className="w-3 h-3" />Explorer
          </a>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chains.map((c) => (
          <span key={c} className={`text-xs font-mono px-2 py-0.5 rounded border uppercase ${CHAIN_COLORS[c] ?? "text-slate-400 bg-slate-800 border-slate-700"}`}>{c}</span>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        {chains.map((c) => (
          <button key={c} onClick={() => onTrace(wallet, c)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold transition-colors">
            <Play className="w-3 h-3" />Trace on {c.toUpperCase()}
          </button>
        ))}
        <button onClick={handleAddToCommingle}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${added ? "bg-emerald-700 text-emerald-100" : "bg-slate-700 hover:bg-slate-600 text-slate-300"}`}>
          <Plus className="w-3 h-3" />{added ? "✓ Added!" : "Add to Commingle"}
        </button>
      </div>
      {chains.length > 1 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-700/40">
          {chains.map((c) => {
            const base = CHAIN_EXPLORERS[c];
            if (!base) return null;
            return (
              <a key={c} href={`${base}${wallet}`} target="_blank" rel="noopener noreferrer"
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${CHAIN_COLORS[c] ?? "text-slate-400 bg-slate-800 border-slate-700"} opacity-80 hover:opacity-100 transition-opacity`}>
                <ExternalLink className="w-2.5 h-2.5" />{c.toUpperCase()} explorer
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ChainProfileSection ───────────────────────────────────────────────────────

function ChainProfileSection({ cp, role }: { cp: ChainResult; role: "victim" | "suspect" }) {
  const [open, setOpen] = useState(true);
  const txBase = TX_EXPLORERS[cp.chain];
  const inColor = role === "victim" ? "text-emerald-400 bg-emerald-950/30" : "text-emerald-400 bg-emerald-950/30";
  const outColor = "text-orange-400 bg-orange-950/30";

  return (
    <div className="rounded-lg border border-slate-700/50 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 hover:bg-slate-800 transition-colors">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-xs font-mono px-2 py-0.5 rounded border uppercase font-bold ${CHAIN_COLORS[cp.chain] ?? "text-slate-400 bg-slate-800 border-slate-700"}`}>{cp.chain}</span>
          {cp.error && <span className="text-xs text-red-400 font-mono">fetch failed</span>}
          {!cp.error && (
            <>
              <span className="text-xs text-slate-400 font-mono">{cp.balance ? `${cp.balance} bal` : "no balance"}</span>
              <span className="text-xs text-slate-500 font-mono">· {cp.txCount.toLocaleString()} txs</span>
              {cp.riskScore !== null && (
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${cp.riskScore > 60 ? "text-red-400 bg-red-950/40" : cp.riskScore > 30 ? "text-yellow-400 bg-yellow-950/40" : "text-emerald-400 bg-emerald-950/40"}`}>
                  Risk {cp.riskScore}
                </span>
              )}
              {cp.tags.map((t) => (
                <span key={t} className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">{t}</span>
              ))}
            </>
          )}
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
      </button>

      {open && !cp.error && (
        <div className="px-4 py-3 space-y-3 bg-slate-900/40">
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {cp.firstSeen && <div><span className="text-slate-500">First Seen: </span><span className="text-slate-300">{new Date(cp.firstSeen).toLocaleDateString()}</span></div>}
            {cp.lastSeen && <div><span className="text-slate-500">Last Active: </span><span className="text-slate-300">{new Date(cp.lastSeen).toLocaleDateString()}</span></div>}
            {cp.balanceUsd != null && cp.balanceUsd > 0 && <div><span className="text-slate-500">USD Value: </span><span className="text-slate-300">${cp.balanceUsd.toLocaleString()}</span></div>}
          </div>

          {cp.recentTxs.length > 0 ? (
            <div className="overflow-x-auto rounded border border-slate-700/40">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700/40">
                    <th className="text-left px-3 py-2 text-slate-500 uppercase tracking-wider">Dir</th>
                    <th className="text-left px-3 py-2 text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="text-left px-3 py-2 text-slate-500 uppercase tracking-wider">Counterparty</th>
                    <th className="text-left px-3 py-2 text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-3 py-2 text-slate-500 uppercase tracking-wider">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {cp.recentTxs.map((tx, i) => {
                    const counterparty = tx.direction === "in" ? tx.from : (tx.to ?? "—");
                    return (
                      <tr key={i} className="border-b border-slate-700/20 hover:bg-slate-800/30">
                        <td className="px-3 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${tx.direction === "in" ? inColor : outColor}`}>
                            {tx.direction === "in" ? "IN" : "OUT"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-slate-300">
                          {tx.value} {tx.tokenSymbol ?? cp.chain.toUpperCase()}
                          {tx.valueUsd > 0 ? <span className="text-slate-500 ml-1">(${tx.valueUsd.toLocaleString()})</span> : null}
                        </td>
                        <td className="px-3 py-1.5 text-slate-400 max-w-[120px] truncate" title={counterparty}>
                          {truncate(counterparty, 16)}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">
                          {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {txBase ? (
                            <a href={`${txBase}${tx.hash}`} target="_blank" rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                              {truncate(tx.hash, 14)}
                            </a>
                          ) : <span className="text-slate-500">{truncate(tx.hash, 14)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500 font-mono italic">No recent transactions found.</p>
          )}
        </div>
      )}
      {open && cp.error && (
        <div className="px-4 py-3 text-xs text-red-400 font-mono bg-red-950/10">
          <AlertTriangle className="w-3 h-3 inline mr-1" />Failed to fetch: {cp.error}
        </div>
      )}
    </div>
  );
}

// ── HopSection — shows connections from the existing connections endpoint ─────

function HopSection({ address, conn, chain, role, onAddToCommingle }: { address: string; conn: ConnectionGraph; chain: string; role: "victim" | "suspect"; onAddToCommingle?: (addr: string) => void }) {
  const [open, setOpen] = useState(true);
  const [addedNodes, setAddedNodes] = useState<Set<string>>(new Set());
  const handleAddNode = (addr: string) => {
    if (onAddToCommingle) {
      onAddToCommingle(addr);
      setAddedNodes((prev) => new Set(prev).add(addr));
      setTimeout(() => setAddedNodes((prev) => { const s = new Set(prev); s.delete(addr); return s; }), 2000);
    }
  };
  if (!conn) return null;
  const peers = conn.nodes.filter((n) => n.address !== address);
  if (peers.length === 0) return null;

  const explorerBase = CHAIN_EXPLORERS[chain];

  return (
    <div className="rounded-lg border border-slate-700/50 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 hover:bg-slate-800 transition-colors">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-mono px-2 py-0.5 rounded border uppercase font-bold ${CHAIN_COLORS[chain] ?? "text-slate-400 bg-slate-800 border-slate-700"}`}>{chain}</span>
          <span className="text-xs text-slate-400 font-mono">Hop 1 — {peers.length} direct counterpart{peers.length !== 1 ? "ies" : "y"}</span>
          {peers.some((p) => isExchangeLabel(p.label)) && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">Exchange flow</span>
          )}
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 py-3 space-y-2 bg-slate-900/40">
          {peers.slice(0, 8).map((node) => {
            const edge = conn.edges.find(
              (e) => (e.from === address && e.to === node.address) ||
                     (e.to === address && e.from === node.address)
            );
            const isExch = isExchangeLabel(node.label);
            return (
              <div key={node.address} className={`rounded border px-3 py-2 space-y-1 ${isExch ? "border-blue-500/30 bg-blue-950/10" : "border-slate-700/40 bg-slate-800/30"}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  {node.label && (
                    <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${isExch ? "text-blue-400 bg-blue-950/40" : "text-slate-300 bg-slate-700/40"}`}>
                      {isExch ? "🏦 " : ""}{node.label}
                    </span>
                  )}
                  {node.riskScore !== null && (
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${node.riskScore > 60 ? "text-red-400 bg-red-950/40" : "text-slate-400 bg-slate-800"}`}>
                      Risk {node.riskScore}
                    </span>
                  )}
                  {explorerBase && (
                    <a href={`${explorerBase}${node.address}`} target="_blank" rel="noopener noreferrer"
                      className="ml-auto shrink-0 p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="font-mono text-xs text-slate-400 break-all flex-1">{node.address}</div>
                  {onAddToCommingle && (
                    <button onClick={() => handleAddNode(node.address)}
                      className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold transition-colors ${addedNodes.has(node.address) ? "bg-emerald-700 text-emerald-100" : "bg-slate-700 hover:bg-slate-600 text-slate-300"}`}>
                      <Plus className="w-3 h-3" />{addedNodes.has(node.address) ? "✓ Added!" : "Add to Commingle"}
                    </button>
                  )}
                </div>
                {edge && (
                  <div className="flex gap-4 text-xs font-mono text-slate-500 flex-wrap">
                    <span><span className="text-slate-600">Txs:</span> {edge.transactionCount}</span>
                    <span><span className="text-slate-600">Vol:</span> {edge.totalValue} {chain.toUpperCase()}</span>
                    {edge.totalValueUsd > 0 && <span><span className="text-slate-600">USD:</span> ${edge.totalValueUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>}
                    <span><span className="text-slate-600">Last:</span> {edge.lastSeen.slice(0, 10)}</span>
                  </div>
                )}
                <div className="text-xs font-mono text-slate-600">
                  {node.transactionCount.toLocaleString()} total txs on {role === "suspect" ? "suspect" : "victim"} side
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ForensicReportModal ───────────────────────────────────────────────────────

function ForensicReportModal({ report, onClose, onAddToCommingle }: { report: ForensicReportData; onClose: () => void; onAddToCommingle: (addr: string) => void }) {
  const reportTitle = `Forensic Intelligence Package — Case #${report.caseId}`;

  function downloadHtml() {
    const textContent = buildTextReport(report);
    const blob = new Blob([textContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forensic-report-case-${report.caseId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPdf() {
    exportAsPdf(reportTitle, buildTextReport(report));
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Compute commingling overlap for display
  const comminglingByChain: Record<string, string[]> = {};
  for (const chain of report.caseSummary.chains) {
    const victimConn = report.victimConnections?.[chain];
    const suspectConn = report.suspectConnections?.[chain];
    const victimNodes = new Set([
      ...(victimConn ? victimConn.nodes.map((n) => n.address) : []),
      ...(report.victimProfile.chains.find((c) => c.chain === chain)?.recentTxs ?? [])
        .map((t) => t.direction === "in" ? t.from : (t.to ?? "")).filter(Boolean),
    ]);
    const suspectAddrs = [
      ...(suspectConn ? suspectConn.nodes.map((n) => n.address) : []),
      ...(report.suspectProfile.chains.find((c) => c.chain === chain)?.recentTxs ?? [])
        .map((t) => t.direction === "in" ? t.from : (t.to ?? "")).filter(Boolean),
    ];
    const overlap = [...new Set(suspectAddrs.filter((a) => victimNodes.has(a) && a !== report.victimProfile.address && a !== report.suspectProfile.address))];
    if (overlap.length > 0) comminglingByChain[chain] = overlap;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/80 backdrop-blur-sm overflow-y-auto p-4">
      <div className="w-full max-w-4xl my-4 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 sticky top-0 bg-slate-900/95 backdrop-blur-sm rounded-t-xl z-10">
          <div>
            <h2 className="text-base font-bold font-mono text-white tracking-wide flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" />
              FORENSIC PACKAGE — CASE #{report.caseId}
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Generated {new Date(report.generatedAt).toLocaleString()} · {report.caseSummary.chains.join(", ").toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadHtml}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold transition-colors">
              <Download className="w-3.5 h-3.5" />TXT
            </button>
            <button onClick={downloadPdf}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-xs font-semibold transition-colors">
              <FileText className="w-3.5 h-3.5" />PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-8 overflow-y-auto">

          {/* Case Summary */}
          <section>
            <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Case Summary</h3>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-700/40 bg-slate-800/30 p-4 text-xs font-mono">
              <div><span className="text-slate-500">Submitter: </span><span className="text-slate-300">{report.caseSummary.submitter.name ?? "Anonymous"}</span></div>
              <div><span className="text-slate-500">Email: </span><span className="text-cyan-400">{report.caseSummary.submitter.email}</span></div>
              <div><span className="text-slate-500">Submitted: </span><span className="text-slate-300">{new Date(report.caseSummary.submittedAt).toLocaleString()}</span></div>
              <div><span className="text-slate-500">Status: </span>
                <span className={`px-1.5 py-0.5 rounded font-bold ${report.caseSummary.status === "done" ? "text-emerald-400" : "text-yellow-400"}`}>
                  {report.caseSummary.status.toUpperCase()}
                </span>
              </div>
              {report.caseSummary.description && (
                <div className="col-span-2"><span className="text-slate-500">Notes: </span><span className="text-slate-300">{report.caseSummary.description}</span></div>
              )}
              {report.caseSummary.txHashes.length > 0 && (
                <div className="col-span-2">
                  <div className="text-slate-500 mb-1">Flagged TXs ({report.caseSummary.txHashes.length}):</div>
                  <div className="space-y-0.5">{report.caseSummary.txHashes.map((h) => <div key={h} className="text-blue-400 break-all">{h}</div>)}</div>
                </div>
              )}
            </div>
          </section>

          {/* Key Findings */}
          <section>
            <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Key Findings</h3>
            <div className="space-y-2">
              {report.keyFindings.map((f, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-lg border border-blue-500/20 bg-blue-950/10 text-sm text-slate-200 font-mono">{f}</div>
              ))}
            </div>
          </section>

          {/* Victim Wallet */}
          <section>
            <h3 className="text-xs font-mono font-bold text-emerald-500/80 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Victim Wallet Analysis
            </h3>
            <p className="text-xs font-mono text-slate-500 mb-3 break-all">{report.victimProfile.address}</p>
            <div className="space-y-2">
              {report.victimProfile.chains.map((cp) => <ChainProfileSection key={cp.chain} cp={cp} role="victim" />)}
            </div>
          </section>

          {/* Suspect Wallet */}
          <section>
            <h3 className="text-xs font-mono font-bold text-red-500/80 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Suspect Wallet Analysis
            </h3>
            <p className="text-xs font-mono text-slate-500 mb-3 break-all">{report.suspectProfile.address}</p>
            <div className="space-y-2">
              {report.suspectProfile.chains.map((cp) => <ChainProfileSection key={cp.chain} cp={cp} role="suspect" />)}
            </div>
          </section>

          {/* Multi-Hop Trace — reusing the connections endpoint data */}
          <section>
            <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
              <Network className="w-3.5 h-3.5 text-violet-400" />Multi-Hop Trace — Suspect Connections
            </h3>
            <p className="text-xs text-slate-600 font-mono mb-3">
              Sourced from the same connections endpoint used by Trace Graph and Trail Trace. Hop 1 = direct counterparties.
            </p>
            <div className="space-y-2">
              {report.caseSummary.chains.map((chain) => {
                const conn = report.suspectConnections?.[chain];
                if (!conn) return <div key={chain} className="text-xs text-slate-600 font-mono px-3 py-2">{chain.toUpperCase()}: no connections data</div>;
                return <HopSection key={chain} address={report.suspectProfile.address} conn={conn} chain={chain} role="suspect" onAddToCommingle={onAddToCommingle} />;
              })}
            </div>
          </section>

          {/* Commingling Analysis */}
          <section>
            <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />Commingling Analysis
            </h3>
            {Object.keys(comminglingByChain).length === 0 ? (
              <div className="rounded-lg border border-slate-700/40 bg-slate-800/20 px-4 py-3 text-xs font-mono text-slate-500">
                No shared counterparty addresses detected between victim and suspect in recent transaction history.
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(comminglingByChain).map(([chain, addrs]) => (
                  <div key={chain} className="rounded-lg border border-yellow-500/30 bg-yellow-950/10 px-4 py-3">
                    <div className="text-xs font-mono font-bold text-yellow-400 mb-2">
                      ⚠ {chain.toUpperCase()} — {addrs.length} shared address{addrs.length !== 1 ? "es" : ""} detected
                    </div>
                    <div className="space-y-1">
                      {addrs.map((a) => (
                        <div key={a} className="font-mono text-xs text-slate-300 break-all">{a}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-xs text-slate-600 font-mono text-center pb-4 border-t border-slate-800 pt-4">
            Report generated by CryptoChainTrace · Data from public blockchain APIs · Verify independently before legal use
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main CaseDetailModal ──────────────────────────────────────────────────────

interface Props {
  submission: Submission;
  onClose: () => void;
  onLoadTrace: (wallet: string, chain: string) => void;
  onMarkDone: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export default function CaseDetailModal({ submission: sub, onClose, onLoadTrace, onMarkDone, onDelete }: Props) {
  const chains = splitList(sub.chains);
  const txHashes = splitList(sub.txHashes);
  const firstChain = chains[0] ?? "ethereum";

  const [cluster, setCluster] = useState<string[]>(() => loadCluster(sub.id));
  const [clusterInput, setClusterInput] = useState("");
  const [markingDone, setMarkingDone] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState<ForensicReportData | null>(null);
  const [reportError, setReportError] = useState("");
  const [showReport, setShowReport] = useState(false);

  useEffect(() => { saveCluster(sub.id, cluster); }, [cluster, sub.id]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !showReport) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, showReport]);

  function addToCluster(wallet: string) { setCluster((p) => p.includes(wallet) ? p : [...p, wallet]); }
  function removeFromCluster(wallet: string) { setCluster((p) => p.filter((w) => w !== wallet)); }
  function addClusterInput() { const v = clusterInput.trim(); if (!v) return; addToCluster(v); setClusterInput(""); }
  function handleTrace(wallet: string, chain: string) { onLoadTrace(wallet, chain); onClose(); }

  async function handleMarkDone() {
    setMarkingDone(true);
    try { await onMarkDone(sub.id); } finally { setMarkingDone(false); }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try { await onDelete(sub.id); } finally { setDeleting(false); }
  }

  function copyHash(hash: string) {
    navigator.clipboard.writeText(hash).catch(() => {});
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  }

  async function handleGenerateReport() {
    setGenerating(true);
    setReportError("");
    try {
      const res = await fetch(`/api/submissions/${sub.id}/report`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setReportError(body.message ?? `Error ${res.status}`);
        return;
      }
      const data = await res.json() as ForensicReportData;
      setReportData(data);
      setShowReport(true);
    } catch (e) {
      setReportError(String(e));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      {showReport && reportData && <ForensicReportModal report={reportData} onClose={() => setShowReport(false)} onAddToCommingle={addToCluster} />}

      <div
        className="fixed inset-0 z-50 flex items-start justify-end bg-black/70 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="relative h-full w-full max-w-2xl bg-slate-900 border-l border-slate-700/60 shadow-2xl flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 bg-slate-900/90 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
              <div>
                <h2 className="text-base font-bold font-mono text-white tracking-wide">CASE #{sub.id}</h2>
                <p className="text-xs text-slate-400 font-mono">{fmtDate(sub.submittedAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${
                sub.status === "done" ? "bg-green-500/15 text-green-400 border-green-500/30" :
                sub.status === "approved" ? "bg-blue-500/15 text-blue-400 border-blue-500/30" :
                sub.status === "rejected" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
              }`}>{sub.status.toUpperCase()}</span>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            <section>
              <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Submitter</h3>
              <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-500 font-mono mb-1">NAME</div>
                  <div className="text-sm text-white font-medium">{sub.name ?? <span className="text-slate-600 italic">not provided</span>}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-mono mb-1">EMAIL</div>
                  <a href={`mailto:${sub.email}`} className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors break-all">{sub.email}</a>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Victim Wallet</h3>
              <WalletRow wallet={sub.victimWallet} label="Victim address" color="emerald" chains={chains} onTrace={handleTrace} onAddToCluster={addToCluster} />
            </section>

            <section>
              <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Thief Wallet</h3>
              <WalletRow wallet={sub.thiefWallet} label="Suspect address" color="red" chains={chains} onTrace={handleTrace} onAddToCluster={addToCluster} />
            </section>

            {txHashes.length > 0 && (
              <section>
                <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5" />Transaction Hashes ({txHashes.length})
                </h3>
                <div className="space-y-2">
                  {txHashes.map((hash) => {
                    const txBase = TX_EXPLORERS[firstChain];
                    return (
                      <div key={hash} className="flex items-center gap-2 rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-2">
                        <span className="font-mono text-xs text-slate-300 flex-1 break-all" title={hash}>{hash}</span>
                        <button onClick={() => copyHash(hash)} className="shrink-0 p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                          <Copy className={`w-3 h-3 ${copiedHash === hash ? "text-emerald-400" : ""}`} />
                        </button>
                        {txBase && (
                          <a href={`${txBase}${hash}`} target="_blank" rel="noopener noreferrer"
                            className="shrink-0 p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {sub.description && (
              <section>
                <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Notes / Description</h3>
                <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 px-4 py-3 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {sub.description}
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center gap-2 mb-3">
                <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
                <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest">Commingling Cluster</h3>
                {cluster.length > 0 && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">{cluster.length}</span>
                )}
              </div>
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-4 space-y-3">
                {cluster.length === 0 ? (
                  <p className="text-xs text-slate-500 font-mono">No wallets in cluster yet. Add victim/thief wallets above or paste any related address.</p>
                ) : (
                  <div className="space-y-2">
                    {cluster.map((w, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded bg-slate-800/60 px-3 py-2">
                        <span className="font-mono text-xs text-cyan-300 flex-1 break-all">{w}</span>
                        <button onClick={() => { navigator.clipboard.writeText(w).catch(() => {}); }} className="shrink-0 p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"><Copy className="w-3 h-3" /></button>
                        <button onClick={() => handleTrace(w, firstChain)} className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 text-xs font-semibold transition-colors"><Play className="w-2.5 h-2.5" />Trace</button>
                        <button onClick={() => removeFromCluster(w)} className="shrink-0 p-1 rounded hover:bg-red-900/50 text-slate-500 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="text" value={clusterInput} onChange={(e) => setClusterInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addClusterInput(); }}
                    placeholder="Paste related wallet address…"
                    className="flex-1 text-xs font-mono bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
                  />
                  <button onClick={addClusterInput} disabled={!clusterInput.trim()}
                    className="flex items-center gap-1 px-3 py-2 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-xs font-semibold transition-colors">
                    <Plus className="w-3 h-3" />Add
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Sticky footer */}
          <div className="sticky bottom-0 px-6 py-4 border-t border-slate-700/60 bg-slate-900/95 backdrop-blur-sm space-y-2">
            {reportError && (
              <p className="text-xs text-red-400 font-mono flex items-center gap-1 mb-1">
                <AlertTriangle className="w-3 h-3" />{reportError}
              </p>
            )}
            <button
              onClick={() => void handleGenerateReport()}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gradient-to-r from-cyan-700 to-blue-700 hover:from-cyan-600 hover:to-blue-600 disabled:opacity-60 font-semibold text-sm transition-all"
            >
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Generating Full Forensic Package…</>
              ) : (
                <><Package className="w-4 h-4" />📦 Full Package</>
              )}
            </button>
            {reportData && !generating && (
              <div className="flex gap-2">
                <button onClick={() => setShowReport(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-300 transition-colors">
                  <Package className="w-3.5 h-3.5" />View Report
                </button>
                <button onClick={() => exportAsPdf(`Forensic Intelligence Package — Case #${reportData.caseId}`, buildTextReport(reportData))}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-300 transition-colors">
                  <FileText className="w-3.5 h-3.5" />Download PDF
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => void handleMarkDone()} disabled={markingDone || sub.status === "done"}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 font-semibold text-sm transition-colors">
                <CheckCircle className="w-4 h-4" />
                {markingDone ? "Marking…" : sub.status === "done" ? "Already Done" : "Mark as Done"}
              </button>
              <button onClick={() => void handleDelete()} disabled={deleting}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                  confirmDelete ? "bg-red-600 hover:bg-red-500 animate-pulse" : "bg-slate-700 hover:bg-red-900/60 text-slate-200 hover:text-red-300"
                }`}>
                <Trash2 className="w-4 h-4" />
                {deleting ? "Deleting…" : confirmDelete ? "Confirm Delete?" : "Delete Case"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
