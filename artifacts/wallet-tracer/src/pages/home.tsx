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
  const [showDonate, setShowDonate] = useState(true);

  const { data: recentSearches, isLoading: recentLoading } = useGetRecentSearches();
  const { data: stats, isLoading: statsLoading } = useGetSearchStats();
  const saveSearch = useSaveSearch();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;

    const trimmedAddress = address.trim();
    saveSearch.mutate(
      { data: { address: trimmedAddress, chain } },
      {
        onSuccess: () => {
          setLocation(`/wallet/${trimmedAddress}?chain=${chain}`);
        },
      }
    );
  };

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
