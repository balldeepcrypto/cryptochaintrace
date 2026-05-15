import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useSaveSearch } from "@workspace/api-client-react";
import { Search, ShieldAlert, History, LayoutDashboard, Heart, Copy, Clock, Bookmark, Eye, GitBranch, BookmarkX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveRecentSearch, getRecentSearches, type RecentSearchEntry } from "@/lib/recent-searches";

const CHAINS = [
  { value: "ethereum", label: "Ethereum" },
  { value: "bitcoin", label: "Bitcoin" },
  { value: "xrp", label: "XRP (XRPL)" },
  { value: "xlm", label: "XLM (Stellar)" },
  { value: "hbar", label: "HBAR (Hedera)" },
  { value: "xdc", label: "XDC" },
  { value: "dag", label: "DAG (Constellation)" },
];

const CHAIN_COLORS: Record<string, string> = {
  ethereum: "text-blue-400 bg-blue-950/40 border-blue-500/30",
  bitcoin: "text-orange-400 bg-orange-950/40 border-orange-500/30",
  xrp: "text-cyan-400 bg-cyan-950/40 border-cyan-500/30",
  xlm: "text-sky-400 bg-sky-950/40 border-sky-500/30",
  hbar: "text-violet-400 bg-violet-950/40 border-violet-500/30",
  xdc: "text-green-400 bg-green-950/40 border-green-500/30",
  dag: "text-pink-400 bg-pink-950/40 border-pink-500/30",
};

const CHAIN_LABELS: Record<string, string> = {
  ethereum: "ETH",
  bitcoin: "BTC",
  xrp: "XRP",
  xlm: "XLM",
  hbar: "HBAR",
  xdc: "XDC",
  dag: "DAG",
};

function truncateAddr(addr: string): string {
  if (addr.length <= 20) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

function detectChain(addr: string): string {
  if (/^0\.0\.\d+$/.test(addr)) return "hbar";
  if (/^G[A-Z2-7]{54}$/.test(addr)) return "xlm";
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,40}$/.test(addr)) return "xrp";
  if (/^DAG/i.test(addr)) return "dag";
  if (/^xdc[0-9a-fA-F]{40}$/.test(addr)) return "xdc";
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return "ethereum";
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(addr)) return "bitcoin";
  return "ethereum";
}

function loadSavedWallets(): string[] {
  try {
    const raw = localStorage.getItem("chaintrace-saved-wallets");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("ethereum");
  const [showDonate, setShowDonate] = useState(true);
  const [recentSearches, setRecentSearches] = useState<RecentSearchEntry[]>(() => getRecentSearches());
  const [savedWallets, setSavedWallets] = useState<string[]>(() => loadSavedWallets());

  const saveSearch = useSaveSearch();

  useEffect(() => {
    setRecentSearches(getRecentSearches());
    const handler = () => setRecentSearches(getRecentSearches());
    window.addEventListener("chaintrace-recent-searches-updated", handler);
    return () => window.removeEventListener("chaintrace-recent-searches-updated", handler);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "chaintrace-saved-wallets") {
        setSavedWallets(loadSavedWallets());
      }
    };
    window.addEventListener("storage", onStorage);
    const onCustom = () => setSavedWallets(loadSavedWallets());
    window.addEventListener("chaintrace-saved-wallets-updated", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("chaintrace-saved-wallets-updated", onCustom);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;

    const trimmedAddress = address.trim();
    saveRecentSearch(trimmedAddress, chain);
    setLocation(`/wallet/${trimmedAddress}?chain=${chain}`);
    saveSearch.mutate({ data: { address: trimmedAddress, chain } });
  };

  const removeFromWatchlist = (addr: string) => {
    setSavedWallets((prev) => {
      const next = prev.filter((a) => a !== addr);
      try { localStorage.setItem("chaintrace-saved-wallets", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const recentChainMap = new Map<string, string>(
    recentSearches.map((s) => [s.address, s.chain])
  );

  const DONATE_ADDRESSES = [
    { chain: "XLM", symbol: "XLM", color: "text-sky-300",    bg: "bg-sky-950/40",    border: "border-sky-500/30",    address: "GCXUMH47OGMC6JKUCMNG5KSKUOZGX7H4A6P2YZTZ2FCA2ZEB2PPSB6XW" },
    { chain: "XRP", symbol: "XRP", color: "text-cyan-300",   bg: "bg-cyan-950/40",   border: "border-cyan-500/30",   address: "rHm4Erz4urYGqvssR6Rs8DwsQkDeEQwxuV" },
    { chain: "BTC", symbol: "BTC", color: "text-orange-300", bg: "bg-orange-950/40", border: "border-orange-500/30", address: "bc1q3k20tfjatu8prsszr9jmtyayj665af2aavfeyt" },
    { chain: "ETH", symbol: "ETH", color: "text-blue-300",   bg: "bg-blue-950/40",   border: "border-blue-500/30",   address: "0x0b3E9efb09Ead589F9F4c957228eE5E45B286d55" },
  ];

  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const copyAddr = (addr: string) => {
    navigator.clipboard.writeText(addr).catch(() => {});
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 2000);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Intelligence Search</h1>
        <p className="text-muted-foreground font-mono text-sm">Enter target wallet address for full profile extraction.</p>
      </div>

      {/* ── Donate / Support banner ── */}
      <div className="rounded-xl border-2 border-pink-500/50 bg-gradient-to-r from-pink-950/60 via-rose-900/30 to-pink-950/60 shadow-xl shadow-pink-500/20 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 via-transparent to-rose-500/5 pointer-events-none" />
        <div className="flex items-start gap-4 p-5 relative">
          <div className="flex-shrink-0 w-14 h-14 rounded-full bg-pink-500/25 border-2 border-pink-500/50 flex items-center justify-center shadow-lg shadow-pink-500/30">
            <Heart className="w-6 h-6 text-pink-400 fill-pink-400/60" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-extrabold text-pink-300 font-mono tracking-widest uppercase">❤️ Support This Free Tool</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="text-pink-200 font-bold">100% free</span> — no fees, ads, or data selling.
                  If CryptoChainTrace helped your investigation, even a small donation keeps the servers running.
                </p>
              </div>
              <button
                onClick={() => setShowDonate(!showDonate)}
                className="flex-shrink-0 px-4 py-2 rounded-lg border-2 border-pink-500/60 bg-pink-500/15 hover:bg-pink-500/30 text-pink-200 font-mono text-xs font-extrabold tracking-widest transition-colors shadow-md"
              >
                {showDonate ? "HIDE ↑" : "DONATE ↓"}
              </button>
            </div>

            {showDonate && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {DONATE_ADDRESSES.map(({ chain: c, symbol, color, bg, border, address: addr }) => (
                  <div key={c} className={`flex items-center gap-2.5 rounded-lg ${bg} border-2 ${border} px-3 py-3 group hover:opacity-90 transition-opacity`}>
                    <div className="flex-shrink-0 w-12 text-center">
                      <span className={`text-sm font-mono font-extrabold ${color} block leading-none`}>{symbol}</span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">{addr}</span>
                    <button
                      onClick={() => copyAddr(addr)}
                      className={`flex-shrink-0 ${color} opacity-70 hover:opacity-100 transition-opacity`}
                      title={`Copy ${symbol} address`}
                    >
                      {copiedAddr === addr
                        ? <span className="text-[9px] font-mono text-green-400 font-bold">COPIED!</span>
                        : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Card className="border-primary/20 bg-card/40 shadow-lg shadow-primary/5">
        <CardContent className="p-6">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
            <div className="w-52">
              <Select value={chain} onValueChange={setChain}>
                <SelectTrigger className="font-mono">
                  <SelectValue placeholder="Network" />
                </SelectTrigger>
                <SelectContent>
                  {CHAINS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x..., bc1..., r..., G..."
                className="pl-9 font-mono bg-background/50 border-input"
              />
            </div>
            <Button type="submit" disabled={!address.trim()} className="w-full md:w-32 font-mono">
              TRACE
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 bg-card/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Recent Targets</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {recentSearches.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground font-mono">
                NO RECENT TARGETS — search a wallet above to begin
              </div>
            ) : (
              <div className="space-y-1">
                {recentSearches.map((s, idx) => {
                  const chainColor = CHAIN_COLORS[s.chain] ?? "text-muted-foreground bg-muted border-border";
                  return (
                    <div
                      key={`${s.address}-${s.chain}-${idx}`}
                      onClick={() => setLocation(`/wallet/${s.address}?chain=${s.chain}`)}
                      className="flex items-center justify-between p-3 rounded hover:bg-accent/50 cursor-pointer transition-colors group border border-transparent hover:border-border/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-primary/50 group-hover:bg-primary transition-colors shrink-0" />
                        <span className="font-mono text-sm truncate" title={s.address}>{truncateAddr(s.address)}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${chainColor}`}>
                          {s.chain}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(s.searchedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card/40">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">System Stats</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-border/50 pb-2">
                  <span className="text-xs font-mono text-muted-foreground">TOTAL TARGETS</span>
                  <span className="text-xl font-mono text-primary">{recentSearches.length}</span>
                </div>
                <div className="flex justify-between items-end border-b border-border/50 pb-2">
                  <span className="text-xs font-mono text-muted-foreground">UNIQUE CHAINS</span>
                  <span className="text-xl font-mono text-primary">
                    {new Set(recentSearches.map((s) => s.chain)).size}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-xs font-mono text-muted-foreground">WATCHLIST</span>
                  <span className="text-xl font-mono text-yellow-400">{savedWallets.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/40 border-destructive/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-destructive" />
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-destructive">Most Searched</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {recentSearches.length === 0 ? (
                <div className="text-xs text-muted-foreground font-mono">NO DATA</div>
              ) : (
                <div className="space-y-2">
                  {recentSearches.slice(0, 3).map((w, idx) => {
                    const chainColor = CHAIN_COLORS[w.chain] ?? "text-muted-foreground bg-muted";
                    return (
                      <div
                        key={idx}
                        onClick={() => setLocation(`/wallet/${w.address}?chain=${w.chain}`)}
                        className="flex items-center justify-between text-sm cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <span className="font-mono text-xs truncate" title={w.address}>{truncateAddr(w.address)}</span>
                        <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${chainColor}`}>
                          {w.chain}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── WATCHLIST ── */}
      <Card className="bg-card/40 border-yellow-500/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-yellow-400 fill-yellow-400/40" />
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-yellow-400">
                Watchlist
              </CardTitle>
              {savedWallets.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-yellow-500/30 bg-yellow-950/40 text-yellow-400">
                  {savedWallets.length}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {savedWallets.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground font-mono">
              NO SAVED WALLETS — star a wallet on its profile page to add it here
            </div>
          ) : (
            <div className="space-y-1">
              {savedWallets.map((addr) => {
                const detectedChain = recentChainMap.get(addr) ?? detectChain(addr);
                const chainColor = CHAIN_COLORS[detectedChain] ?? "text-muted-foreground bg-muted border-border";
                const chainLabel = CHAIN_LABELS[detectedChain] ?? detectedChain.toUpperCase();
                return (
                  <div
                    key={addr}
                    className="flex items-center justify-between p-3 rounded border border-transparent hover:bg-accent/30 hover:border-yellow-500/20 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Bookmark className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border shrink-0 ${chainColor}`}>
                        {chainLabel}
                      </span>
                      <span className="font-mono text-sm truncate text-foreground/90" title={addr}>
                        {truncateAddr(addr)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      <button
                        onClick={() => setLocation(`/wallet/${addr}?chain=${detectedChain}`)}
                        title="View Profile"
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold text-blue-300 border border-blue-500/30 bg-blue-950/30 hover:bg-blue-900/50 transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        <span className="hidden sm:inline">PROFILE</span>
                      </button>
                      <button
                        onClick={() => setLocation(`/trace/${addr}?chain=${detectedChain}`)}
                        title="Start Trail Trace"
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 transition-colors"
                      >
                        <GitBranch className="w-3 h-3" />
                        <span className="hidden sm:inline">TRACE</span>
                      </button>
                      <button
                        onClick={() => removeFromWatchlist(addr)}
                        title="Remove from Watchlist"
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold text-muted-foreground border border-border/40 hover:border-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <BookmarkX className="w-3 h-3" />
                        <span className="hidden sm:inline">REMOVE</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
