import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Search, Activity, Network, Box, Info, X, LogOut, Users, ClipboardList } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getRecentSearches, type RecentSearchEntry } from "@/lib/recent-searches";

const CHAIN_SHORT: Record<string, string> = {
  ethereum: "ETH", bitcoin: "BTC", xrp: "XRP", xlm: "XLM",
  hbar: "HBAR", xdc: "XDC", dag: "DAG", polygon: "MATIC", bsc: "BSC",
};

function shortAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 7)}…${addr.slice(-5)}`;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [recents, setRecents] = useState<RecentSearchEntry[]>(() => getRecentSearches().slice(0, 8));
  const [showAbout, setShowAbout] = useState(false);
  const { user, logout } = useAuth();

  useEffect(() => {
    const refresh = () => setRecents(getRecentSearches().slice(0, 8));
    refresh();
    window.addEventListener("chaintrace-recent-searches-updated", refresh);
    return () => window.removeEventListener("chaintrace-recent-searches-updated", refresh);
  }, []);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-card flex flex-col">
        <div className="flex flex-col justify-center px-6 py-3 border-b border-border min-h-[64px]">
          <div className="flex items-center gap-2 text-primary font-mono font-bold tracking-tight text-base">
            <Box className="w-4 h-4 shrink-0" />
            <span>CryptoChainTrace</span>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground/60 tracking-widest uppercase mt-0.5 pl-6">
            Law Enforcement / Analyst Portal
          </div>
        </div>
        <nav className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
          <Link href="/dashboard">
            <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors ${location === '/dashboard' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <Search className="w-4 h-4" />
              Intelligence Search
            </div>
          </Link>

          <div className="mt-4 mb-1 px-3 text-xs font-mono tracking-wider text-muted-foreground uppercase">
            Admin
          </div>
          <Link href="/manage-analysts">
            <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors ${location === '/manage-analysts' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <Users className="w-4 h-4" />
              Manage Analysts
            </div>
          </Link>
          <Link href="/analyst-activity">
            <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors ${location === '/analyst-activity' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <ClipboardList className="w-4 h-4" />
              Analyst Activity
            </div>
          </Link>

          <div className="mt-4 mb-1 px-3 text-xs font-mono tracking-wider text-muted-foreground uppercase">
            Recent Targets
          </div>

          {recents.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Activity className="w-3 h-3" />
              <span className="italic">No targets yet</span>
            </div>
          ) : (
            recents.map((r, i) => (
              <Link key={`${r.address}-${r.chain}-${i}`} href={`/wallet/${r.address}?chain=${r.chain}`}>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors text-xs font-mono group ${location === `/wallet/${r.address}` ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                  <Network className="w-3 h-3 shrink-0 text-primary/60 group-hover:text-primary transition-colors" />
                  <span className="flex-1 truncate min-w-0" title={r.address}>{shortAddr(r.address)}</span>
                  <span className="shrink-0 text-[9px] font-mono text-muted-foreground/60 uppercase">
                    {CHAIN_SHORT[r.chain] ?? r.chain.toUpperCase()}
                  </span>
                </div>
              </Link>
            ))
          )}
        </nav>
        <div className="p-4 border-t border-border">
          <div className="text-[10px] text-muted-foreground/40 font-mono uppercase tracking-widest text-center">
            For Official Investigative Use Only
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <header className="h-16 flex items-center px-8 border-b border-border bg-card/50 backdrop-blur-sm z-10 sticky top-0 flex-shrink-0">
          <div className="flex-1 flex items-center justify-between">
            <div className="text-sm font-mono text-muted-foreground">
              {location === '/dashboard' ? 'SYS // SEARCH_MODULE' :
               location.startsWith('/wallet/') ? 'SYS // PROFILE_INSPECTION' :
               location.startsWith('/trace/') ? 'SYS // NETWORK_ANALYSIS' : 'SYS // UNKNOWN_STATE'}
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-success">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                </span>
                API CONNECTED
              </div>
              <div className="text-muted-foreground">NODE: 0x4812...</div>
              <button
                onClick={() => setShowAbout(true)}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border/40 hover:border-border/80"
                title="About CryptoChainTrace"
              >
                <Info className="w-3.5 h-3.5" />
                <span>About</span>
              </button>
              {user && (
                <div className="flex items-center gap-2 pl-2 border-l border-border/40">
                  <span className="text-muted-foreground/60 text-[10px] font-mono max-w-[140px] truncate" title={user.email ?? ""}>
                    {user.email}
                  </span>
                  <button
                    onClick={logout}
                    title="Sign out"
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-red-400 transition-colors px-2 py-1 rounded border border-border/40 hover:border-red-900/60"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg font-mono">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Box className="w-5 h-5 text-primary" />
                <div>
                  <div className="text-sm font-bold text-foreground tracking-widest uppercase">CryptoChainTrace</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Blockchain Intelligence Platform</div>
                </div>
              </div>
              <button onClick={() => setShowAbout(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <div className="text-[10px] font-mono text-primary uppercase tracking-widest mb-2">Agency Edition — Capabilities</div>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">▸</span>Multi-wallet Intersection / Funnel Analysis with full hop-by-hop TX trails</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">▸</span>Multi-Wallet Exchange Flows with per-exchange breakdowns across all wallets</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">▸</span>Bulk load from Commingle List — one-click population of tracked wallets</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">▸</span>Private convergence points only — exchanges strictly excluded from intersection results</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">▸</span>Full TX history + USD valuation across 9 chains (ETH, BTC, XRP, XLM, HBAR, XDC, DAG, MATIC, BSC)</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">▸</span>Cryptographically signed, tamper-evident reports for chain of custody</li>
                  <li className="flex items-start gap-2"><span className="text-primary mt-0.5">▸</span>Designed for law enforcement, regulatory, and private investigative use</li>
                </ul>
              </div>
              <div className="border-t border-border/40 pt-4">
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">Platform</div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>cryptochaintrace.replit.app</div>
                  <div className="text-[10px] text-muted-foreground/60">© 2026 Ball Deep Crypto  •  For Official Investigative Use Only</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
