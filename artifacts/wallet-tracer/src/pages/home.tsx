import { useState } from "react";
import { useLocation } from "wouter";
import { useGetRecentSearches, useGetSearchStats, useSaveSearch } from "@workspace/api-client-react";
import { Search, ShieldAlert, Zap, History, LayoutDashboard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddressDisplay } from "@/components/address-display";

export default function Home() {
  const [, setLocation] = useLocation();
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("ethereum");

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

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Intelligence Search</h1>
        <p className="text-muted-foreground font-mono text-sm">Enter target wallet address for full profile extraction.</p>
      </div>

      <Card className="border-primary/20 bg-card/40 shadow-lg shadow-primary/5">
        <CardContent className="p-6">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
            <div className="w-48">
              <Select value={chain} onValueChange={setChain}>
                <SelectTrigger className="font-mono">
                  <SelectValue placeholder="Network" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ethereum">Ethereum</SelectItem>
                  <SelectItem value="bitcoin">Bitcoin</SelectItem>
                  <SelectItem value="polygon">Polygon</SelectItem>
                  <SelectItem value="bsc">BSC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x... or bc1..." 
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
