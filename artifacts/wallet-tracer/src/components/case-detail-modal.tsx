import { useState, useEffect } from "react";
import { X, Copy, ExternalLink, Play, Plus, Trash2, CheckCircle, GitBranch, Hash } from "lucide-react";

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

function clusterKey(id: number) {
  return `chaintrace-cluster-${id}`;
}

function loadCluster(id: number): string[] {
  try {
    const raw = localStorage.getItem(clusterKey(id));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

function saveCluster(id: number, wallets: string[]) {
  try { localStorage.setItem(clusterKey(id), JSON.stringify(wallets)); } catch { /* noop */ }
}

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
  const badgeBase = color === "emerald" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-red-500/10 text-red-400 border-red-500/30";

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
          <button
            onClick={copy}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
            title="Copy address"
          >
            <Copy className={`w-3 h-3 ${copied ? "text-emerald-400" : ""}`} />
            {copied ? "Copied!" : "Copy"}
          </button>
          <a
            href={`${explorerBase}${wallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
            title="Open in explorer"
          >
            <ExternalLink className="w-3 h-3" />
            Explorer
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chains.map((c) => (
          <span key={c} className={`text-xs font-mono px-2 py-0.5 rounded border uppercase ${CHAIN_COLORS[c] ?? "text-slate-400 bg-slate-800 border-slate-700"}`}>
            {c}
          </span>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {chains.map((c) => (
          <button
            key={c}
            onClick={() => onTrace(wallet, c)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold transition-colors"
            title={`Trace on ${c}`}
          >
            <Play className="w-3 h-3" />
            Trace on {c.toUpperCase()}
          </button>
        ))}
        <button
          onClick={() => onAddToCluster(wallet)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-300 transition-colors"
          title="Add to commingling cluster"
        >
          <Plus className="w-3 h-3" />
          Add to Cluster
        </button>
      </div>

      {/* Per-chain explorer links */}
      {chains.length > 1 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-700/40">
          {chains.map((c) => {
            const base = CHAIN_EXPLORERS[c];
            if (!base) return null;
            return (
              <a
                key={c}
                href={`${base}${wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${CHAIN_COLORS[c] ?? "text-slate-400 bg-slate-800 border-slate-700"} opacity-80 hover:opacity-100 transition-opacity`}
              >
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

  useEffect(() => {
    saveCluster(sub.id, cluster);
  }, [cluster, sub.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function addToCluster(wallet: string) {
    setCluster((prev) => prev.includes(wallet) ? prev : [...prev, wallet]);
  }

  function removeFromCluster(wallet: string) {
    setCluster((prev) => prev.filter((w) => w !== wallet));
  }

  function addClusterInput() {
    const val = clusterInput.trim();
    if (!val) return;
    addToCluster(val);
    setClusterInput("");
  }

  function handleTrace(wallet: string, chain: string) {
    onLoadTrace(wallet, chain);
    onClose();
  }

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Side panel */}
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
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Submitter info */}
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

          {/* Victim Wallet */}
          <section>
            <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Victim Wallet</h3>
            <WalletRow
              wallet={sub.victimWallet}
              label="Victim address"
              color="emerald"
              chains={chains}
              onTrace={handleTrace}
              onAddToCluster={addToCluster}
            />
          </section>

          {/* Thief Wallet */}
          <section>
            <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Thief Wallet</h3>
            <WalletRow
              wallet={sub.thiefWallet}
              label="Suspect address"
              color="red"
              chains={chains}
              onTrace={handleTrace}
              onAddToCluster={addToCluster}
            />
          </section>

          {/* TX Hashes */}
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
                      <button
                        onClick={() => copyHash(hash)}
                        className="shrink-0 p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="Copy hash"
                      >
                        <Copy className={`w-3 h-3 ${copiedHash === hash ? "text-emerald-400" : ""}`} />
                      </button>
                      {txBase && (
                        <a
                          href={`${txBase}${hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                          title="Open transaction in explorer"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Description / Notes */}
          {sub.description && (
            <section>
              <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest mb-3">Notes / Description</h3>
              <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 px-4 py-3 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {sub.description}
              </div>
            </section>
          )}

          {/* Commingling Cluster */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
              <h3 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-widest">Commingling Cluster</h3>
              {cluster.length > 0 && (
                <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  {cluster.length}
                </span>
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
                      <button
                        onClick={() => { navigator.clipboard.writeText(w).catch(() => {}); }}
                        className="shrink-0 p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="Copy"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleTrace(w, firstChain)}
                        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 text-xs font-semibold transition-colors"
                        title="Trace this wallet"
                      >
                        <Play className="w-2.5 h-2.5" />
                        Trace
                      </button>
                      <button
                        onClick={() => removeFromCluster(w)}
                        className="shrink-0 p-1 rounded hover:bg-red-900/50 text-slate-500 hover:text-red-400 transition-colors"
                        title="Remove from cluster"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add wallet input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={clusterInput}
                  onChange={(e) => setClusterInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addClusterInput(); }}
                  placeholder="Paste related wallet address…"
                  className="flex-1 text-xs font-mono bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
                />
                <button
                  onClick={addClusterInput}
                  disabled={!clusterInput.trim()}
                  className="flex items-center gap-1 px-3 py-2 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Action buttons — sticky footer */}
        <div className="sticky bottom-0 px-6 py-4 border-t border-slate-700/60 bg-slate-900/95 backdrop-blur-sm flex gap-3">
          <button
            onClick={handleMarkDone}
            disabled={markingDone || sub.status === "done"}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 font-semibold text-sm transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            {markingDone ? "Marking…" : sub.status === "done" ? "Already Done" : "Mark as Done"}
          </button>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
              confirmDelete
                ? "bg-red-600 hover:bg-red-500 animate-pulse"
                : "bg-slate-700 hover:bg-red-900/60 text-slate-200 hover:text-red-300"
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? "Deleting…" : confirmDelete ? "Confirm Delete?" : "Delete Case"}
          </button>
        </div>
      </div>
    </div>
  );
}
