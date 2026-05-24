import { useState, useEffect, useCallback } from "react";
import { UserPlus, Trash2, RefreshCw, AlertCircle, Users, Mail } from "lucide-react";

interface Analyst {
  id: number;
  email: string;
  department: string;
  createdAt: string | null;
  lastLogin: string | null;
}

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default function ManageAnalysts() {
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newDept, setNewDept] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [removingId, setRemovingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/analysts");
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setError(body.message ?? `Error ${res.status}`);
        setLoading(false);
        return;
      }
      setAnalysts(await res.json() as Analyst[]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError("");
    setAddSuccess("");
    try {
      const res = await fetch("/api/analysts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), department: newDept.trim() }),
      });
      const body = await res.json().catch(() => ({})) as { message?: string; inviteStatus?: string };
      if (!res.ok) {
        setAddError(body.message ?? `Error ${res.status}`);
        setAdding(false);
        return;
      }
      const invited = body.inviteStatus === "invited";
      setAddSuccess(
        invited
          ? `Analyst added. A magic-link sign-in email has been sent to ${newEmail.trim()}.`
          : `Analyst added to allowlist. (Invite email not sent — Supabase not configured.)`
      );
      setNewEmail("");
      setNewDept("");
      await load();
    } catch (e) {
      setAddError(String(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(analyst: Analyst) {
    if (!confirm(`Remove ${analyst.email}? This cannot be undone.`)) return;
    setRemovingId(analyst.id);
    try {
      await fetch(`/api/analysts/${analyst.id}`, { method: "DELETE" });
      await load();
    } finally {
      setRemovingId(null);
    }
  }

  const inputCls = "w-full bg-[#0a0f1e] border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50";

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-[10px] font-mono text-primary uppercase tracking-widest mb-1">Admin</div>
          <h1 className="text-xl font-bold font-mono text-foreground tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Manage Analysts
          </h1>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            Add or remove law enforcement / analyst portal accounts.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-xs font-mono text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => { setShowModal(true); setAddError(""); setAddSuccess(""); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-mono font-semibold hover:opacity-90 transition-opacity"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Analyst
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 mb-6 p-4 rounded-lg border border-red-900/40 bg-red-950/20 text-red-400 text-xs font-mono">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-1">Failed to load analysts</div>
            <div className="text-red-400/80">{error}</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-border bg-card/60">
              <th className="text-left px-4 py-3 text-muted-foreground uppercase tracking-wider font-semibold">Email</th>
              <th className="text-left px-4 py-3 text-muted-foreground uppercase tracking-wider font-semibold">Department</th>
              <th className="text-left px-4 py-3 text-muted-foreground uppercase tracking-wider font-semibold">Added</th>
              <th className="text-left px-4 py-3 text-muted-foreground uppercase tracking-wider font-semibold">Last Login</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Loading…</td>
              </tr>
            ) : analysts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No analysts yet. Click "Add Analyst" to invite the first user.
                </td>
              </tr>
            ) : (
              analysts.map((a) => (
                <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-foreground">{a.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {a.department || <span className="italic text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmt(a.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmt(a.lastLogin)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => void handleRemove(a)}
                      disabled={removingId === a.id}
                      className="flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded border border-border/40 text-muted-foreground hover:text-red-400 hover:border-red-900/60 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
                      {removingId === a.id ? "Removing…" : "Remove"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Analyst Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md font-mono">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="text-sm font-bold text-foreground tracking-wider uppercase flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                Add Analyst
              </div>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none">×</button>
            </div>

            <form onSubmit={(e) => void handleAdd(e)} className="px-6 py-5 space-y-4">
              {addSuccess ? (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-emerald-900/40 bg-emerald-950/20 text-emerald-400 text-xs">
                  <Mail className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{addSuccess}</span>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Email Address</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="analyst@agency.gov"
                      required
                      autoFocus
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Department</label>
                    <input
                      type="text"
                      value={newDept}
                      onChange={(e) => setNewDept(e.target.value)}
                      placeholder="e.g. Cybercrime Unit, TRM Labs, FBI"
                      className={inputCls}
                    />
                  </div>

                  {addError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg border border-red-900/40 bg-red-950/20 text-red-400 text-xs">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{addError}</span>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="flex-1 py-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={adding}
                      className="flex-1 py-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {adding ? "Adding…" : "Add & Invite"}
                    </button>
                  </div>

                  <p className="text-[10px] text-muted-foreground/50 text-center">
                    Analyst is added to the allowlist instantly. A sign-in link is emailed to them.
                  </p>
                </>
              )}

              {addSuccess && (
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-full py-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Close
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
