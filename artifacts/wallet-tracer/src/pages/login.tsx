import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, Mail, Lock } from "lucide-react";

type Mode = "password" | "magic";

export default function Login() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        console.error("[login] signInWithPassword error:", err);
        setError(err.message);
        setLoading(false);
      }
      // on success: AuthProvider detects new session → App.tsx LoginGate redirects to /dashboard
    } catch (thrown: unknown) {
      const msg = thrown instanceof Error ? thrown.message : String(thrown);
      console.error("[login] signInWithPassword threw:", thrown);
      setError(`Network error: ${msg}. Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set correctly.`);
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + "/dashboard" },
      });
      if (err) {
        console.error("[login] signInWithOtp error:", err);
        setError(err.message);
        setLoading(false);
      } else {
        setMagicSent(true);
        setLoading(false);
      }
    } catch (thrown: unknown) {
      const msg = thrown instanceof Error ? thrown.message : String(thrown);
      console.error("[login] signInWithOtp threw:", thrown);
      setError(`Network error: ${msg}. Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set correctly.`);
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px 11px 40px",
    borderRadius: 8,
    border: "1px solid #1e293b",
    background: "#0a0f1e",
    color: "#e2e8f0",
    fontSize: "0.9rem",
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    boxSizing: "border-box",
    outline: "none",
    transition: "border-color 0.15s",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080d1a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Code', monospace",
        padding: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle grid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.025,
          backgroundImage:
            "linear-gradient(#22d3ee 1px, transparent 1px), linear-gradient(90deg, #22d3ee 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          pointerEvents: "none",
        }}
      />
      {/* Top glow */}
      <div
        style={{
          position: "absolute",
          top: "-80px",
          left: "50%",
          transform: "translateX(-50%)",
          width: 700,
          height: 400,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse, rgba(34,211,238,0.07) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ width: "100%", maxWidth: 440, position: "relative", zIndex: 1 }}>
        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "rgba(34,211,238,0.07)",
              border: "1px solid rgba(34,211,238,0.18)",
              marginBottom: 22,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </div>

          <h1
            style={{
              color: "#f1f5f9",
              fontSize: "1.5rem",
              fontWeight: 700,
              letterSpacing: "0.01em",
              margin: "0 0 10px",
              lineHeight: 1.25,
            }}
          >
            Law Enforcement &amp; Analyst Portal
          </h1>

          <div
            style={{
              color: "#22d3ee",
              fontSize: "0.7rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            CRYPTOCHAINTRACE // Secure Investigative Access
          </div>
        </div>

        {/* ── Card ── */}
        <div
          style={{
            background: "rgba(13,20,38,0.95)",
            border: "1px solid #1e293b",
            borderRadius: 14,
            padding: "32px 36px",
            backdropFilter: "blur(16px)",
            boxShadow:
              "0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,211,238,0.04)",
          }}
        >
          {/* Mode toggle */}
          <div
            style={{
              display: "flex",
              marginBottom: 28,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid #1e293b",
              borderRadius: 8,
              padding: 3,
            }}
          >
            {(["password", "magic"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                  setMagicSent(false);
                }}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "0.72rem",
                  letterSpacing: "0.1em",
                  fontWeight: mode === m ? 600 : 400,
                  background:
                    mode === m ? "rgba(34,211,238,0.1)" : "transparent",
                  color: mode === m ? "#22d3ee" : "#475569",
                  transition: "all 0.15s",
                }}
              >
                {m === "password" ? "PASSWORD" : "MAGIC LINK"}
              </button>
            ))}
          </div>

          {magicSent ? (
            <div
              style={{
                textAlign: "center",
                padding: "16px 0 8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "rgba(34,211,238,0.08)",
                  border: "1px solid rgba(34,211,238,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CheckCircle2 style={{ width: 20, height: 20, color: "#22d3ee" }} />
              </div>
              <div>
                <div style={{ color: "#e2e8f0", fontSize: "0.9rem", fontWeight: 600, marginBottom: 6 }}>
                  Check your inbox
                </div>
                <div style={{ color: "#475569", fontSize: "0.8rem", lineHeight: 1.6 }}>
                  A sign-in link was sent to
                  <br />
                  <span style={{ color: "#94a3b8" }}>{email}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setMagicSent(false); setEmail(""); }}
                style={{
                  marginTop: 4,
                  background: "none",
                  border: "1px solid #1e293b",
                  borderRadius: 6,
                  color: "#475569",
                  fontSize: "0.72rem",
                  padding: "7px 16px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.08em",
                }}
              >
                USE DIFFERENT EMAIL
              </button>
            </div>
          ) : (
            <form onSubmit={mode === "password" ? handleSignIn : handleMagicLink}>
              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    color: "#475569",
                    fontSize: "0.68rem",
                    letterSpacing: "0.12em",
                    marginBottom: 7,
                    textTransform: "uppercase",
                  }}
                >
                  Email Address
                </label>
                <div style={{ position: "relative" }}>
                  <Mail
                    style={{
                      position: "absolute",
                      left: 13,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 14,
                      height: 14,
                      color: "#334155",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="analyst@agency.gov"
                    required
                    autoFocus
                    autoComplete="email"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "rgba(34,211,238,0.35)")}
                    onBlur={(e) => (e.target.style.borderColor = "#1e293b")}
                  />
                </div>
              </div>

              {/* Password (only in password mode) */}
              {mode === "password" && (
                <div style={{ marginBottom: 24 }}>
                  <label
                    style={{
                      display: "block",
                      color: "#475569",
                      fontSize: "0.68rem",
                      letterSpacing: "0.12em",
                      marginBottom: 7,
                      textTransform: "uppercase",
                    }}
                  >
                    Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <Lock
                      style={{
                        position: "absolute",
                        left: 13,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 14,
                        height: 14,
                        color: "#334155",
                        pointerEvents: "none",
                      }}
                    />
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      autoComplete="current-password"
                      style={{ ...inputStyle, paddingRight: 42 }}
                      onFocus={(e) => (e.target.style.borderColor = "rgba(34,211,238,0.35)")}
                      onBlur={(e) => (e.target.style.borderColor = "#1e293b")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      style={{
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#334155",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {showPw ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                    </button>
                  </div>
                </div>
              )}

              {mode === "magic" && <div style={{ marginBottom: 24 }} />}

              {/* Error banner */}
              {error && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: 8,
                    marginBottom: 16,
                    background: "rgba(239,68,68,0.07)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    color: "#f87171",
                    fontSize: "0.8rem",
                    lineHeight: 1.5,
                    wordBreak: "break-word",
                  }}
                >
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: loading
                    ? "rgba(34,211,238,0.5)"
                    : "linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)",
                  color: "#040d1a",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  letterSpacing: "0.1em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "opacity 0.15s",
                }}
              >
                {loading ? (
                  <>
                    <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} />
                    {mode === "password" ? "SIGNING IN…" : "SENDING LINK…"}
                  </>
                ) : mode === "password" ? (
                  "SIGN IN"
                ) : (
                  "SEND MAGIC LINK"
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            textAlign: "center",
            marginTop: 28,
            color: "#1e293b",
            fontSize: "0.62rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          For Official Investigative Use Only &nbsp;·&nbsp; CryptoChainTrace © 2026
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        input::placeholder { color: #1e3a4a; }
      `}</style>
    </div>
  );
}
