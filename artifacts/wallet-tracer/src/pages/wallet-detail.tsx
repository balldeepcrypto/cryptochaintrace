import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetWallet,
  useGetWalletTransactions,
  getGetWalletQueryKey,
  getGetWalletTransactionsQueryKey,
} from "@workspace/api-client-react";
import { AddressDisplay } from "@/components/address-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftRight, ArrowDownLeft, ArrowUpRight,
  Network, GitFork, FileCode, Tag, ShieldAlert, ShieldCheck, Shield,
  ExternalLink, Users, ChevronRight, ChevronDown, Loader2,
  AlertTriangle, X, Zap, Bookmark, BookmarkCheck,
} from "lucide-react";
import { Link } from "wouter";

// ─── Known entity labels ──────────────────────────────────────────────────────
const KNOWN_LABELS: Record<string, { label: string; type: "exchange" | "genesis" | "defi" | "flagged" }> = {
  rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh: { label: "XRP Genesis", type: "genesis" },
  rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh: { label: "Bitstamp Hot", type: "exchange" },
  rG6FZ31hDHN1K5Dkbma3PSB5uVCuVVRzfn: { label: "Bitfinex", type: "exchange" },
  r3kmLJN5D28dHuH8vZNUZpMC4JPgrKQBkR: { label: "Ripple Inc.", type: "exchange" },
  rBndiPPKs9k5rjBb7HsEiqXKVZ9MMhGmhM: { label: "Kraken XRP", type: "exchange" },
  rLHzPsX6oXkzU2qL12kHCH8G8cnZv1rBJh: { label: "Binance XRP", type: "exchange" },
  "0x28c6c06298d514db089934071355e5743bf21d60": { label: "Binance Hot", type: "exchange" },
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": { label: "Binance Cold", type: "exchange" },
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": { label: "Binance 2", type: "exchange" },
  "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": { label: "Coinbase", type: "exchange" },
  "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8": { label: "Binance Cold 3", type: "exchange" },
  "1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s": { label: "Binance BTC", type: "exchange" },
  "3E35SFZkfLMGo4qX5aVs1iBnpEiFLSZmBP": { label: "Kraken BTC", type: "exchange" },
  "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h": { label: "Coinbase BTC", type: "exchange" },
};

const EXPLORER_MAP: Record<string, (h: string) => string> = {
  ethereum: (h) => `https://etherscan.io/tx/${h}`,
  bitcoin: (h) => `https://blockchair.com/bitcoin/transaction/${h}`,
  polygon: (h) => `https://polygonscan.com/tx/${h}`,
  bsc: (h) => `https://bscscan.com/tx/${h}`,
  xrp: (h) => `https://xrpscan.com/tx/${h}`,
  xlm: (h) => `https://stellarchain.io/transactions/${h}`,
  hbar: (h) => `https://hashscan.io/mainnet/transaction/${h}`,
  xdc: (h) => `https://xdcscan.io/txs/${h}`,
  dag: (h) => `https://dagexplorer.io/transaction/${h}`,
};

const WALLET_EXPLORER_MAP: Record<string, (a: string) => string> = {
  ethereum: (a) => `https://etherscan.io/address/${a}`,
  bitcoin: (a) => `https://blockchair.com/bitcoin/address/${a}`,
  polygon: (a) => `https://polygonscan.com/address/${a}`,
  bsc: (a) => `https://bscscan.com/address/${a}`,
  xrp: (a) => `https://xrpscan.com/account/${a}`,
  xlm: (a) => `https://stellarchain.io/accounts/${a}`,
  hbar: (a) => `https://hashscan.io/mainnet/account/${a}`,
  xdc: (a) => `https://xdcscan.io/address/${a}`,
  dag: (a) => `https://dagexplorer.io/address/${a}`,
};

// ─── Trail types ──────────────────────────────────────────────────────────────
interface TrailEntry {
  address: string;
  depth: number;
  parentAddress: string | null;
  knownInfo?: { label: string; type: string };
  isExpanded: boolean;
  isLoading: boolean;
  error?: boolean;
  totalValueUsd: number;
  txCount: number;
  childAddresses: string[];
}

// ─── Transaction type (from API) ──────────────────────────────────────────────
interface Tx {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  valueUsd: number;
  fee: string;
  feeUsd: number;
  timestamp: string;
  blockNumber: number;
  status: "success" | "failed" | "pending";
  direction: "in" | "out" | "self";
  tokenSymbol: string | null;
  tokenName: string | null;
}

// ─── Grouped by (address + direction) ─────────────────────────────────────────
interface GroupedRow {
  address: string;
  direction: "in" | "out";
  totalValue: number;
  txCount: number;
  latestTs: string;
  asset: string;
}

const LOAD_LIMIT = 100;

export default function WalletDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const address = params.address || "";
  type ChainId = "ethereum" | "bitcoin" | "polygon" | "bsc" | "xrp" | "xlm" | "hbar" | "xdc" | "dag";
  const chain = (new URLSearchParams(window.location.search).get("chain") || "ethereum") as ChainId;

  // ── Ledger view toggle ──
  const [groupByCounterparty, setGroupByCounterparty] = useState(false);

  // ── Accumulated transaction state ──
  const [allTxs, setAllTxs] = useState<Tx[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);

  // ── Saved wallets (localStorage) ──
  const [savedWallets, setSavedWallets] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("chaintrace-saved-wallets");
      return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const toggleSavedWallet = useCallback((addr: string) => {
    setSavedWallets((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      try { localStorage.setItem("chaintrace-saved-wallets", JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ── Counterparty context menu ──
  const [activeMenu, setActiveMenu] = useState<{ addr: string; x: number; y: number } | null>(null);

  // ── Trail trace ──
  const [showTrailPanel, setShowTrailPanel] = useState(false);
  const [trailEntries, setTrailEntries] = useState<TrailEntry[]>([]);
  const fetchingRef = useRef(new Set<string>());
  const trailPanelRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = () => setActiveMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  // ── Reset accumulated state on address/chain change ──
  useEffect(() => {
    setAllTxs([]);
    setNextCursor(null);
    setHasMore(false);
  }, [address, chain]);

  const { data: wallet, isLoading: walletLoading, error: walletError } = useGetWallet(
    address, { chain },
    { query: { enabled: !!address, queryKey: getGetWalletQueryKey(address, { chain }) } }
  );

  const { data: transactionsData, isLoading: txLoading } = useGetWalletTransactions(
    address, { chain, page: 1, limit: LOAD_LIMIT },
    { query: { enabled: !!address, queryKey: getGetWalletTransactionsQueryKey(address, { chain, page: 1, limit: LOAD_LIMIT }) } }
  );

  // ── Sync initial React Query data into local accumulated state ──
  useEffect(() => {
    if (!transactionsData?.transactions) return;
    const seen = new Set<string>();
    const deduped = transactionsData.transactions.filter((tx) => {
      const key = tx.hash || `${tx.from}:${tx.to}:${tx.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setAllTxs(deduped as Tx[]);
    setNextCursor(transactionsData.nextCursor ?? null);
    setHasMore(transactionsData.hasMore ?? false);
  }, [transactionsData]);

  // ── Load More (one page) ──
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || loadingAll) return;
    setLoadingMore(true);
    try {
      const url = `/api/wallets/${encodeURIComponent(address)}/transactions?chain=${chain}&limit=${LOAD_LIMIT}&cursor=${encodeURIComponent(nextCursor)}`;
      const resp = await fetch(url);
      const data = await resp.json() as { transactions: Tx[]; nextCursor: string | null; hasMore: boolean };
      const existingKeys = new Set(allTxs.map((t) => t.hash || `${t.from}:${t.to}:${t.timestamp}`));
      const newTxs = (data.transactions || []).filter((tx) => {
        const key = tx.hash || `${tx.from}:${tx.to}:${tx.timestamp}`;
        return !existingKeys.has(key);
      });
      setAllTxs((prev) => [...prev, ...newTxs]);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
    } catch { /* silently fail */ } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, loadingAll, allTxs, address, chain]);

  // ── Load All (loop until no more pages, cap at 2000) ──
  const loadAll = useCallback(async () => {
    if (!hasMore || loadingAll || loadingMore) return;
    setLoadingAll(true);
    let cursor = nextCursor;
    let accumulated = [...allTxs];
    const MAX_TXS = 2000;
    try {
      while (cursor && accumulated.length < MAX_TXS) {
        const url = `/api/wallets/${encodeURIComponent(address)}/transactions?chain=${chain}&limit=${LOAD_LIMIT}&cursor=${encodeURIComponent(cursor)}`;
        const resp = await fetch(url);
        const data = await resp.json() as { transactions: Tx[]; nextCursor: string | null; hasMore: boolean };
        const existingKeys = new Set(accumulated.map((t) => t.hash || `${t.from}:${t.to}:${t.timestamp}`));
        const newTxs = (data.transactions || []).filter((tx) => {
          const key = tx.hash || `${tx.from}:${tx.to}:${tx.timestamp}`;
          return !existingKeys.has(key);
        });
        accumulated = [...accumulated, ...newTxs];
        cursor = data.nextCursor ?? null;
        if (!cursor || !data.hasMore) break;
      }
      setAllTxs(accumulated);
      setNextCursor(cursor);
      setHasMore(cursor !== null && accumulated.length < MAX_TXS);
    } catch { /* silently fail */ } finally {
      setLoadingAll(false);
    }
  }, [hasMore, loadingAll, loadingMore, nextCursor, allTxs, address, chain]);

  // ── Group by (address + direction) ──
  const groupedRows = useMemo((): GroupedRow[] => {
    const map = new Map<string, GroupedRow>();
    for (const tx of allTxs) {
      if (tx.direction === "self") continue;
      const cp = tx.direction === "in" ? tx.from : tx.to;
      if (!cp) continue;
      const key = `${cp}:${tx.direction}`;
      const val = parseFloat(tx.value) || 0;
      const existing = map.get(key);
      if (existing) {
        existing.txCount++;
        existing.totalValue += val;
        if (tx.timestamp && tx.timestamp > existing.latestTs) existing.latestTs = tx.timestamp;
      } else {
        map.set(key, {
          address: cp,
          direction: tx.direction as "in" | "out",
          totalValue: val,
          txCount: 1,
          latestTs: tx.timestamp || "",
          asset: tx.tokenSymbol || chain.toUpperCase(),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.txCount - a.txCount);
  }, [allTxs, chain]);

  // ── Commingling detection ──
  const comminglingAddresses = useMemo(() => {
    const parentSets = new Map<string, Set<string>>();
    for (const e of trailEntries) {
      if (!e.parentAddress) continue;
      if (!parentSets.has(e.address)) parentSets.set(e.address, new Set());
      parentSets.get(e.address)!.add(e.parentAddress);
    }
    return new Set(
      Array.from(parentSets.entries())
        .filter(([, parents]) => parents.size > 1)
        .map(([addr]) => addr)
    );
  }, [trailEntries]);

  // ── Trail trace ──
  const expandTrailNode = useCallback(async (entry: TrailEntry) => {
    if (fetchingRef.current.has(entry.address) || entry.depth >= 5) return;
    fetchingRef.current.add(entry.address);
    setTrailEntries((prev) =>
      prev.map((e) => e.address === entry.address ? { ...e, isLoading: true } : e)
    );
    try {
      const resp = await fetch(`/api/wallets/${encodeURIComponent(entry.address)}/connections?chain=${chain}`);
      if (!resp.ok) throw new Error("fetch failed");
      const data = await resp.json() as {
        nodes: Array<{ address: string; riskScore: number | null }>;
        edges: Array<{ from: string; to: string; totalValueUsd: number; transactionCount: number }>;
        centerAddress: string;
      };
      const peers = (data.nodes || []).filter((n) => n.address !== entry.address).slice(0, 12);
      const edges = data.edges || [];
      setTrailEntries((prev) => {
        const existingAddrs = new Set(prev.map((e) => e.address));
        const updated = prev.map((e) =>
          e.address === entry.address
            ? { ...e, isLoading: false, isExpanded: true, childAddresses: peers.map((p) => p.address) }
            : e
        );
        const newEntries: TrailEntry[] = [];
        for (const peer of peers) {
          if (!existingAddrs.has(peer.address)) {
            const edge = edges.find(
              (ed) =>
                (ed.from === entry.address && ed.to === peer.address) ||
                (ed.to === entry.address && ed.from === peer.address)
            );
            newEntries.push({
              address: peer.address, depth: entry.depth + 1, parentAddress: entry.address,
              knownInfo: KNOWN_LABELS[peer.address],
              isExpanded: false, isLoading: false,
              totalValueUsd: edge?.totalValueUsd ?? 0, txCount: edge?.transactionCount ?? 0,
              childAddresses: [],
            });
          }
        }
        return [...updated, ...newEntries];
      });
    } catch {
      setTrailEntries((prev) =>
        prev.map((e) => e.address === entry.address ? { ...e, isLoading: false, error: true } : e)
      );
    } finally {
      fetchingRef.current.delete(entry.address);
    }
  }, [chain]);

  const startTrailTrace = useCallback(async (targetAddr: string) => {
    setShowTrailPanel(true);
    fetchingRef.current.clear();
    const rootEntry: TrailEntry = {
      address: targetAddr, depth: 0, parentAddress: null,
      knownInfo: KNOWN_LABELS[targetAddr],
      isExpanded: false, isLoading: true,
      totalValueUsd: 0, txCount: 0, childAddresses: [],
    };
    setTrailEntries([rootEntry]);
    try {
      const resp = await fetch(`/api/wallets/${encodeURIComponent(targetAddr)}/connections?chain=${chain}`);
      if (!resp.ok) throw new Error("fetch failed");
      const data = await resp.json() as {
        nodes: Array<{ address: string; riskScore: number | null }>;
        edges: Array<{ from: string; to: string; totalValueUsd: number; transactionCount: number }>;
        centerAddress: string;
      };
      const peers = (data.nodes || []).filter((n) => n.address !== targetAddr).slice(0, 12);
      const edges = data.edges || [];
      const rootExpanded: TrailEntry = {
        ...rootEntry, isLoading: false, isExpanded: true,
        childAddresses: peers.map((p) => p.address),
      };
      const peerEntries: TrailEntry[] = peers.map((peer) => {
        const edge = edges.find(
          (ed) =>
            (ed.from === targetAddr && ed.to === peer.address) ||
            (ed.to === targetAddr && ed.from === peer.address)
        );
        return {
          address: peer.address, depth: 1, parentAddress: targetAddr,
          knownInfo: KNOWN_LABELS[peer.address],
          isExpanded: false, isLoading: false,
          totalValueUsd: edge?.totalValueUsd ?? 0, txCount: edge?.transactionCount ?? 0,
          childAddresses: [],
        };
      });
      setTrailEntries([rootExpanded, ...peerEntries]);
    } catch {
      setTrailEntries([{ ...rootEntry, isLoading: false, error: true }]);
    }
    setTimeout(() => {
      trailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  }, [chain]);

  const continueTrailOnWallet = useCallback((addr: string) => {
    setActiveMenu(null);
    startTrailTrace(addr);
  }, [startTrailTrace]);

  // ── Helpers ──
  const getRiskBadge = (score: number | null) => {
    if (score === null)
      return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono"><Shield className="w-3 h-3" /> UNSCORED</span>;
    if (score <= 30)
      return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-950/60 text-green-400 font-mono"><ShieldCheck className="w-3 h-3" /> LOW RISK ({score})</span>;
    if (score <= 70)
      return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-yellow-950/60 text-yellow-400 font-mono"><ShieldAlert className="w-3 h-3" /> MED RISK ({score})</span>;
    return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-950/60 text-red-400 font-mono"><ShieldAlert className="w-3 h-3" /> HIGH RISK ({score})</span>;
  };

  const getKnownBadge = (info?: { label: string; type: string }) => {
    if (!info) return null;
    const colors: Record<string, string> = {
      exchange: "bg-blue-950/60 text-blue-400 border-blue-500/20",
      genesis: "bg-purple-950/60 text-purple-400 border-purple-500/20",
      defi: "bg-teal-950/60 text-teal-400 border-teal-500/20",
      flagged: "bg-red-950/60 text-red-400 border-red-500/20",
    };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${colors[info.type] ?? colors.exchange}`}>
        {info.label}
      </span>
    );
  };

  const renderCounterpartyCell = (addr: string | null, dir: string) => {
    if (!addr) {
      return dir === "out"
        ? <span className="text-muted-foreground text-xs">CONTRACT CREATION</span>
        : <span className="text-muted-foreground text-xs">—</span>;
    }
    const known = KNOWN_LABELS[addr];
    const saved = savedWallets.has(addr);
    const explorerAddrUrl = WALLET_EXPLORER_MAP[chain];
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setActiveMenu({ addr, x: rect.left, y: rect.bottom + 4 });
          }}
          className="text-primary/80 hover:text-primary text-xs hover:underline transition-colors font-mono"
          title={addr}
        >
          {addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr}
        </button>
        {known && getKnownBadge(known)}
        {saved && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
        {explorerAddrUrl && (
          <a
            href={explorerAddrUrl(addr)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    );
  };

  const explorerTxUrl = EXPLORER_MAP[chain];

  if (walletError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <ShieldAlert className="w-16 h-16 text-destructive opacity-40" />
        <h2 className="text-xl font-mono text-destructive tracking-widest">PROFILE NOT FOUND</h2>
        <p className="text-muted-foreground text-sm max-w-md font-mono">
          Target address could not be resolved on the{" "}
          <span className="text-primary uppercase">{chain}</span> network.
        </p>
        <Link href="/">
          <Button variant="outline" className="font-mono mt-4 tracking-wider">RETURN TO SEARCH</Button>
        </Link>
      </div>
    );
  }

  const inCount = allTxs.filter((t) => t.direction === "in").length;
  const outCount = allTxs.filter((t) => t.direction === "out").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" onClick={() => setActiveMenu(null)}>

      {/* ── Counterparty context menu ── */}
      {activeMenu && (
        <div
          className="fixed z-50 bg-card border border-border/60 rounded-lg shadow-xl shadow-black/40 overflow-hidden min-w-[220px]"
          style={{ top: Math.min(activeMenu.y, window.innerHeight - 160), left: Math.min(activeMenu.x, window.innerWidth - 240) }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-border/40 bg-muted/20">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Counterparty</p>
            <p className="text-xs font-mono text-primary truncate max-w-[200px]">{activeMenu.addr}</p>
          </div>
          <div className="p-1">
            <button
              onClick={() => { setActiveMenu(null); setLocation(`/wallet/${activeMenu.addr}?chain=${chain}`); }}
              className="w-full text-left px-3 py-2 text-xs font-mono text-foreground hover:bg-muted/40 rounded-md transition-colors flex items-center gap-2"
            >
              <Network className="w-3 h-3 text-muted-foreground" /> View Profile
            </button>
            <button
              onClick={() => continueTrailOnWallet(activeMenu.addr)}
              className="w-full text-left px-3 py-2 text-xs font-mono text-primary hover:bg-primary/10 rounded-md transition-colors flex items-center gap-2"
            >
              <GitFork className="w-3 h-3" /> Continue Trail on this Wallet
            </button>
            <button
              onClick={() => { toggleSavedWallet(activeMenu.addr); setActiveMenu(null); }}
              className={`w-full text-left px-3 py-2 text-xs font-mono rounded-md transition-colors flex items-center gap-2 ${
                savedWallets.has(activeMenu.addr)
                  ? "text-yellow-400 hover:bg-yellow-950/30"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {savedWallets.has(activeMenu.addr)
                ? <><BookmarkCheck className="w-3 h-3" /> Remove from Saved</>
                : <><Bookmark className="w-3 h-3" /> Save / Add to Trail Wallet</>
              }
            </button>
            <a
              href={WALLET_EXPLORER_MAP[chain]?.(activeMenu.addr) ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setActiveMenu(null)}
              className="w-full text-left px-3 py-2 text-xs font-mono text-muted-foreground hover:bg-muted/40 rounded-md transition-colors flex items-center gap-2 block"
            >
              <ExternalLink className="w-3 h-3" /> Open in Explorer
            </a>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-3 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-mono rounded uppercase border border-primary/20">{chain}</span>
            {walletLoading ? <div className="w-28 h-5 bg-muted/50 rounded animate-pulse" /> : getRiskBadge(wallet?.riskScore ?? null)}
            {wallet?.isContract && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-950/50 text-blue-400 text-xs font-mono rounded border border-blue-500/20">
                <FileCode className="w-3 h-3" /> CONTRACT
              </span>
            )}
            {wallet?.tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-muted text-muted-foreground text-xs font-mono rounded">
                <Tag className="w-3 h-3" /> {tag.toUpperCase()}
              </span>
            ))}
            {KNOWN_LABELS[address] && getKnownBadge(KNOWN_LABELS[address])}
            {savedWallets.has(address) && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-950/50 text-yellow-400 text-xs font-mono rounded border border-yellow-500/20">
                <Bookmark className="w-3 h-3 fill-yellow-400" /> SAVED
              </span>
            )}
          </div>
          <div className="font-mono text-sm text-foreground break-all bg-muted/20 px-3 py-2 rounded border border-border/40">
            <AddressDisplay address={address} truncate={false} showIcon />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/trace/${address}?chain=${chain}`}>
            <Button variant="outline" className="font-mono border-primary/30 text-primary hover:bg-primary/10 text-xs">
              <Network className="w-3.5 h-3.5 mr-1.5" /> TRACE GRAPH
            </Button>
          </Link>
          <Button
            className="font-mono bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
            onClick={() => startTrailTrace(address)}
          >
            <GitFork className="w-3.5 h-3.5 mr-1.5" /> START TRAIL TRACE
          </Button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "BALANCE", value: wallet?.balance ?? "0", sub: `$${(wallet?.balanceUsd ?? 0).toLocaleString()}`, subClass: "text-green-400" },
          { label: "TRANSACTIONS", value: (wallet?.transactionCount ?? 0).toLocaleString(), sub: null },
          { label: "FIRST SEEN", value: wallet?.firstSeen ? new Date(wallet.firstSeen).toLocaleDateString() : "UNKNOWN", sub: null },
          { label: "LAST ACTIVE", value: wallet?.lastSeen ? new Date(wallet.lastSeen).toLocaleDateString() : "UNKNOWN", sub: null },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card/40 border-border/40">
            <CardContent className="p-4">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">{stat.label}</div>
              {walletLoading ? (
                <div className="h-7 bg-muted/50 rounded animate-pulse" />
              ) : (
                <>
                  <div className="text-xl font-mono text-foreground truncate">{stat.value}</div>
                  {stat.sub && <div className={`text-xs font-mono mt-0.5 ${stat.subClass ?? "text-muted-foreground"}`}>{stat.sub}</div>}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Transaction Ledger ── */}
      <Card className="bg-card/40 border-border/40">
        <CardHeader className="border-b border-border/40 pb-4 px-5 pt-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-foreground">Transaction Ledger</CardTitle>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {allTxs.length} loaded{hasMore ? ` · more available` : " · complete"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setGroupByCounterparty((v) => !v)}
                className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border transition-colors ${
                  groupByCounterparty
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-muted/20 text-muted-foreground border-border/40 hover:border-primary/30 hover:text-primary"
                }`}
              >
                <Users className="w-3 h-3" />
                GROUP BY COUNTERPARTY
              </button>
              <div className="text-right">
                <div className="text-xs font-mono text-muted-foreground">
                  {txLoading ? "LOADING..." : groupByCounterparty
                    ? `${groupedRows.length} COUNTERPARTY ROWS`
                    : `${allTxs.length} TXS`}
                </div>
                <div className="flex gap-3 mt-0.5 text-xs font-mono justify-end">
                  <span className="text-green-400">↓ {inCount} IN</span>
                  <span className="text-red-400">↑ {outCount} OUT</span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          {groupByCounterparty ? (
            /* ── GROUPED BY (address + direction) VIEW ── */
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-xs font-mono text-muted-foreground bg-muted/10">
                  <th className="px-5 py-3 font-normal w-20">DIR</th>
                  <th className="px-5 py-3 font-normal">COUNTERPARTY</th>
                  <th className="px-5 py-3 font-normal text-center">TXS</th>
                  <th className="px-5 py-3 font-normal text-right">TOTAL AMOUNT</th>
                  <th className="px-5 py-3 font-normal text-right">ASSET</th>
                  <th className="px-5 py-3 font-normal text-right">LAST SEEN</th>
                  <th className="px-5 py-3 font-normal"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {txLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={7} className="px-5 py-3"><div className="h-5 bg-muted/40 rounded animate-pulse" /></td></tr>
                  ))
                ) : groupedRows.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground font-mono text-sm">NO TRANSACTIONS FOUND</td></tr>
                ) : (
                  groupedRows.map((row, idx) => {
                    const known = KNOWN_LABELS[row.address];
                    const saved = savedWallets.has(row.address);
                    return (
                      <tr key={`${row.address}:${row.direction}:${idx}`} className="hover:bg-muted/10 transition-colors text-sm font-mono">
                        <td className="px-5 py-3">
                          {row.direction === "in" ? (
                            <span className="inline-flex items-center gap-1 text-green-400 bg-green-950/40 border border-green-500/20 px-2 py-0.5 rounded text-xs"><ArrowDownLeft className="w-3 h-3" /> IN</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-400 bg-red-950/40 border border-red-500/20 px-2 py-0.5 rounded text-xs"><ArrowUpRight className="w-3 h-3" /> OUT</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveMenu({ addr: row.address, x: rect.left, y: rect.bottom + 4 });
                              }}
                              className="text-primary/80 hover:text-primary text-xs hover:underline font-mono"
                            >
                              {row.address.length > 16 ? `${row.address.slice(0, 10)}…${row.address.slice(-4)}` : row.address}
                            </button>
                            {known && getKnownBadge(known)}
                            {saved && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                            <a
                              href={WALLET_EXPLORER_MAP[chain]?.(row.address) ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-muted-foreground hover:text-primary transition-colors"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-center text-muted-foreground">{row.txCount}</td>
                        <td className={`px-5 py-3 text-right text-xs ${row.direction === "in" ? "text-green-400" : "text-red-400"}`}>
                          {row.direction === "in" ? "+" : "−"}{row.totalValue.toFixed(4)}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground text-xs uppercase">{row.asset}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground text-xs">
                          {row.latestTs ? new Date(row.latestTs).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => continueTrailOnWallet(row.address)}
                            className="text-[10px] font-mono text-primary/70 hover:text-primary border border-primary/20 hover:border-primary/50 px-2 py-0.5 rounded transition-colors whitespace-nowrap"
                          >
                            TRAIL →
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            /* ── INDIVIDUAL TX VIEW ── */
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-xs font-mono text-muted-foreground bg-muted/10">
                  <th className="px-5 py-3 font-normal w-20">DIR</th>
                  <th className="px-5 py-3 font-normal">TX HASH</th>
                  <th className="px-5 py-3 font-normal">TIMESTAMP</th>
                  <th className="px-5 py-3 font-normal">COUNTERPARTY</th>
                  <th className="px-5 py-3 font-normal text-right">AMOUNT</th>
                  <th className="px-5 py-3 font-normal text-right">ASSET</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {txLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-5 py-3"><div className="h-5 bg-muted/40 rounded animate-pulse" /></td></tr>
                  ))
                ) : allTxs.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground font-mono text-sm">NO TRANSACTIONS FOUND</td></tr>
                ) : (
                  allTxs.map((tx, idx) => {
                    const counterparty = tx.direction === "in" ? tx.from : tx.to;
                    const isIn = tx.direction === "in";
                    const isOut = tx.direction === "out";
                    const val = parseFloat(tx.value);
                    return (
                      <tr key={tx.hash || idx} className="hover:bg-muted/10 transition-colors text-sm font-mono">
                        <td className="px-5 py-3">
                          {isIn ? (
                            <span className="inline-flex items-center gap-1 text-green-400 bg-green-950/40 border border-green-500/20 px-2 py-0.5 rounded text-xs font-bold">
                              <ArrowDownLeft className="w-3 h-3" /> IN
                            </span>
                          ) : isOut ? (
                            <span className="inline-flex items-center gap-1 text-red-400 bg-red-950/40 border border-red-500/20 px-2 py-0.5 rounded text-xs font-bold">
                              <ArrowUpRight className="w-3 h-3" /> OUT
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground bg-muted/40 border border-border/40 px-2 py-0.5 rounded text-xs">
                              <ArrowLeftRight className="w-3 h-3" /> SELF
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {tx.hash ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-primary/80 text-xs">
                                {tx.hash.length > 12 ? `${tx.hash.slice(0, 8)}…${tx.hash.slice(-4)}` : tx.hash}
                              </span>
                              {explorerTxUrl && (
                                <a href={explorerTxUrl(tx.hash)} target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">
                          {tx.timestamp ? new Date(tx.timestamp).toLocaleString(undefined, {
                            month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
                          }) : "—"}
                        </td>
                        <td className="px-5 py-3">{renderCounterpartyCell(counterparty ?? null, tx.direction)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className={val > 0 ? isIn ? "text-green-400" : isOut ? "text-red-400" : "text-foreground" : "text-muted-foreground"}>
                            {isIn ? "+" : isOut ? "−" : ""}{tx.value}
                          </div>
                          {tx.valueUsd > 0 && <div className="text-xs text-muted-foreground mt-0.5">${tx.valueUsd.toLocaleString()}</div>}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground text-xs uppercase">
                          {tx.tokenSymbol || chain.toUpperCase()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Load More / Load All ── */}
        {hasMore && !txLoading && (
          <div className="px-5 py-4 border-t border-border/40 bg-muted/5 flex items-center justify-between gap-4">
            <span className="text-xs font-mono text-muted-foreground">
              {allTxs.length} transactions loaded · more available
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs"
                disabled={loadingMore || loadingAll}
                onClick={loadMore}
              >
                {loadingMore ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> LOADING…</> : "LOAD MORE"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs border-primary/30 text-primary hover:bg-primary/10"
                disabled={loadingMore || loadingAll}
                onClick={loadAll}
              >
                {loadingAll ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> LOADING ALL…</> : "LOAD ALL HISTORY"}
              </Button>
            </div>
          </div>
        )}
        {!hasMore && allTxs.length > 0 && !txLoading && (
          <div className="px-5 py-3 border-t border-border/40 text-center text-xs font-mono text-muted-foreground/60">
            FULL HISTORY LOADED · {allTxs.length} TRANSACTIONS
          </div>
        )}
      </Card>

      {/* ── Trail Trace Panel ── */}
      {showTrailPanel && (
        <Card ref={trailPanelRef} className="bg-card/40 border-border/40 border-primary/20">
          <CardHeader className="border-b border-border/40 pb-4 px-5 pt-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-primary">
                  Trail Trace // Active
                </CardTitle>
                <span className="text-xs font-mono text-muted-foreground">
                  MAX DEPTH 5 · {trailEntries.length} NODES
                </span>
                {comminglingAddresses.size > 0 && (
                  <span className="flex items-center gap-1 text-xs font-mono text-yellow-400 bg-yellow-950/40 border border-yellow-500/20 px-2 py-0.5 rounded">
                    <AlertTriangle className="w-3 h-3" />
                    {comminglingAddresses.size} COMMINGLING DETECTED
                  </span>
                )}
              </div>
              <button onClick={() => setShowTrailPanel(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-4 mt-3 text-[10px] font-mono text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" /> Target</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Exchange</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Commingling</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" /> Standard Wallet</span>
            </div>
          </CardHeader>

          <div className="p-4 space-y-1 max-h-[500px] overflow-y-auto">
            {trailEntries.map((entry) => {
              const isCommingling = comminglingAddresses.has(entry.address);
              const isExchange = entry.knownInfo?.type === "exchange";
              const isGenesis = entry.knownInfo?.type === "genesis";
              const isRoot = entry.depth === 0;

              let dotColor = "bg-muted-foreground";
              if (isRoot) dotColor = "bg-primary";
              else if (isExchange) dotColor = "bg-blue-500";
              else if (isGenesis) dotColor = "bg-purple-500";
              else if (isCommingling) dotColor = "bg-yellow-500";

              let rowBg = "hover:bg-muted/10";
              if (isCommingling) rowBg = "bg-yellow-950/20 hover:bg-yellow-950/30 border-l-2 border-yellow-500/40";
              else if (isExchange) rowBg = "bg-blue-950/10 hover:bg-blue-950/20";
              else if (isRoot) rowBg = "bg-primary/5 border-l-2 border-primary/40";

              return (
                <div
                  key={`${entry.address}-${entry.depth}-${entry.parentAddress}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded text-xs font-mono transition-colors ${rowBg}`}
                  style={{ paddingLeft: `${12 + entry.depth * 20}px` }}
                >
                  {entry.depth > 0 && (
                    <span className="text-border/60 shrink-0">{"└─"}</span>
                  )}
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${entry.isLoading ? "animate-pulse" : ""}`} />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActiveMenu({ addr: entry.address, x: rect.left, y: rect.bottom + 4 });
                    }}
                    className="text-primary/80 hover:text-primary hover:underline transition-colors truncate max-w-[200px]"
                  >
                    {entry.address.length > 20 ? `${entry.address.slice(0, 10)}…${entry.address.slice(-6)}` : entry.address}
                  </button>
                  {entry.knownInfo && getKnownBadge(entry.knownInfo)}
                  {savedWallets.has(entry.address) && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                  {isCommingling && (
                    <span className="flex items-center gap-1 text-yellow-400 bg-yellow-950/40 px-1.5 py-0.5 rounded border border-yellow-500/20">
                      <AlertTriangle className="w-2.5 h-2.5" /> COMMINGLING
                    </span>
                  )}
                  <span className="text-muted-foreground/60 shrink-0">D{entry.depth}</span>
                  {entry.totalValueUsd > 0 && (
                    <span className="text-muted-foreground shrink-0">${entry.totalValueUsd.toFixed(0)}</span>
                  )}
                  {entry.txCount > 0 && (
                    <span className="text-muted-foreground/60 shrink-0">{entry.txCount} tx</span>
                  )}
                  {entry.error && <span className="text-red-400 text-[10px]">FETCH FAILED</span>}
                  {entry.isLoading && <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />}
                  {!entry.isLoading && !entry.isExpanded && !entry.error && entry.depth < 5 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); expandTrailNode(entry); }}
                      className="ml-auto shrink-0 flex items-center gap-1 text-[10px] text-primary/60 hover:text-primary border border-primary/20 hover:border-primary/50 px-1.5 py-0.5 rounded transition-colors"
                    >
                      <ChevronRight className="w-2.5 h-2.5" /> EXPAND
                    </button>
                  )}
                  {entry.isExpanded && entry.childAddresses.length > 0 && (
                    <span className="ml-auto shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <ChevronDown className="w-2.5 h-2.5" /> {entry.childAddresses.length} peers
                    </span>
                  )}
                  {entry.isExpanded && entry.childAddresses.length === 0 && (
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/40">NO CONNECTIONS</span>
                  )}
                  {entry.depth >= 5 && (
                    <span className="ml-auto shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground/40">
                      <Zap className="w-2.5 h-2.5" /> MAX DEPTH
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
