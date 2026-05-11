import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { useGetWalletConnections, getGetWalletConnectionsQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Network, ZoomIn, ZoomOut, Maximize, AlertCircle, X, ExternalLink, FileText, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddressDisplay } from "@/components/address-display";

type ChainId = "ethereum" | "bitcoin" | "xrp" | "xlm" | "hbar" | "xdc" | "dag";

const EXPLORER_MAP: Partial<Record<ChainId, (a: string) => string>> = {
  ethereum: (a) => `https://eth.blockscout.com/address/${a}`,
  bitcoin:  (a) => `https://blockstream.info/address/${a}`,
  xrp:      (a) => `https://xrpscan.com/account/${a}`,
  xlm:      (a) => `https://stellarchain.io/accounts/${a}`,
  hbar:     (a) => `https://hashscan.io/mainnet/account/${a}`,
  xdc:      (a) => `https://xdcscan.io/address/${a}`,
  dag:      (a) => `https://dagexplorer.io/address/${a}`,
};

interface NodeStyle {
  fill: string; ring: string; glow: string;
  radius: number; textColor: string; category: string;
}

function nodeStyle(
  addr: string, center: string,
  riskScore: number | null | undefined,
  isContract: boolean | null | undefined,
  label: string | null | undefined,
  isCommingling: boolean,
): NodeStyle {
  if (addr === center)
    return { fill: "#3b82f6", ring: "#1d4ed8", glow: "rgba(59,130,246,0.45)", radius: 14, textColor: "#93c5fd", category: "center" };
  if (isCommingling)
    return { fill: "#eab308", ring: "#ca8a04", glow: "rgba(234,179,8,0.4)",   radius: 11, textColor: "#fde047",  category: "commingling" };
  if (label)
    return { fill: "#ef4444", ring: "#b91c1c", glow: "rgba(239,68,68,0.4)",   radius: 10, textColor: "#fca5a5",  category: "exchange" };
  if ((riskScore ?? 0) > 70)
    return { fill: "#f97316", ring: "#ea580c", glow: "rgba(249,115,22,0.4)",  radius: 10, textColor: "#fdba74",  category: "high-risk" };
  if (isContract)
    return { fill: "#a855f7", ring: "#7c3aed", glow: "rgba(168,85,247,0.4)",  radius:  9, textColor: "#d8b4fe",  category: "contract" };
  return   { fill: "#334155", ring: "#1e293b", glow: "rgba(71,85,105,0.25)",  radius:  8, textColor: "#94a3b8",  category: "standard" };
}

export default function TraceGraph() {
  const params = useParams();
  const address = params.address || "";
  const chain = (new URLSearchParams(window.location.search).get("chain") || "ethereum") as ChainId;
  const [depth, setDepth] = useState<"1" | "2" | "3">("1");

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const commRef      = useRef<Set<string>>(new Set());

  const [hoveredAddr,  setHoveredAddr]  = useState<string | null>(null);
  const [selectedAddr, setSelectedAddr] = useState<string | null>(null);
  const [showNodeReport, setShowNodeReport] = useState(false);
  const [nodeReportText, setNodeReportText] = useState("");
  const [reportCopied,   setReportCopied]   = useState(false);

  const { data: connections, isLoading, error } = useGetWalletConnections(address, {
    chain, depth: parseInt(depth),
  }, {
    query: {
      enabled: !!address,
      queryKey: getGetWalletConnectionsQueryKey(address, { chain, depth: parseInt(depth) }),
    },
  });

  const drawGraph = useCallback((hovered: string | null) => {
    const canvas = canvasRef.current;
    if (!canvas || !connections || connections.nodes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pr = canvas.parentElement?.getBoundingClientRect();
    if (pr) { canvas.width = pr.width; canvas.height = pr.height; }
    const W = canvas.width, H = canvas.height, CX = W / 2, CY = H / 2;

    ctx.clearRect(0, 0, W, H);

    // Detect commingling nodes (2+ distinct parents, excluding center)
    const inMap = new Map<string, Set<string>>();
    for (const e of connections.edges) {
      if (e.to === connections.centerAddress) continue;
      if (!inMap.has(e.to)) inMap.set(e.to, new Set());
      inMap.get(e.to)!.add(e.from);
    }
    const commingling = new Set(
      [...inMap.entries()].filter(([, f]) => f.size > 1).map(([t]) => t)
    );
    commRef.current = commingling;

    // Layout: radial rings by depth
    const pos = new Map<string, { x: number; y: number }>();
    pos.set(connections.centerAddress, { x: CX, y: CY });

    const byDepth = new Map<number, typeof connections.nodes>();
    for (const n of connections.nodes) {
      if (n.address === connections.centerAddress) continue;
      const d = 1; // nodes don't carry depth in schema, treat as depth 1
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(n);
    }
    // Multi-depth from edges: derive depth from BFS
    const depthMap = new Map<string, number>();
    depthMap.set(connections.centerAddress, 0);
    const queue = [connections.centerAddress];
    while (queue.length) {
      const cur = queue.shift()!;
      const curDepth = depthMap.get(cur)!;
      for (const e of connections.edges) {
        if (e.from === cur && !depthMap.has(e.to)) {
          depthMap.set(e.to, curDepth + 1);
          queue.push(e.to);
        }
      }
    }
    const depthGroups = new Map<number, string[]>();
    for (const [addr, d] of depthMap) {
      if (addr === connections.centerAddress) continue;
      if (!depthGroups.has(d)) depthGroups.set(d, []);
      depthGroups.get(d)!.push(addr);
    }
    const maxD = Math.max(...[...depthGroups.keys()], 1);
    const minR = Math.min(W, H) * 0.15;
    const maxR = Math.min(W, H) * 0.42;
    for (const [d, addrs] of depthGroups) {
      const r = minR + (maxR - minR) * (d / maxD);
      addrs.forEach((addr, i) => {
        const angle = -Math.PI / 2 + (i / addrs.length) * 2 * Math.PI;
        pos.set(addr, { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) });
      });
    }
    // Fallback for nodes not reachable via BFS
    for (const n of connections.nodes) {
      if (!pos.has(n.address)) {
        const angle = Math.random() * 2 * Math.PI;
        pos.set(n.address, { x: CX + minR * Math.cos(angle), y: CY + minR * Math.sin(angle) });
      }
    }
    positionsRef.current = pos;

    // Draw edges
    for (const e of connections.edges) {
      const s = pos.get(e.from), t = pos.get(e.to);
      if (!s || !t) continue;
      const hot = hovered === e.from || hovered === e.to;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = hot ? "rgba(99,179,237,0.65)" : "rgba(99,179,237,0.1)";
      ctx.lineWidth = hot ? 2 : 1;
      ctx.stroke();
      // Arrow at 60% along edge when hovered
      if (hot) {
        const px = s.x + (t.x - s.x) * 0.6, py = s.y + (t.y - s.y) * 0.6;
        const ang = Math.atan2(t.y - s.y, t.x - s.x);
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(ang) * 7, py + Math.sin(ang) * 7);
        ctx.lineTo(px + Math.cos(ang + Math.PI - 2.3) * 7, py + Math.sin(ang + Math.PI - 2.3) * 7);
        ctx.lineTo(px + Math.cos(ang + Math.PI + 2.3) * 7, py + Math.sin(ang + Math.PI + 2.3) * 7);
        ctx.closePath();
        ctx.fillStyle = "rgba(99,179,237,0.65)";
        ctx.fill();
      }
    }

    // Draw nodes (back-to-front: standard → special → center)
    const sorted = [...connections.nodes].sort((a, b) => {
      const rank = (n: typeof a) =>
        n.address === connections.centerAddress ? 3 :
        commingling.has(n.address) ? 2 :
        n.label ? 1 : 0;
      return rank(a) - rank(b);
    });

    for (const node of sorted) {
      const p = pos.get(node.address);
      if (!p) continue;
      const isComm = commingling.has(node.address);
      const isHov  = node.address === hovered;
      const isSel  = node.address === selectedAddr;
      const st = nodeStyle(node.address, connections.centerAddress, node.riskScore, node.isContract, node.label, isComm);
      const r  = st.radius + (isHov ? 3 : 0);

      // Glow ring on hover/select
      if (isHov || isSel) {
        const grad = ctx.createRadialGradient(p.x, p.y, r * 0.4, p.x, p.y, r + 16);
        grad.addColorStop(0, st.glow);
        grad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 16, 0, 2 * Math.PI);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      // Selection dashed ring
      if (isSel) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 6, 0, 2 * Math.PI);
        ctx.strokeStyle = "#ffffff50";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Node fill
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = st.fill;
      ctx.fill();
      ctx.strokeStyle = isHov ? "#ffffffa0" : st.ring;
      ctx.lineWidth = isHov ? 2.5 : 1.5;
      ctx.stroke();
      // Label
      ctx.font = `${node.address === connections.centerAddress ? "bold " : ""}10px monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = isHov ? "#fff" : st.textColor;
      const lbl = node.label
        ? (node.label.length > 16 ? node.label.slice(0, 14) + "…" : node.label)
        : `${node.address.slice(0, 4)}…${node.address.slice(-4)}`;
      ctx.fillText(lbl, p.x, p.y + r + 14);
    }
  }, [connections, selectedAddr]);

  // Redraw whenever data / hover / selection changes
  useEffect(() => { drawGraph(hoveredAddr); }, [connections, hoveredAddr, selectedAddr, drawGraph]);

  // Mouse event handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !connections) return;

    const hit = (e: MouseEvent): string | null => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * sx, cy = (e.clientY - rect.top) * sy;
      for (const [addr, p] of positionsRef.current) {
        if (Math.hypot(cx - p.x, cy - p.y) <= 22) return addr;
      }
      return null;
    };

    const onMove = (e: MouseEvent) => {
      const h = hit(e);
      canvas.style.cursor = h ? "pointer" : "crosshair";
      setHoveredAddr(h);
    };
    const onClick = (e: MouseEvent) => {
      const h = hit(e);
      setSelectedAddr(prev => (prev === h ? null : h));
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("click",     onClick);
    return () => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("click",     onClick);
    };
  }, [connections]);

  const selectedNode = connections?.nodes.find(n => n.address === selectedAddr) ?? null;
  const explorerUrl  = EXPLORER_MAP[chain];
  const isCommingling = selectedAddr ? commRef.current.has(selectedAddr) : false;

  function genNodeReport(): string {
    if (!selectedNode) return "";
    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const chainUp = chain.toUpperCase();
    const nodeType = selectedNode.isContract
      ? "SMART CONTRACT"
      : isCommingling
      ? "COMMINGLING HUB"
      : selectedNode.label
      ? "EXCHANGE / KNOWN ENTITY"
      : "STANDARD WALLET";
    const lines: string[] = [
      `╔══════════════════════════════════════════════════════════════╗`,
      `║        INVESTIGATIVE REPORT — CryptoChainTrace              ║`,
      `╚══════════════════════════════════════════════════════════════╝`,
      `Generated : ${now}`,
      `Chain     : ${chainUp}   |   Source: Trace Graph`,
      ``,
      `─── NODE DETAILS ${"─".repeat(47)}`,
      ``,
      `  Address    : ${selectedNode.address}`,
      ...(selectedNode.label ? [`  Label      : ${selectedNode.label}`] : []),
      `  Type       : ${nodeType}`,
      `  Risk Score : ${selectedNode.riskScore != null ? selectedNode.riskScore : "UNSCORED"}`,
      ...(selectedNode.balance && selectedNode.balance !== "0" ? [`  Balance    : ${selectedNode.balance} ${chainUp}`] : []),
      ...(selectedNode.transactionCount != null ? [`  Tx Count   : ${selectedNode.transactionCount}`] : []),
      ...(isCommingling ? [
        ``,
        `  ⚠ COMMINGLING HUB — Receives funds from multiple independent`,
        `    sources, indicating potential fund mixing or layering.`,
      ] : []),
      ``,
      `─── GRAPH CONTEXT ${"─".repeat(46)}`,
      ``,
      `  Identified in connection graph for:`,
      `  ${address}`,
      ``,
      `${"═".repeat(64)}`,
      `Generated by CryptoChainTrace  ·  cryptochaintrace.replit.app`,
    ];
    return lines.join("\n");
  }

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">

      {/* ── Top-left control card ── */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
        <Card className="bg-card/80 backdrop-blur pointer-events-auto border-primary/20 shadow-lg w-80">
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Center Node</h3>
              <div className="font-mono text-primary truncate">
                <AddressDisplay address={address} truncate={true} />
              </div>
            </div>
            <div>
              <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Network Depth</h3>
              <Select value={depth} onValueChange={(v: "1" | "2" | "3") => setDepth(v)}>
                <SelectTrigger className="font-mono h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Hop (Direct)</SelectItem>
                  <SelectItem value="2">2 Hops (Extended)</SelectItem>
                  <SelectItem value="3">3 Hops (Deep)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {connections && (
              <div className="pt-2 border-t border-border/50 grid grid-cols-3 gap-2 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground block mb-0.5">NODES</span>
                  <span className="text-lg font-bold">{connections.nodes.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">EDGES</span>
                  <span className="text-lg font-bold">{connections.edges.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">HUBS</span>
                  <span className="text-lg font-bold text-yellow-400">{commRef.current.size}</span>
                </div>
              </div>
            )}
            {connections && (
              <p className="text-[10px] font-mono text-muted-foreground/50 pt-1 border-t border-border/30">
                Click any node for details
              </p>
            )}
          </div>
        </Card>

        <div className="flex gap-2 pointer-events-auto">
          <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur"><ZoomIn className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur"><ZoomOut className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur"><Maximize className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* ── Node info popup ── */}
      {selectedNode && (
        <div className="absolute bottom-24 right-4 z-20 pointer-events-auto w-80 max-w-[calc(100vw-2rem)]">
          <Card className={`bg-[#0d1117]/96 backdrop-blur-sm shadow-2xl border ${
            isCommingling            ? "border-yellow-500/60" :
            selectedNode.label       ? "border-red-500/50"    :
            selectedAddr === address ? "border-primary/50"    : "border-border/50"
          }`}>
            <div className="p-4 space-y-3">
              {/* Node header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0 space-y-1">
                  {isCommingling && (
                    <div className="text-[10px] font-mono font-bold text-yellow-400 flex items-center gap-1">
                      ⚠ COMMINGLING HUB
                    </div>
                  )}
                  {selectedNode.label && (
                    <div className="text-xs font-mono font-bold text-red-400 uppercase tracking-wide">
                      {selectedNode.label}
                    </div>
                  )}
                  {selectedAddr === address && (
                    <div className="text-[10px] font-mono font-bold text-primary">ROOT NODE</div>
                  )}
                  <div className="font-mono text-[10px] text-muted-foreground break-all leading-relaxed">
                    {selectedNode.address}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAddr(null)}
                  className="text-muted-foreground hover:text-foreground shrink-0 transition-colors mt-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/30">
                <div className="text-center">
                  <div className="text-[9px] font-mono text-muted-foreground mb-0.5">TXS</div>
                  <div className="text-sm font-mono font-bold">{selectedNode.transactionCount ?? "—"}</div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] font-mono text-muted-foreground mb-0.5">RISK</div>
                  <div className={`text-sm font-mono font-bold ${
                    (selectedNode.riskScore ?? 0) > 70 ? "text-red-400" :
                    (selectedNode.riskScore ?? 0) > 40 ? "text-yellow-400" : "text-green-400"
                  }`}>{selectedNode.riskScore ?? "?"}</div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] font-mono text-muted-foreground mb-0.5">TYPE</div>
                  <div className="text-[10px] font-mono font-bold text-muted-foreground">
                    {selectedNode.isContract ? "CONTRACT" : isCommingling ? "HUB" : selectedNode.label ? "EXCHANGE" : "WALLET"}
                  </div>
                </div>
              </div>

              {/* Balance */}
              {selectedNode.balance && selectedNode.balance !== "0" && (
                <div className="pt-1 border-t border-border/20 text-xs font-mono text-center">
                  <span className="text-muted-foreground">BALANCE  </span>
                  <span className="text-primary font-bold">{selectedNode.balance} {chain.toUpperCase()}</span>
                </div>
              )}

              {/* Contract badge */}
              {selectedNode.isContract && (
                <div className="text-[10px] font-mono text-violet-400 bg-violet-950/30 border border-violet-500/20 rounded px-2 py-1 text-center">
                  SMART CONTRACT
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-1.5 pt-1 border-t border-border/20">
                <div className="flex gap-2">
                  <a
                    href={`/wallet/${selectedNode.address}?chain=${chain}`}
                    className="flex-1 text-center text-[11px] font-mono text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded px-2 py-1.5 transition-colors"
                  >
                    View Profile →
                  </a>
                  {explorerUrl && (
                    <a
                      href={explorerUrl(selectedNode.address)}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border/30 hover:border-border/60 rounded px-2 py-1.5 transition-colors"
                    >
                      Explorer <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <button
                  onClick={() => { setNodeReportText(genNodeReport()); setShowNodeReport(true); }}
                  className="w-full flex items-center justify-center gap-1.5 text-[11px] font-mono text-orange-300 hover:text-orange-200 bg-orange-950/30 hover:bg-orange-950/50 border border-orange-500/30 hover:border-orange-500/50 rounded px-2 py-1.5 transition-colors"
                >
                  <FileText className="w-3 h-3" /> Generate Investigative Report
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Legend ── */}
      <Card className="absolute bottom-4 left-4 bg-card/80 backdrop-blur pointer-events-none border-border/40 z-10 p-3">
        <h4 className="text-[9px] font-mono uppercase text-muted-foreground mb-2 tracking-widest">Legend</h4>
        <div className="space-y-1.5 text-[10px] font-mono">
          {([
            ["#3b82f6","#1d4ed8","Target Wallet"],
            ["#ef4444","#b91c1c","Exchange / Known Entity"],
            ["#eab308","#ca8a04","Commingling Hub"],
            ["#f97316","#ea580c","High Risk"],
            ["#a855f7","#7c3aed","Smart Contract"],
            ["#334155","#1e293b","Standard Wallet"],
          ] as [string,string,string][]).map(([fill,ring,label]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{background:fill,border:`1.5px solid ${ring}`}} />
              {label}
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-border/30 text-[9px] font-mono text-muted-foreground/50">
          Click node for details · hover for edges
        </div>
      </Card>

      {/* ── Node Report Modal ── */}
      {showNodeReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowNodeReport(false)}
        >
          <div
            className="relative w-full max-w-3xl bg-[#0a0c10] border border-orange-500/30 rounded-lg shadow-2xl flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="font-mono text-sm text-orange-300 font-bold uppercase tracking-widest">Investigative Report</span>
                <span className="text-[11px] font-mono text-muted-foreground">{chain.toUpperCase()} · Trace Graph Node</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(nodeReportText).catch(() => {});
                    setReportCopied(true);
                    setTimeout(() => setReportCopied(false), 2500);
                  }}
                  className={`flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded border transition-colors ${
                    reportCopied
                      ? "border-green-500/50 text-green-400 bg-green-950/30"
                      : "border-orange-500/30 text-orange-300 hover:bg-orange-950/30 hover:border-orange-500/60"
                  }`}
                >
                  {reportCopied ? <><Check className="w-3.5 h-3.5" /> COPIED!</> : <><Copy className="w-3.5 h-3.5" /> COPY</>}
                </button>
                <button
                  onClick={() => setShowNodeReport(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <pre className="font-mono text-[11px] leading-relaxed text-green-300/90 whitespace-pre bg-transparent select-all">
                {nodeReportText}
              </pre>
            </div>
            <div className="px-5 py-3 border-t border-border/30 shrink-0 text-[10px] font-mono text-muted-foreground/50">
              Click anywhere outside to close · Select text to copy manually
            </div>
          </div>
        </div>
      )}

      {/* ── Canvas ── */}
      <div className="flex-1 relative w-full h-full bg-[#060810]">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm z-20">
            <Network className="w-12 h-12 text-primary animate-pulse mb-4" />
            <div className="text-primary font-mono tracking-widest text-sm animate-pulse">MAPPING NETWORK...</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-20">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <div className="text-destructive font-mono tracking-widest text-sm">FAILED TO MAP CONNECTIONS</div>
          </div>
        )}
        {connections && connections.nodes.length === 0 && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Network className="w-16 h-16 text-muted-foreground/15 mb-4" />
            <div className="text-muted-foreground/40 font-mono text-sm">NO CONNECTIONS FOUND</div>
          </div>
        )}
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
}
