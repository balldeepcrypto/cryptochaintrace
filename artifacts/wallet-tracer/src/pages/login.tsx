import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Lock, Eye, EyeOff, Loader2, AlertCircle, Box, Mail, CheckCircle2 } from "lucide-react";

type Mode = "password" | "magic";

export default function Login() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
    } else {
      setMagicSent(true);
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0f1e 0%, #0f172a 50%, #0a1628 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Code', monospace",
      padding: "24px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background grid */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.04,
        backgroundImage: "linear-gradient(#22d3ee 1px, transparent 1px), linear-gradient(90deg, #22d3ee 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        pointerEvents: "none",
      }} />

      {/* Glow */}
      <div style={{
        position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 300, borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(34,211,238,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 56, height: 56, borderRadius: "50%",
            background: "rgba(34,211,238,0.08)",
            border: "1px solid rgba(34,211,238,0.2)",
            marginBottom: 20,
          }}>
            <Box style={{ width: 24, height: 24, color: "#22d3ee" }} />
          </div>
          <div style={{ color: "#22d3ee", fontSize: "1.1rem", fontWeight: 700, letterSpacing: "0.15em", marginBottom: 6 }}>
            CRYPTOCHAINTRACE
          </div>
          <div style={{ color: "#475569", fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase" }}>
            Law Enforcement &amp; Analyst Portal
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(15,23,42,0.9)",
          border: "1px solid rgba(51,65,85,0.8)",
          borderRadius: 16,
          padding: "36px 40px",
          backdropFilter: "blur(12px)",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(34,211,238,0.05)",
        }}>
          {/* Access level badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 28,
            padding: "8px 14px", borderRadius: 8,
            background: "rgba(34,211,238,0.05)",
            border: "1px solid rgba(34,211,238,0.15)",
          }}>
            <Lock style={{ width: 12, height: 12, color: "#22d3ee" }} />
            <span style={{ color: "#94a3b8", fontSize: "0.7rem", letterSpacing: "0.1em" }}>
              RESTRICTED ACCESS // AUTHORIZED PERSONNEL ONLY
            </span>
          </div>

          {/* Mode toggle */}
          <div style={{
            display: "flex", marginBottom: 24,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(51,65,85,0.6)",
            borderRadius: 8, padding: 3,
          }}>
            {(["password", "magic"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); setMagicSent(false); }}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 6, border: "none", cursor: "pointer",
                  fontFamily: "inherit", fontSize: "0.75rem", letterSpacing: "0.08em",
                  fontWeight: mode === m ? 600 : 400,
                  background: mode === m ? "rgba(34,211,238,0.12)" : "transparent",
                  color: mode === m ? "#22d3ee" : "#64748b",
                  transition: "all 0.15s",
                }}
              >
                {m === "password" ? "PASSWORD" : "MAGIC LINK"}
              </button>
            ))}
          </div>

          {magicSent ? (
            <div style={{
              textAlign: "center", padding: "24px 0",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "rgba(34,211,238,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <CheckCircle2 style={{ width: 22, height: 22, color: "#22d3ee" }} />
              </div>
              <div>
                <div style={{ color: "#e2e8f0", fontSize: "0.9rem", marginBottom: 8, fontWeight: 600 }}>
                  Magic link sent
                </div>
                <div style={{ color: "#64748b", fontSize: "0.8rem", lineHeight: 1.6 }}>
                  Check your inbox at<br />
                  <span style={{ color: "#94a3b8" }}>{email}</span>
                </div>
              </div>
              <button
                onClick={() => { setMagicSent(false); setEmail(""); }}
                style={{
                  background: "none", border: "1px solid rgba(51,65,85,0.6)", borderRadius: 6,
                  color: "#64748b", fontSize: "0.75rem", padding: "8px 16px", cursor: "pointer",
                  fontFamily: "inherit", letterSpacing: "0.05em",
                }}
              >
                Use different email
              </button>
            </div>
          ) : (
            <form onSubmit={mode === "password" ? handlePasswordLogin : handleMagicLink}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", color: "#64748b", fontSize: "0.7rem", letterSpacing: "0.1em", marginBottom: 6 }}>
                  EMAIL ADDRESS
                </label>
                <div style={{ position: "relative" }}>
                  <Mail style={{
                    position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
                    width: 14, height: 14, color: "#475569",
                  }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="analyst@agency.gov"
                    required
                    autoFocus
                    style={{
                      width: "100%", padding: "11px 14px 11px 38px",
                      borderRadius: 8, border: "1px solid rgba(51,65,85,0.8)",
                      background: "rgba(255,255,255,0.03)", color: "#e2e8f0",
                      fontSize: "0.9rem", fontFamily: "inherit", boxSizing: "border-box",
                      outline: "none", transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "rgba(34,211,238,0.4)"}
                    onBlur={(e) => e.target.style.borderColor = "rgba(51,65,85,0.8)"}
                  />
                </div>
              </div>

              {mode === "password" && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", color: "#64748b", fontSize: "0.7rem", letterSpacing: "0.1em", marginBottom: 6 }}>
                    PASSWORD
                  </label>
                  <div style={{ position: "relative" }}>
                    <Lock style={{
                      position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
                      width: 14, height: 14, color: "#475569",
                    }} />
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      style={{
                        width: "100%", padding: "11px 40px 11px 38px",
                        borderRadius: 8, border: "1px solid rgba(51,65,85,0.8)",
                        background: "rgba(255,255,255,0.03)", color: "#e2e8f0",
                        fontSize: "0.9rem", fontFamily: "inherit", boxSizing: "border-box",
                        outline: "none", transition: "border-color 0.15s",
                      }}
                      onFocus={(e) => e.target.style.borderColor = "rgba(34,211,238,0.4)"}
                      onBlur={(e) => e.target.style.borderColor = "rgba(51,65,85,0.8)"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      style={{
                        position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                        background: "none", border: "none", cursor: "pointer", color: "#475569",
                        padding: 0, display: "flex", alignItems: "center",
                      }}
                    >
                      {showPw ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                    </button>
                  </div>
                </div>
              )}

              {mode === "magic" && <div style={{ marginBottom: 20 }} />}

              {error && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 14px", borderRadius: 8, marginBottom: 16,
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                  color: "#f87171", fontSize: "0.8rem",
                }}>
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%", padding: "12px",
                  background: "linear-gradient(135deg, #22d3ee, #0891b2)",
                  color: "#0f172a", border: "none", borderRadius: 8,
                  fontWeight: 700, fontSize: "0.85rem", cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1, fontFamily: "inherit",
                  letterSpacing: "0.1em", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 8, transition: "opacity 0.15s",
                }}
              >
                {loading
                  ? <><Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> AUTHENTICATING…</>
                  : mode === "password" ? "ACCESS TERMINAL" : "SEND MAGIC LINK"
                }
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 24, color: "#1e293b", fontSize: "0.65rem", letterSpacing: "0.1em" }}>
          FOR OFFICIAL INVESTIGATIVE USE ONLY // CRYPTOCHAINTRACE © 2026
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: #334155; }
      `}</style>
    </div>
  );
}
