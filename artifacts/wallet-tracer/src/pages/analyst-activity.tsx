import { useState, useEffect, useCallback } from "react";
import { Activity, RefreshCw, Filter } from "lucide-react";

interface ActivityLog {
  id: string;
  userEmail: string;
  department: string;
  action: string;
  timestamp: string;
  sessionDurationSeconds: number | null;
  metadata: Record<string, unknown> | null;
}

const ACTION_COLORS: Record<string, string> = {
  login: "text-emerald-400",
  logout: "text-slate-400",
  search: "text-cyan-400",
  start_trace: "text-violet-400",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString();
}

function fmtDuration(secs: number | null) {
  if (secs == null) return "—";
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export default function AnalystActivity() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState("");
  const [filterEmail, setFilterEmail] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const departments = [...new Set(logs.map((l) => l.department).filter(Boolean))].sort();
  const emails = [...new Set(logs.map((l) => l.userEmail))].sort();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (filterDept) params.set("department", filterDept);
      if (filterEmail) params.set("userEmail", filterEmail);
      const res = await fetch(`/api/activity-logs?${params}`);
      if (res.ok) setLogs(await res.json() as ActivityLog[]);
    } finally {
      setLoading(false);
    }
  }, [filterDept, filterEmail]);

  useEffect(() => { void load(); }, [load]);

  const filtered = logs
    .filter((l) => !filterAction || l.action === filterAction)
    .sort((a, b) => {
      const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      return sortDir === "desc" ? diff : -diff;
    });

  const inputCls = "bg-[#0a0f1e] border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50";

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] font-mono text-primary uppercase tracking-widest mb-1">Admin</div>
          <h1 className="text-xl font-bold font-mono text-foreground tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Analyst Activity Log
          </h1>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            All platform actions by analysts — logins, searches, traces.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5 p-4 rounded-lg border border-border/50 bg-card/40">
        <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <select
          value={filterEmail}
          onChange={(e) => setFilterEmail(e.target.value)}
          className={inputCls}
        >
          <option value="">All analysts</option>
          {emails.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className={inputCls}
        >
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className={inputCls}
        >
          <option value="">All actions</option>
          <option value="login">login</option>
          <option value="logout">logout</option>
          <option value="search">search</option>
          <option value="start_trace">start_trace</option>
        </select>
        <button
          onClick={() => setSortDir((d) => d === "desc" ? "asc" : "desc")}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-border text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          Time {sortDir === "desc" ? "↓" : "↑"}
        </button>
        <span className="ml-auto text-xs font-mono text-muted-foreground/60">
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border bg-card/60">
                <th className="text-left px-4 py-3 text-muted-foreground uppercase tracking-wider font-semibold whitespace-nowrap">Timestamp</th>
                <th className="text-left px-4 py-3 text-muted-foreground uppercase tracking-wider font-semibold">Analyst</th>
                <th className="text-left px-4 py-3 text-muted-foreground uppercase tracking-wider font-semibold">Department</th>
                <th className="text-left px-4 py-3 text-muted-foreground uppercase tracking-wider font-semibold">Action</th>
                <th className="text-left px-4 py-3 text-muted-foreground uppercase tracking-wider font-semibold">Session</th>
                <th className="text-left px-4 py-3 text-muted-foreground uppercase tracking-wider font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Loading…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No activity logged yet. Activity appears here after analysts sign in.
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{fmt(log.timestamp)}</td>
                    <td className="px-4 py-2.5 text-foreground max-w-[180px] truncate" title={log.userEmail}>{log.userEmail}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {log.department || <span className="italic text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`font-semibold uppercase tracking-wider ${ACTION_COLORS[log.action] ?? "text-foreground"}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDuration(log.sessionDurationSeconds)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground/70 max-w-[220px] truncate" title={log.metadata ? JSON.stringify(log.metadata) : ""}>
                      {log.metadata ? JSON.stringify(log.metadata) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
