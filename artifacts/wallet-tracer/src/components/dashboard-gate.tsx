import { useState, useEffect, createContext, useContext } from "react";
import { Lock, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";

const SESSION_KEY = "cct_dashboard_authed";

type AuthCtx = { authed: boolean; logout: () => void };
const AuthContext = createContext<AuthCtx>({ authed: false, logout: () => {} });
export const useAuth = () => useContext(AuthContext);

function PasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        sessionStorage.setItem(SESSION_KEY, "1");
        onSuccess();
      } else {
        setError("Incorrect password.");
        setPassword("");
      }
    } catch {
      setError("Could not reach server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0f172a", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "monospace",
    }}>
      <div style={{
        background: "#1e2937", border: "1px solid #334155", borderRadius: 12,
        padding: "40px 48px", width: "100%", maxWidth: 400, textAlign: "center",
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", background: "rgba(34,211,238,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
        }}>
          <Lock style={{ width: 22, height: 22, color: "#22d3ee" }} />
        </div>
        <h2 style={{ color: "#22d3ee", fontSize: "1.2rem", margin: "0 0 6px", fontFamily: "monospace", letterSpacing: "0.1em" }}>
          RESTRICTED ACCESS
        </h2>
        <p style={{ color: "#94a3b8", fontSize: "0.8rem", margin: "0 0 28px", letterSpacing: "0.05em" }}>
          CRYPTOCHAINTRACE // INTELLIGENCE TERMINAL
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter access password"
              required
              autoFocus
              style={{
                width: "100%", padding: "12px 44px 12px 14px", borderRadius: 8,
                border: "1px solid #334155", background: "#0f172a",
                color: "#e2e8f0", fontSize: "0.95rem", fontFamily: "monospace",
                boxSizing: "border-box" as const, outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "#64748b",
                padding: 0,
              }}
            >
              {show ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
            </button>
          </div>

          {error && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
              borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              color: "#f87171", fontSize: "0.85rem", marginBottom: 16, textAlign: "left",
            }}>
              <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "12px", background: "#22d3ee", color: "#0f172a",
              border: "none", borderRadius: 8, fontWeight: "bold", fontSize: "0.95rem",
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
              fontFamily: "monospace", letterSpacing: "0.05em",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {loading ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> VERIFYING…</> : "ACCESS TERMINAL"}
          </button>
        </form>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function DashboardGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(sessionStorage.getItem(SESSION_KEY) === "1");
  }, []);

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthed(false);
  }

  if (authed === null) return null;

  if (!authed) {
    return <PasswordForm onSuccess={() => setAuthed(true)} />;
  }

  return (
    <AuthContext.Provider value={{ authed: true, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
