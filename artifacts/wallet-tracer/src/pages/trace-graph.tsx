import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { useGetWalletConnections, getGetWalletConnectionsQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Network, ZoomIn, ZoomOut, Maximize, AlertCircle, X, ExternalLink, FileText, Copy, Check, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddressDisplay } from "@/components/address-display";

type ChainId = "ethereum" | "bitcoin" | "xrp" | "xlm" | "hbar" | "xdc" | "dag";
type DepthStr = "1" | "2" | "3" | "4" | "5" | "6";

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

const DEPTH_LABELS: Record<DepthStr, string> = {
  "1": "1 Hop (Quick)",
  "2": "2 Hops (Standard)",
  "3": "3 Hops (Deep)",
  "4": "4 Hops (Extended)",
  "5": "5 Hops (Thorough)",
  "6": "6 Hops (Maximum)",
};

export default function TraceGraph() {
  const params = useParams();
  const address = params.address || "";
  const chain = (new URLSearchParams(window.location.search).get("chain") || "ethereum") as ChainId;
  const chainUp = chain.toUpperCase();

  const [depth, setDepth] = useState<DepthStr>("1");

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const commRef      = useRef<Set<string>>(new Set());

  const [hoveredAddr,     setHoveredAddr]     = useState<string | null>(null);
  const [selectedAddr,    setSelectedAddr]    = useState<string | null>(null);
  const [showNodeReport,  setShowNodeReport]  = useState(false);
  const [showGraphReport, setShowGraphReport] = useState(false);
  const [nodeReportText,  setNodeReportText]  = useState("");
  const [graphReportText, setGraphReportText] = useState("");
  const [reportCopied,    setReportCopied]    = useState(false);
  const [addedCopied,     setAddedCopied]     = useState(false);

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

    // Layout: radial rings by depth (BFS from center via edges)
    const pos = new Map<string, { x: number; y: number }>();
    pos.set(connections.centerAddress, { x: CX, y: CY });

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
    const maxR = Math.min(W, H) * 0.44;
    for (const [d, addrs] of depthGroups) {
      const r = minR + (maxR - minR) * (d / maxD);
      // Sort: commingling hubs and exchange nodes first for visual clarity
      const sortedAddrs = [...addrs].sort((a, b) => {
        const scoreA = commingling.has(a) ? 2 : connections.nodes.find(n => n.address === a)?.label ? 1 : 0;
        const scoreB = commingling.has(b) ? 2 : connections.nodes.find(n => n.address === b)?.label ? 1 : 0;
        return scoreB - scoreA;
      });
      sortedAddrs.forEach((addr, i) => {
        const angle = -Math.PI / 2 + (i / sortedAddrs.length) * 2 * Math.PI;
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

    // Draw edges — highlight commingling/exchange edges more prominently
    for (const e of connections.edges) {
      const s = pos.get(e.from), t = pos.get(e.to);
      if (!s || !t) continue;
      const isHotEdge    = hovered === e.from || hovered === e.to;
      const isCommEdge   = commingling.has(e.to) || commingling.has(e.from);
      const isExchEdge   = connections.nodes.find(n => n.address === e.to)?.label != null;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = isHotEdge
        ? "rgba(99,179,237,0.75)"
        : isCommEdge
        ? "rgba(234,179,8,0.25)"
        : isExchEdge
        ? "rgba(239,68,68,0.2)"
        : "rgba(99,179,237,0.08)";
      ctx.lineWidth = isHotEdge ? 2.5 : isCommEdge || isExchEdge ? 1.5 : 1;
      ctx.stroke();
      // Arrow at 60% along edge when hovered
      if (isHotEdge) {
        const px = s.x + (t.x - s.x) * 0.6, py = s.y + (t.y - s.y) * 0.6;
        const ang = Math.atan2(t.y - s.y, t.x - s.x);
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(ang) * 7, py + Math.sin(ang) * 7);
        ctx.lineTo(px + Math.cos(ang + Math.PI - 2.3) * 7, py + Math.sin(ang + Math.PI - 2.3) * 7);
        ctx.lineTo(px + Math.cos(ang + Math.PI + 2.3) * 7, py + Math.sin(ang + Math.PI + 2.3) * 7);
        ctx.closePath();
        ctx.fillStyle = "rgba(99,179,237,0.75)";
        ctx.fill();
      }
    }

    // Draw nodes (back-to-front: standard → high-risk → exchange → commingling → center)
    const sorted = [...connections.nodes].sort((a, b) => {
      const rank = (n: typeof a) =>
        n.address === connections.centerAddress ? 4 :
        commingling.has(n.address) ? 3 :
        n.label ? 2 :
        (n.riskScore ?? 0) > 70 ? 1 : 0;
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
      if (isHov || isSel || isComm || node.label) {
        const grad = ctx.createRadialGradient(p.x, p.y, r * 0.4, p.x, p.y, r + (isHov || isSel ? 20 : 12));
        grad.addColorStop(0, st.glow);
        grad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + (isHov || isSel ? 20 : 12), 0, 2 * Math.PI);
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
      ctx.font = `${node.address === connections.centerAddress || isComm ? "bold " : ""}10px monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = isHov ? "#fff" : st.textColor;
      const lbl = node.label
        ? (node.label.length > 16 ? node.label.slice(0, 14) + "…" : node.label)
        : `${node.address.slice(0, 4)}…${node.address.slice(-4)}`;
      ctx.fillText(lbl, p.x, p.y + r + 14);
    }
  }, [connections, selectedAddr]);

  useEffect(() => { drawGraph(hoveredAddr); }, [connections, hoveredAddr, selectedAddr, drawGraph]);

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

  const selectedNode    = connections?.nodes.find(n => n.address === selectedAddr) ?? null;
  const explorerUrl     = EXPLORER_MAP[chain];
  const isCommingling   = selectedAddr ? commRef.current.has(selectedAddr) : false;

  // Edges between selected node and center (for panel stats)
  const edgesWithCenter = connections?.edges.filter(e =>
    (e.from === selectedAddr && e.to === address) ||
    (e.to === selectedAddr   && e.from === address)
  ) ?? [];
  const txsWithCenter  = edgesWithCenter.reduce((s, e) => s + (e.transactionCount ?? 0), 0);
  const volWithCenter  = edgesWithCenter.reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0);
  const usdWithCenter  = edgesWithCenter.reduce((s, e) => s + (e.totalValueUsd ?? 0), 0);

  function genNodeReport(): string {
    if (!selectedNode) return "";
    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
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
      `Chain     : ${chainUp}   |   Source: Trace Graph (${DEPTH_LABELS[depth]})`,
      ``,
      `─── NODE DETAILS ${"─".repeat(47)}`,
      ``,
      `  Address    : ${selectedNode.address}`,
      ...(selectedNode.label ? [`  Label      : ${selectedNode.label}`] : []),
      `  Type       : ${nodeType}`,
      `  Risk Score : ${selectedNode.riskScore != null ? selectedNode.riskScore : "UNSCORED"}`,
      ...(selectedNode.balance && selectedNode.balance !== "0" ? [`  Balance    : ${selectedNode.balance} ${chainUp}`] : []),
      ...(selectedNode.transactionCount != null ? [`  Total Txs  : ${selectedNode.transactionCount}`] : []),
      ...(txsWithCenter > 0 ? [
        ``,
        `─── CONNECTION TO CENTER WALLET ${"─".repeat(32)}`,
        ``,
        `  Txs w/ Center : ${txsWithCenter}`,
        `  Volume        : ${volWithCenter.toFixed(4)} ${chainUp}${usdWithCenter > 0 ? `  ($${usdWithCenter.toLocaleString("en-US", {maximumFractionDigits: 2})})` : ""}`,
      ] : []),
      ...(isCommingling ? [
        ``,
        `  ⚠ COMMINGLING HUB — Receives funds from multiple independent`,
        `    sources, indicating potential fund mixing or layering.`,
      ] : []),
      ``,
      `─── GRAPH CONTEXT ${"─".repeat(46)}`,
      ``,
      `  Center wallet : ${address}`,
      `  Graph depth   : ${depth} hop${parseInt(depth) !== 1 ? "s" : ""}`,
      `  Total nodes   : ${connections?.nodes.length ?? 0}`,
      `  Total edges   : ${connections?.edges.length ?? 0}`,
      `  Commingle hubs: ${commRef.current.size}`,
      ``,
      `${"═".repeat(64)}`,
      `Generated by CryptoChainTrace  ·  cryptochaintrace.replit.app`,
    ];
    return lines.join("\n");
  }

  function genGraphReport(): string {
    if (!connections) return "";
    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const commingling = commRef.current;
    const hubNodes     = connections.nodes.filter(n => commingling.has(n.address));
    const exchNodes    = connections.nodes.filter(n => n.label && !commingling.has(n.address));
    const highRiskNodes = connections.nodes.filter(n => (n.riskScore ?? 0) > 70 && !commingling.has(n.address) && !n.label);
    const sortedEdges  = [...connections.edges].sort((a, b) =>
      parseFloat(b.totalValue || "0") - parseFloat(a.totalValue || "0")
    );
    const lines: string[] = [
      `╔══════════════════════════════════════════════════════════════╗`,
      `║    GRAPH INVESTIGATIVE REPORT — CryptoChainTrace            ║`,
      `╚══════════════════════════════════════════════════════════════╝`,
      `Generated  : ${now}`,
      `Chain      : ${chainUp}   |   Depth: ${depth} hop${parseInt(depth) !== 1 ? "s" : ""} (${DEPTH_LABELS[depth]})`,
      `Center     : ${address}`,
      ``,
      `─── GRAPH SUMMARY ${"─".repeat(46)}`,
      ``,
      `  Total Nodes       : ${connections.nodes.length}`,
      `  Total Edges       : ${connections.edges.length}`,
      `  Commingling Hubs  : ${commingling.size}`,
      `  Exchange Nodes    : ${exchNodes.length}`,
      `  High-Risk Nodes   : ${highRiskNodes.length}`,
      ``,
    ];

    if (hubNodes.length > 0) {
      lines.push(`─── ⚠ COMMINGLING HUBS (${hubNodes.length}) ${"─".repeat(40)}`);
      lines.push(``);
      for (const n of hubNodes) {
        const inEdges = connections.edges.filter(e => e.to === n.address);
        const sources = [...new Set(inEdges.map(e => e.from))];
        lines.push(`  ${n.address}`);
        lines.push(`    Receives from ${sources.length} source wallet${sources.length !== 1 ? "s" : ""}:`);
        for (const src of sources.slice(0, 5)) {
          const vol = inEdges.filter(e => e.from === src).reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0);
          lines.push(`    · ${src}  (${vol.toFixed(4)} ${chainUp})`);
        }
        lines.push(``);
      }
    }

    if (exchNodes.length > 0) {
      lines.push(`─── EXCHANGE / KNOWN ENTITIES (${exchNodes.length}) ${"─".repeat(33)}`);
      lines.push(``);
      for (const n of exchNodes) {
        const vol = connections.edges
          .filter(e => e.from === n.address || e.to === n.address)
          .reduce((s, e) => s + parseFloat(e.totalValue || "0"), 0);
        lines.push(`  ${n.label?.toUpperCase() ?? n.address}`);
        lines.push(`  ${n.address}  |  Volume: ${vol.toFixed(4)} ${chainUp}`);
        lines.push(``);
      }
    }

    lines.push(`─── ALL NODES ${"─".repeat(50)}`);
    lines.push(``);
    for (const n of connections.nodes) {
      const tag = n.address === address ? "[CENTER]"
                : commingling.has(n.address) ? "[HUB]"
                : n.label ? `[${n.label}]`
                : (n.riskScore ?? 0) > 70 ? "[HIGH-RISK]"
                : "";
      lines.push(`  ${n.address}  ${tag}`);
    }
    lines.push(``);
    lines.push(`─── TOP FLOWS (by volume) ${"─".repeat(38)}`);
    lines.push(``);
    for (const e of sortedEdges.slice(0, 25)) {
      const vol = parseFloat(e.totalValue || "0");
      const usd = e.totalValueUsd ?? 0;
      const usdStr = usd > 0 ? `  ($${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })})` : "";
      lines.push(`  ${e.from}`);
      lines.push(`    → ${e.to}`);
      lines.push(`    ${vol.toFixed(4)} ${chainUp}${usdStr}  |  ${e.transactionCount} tx${e.transactionCount !== 1 ? "s" : ""}`);
      lines.push(``);
    }
    lines.push(`${"═".repeat(64)}`);
    lines.push(`Generated by CryptoChainTrace  ·  cryptochaintrace.replit.app`);
    return lines.join("\n");
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 2500);
  };

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
              <Select value={depth} onValueChange={(v: DepthStr) => setDepth(v)}>
                <SelectTrigger className="font-mono h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Hop (Quick)</SelectItem>
                  <SelectItem value="2">2 Hops (Standard)</SelectItem>
                  <SelectItem value="3">3 Hops (Deep)</SelectItem>
                  <SelectItem value="4">4 Hops (Extended)</SelectItem>
                  <SelectItem value="5">5 Hops (Thorough)</SelectItem>
                  <SelectItem value="6">6 Hops (Maximum)</SelectItem>
                </SelectContent>
              </Select>
              {parseInt(depth) >= 3 && (
                <p className="text-[10px] font-mono text-yellow-500/70 mt-1">
                  Deeper graphs may take a few seconds to load.
                </p>
              )}
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
              <button
                onClick={() => { setGraphReportText(genGraphReport()); setShowGraphReport(true); }}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-mono text-emerald-300 hover:text-emerald-200 bg-emerald-950/30 hover:bg-emerald-950/50 border border-emerald-500/30 hover:border-emerald-500/50 rounded px-2 py-2 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Generate Investigative Report from Graph
              </button>
            )}
            <p className="text-[10px] font-mono text-muted-foreground/50 pt-0 border-t border-border/30">
              Click any node for details · hover for edges
            </p>
          </div>
        </Card>

        <div className="flex gap-2 pointer-events-auto">
          <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur"><ZoomIn className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur"><ZoomOut className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="bg-card/80 backdrop-blur"><Maximize className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* ── Canvas ── */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <Network className="w-8 h-8 text-primary animate-pulse" />
            <span className="text-sm font-mono text-muted-foreground">
              Building {DEPTH_LABELS[depth]} graph…
            </span>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="flex flex-col items-center gap-3 text-destructive">
            <AlertCircle className="w-8 h-8" />
            <span className="text-sm font-mono">Failed to load graph data</span>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="w-full h-full" style={{ cursor: "crosshair" }} />

      {/* ── Node info panel ── */}
      {selectedNode && (
        <div className="absolute bottom-24 right-4 z-20 pointer-events-auto w-[22rem] max-w-[calc(100vw-2rem)]">
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
                  <div className="text-[9px] font-mono text-muted-foreground mb-0.5">TOTAL TXS</div>
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

              {/* Connection to center stats */}
              {txsWithCenter > 0 && selectedAddr !== address && (
                <div className="pt-2 border-t border-border/20 space-y-1">
                  <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">With Center Wallet</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-border/10 rounded px-2 py-1 text-center">
                      <div className="text-[9px] font-mono text-muted-foreground">TXS</div>
                      <div className="text-sm font-mono font-bold text-primary">{txsWithCenter}</div>
                    </div>
                    <div className="bg-border/10 rounded px-2 py-1 text-center">
                      <div className="text-[9px] font-mono text-muted-foreground">VOLUME</div>
                      <div className="text-xs font-mono font-bold text-primary">
                        {volWithCenter >= 1000
                          ? `${(volWithCenter / 1000).toFixed(1)}K`
                          : volWithCenter.toFixed(3)}{" "}{chainUp}
                      </div>
                    </div>
                  </div>
                  {usdWithCenter > 0 && (
                    <div className="text-[10px] font-mono text-center text-muted-foreground">
                      ≈ ${usdWithCenter.toLocaleString("en-US", { maximumFractionDigits: 0 })} USD
                    </div>
                  )}
                </div>
              )}

              {/* Balance */}
              {selectedNode.balance && selectedNode.balance !== "0" && (
                <div className="pt-1 border-t border-border/20 text-xs font-mono text-center">
                  <span className="text-muted-foreground">BALANCE  </span>
                  <span className="text-primary font-bold">{selectedNode.balance} {chainUp}</span>
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
                  onClick={() => {
                    navigator.clipboard.writeText(selectedNode.address).catch(() => {});
                    setAddedCopied(true);
                    setTimeout(() => setAddedCopied(false), 2500);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 text-[11px] font-mono text-cyan-300 hover:text-cyan-200 bg-cyan-950/30 hover:bg-cyan-950/50 border border-cyan-500/30 hover:border-cyan-500/50 rounded px-2 py-1.5 transition-colors"
                >
                  {addedCopied
                    ? <><Check className="w-3 h-3" /> Copied! Paste into Commingle Check</>
                    : <><BookmarkPlus className="w-3 h-3" /> Add to Commingle Check</>
                  }
                </button>
                <button
                  onClick={() => { setNodeReportText(genNodeReport()); setShowNodeReport(true); }}
                  className="w-full flex items-center justify-center gap-1.5 text-[11px] font-mono text-orange-300 hover:text-orange-200 bg-orange-950/30 hover:bg-orange-950/50 border border-orange-500/30 hover:border-orange-500/50 rounded px-2 py-1.5 transition-colors"
                >
                  <FileText className="w-3 h-3" /> Node Investigative Report
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
      </Card>

      {/* ── Node Report Modal ── */}
      {showNodeReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowNodeReport(false)}>
          <div className="relative w-full max-w-3xl bg-[#0a0c10] border border-orange-500/30 rounded-lg shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="font-mono text-sm text-orange-300 font-bold uppercase tracking-widest">Node Investigative Report</span>
                <span className="text-[11px] font-mono text-muted-foreground">{chainUp} · Trace Graph</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyText(nodeReportText)}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border/40 hover:border-border/70 rounded px-3 py-1.5 transition-colors"
                >
                  {reportCopied ? <><Check className="w-3 h-3 text-green-400" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
                <button onClick={() => setShowNodeReport(false)} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono text-foreground/90 leading-relaxed whitespace-pre">{nodeReportText}</pre>
          </div>
        </div>
      )}

      {/* ── Graph Report Modal ── */}
      {showGraphReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowGraphReport(false)}>
          <div className="relative w-full max-w-4xl bg-[#0a0c10] border border-emerald-500/30 rounded-lg shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-sm text-emerald-300 font-bold uppercase tracking-widest">Graph Investigative Report</span>
                <span className="text-[11px] font-mono text-muted-foreground">{chainUp} · {DEPTH_LABELS[depth]} · {connections?.nodes.length} nodes</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyText(graphReportText)}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border/40 hover:border-border/70 rounded px-3 py-1.5 transition-colors"
                >
                  {reportCopied ? <><Check className="w-3 h-3 text-green-400" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
                <button onClick={() => setShowGraphReport(false)} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono text-foreground/90 leading-relaxed whitespace-pre">{graphReportText}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
