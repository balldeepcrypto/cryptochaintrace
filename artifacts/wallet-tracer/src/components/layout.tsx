import { Link, useLocation } from "wouter";
import { Search, Activity, Network, Box } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-card flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-mono font-bold tracking-tight text-lg">
            <Box className="w-5 h-5" />
            <span>CryptoChainTrace</span>
          </div>
        </div>
        <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
          <Link href="/">
            <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors ${location === '/' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <Search className="w-4 h-4" />
              Intelligence Search
            </div>
          </Link>
          <div className="mt-8 mb-2 px-3 text-xs font-mono tracking-wider text-muted-foreground uppercase">
            Recent Targets
          </div>
          {/* Recent targets will be populated dynamically or via a global context, but we keep the sidebar simple for now */}
          <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <Activity className="w-3 h-3" />
            <span className="italic">Active Session</span>
          </div>
        </nav>
        <div className="p-4 border-t border-border">
          <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest text-center">
            Secure Terminal v1.0.4
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <header className="h-16 flex items-center px-8 border-b border-border bg-card/50 backdrop-blur-sm z-10 sticky top-0 flex-shrink-0">
          <div className="flex-1 flex items-center justify-between">
            <div className="text-sm font-mono text-muted-foreground">
              {location === '/' ? 'SYS // SEARCH_MODULE' : 
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
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
