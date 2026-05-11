import { useState, useEffect } from "react";
import { decodeReportFromUrl } from "@/lib/report-export";

export default function ReportView() {
  const [title, setTitle]     = useState("");
  const [content, setContent] = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("d");
    if (!d) {
      setError("No report data in URL. Generate a share link from within the app.");
      setLoading(false);
      return;
    }
    decodeReportFromUrl(d)
      .then(({ title: t, content: c }) => {
        setTitle(t);
        setContent(c);
        document.title = `${t} — CryptoChainTrace`;
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to decode report. The link may be malformed or too old.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center">
        <span className="font-mono text-sm text-green-400 animate-pulse">Decoding report…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center p-8">
        <div className="text-center">
          <p className="font-mono text-xs text-orange-400 uppercase tracking-widest mb-3">CryptoChainTrace</p>
          <p className="font-mono text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0c10]">
      {/* Top bar (hidden when printing) */}
      <div className="print:hidden sticky top-0 z-10 bg-[#0f1117] border-b border-orange-500/30 px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-[10px] text-orange-400 uppercase tracking-widest">CryptoChainTrace — Shared Report</p>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">{title}</p>
        </div>
        <button
          onClick={() => { window.print(); setPrinted(true); }}
          className={`flex items-center gap-2 text-xs font-mono font-bold px-4 py-2 rounded border transition-colors ${
            printed
              ? "border-green-500/50 text-green-400 bg-green-950/20"
              : "border-blue-500/40 text-blue-300 hover:bg-blue-950/30 hover:border-blue-400"
          }`}
        >
          {printed ? "✓ Printed" : "⬇ Save as PDF / Print"}
        </button>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block text-[7pt] text-gray-500 border-b border-gray-300 pb-1 mb-4 flex justify-between font-mono">
        <span>CryptoChainTrace — Blockchain Intelligence Platform</span>
        <span>CONFIDENTIAL — LAW ENFORCEMENT USE</span>
      </div>

      {/* Report body */}
      <div className="p-6 max-w-5xl mx-auto">
        <pre className="font-mono text-[11px] leading-relaxed text-green-300/90 whitespace-pre-wrap break-all bg-transparent select-all print:text-black print:text-[9pt]">
          {content}
        </pre>
      </div>

      <style>{`
        @media print {
          @page { margin: 20mm 16mm; size: A4; }
          body { background: white !important; }
          pre { color: black !important; font-size: 8.5pt !important; line-height: 1.5 !important; }
        }
      `}</style>
    </div>
  );
}
