import { useState, useEffect } from "react";
import { X, Copy, ExternalLink, Play, Plus, Trash2, CheckCircle, GitBranch, Hash, Package, Download, Loader2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

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

type TxRow = {
  txHash: string;
  direction: string;
  amount: string;
  amountUsd: number | null;
  tokenSymbol: string | null;
  counterparty: string | null;
  timestamp: string | null;
  status: string;
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
    month: "long", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
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
  const firstChain = chains[0] ?? "ethereum";
  const explorerBase = CHAIN_EXPLORERS[firstChain] ?? CHAIN_EXPLORERS.ethereum;
  const colorClass = color === "emerald" ? "text-emerald-300" : "text-red-300";
  const borderClass = color === "emerald" ? "border-emerald-500/20 bg-emerald-950/20" : "border-red-500/20 bg-red-950/20";

  const copy = () => {
    navigator.clipboard.writeText(wallet).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
            <ExternalLink className="w-3 h-3" />
            Explorer
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
            <Play className="w-3 h-3" />
            Trace on {c.toUpperCase()}
          </button>
        ))}
        <button onClick={() => onAddToCluster(wallet)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-300 transition-colors">
          <Plus className="w-3 h-3" />
          Add to Cluster
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
                <ExternalLink className="w-2.5 h-2.5" />
                {c.toUpperCase()} explorer
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ForensicReportModal ───────────────────────────────────────────────────────

function ChainProfileSection({ cp, role }: { cp: ChainResult; role: "victim" | "suspect" }) {
  const [open, setOpen] = useState(true);
  const accent = role === "victim" ? "emerald" : "red";
  const txBase = TX_EXPLORERS[cp.chain];

  return (
    <div className="rounded-lg border border-slate-700/50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-3">
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
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
      </button>

      {open && !cp.error && (
        <div className="px-4 py-3 space-y-3 bg-slate-900/40">
          {/* Profile grid */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {cp.firstSeen && <div><span className="text-slate-500">First Seen: </span><span className="text-slate-300">{new Date(cp.firstSeen).toLocaleDateString()}</span></div>}
            {cp.lastSeen && <div><span className="text-slate-500">Last Active: </span><span className="text-slate-300">{new Date(cp.lastSeen).toLocaleDateString()}</span></div>}
            {cp.balanceUsd && <div><span className="text-slate-500">USD Value: </span><span className="text-slate-300">${cp.balanceUsd.toLocaleString()}</span></div>}
          </div>

          {/* Transactions table */}
          {cp.recentTxs.length > 0 && (
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
                  {cp.recentTxs.map((tx, i) => (
                    <tr key={i} className="border-b border-slate-700/20 hover:bg-slate-800/30">
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${tx.direction === "in" ? `text-${accent}-400 bg-${accent}-950/40` : "text-orange-400 bg-orange-950/40"}`}>
                          {tx.direction?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-slate-300">
                        {tx.amount} {tx.tokenSymbol ?? ""}
                        {tx.amountUsd ? <span className="text-slate-500 ml-1">(${tx.amountUsd.toLocaleString()})</span> : null}
                      </td>
                      <td className="px-3 py-1.5 text-slate-400 max-w-[120px] truncate" title={tx.counterparty ?? ""}>
                        {tx.counterparty ? truncate(tx.counterparty, 16) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">
                        {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {txBase ? (
                          <a href={`${txBase}${tx.txHash}`} target="_blank" rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                            {truncate(tx.txHash, 14)}
                          </a>
                        ) : (
                          <span className="text-slate-500">{truncate(tx.txHash, 14)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {cp.recentTxs.length === 0 && <p className="text-xs text-slate-500 font-mono italic">No recent transactions found.</p>}
        </div>
      )}
      {open && cp.error && (
        <div className="px-4 py-3 text-xs text-red-400 font-mono bg-red-950/10">
          <AlertTriangle className="w-3 h-3 inline mr-1" />Failed to fetch data: {cp.error}
        </div>
      )}
    </div>
  );
}

function buildHtmlReport(report: ForensicReportData): string {
  const profileHtml = (profile: WalletProfile, role: "victim" | "suspect") => `
    <h3 style="color:${role === "victim" ? "#6ee7b7" : "#fca5a5"};margin:24px 0 8px">${role === "victim" ? "🟢 VICTIM" : "🔴 SUSPECT"} WALLET</h3>
    <code style="font-size:11px;color:#94a3b8">${profile.address}</code>
    ${profile.chains.map((cp) => `
      <h4 style="color:#7dd3fc;margin:16px 0 6px">${cp.chain.toUpperCase()}</h4>
      ${cp.error ? `<p style="color:#f87171">Fetch failed: ${cp.error}</p>` : `
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <tr><td style="color:#64748b;padding:2px 8px 2px 0">Balance</td><td>${cp.balance ?? "—"}</td></tr>
          <tr><td style="color:#64748b;padding:2px 8px 2px 0">Tx Count</td><td>${cp.txCount.toLocaleString()}</td></tr>
          <tr><td style="color:#64748b;padding:2px 8px 2px 0">Risk Score</td><td>${cp.riskScore ?? "—"}</td></tr>
          <tr><td style="color:#64748b;padding:2px 8px 2px 0">Tags</td><td>${cp.tags.join(", ") || "none"}</td></tr>
          <tr><td style="color:#64748b;padding:2px 8px 2px 0">First Seen</td><td>${cp.firstSeen ? new Date(cp.firstSeen).toLocaleDateString() : "—"}</td></tr>
          <tr><td style="color:#64748b;padding:2px 8px 2px 0">Last Seen</td><td>${cp.lastSeen ? new Date(cp.lastSeen).toLocaleDateString() : "—"}</td></tr>
        </table>
        ${cp.recentTxs.length > 0 ? `
        <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:8px">
          <thead><tr style="color:#475569;border-bottom:1px solid #334155">
            <th style="text-align:left;padding:4px 6px">Dir</th>
            <th style="text-align:left;padding:4px 6px">Amount</th>
            <th style="text-align:left;padding:4px 6px">Counterparty</th>
            <th style="text-align:left;padding:4px 6px">Date</th>
            <th style="text-align:left;padding:4px 6px">Hash</th>
          </tr></thead>
          <tbody>
          ${cp.recentTxs.map((t) => `<tr style="border-bottom:1px solid #1e293b">
            <td style="padding:3px 6px;color:${t.direction === "in" ? "#6ee7b7" : "#fb923c"}">${(t.direction ?? "").toUpperCase()}</td>
            <td style="padding:3px 6px">${t.amount} ${t.tokenSymbol ?? ""}</td>
            <td style="padding:3px 6px;color:#94a3b8">${t.counterparty ? t.counterparty.slice(0, 20) + "…" : "—"}</td>
            <td style="padding:3px 6px;color:#64748b">${t.timestamp ? new Date(t.timestamp).toLocaleDateString() : "—"}</td>
            <td style="padding:3px 6px;color:#60a5fa">${t.txHash.slice(0, 16)}…</td>
          </tr>`).join("")}
          </tbody>
        </table>` : "<p style='color:#475569;font-size:11px'>No recent transactions found.</p>"}
      `}
    `).join("")}
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>CryptoChainTrace — Forensic Report #${report.caseId}</title>
<style>
  body{background:#0f172a;color:#e2e8f0;font-family:'Courier New',monospace;margin:0;padding:32px}
  h1{color:#38bdf8;font-size:20px;margin:0 0 4px}
  h2{color:#7dd3fc;font-size:14px;border-bottom:1px solid #1e293b;padding-bottom:6px;margin:24px 0 12px}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold}
  .meta{color:#64748b;font-size:11px;margin:0 0 24px}
  .finding{padding:8px 12px;margin:6px 0;background:#1e293b;border-left:3px solid #3b82f6;border-radius:2px;font-size:12px}
  @media print{body{background:#fff;color:#000}h1,h2,h3{color:#000}}
</style>
</head>
<body>
<h1>⛓ CRYPTOCHAINTRACE — FORENSIC INTELLIGENCE REPORT</h1>
<p class="meta">Case #${report.caseId} · Generated ${new Date(report.generatedAt).toLocaleString()} · Status: ${report.caseSummary.status.toUpperCase()}</p>

<h2>CASE SUMMARY</h2>
<table style="font-size:12px;width:100%;border-collapse:collapse">
  <tr><td style="color:#64748b;padding:3px 12px 3px 0;width:140px">Submitter</td><td>${report.caseSummary.submitter.name ?? "Anonymous"} &lt;${report.caseSummary.submitter.email}&gt;</td></tr>
  <tr><td style="color:#64748b;padding:3px 12px 3px 0">Submitted</td><td>${new Date(report.caseSummary.submittedAt).toLocaleString()}</td></tr>
  <tr><td style="color:#64748b;padding:3px 12px 3px 0">Chains</td><td>${report.caseSummary.chains.join(", ").toUpperCase()}</td></tr>
  ${report.caseSummary.description ? `<tr><td style="color:#64748b;padding:3px 12px 3px 0;vertical-align:top">Description</td><td>${report.caseSummary.description}</td></tr>` : ""}
  ${report.caseSummary.txHashes.length > 0 ? `<tr><td style="color:#64748b;padding:3px 12px 3px 0;vertical-align:top">TX Hashes</td><td style="font-size:10px">${report.caseSummary.txHashes.join("<br>")}</td></tr>` : ""}
</table>

<h2>KEY FINDINGS</h2>
${report.keyFindings.map((f) => `<div class="finding">${f}</div>`).join("")}

<h2>WALLET ANALYSIS</h2>
${profileHtml(report.victimProfile, "victim")}
${profileHtml(report.suspectProfile, "suspect")}

<p style="color:#334155;font-size:10px;margin-top:48px;border-top:1px solid #1e293b;padding-top:12px">
  This report was generated automatically by CryptoChainTrace. All blockchain data is sourced from public APIs and should be verified independently before use in legal proceedings.
</p>
</body></html>`;
}

function ForensicReportModal({ report, onClose }: { report: ForensicReportData; onClose: () => void }) {
  function downloadHtml() {
    const html = buildHtmlReport(report);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forensic-report-case-${report.caseId}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/80 backdrop-blur-sm overflow-y-auto p-4">
      <div className="w-full max-w-4xl my-4 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl flex flex-col">
        {/* Report header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 sticky top-0 bg-slate-900/95 backdrop-blur-sm rounded-t-xl z-10">
          <div>
            <h2 className="text-base font-bold font-mono text-white tracking-wide flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" />
              FORENSIC INTELLIGENCE PACKAGE — CASE #{report.caseId}
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Generated {new Date(report.generatedAt).toLocaleString()} · Chains: {report.caseSummary.chains.join(", ").toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadHtml}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-xs font-semibold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Report
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
                  <div className="text-slate-500 mb-1">Flagged Transactions ({report.caseSummary.txHashes.length}):</div>
                  <div className="space-y-1">
                    {report.caseSummary.txHashes.map((h) => <div key={h} className="text-blue-400 break-all">{h}</div>)}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Key Findings */}
          <section>
            <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Key Findings</h3>
            <div className="space-y-2">
              {report.keyFindings.map((f, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-lg border border-blue-500/20 bg-blue-950/10 text-sm text-slate-200 font-mono">
                  {f}
                </div>
              ))}
            </div>
          </section>

          {/* Victim Wallet */}
          <section>
            <h3 className="text-xs font-mono font-bold text-emerald-500/80 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Victim Wallet Analysis
            </h3>
            <p className="text-xs font-mono text-slate-500 mb-3 break-all">{report.victimProfile.address}</p>
            <div className="space-y-2">
              {report.victimProfile.chains.map((cp) => (
                <ChainProfileSection key={cp.chain} cp={cp} role="victim" />
              ))}
            </div>
          </section>

          {/* Suspect Wallet */}
          <section>
            <h3 className="text-xs font-mono font-bold text-red-500/80 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              Suspect Wallet Analysis
            </h3>
            <p className="text-xs font-mono text-slate-500 mb-3 break-all">{report.suspectProfile.address}</p>
            <div className="space-y-2">
              {report.suspectProfile.chains.map((cp) => (
                <ChainProfileSection key={cp.chain} cp={cp} role="suspect" />
              ))}
            </div>
          </section>

          <p className="text-xs text-slate-600 font-mono text-center pb-4 border-t border-slate-800 pt-4">
            Report generated by CryptoChainTrace · Data sourced from public blockchain APIs · Verify independently before legal use
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

  // Full Package state
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

  function addToCluster(wallet: string) { setCluster((prev) => prev.includes(wallet) ? prev : [...prev, wallet]); }
  function removeFromCluster(wallet: string) { setCluster((prev) => prev.filter((w) => w !== wallet)); }
  function addClusterInput() { const val = clusterInput.trim(); if (!val) return; addToCluster(val); setClusterInput(""); }
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
      {showReport && reportData && (
        <ForensicReportModal report={reportData} onClose={() => setShowReport(false)} />
      )}

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
              }`}>
                {sub.status.toUpperCase()}
              </span>
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
                  <Hash className="w-3.5 h-3.5" />
                  Transaction Hashes ({txHashes.length})
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
                        <button onClick={() => { navigator.clipboard.writeText(w).catch(() => {}); }} className="shrink-0 p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                          <Copy className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleTrace(w, firstChain)} className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 text-xs font-semibold transition-colors">
                          <Play className="w-2.5 h-2.5" />
                          Trace
                        </button>
                        <button onClick={() => removeFromCluster(w)} className="shrink-0 p-1 rounded hover:bg-red-900/50 text-slate-500 hover:text-red-400 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={clusterInput}
                    onChange={(e) => setClusterInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addClusterInput(); }}
                    placeholder="Paste related wallet address…"
                    className="flex-1 text-xs font-mono bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
                  />
                  <button onClick={addClusterInput} disabled={!clusterInput.trim()}
                    className="flex items-center gap-1 px-3 py-2 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-xs font-semibold transition-colors">
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Action buttons — sticky footer */}
          <div className="sticky bottom-0 px-6 py-4 border-t border-slate-700/60 bg-slate-900/95 backdrop-blur-sm space-y-2">
            {/* Full Package button */}
            <div>
              {reportError && (
                <p className="text-xs text-red-400 font-mono mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{reportError}
                </p>
              )}
              <button
                onClick={() => void handleGenerateReport()}
                disabled={generating}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gradient-to-r from-cyan-700 to-blue-700 hover:from-cyan-600 hover:to-blue-600 disabled:opacity-60 font-semibold text-sm transition-all"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Full Forensic Package…
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4" />
                    📦 Full Package
                  </>
                )}
              </button>
            </div>

            {/* Mark Done + Delete row */}
            <div className="flex gap-3">
              <button
                onClick={() => void handleMarkDone()}
                disabled={markingDone || sub.status === "done"}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 font-semibold text-sm transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                {markingDone ? "Marking…" : sub.status === "done" ? "Already Done" : "Mark as Done"}
              </button>

              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                  confirmDelete ? "bg-red-600 hover:bg-red-500 animate-pulse" : "bg-slate-700 hover:bg-red-900/60 text-slate-200 hover:text-red-300"
                }`}
              >
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
