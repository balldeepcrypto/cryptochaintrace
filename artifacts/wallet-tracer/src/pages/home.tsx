import { useState } from "react";
import { useLocation } from "wouter";
import { useGetRecentSearches, useGetSearchStats, useSaveSearch } from "@workspace/api-client-react";
import { Search, ShieldAlert, History, LayoutDashboard, Heart, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddressDisplay } from "@/components/address-display";

const CHAINS = [
  { value: "ethereum", label: "Ethereum" },
  { value: "bitcoin", label: "Bitcoin" },
  { value: "polygon", label: "Polygon" },
  { value: "bsc", label: "BSC" },
  { value: "xrp", label: "XRP (XRPL)" },
  { value: "xlm", label: "XLM (Stellar)" },
  { value: "hbar", label: "HBAR (Hedera)" },
  { value: "xdc", label: "XDC" },
  { value: "dag", label: "DAG (Constellation)" },
];

export default function Home() {
  const [, setLocation] = useLocation();
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("ethereum");
  const [showDonate, setShowDonate] = useState(false);

  const { data: recentSearches, isLoading: recentLoading } = useGetRecentSearches();
  const { data: stats, isLoading: statsLoading } = useGetSearchStats();
  const saveSearch = useSaveSearch();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;

    saveSearch.mutate(
      { data: { address, chain } },
      {
        onSuccess: () => {
          setLocation(`/wallet/${address}?chain=${chain}`);
        },
      }
    );
  };

  const DONATE_ADDRESSES = [
    { chain: "ETH", symbol: "ETH", address: "0x742d35Cc6634C0532925a3b8D4C9b9b8D8b8D8b8" },
    { chain: "BTC", symbol: "BTC", address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
    { chain: "XRP", symbol: "XRP", address: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh" },
    { chain: "DAG", symbol: "DAG", address: "DAG3WnpWbwnnKBLtu8FvBp3VUkmxJgdcs41dTHg5" },
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
      <div className="rounded-xl border border-pink-500/30 bg-gradient-to-r from-pink-950/40 via-rose-900/20 to-pink-950/40 shadow-lg shadow-pink-500/10 overflow-hidden">
        <div className="flex items-start gap-4 p-5">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-pink-500/20 border border-pink-500/40 flex items-center justify-center">
            <Heart className="w-5 h-5 text-pink-400 fill-pink-400/30" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-pink-400 font-mono tracking-wide">Support This Free Tool</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  <span className="text-pink-300 font-semibold">100% free</span> — no fees, ads, or data selling.
                  CryptoChainTrace is community-powered. Even a small donation keeps the servers running and new chains coming.
                </p>
              </div>
              <button
                onClick={() => setShowDonate(!showDonate)}
                className="flex-shrink-0 px-4 py-1.5 rounded border border-pink-500/50 bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 font-mono text-xs font-bold tracking-wider transition-colors"
              >
                {showDonate ? "HIDE ↑" : "DONATE ↓"}
              </button>
            </div>

            {showDonate && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DONATE_ADDRESSES.map(({ chain: c, symbol, address: addr }) => (
                  <div key={c} className="flex items-center gap-2 rounded-lg bg-black/30 border border-pink-500/20 px-3 py-2 group">
                    <span className="text-xs font-mono font-bold text-pink-400 w-8 flex-shrink-0">{symbol}</span>
                    <span className="text-xs font-mono text-muted-foreground truncate flex-1">{addr}</span>
                    <button
                      onClick={() => copyAddr(addr)}
                      className="flex-shrink-0 text-muted-foreground hover:text-pink-300 transition-colors"
                      title={`Copy ${symbol} address`}
                    >
                      <Copy className={`w-3.5 h-3.5 ${copiedAddr === addr ? "text-green-400" : ""}`} />
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
            <Button type="submit" disabled={!address.trim() || saveSearch.isPending} className="w-full md:w-32 font-mono">
              {saveSearch.isPending ? "SCANNING..." : "TRACE"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 bg-card/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Recent Traces</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {recentLoading ? (
              <div className="space-y-4 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-muted/50 rounded" />
                ))}
              </div>
            ) : recentSearches?.length ? (
              <div className="space-y-1">
                {recentSearches.map((search) => (
                  <div
                    key={search.id}
                    onClick={() => setLocation(`/wallet/${search.address}?chain=${search.chain}`)}
                    className="flex items-center justify-between p-3 rounded hover:bg-accent/50 cursor-pointer transition-colors group border border-transparent hover:border-border/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary/50 group-hover:bg-primary transition-colors" />
                      <AddressDisplay address={search.address} className="text-sm" showIcon={false} />
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-muted-foreground uppercase bg-muted px-2 py-0.5 rounded">
                        {search.chain}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {new Date(search.searchedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground font-mono">
                NO RECENT SEARCHES DETECTED
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
              {statsLoading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-12 bg-muted/50 rounded" />
                  <div className="h-12 bg-muted/50 rounded" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-end border-b border-border/50 pb-2">
                    <span className="text-xs font-mono text-muted-foreground">TOTAL TARGETS</span>
                    <span className="text-xl font-mono text-primary">{stats?.totalSearches || 0}</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-border/50 pb-2">
                    <span className="text-xs font-mono text-muted-foreground">UNIQUE IDENTITIES</span>
                    <span className="text-xl font-mono text-primary">{stats?.uniqueWallets || 0}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/40 border-destructive/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-destructive" />
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-destructive">High Interest Targets</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="h-20 bg-muted/50 rounded animate-pulse" />
              ) : stats?.popularWallets?.length ? (
                <div className="space-y-2">
                  {stats.popularWallets.slice(0, 3).map((w, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <AddressDisplay address={w.address} className="text-xs" showIcon={false} />
                      <span className="text-xs font-mono bg-destructive/10 text-destructive px-1.5 rounded">
                        {w.searchCount} HITS
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground font-mono">NO DATA</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
