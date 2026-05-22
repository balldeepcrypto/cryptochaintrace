import { useState } from "react";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

const CHAINS = [
  { id: "xrp",      label: "XRP" },
  { id: "xlm",      label: "XLM (Stellar)" },
  { id: "hbar",     label: "HBAR (Hedera)" },
  { id: "dag",      label: "DAG (Constellation)" },
  { id: "xdc",      label: "XDC" },
  { id: "ethereum", label: "ETH (Ethereum)" },
  { id: "bitcoin",  label: "BTC (Bitcoin)" },
  { id: "polygon",  label: "MATIC (Polygon)" },
  { id: "bsc",      label: "BSC (BNB Chain)" },
];

type Status = "idle" | "loading" | "success" | "error";

export default function SubmitCase() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [victimWallet, setVictimWallet] = useState("");
  const [thiefWallet, setThiefWallet] = useState("");
  const [selectedChains, setSelectedChains] = useState<string[]>([]);
  const [txHashes, setTxHashes] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function toggleChain(id: string) {
    setSelectedChains((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedChains.length === 0) {
      setErrorMsg("Please select at least one chain.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          email: email.trim(),
          victimWallet: victimWallet.trim(),
          thiefWallet: thiefWallet.trim(),
          chains: selectedChains.join(", "),
          txHashes: txHashes.trim() || null,
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "Submission failed.");
      }
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", background: "#0f172a", color: "#e2e8f0", margin: 0, padding: 0, minHeight: "100vh" }}>
        <div style={{ maxWidth: 900, margin: "40px auto", padding: 30, background: "#1e2937", borderRadius: 12, textAlign: "center" }}>
          <CheckCircle style={{ width: 64, height: 64, color: "#22d3ee", margin: "0 auto 24px" }} />
          <h1 style={{ fontSize: "2rem", color: "#22d3ee", marginBottom: 16 }}>Case Submitted</h1>
          <p style={{ fontSize: "1.1rem", color: "#cbd5e1", marginBottom: 12 }}>
            Your case has been received. We manually review every submission and will contact you at <strong>{email}</strong> once approved.
          </p>
          <p style={{ fontSize: "0.9rem", color: "#94a3b8" }}>
            We only run forensic packages for verified U.S. victims. If approved, you will receive professional reports you can share with law enforcement, your exchange, or your attorney.
          </p>
          <button
            onClick={() => {
              setStatus("idle");
              setName(""); setEmail(""); setVictimWallet(""); setThiefWallet("");
              setSelectedChains([]); setTxHashes(""); setDescription("");
            }}
            style={{ background: "#22d3ee", color: "#0f172a", padding: "14px 32px", fontSize: "1rem", fontWeight: "bold", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 24 }}
          >
            Submit Another Case
          </button>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: 12, borderRadius: 8, border: "none",
    background: "#334155", color: "#e2e8f0", fontSize: "0.95rem",
    boxSizing: "border-box",
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle, resize: "vertical" as const, minHeight: 100,
  };

  const labelStyle: React.CSSProperties = {
    display: "block", marginBottom: 6, fontWeight: "bold", fontSize: "0.9rem",
  };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", background: "#0f172a", color: "#e2e8f0", margin: 0, padding: 0, minHeight: "100vh" }}>
      <div style={{ maxWidth: 900, margin: "40px auto", padding: 30, background: "#1e2937", borderRadius: 12 }}>

        <h1 style={{ fontSize: "2.8rem", color: "#22d3ee", textAlign: "center", marginTop: 0 }}>CryptoChainTrace</h1>
        <h2 style={{ color: "#67e8f9", textAlign: "center" }}>Free Blockchain Forensics for USA Victims of Crypto Theft</h2>

        <p style={{ textAlign: "center", fontSize: "1.2rem", margin: "30px 0" }}>
          We help real victims trace stolen funds across XRP, XLM, HBAR, DAG, XDC, ETH, and BTC — completely free for verified U.S. residents.
        </p>

        <p>CryptoChainTrace was built by a victim for victims.</p>
        <p>If your crypto was stolen, you are not alone. We use advanced on-chain analysis to map commingling, mixing patterns, and flows to exchanges — the same techniques used by professional investigators, but made available at no cost to everyday Americans.</p>

        <h2 style={{ color: "#67e8f9" }}>How it works</h2>
        <ol style={{ lineHeight: 2, fontSize: "1rem" }}>
          <li>Submit your case (victim wallet + thief wallet + every known transaction hash)</li>
          <li>We manually review and verify</li>
          <li>If approved, we run a full forensic package and send you professional reports</li>
          <li>You can share the reports with law enforcement, your exchange, or your attorney</li>
        </ol>

        <p><strong>We only help verified USA victims.</strong> All submissions are reviewed manually to protect the integrity of the tool.</p>

        <h2 style={{ color: "#67e8f9" }}>Submit Your Case</h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Your Name <span style={{ color: "#94a3b8", fontWeight: "normal" }}>(optional)</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Email Address *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" required style={inputStyle} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Your Victim Wallet Address *</label>
            <input type="text" value={victimWallet} onChange={(e) => setVictimWallet(e.target.value)} placeholder="The wallet your funds were stolen from" required style={{ ...inputStyle, fontFamily: "monospace" }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Suspect / Thief Wallet Address *</label>
            <input type="text" value={thiefWallet} onChange={(e) => setThiefWallet(e.target.value)} placeholder="The wallet the stolen funds were sent to" required style={{ ...inputStyle, fontFamily: "monospace" }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Chain(s) Involved *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {CHAINS.map((c) => {
                const active = selectedChains.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleChain(c.id)}
                    style={{
                      padding: "8px 16px", borderRadius: 6, border: active ? "1px solid #22d3ee" : "1px solid #475569",
                      background: active ? "rgba(34,211,238,0.15)" : "#334155",
                      color: active ? "#22d3ee" : "#cbd5e1",
                      cursor: "pointer", fontSize: "0.85rem", fontWeight: active ? "bold" : "normal",
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Known Transaction Hashes <span style={{ color: "#94a3b8", fontWeight: "normal" }}>(recommended — one per line)</span></label>
            <textarea value={txHashes} onChange={(e) => setTxHashes(e.target.value)} placeholder={"Paste every known transaction hash, one per line"} rows={5} style={{ ...textareaStyle, fontFamily: "monospace" }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>What Happened <span style={{ color: "#94a3b8", fontWeight: "normal" }}>(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Briefly describe how the theft occurred and any details that may help us investigate" rows={4} style={textareaStyle} />
          </div>

          {status === "error" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", marginBottom: 20 }}>
              <AlertCircle style={{ width: 18, height: 18, flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            style={{
              background: "#22d3ee", color: "#0f172a", padding: "14px 32px",
              fontSize: "1.1rem", fontWeight: "bold", border: "none", borderRadius: 8,
              cursor: status === "loading" ? "not-allowed" : "pointer",
              width: "100%", marginTop: 20,
              opacity: status === "loading" ? 0.7 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {status === "loading" ? (
              <><Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} /> Submitting…</>
            ) : "Submit Case for Review"}
          </button>

          <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: 24, textAlign: "center" }}>
            By submitting, you confirm you are a U.S. resident and the victim of actual crypto theft. All information is kept confidential and used solely for forensic investigation.
          </p>
        </form>

      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
