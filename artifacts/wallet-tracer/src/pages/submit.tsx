import { useState } from "react";
import { Shield, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

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
      <div className="flex flex-col items-center justify-center min-h-full px-8 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-6">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-3">Case Submitted</h2>
        <p className="text-muted-foreground max-w-md mb-2">
          Your case has been received. We manually review every submission and will contact you at <span className="text-foreground font-mono">{email}</span> once approved.
        </p>
        <p className="text-xs text-muted-foreground/60 max-w-md">
          We only run forensic packages for verified U.S. victims. If approved, you will receive professional reports you can share with law enforcement, your exchange, or your attorney.
        </p>
        <button
          onClick={() => {
            setStatus("idle");
            setName(""); setEmail(""); setVictimWallet(""); setThiefWallet("");
            setSelectedChains([]); setTxHashes(""); setDescription("");
          }}
          className="mt-8 px-6 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Submit Another Case
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Submit Your Case</h1>
            <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Free Forensics for USA Victims of Crypto Theft</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          CryptoChainTrace was built by a victim for victims. We use advanced on-chain analysis to map commingling, mixing patterns, and exchange flows — the same techniques used by professional investigators — completely free for verified U.S. residents.
        </p>
        <div className="mt-4 border border-border/60 rounded-lg p-4 bg-card/50">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">How it works</p>
          <ol className="space-y-1.5 text-sm text-muted-foreground list-none">
            {[
              "Submit your case — victim wallet, thief wallet, and all known transaction hashes",
              "We manually review and verify your submission",
              "If approved, we run a full forensic package and send you professional reports",
              "Share the reports with law enforcement, your exchange, or your attorney",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-primary font-mono text-xs mt-0.5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="mt-3 text-xs text-muted-foreground/70">
          <span className="text-amber-400 font-medium">USA victims only.</span> All submissions are reviewed manually to protect the integrity of the tool.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
            Your Name <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-3 py-2.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
            Email Address <span className="text-destructive">*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="w-full px-3 py-2.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
          />
        </div>

        {/* Victim Wallet */}
        <div>
          <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
            Your Victim Wallet Address <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={victimWallet}
            onChange={(e) => setVictimWallet(e.target.value)}
            placeholder="The wallet the funds were stolen from"
            required
            className="w-full px-3 py-2.5 rounded-md bg-card border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
          />
        </div>

        {/* Thief Wallet */}
        <div>
          <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
            Suspect / Thief Wallet Address <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={thiefWallet}
            onChange={(e) => setThiefWallet(e.target.value)}
            placeholder="The wallet the stolen funds were sent to"
            required
            className="w-full px-3 py-2.5 rounded-md bg-card border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
          />
        </div>

        {/* Chain selector */}
        <div>
          <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
            Chain(s) Involved <span className="text-destructive">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {CHAINS.map((c) => {
              const active = selectedChains.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleChain(c.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono border transition-colors ${
                    active
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-card border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* TX Hashes */}
        <div>
          <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
            Known Transaction Hashes <span className="text-muted-foreground/50">(optional but recommended)</span>
          </label>
          <textarea
            value={txHashes}
            onChange={(e) => setTxHashes(e.target.value)}
            placeholder={"Paste every known transaction hash, one per line"}
            rows={4}
            className="w-full px-3 py-2.5 rounded-md bg-card border border-border text-sm text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 resize-none"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
            What Happened <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Briefly describe how the theft occurred and any other details that may help us investigate"
            rows={4}
            className="w-full px-3 py-2.5 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 resize-none"
          />
        </div>

        {/* Error */}
        {status === "error" && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground text-sm font-bold tracking-wide hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting…
            </>
          ) : (
            "Submit Case for Review"
          )}
        </button>

        <p className="text-xs text-muted-foreground/60 text-center">
          By submitting, you confirm you are a U.S. resident and the victim of actual crypto theft. All information is kept confidential and used solely for forensic investigation.
        </p>
      </form>
    </div>
  );
}
