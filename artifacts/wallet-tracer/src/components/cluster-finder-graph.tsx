import { memo, useMemo, useRef, useState, type ReactNode } from "react";
import ReactFlow, { Background, BackgroundVariant, BaseEdge, Controls, EdgeLabelRenderer, getSmoothStepPath, Handle, MarkerType, Position, type Edge, type EdgeProps, type Node, type NodeProps, type ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import type { ClusterFlow, ClusterNode } from "@/lib/cluster-finder-engine";
import { buildClusterGraphSvg, clusterGraphHandleSides, downloadClusterGraph } from "@/lib/cluster-finder-exports";
import { filterClusterGraph } from "@/lib/cluster-finder-display";
import { downloadClusterGraphPng } from "@/lib/cluster-finder-image";
import { triggerClusterDownload, type ClusterDownload } from "@/lib/cluster-finder-download";
import { ClusterFinderDownloadLinks } from "./cluster-finder-download-links";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { clusterFlowCaption, clusterNodeAppearance, GRAPH_LEGEND, MAIN_PATH_COLOR, mainObservedGraphPath, mainPathFlowIds } from "@/lib/cluster-finder-graph-style";

interface ClusterFinderGraphProps {
  nodes: ClusterNode[];
  flows: ClusterFlow[];
  selectedPath?: string[];
  focusAddresses?: string[];
  focusFlowIds?: string[];
}

function shorten(address: string) {
  return address.length > 24 ? `${address.slice(0, 10)}…${address.slice(-8)}` : address;
}

function ClusterWalletNode({ data }: NodeProps<{ label: ReactNode }>) {
  return <>
    {data.label}
    {[Position.Left, Position.Right, Position.Top, Position.Bottom].map((position) => <span key={position}>
      <Handle id={`${position}-out`} type="source" position={position} isConnectable={false} style={{ opacity: 0 }} />
      <Handle id={`${position}-in`} type="target" position={position} isConnectable={false} style={{ opacity: 0 }} />
    </span>)}
  </>;
}
const nodeTypes = { clusterWallet: ClusterWalletNode };

function ClusterTransferEdge(props: EdgeProps) {
  const [path, x, y] = getSmoothStepPath(props);
  return <>
    <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={props.style} />
    <EdgeLabelRenderer>
      <div className="nodrag nopan" style={{
        position: "absolute", transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
        pointerEvents: "none", whiteSpace: "pre", padding: "4px 6px", borderRadius: 3,
        background: "#101923", color: "#dce8ef", fontSize: 9, lineHeight: "13px",
        fontFamily: "ui-monospace, monospace", border: `1px solid ${props.style?.stroke === MAIN_PATH_COLOR ? "#ef444470" : "#334151"}`,
      }}>{props.label}</div>
    </EdgeLabelRenderer>
  </>;
}
const edgeTypes = { clusterTransfer: ClusterTransferEdge };

export const ClusterFinderGraph = memo(function ClusterFinderGraph({ nodes: allNodes, flows: allFlows, selectedPath = [], focusAddresses = [], focusFlowIds = [] }: ClusterFinderGraphProps) {
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [pngFile, setPngFile] = useState<ClusterDownload | null>(null);
  const [svgFile, setSvgFile] = useState<ClusterDownload | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const focusIds = useMemo(() => new Set(focusFlowIds), [focusFlowIds]);
  const focusNodes = useMemo(() => new Set([
    ...focusAddresses, ...allFlows.filter((flow) => focusIds.has(flow.id)).flatMap((flow) => [flow.from, flow.to]),
  ]), [focusAddresses, allFlows, focusIds]);
  const { nodes: clusterNodes, flows } = useMemo(
    () => {
      if (showAll) return { nodes: allNodes, flows: allFlows };
      if (!focusAddresses.length) return filterClusterGraph(allNodes, allFlows);
      const ids = new Set(focusFlowIds);
      const flows = allFlows.filter((flow) => ids.has(flow.id));
      const visible = new Set([...focusAddresses, ...flows.flatMap((flow) => [flow.from, flow.to])]);
      return { nodes: allNodes.filter((node) => node.role === "primary" || visible.has(node.address)), flows };
    },
    [allNodes, allFlows, showAll, focusAddresses, focusFlowIds],
  );
  const mainPath = mainObservedGraphPath(clusterNodes, flows, selectedPath, focusAddresses);
  const mainFlowIds = mainPathFlowIds(flows, mainPath);
  const exportPng = async () => {
    if (!graphRef.current) return;
    setExporting(true);
    setExportError("");
    try {
      const { width, height } = graphRef.current.getBoundingClientRect();
      const svg = buildClusterGraphSvg(instance?.getNodes() ?? nodes, clusterNodes, flows,
        mainPath,
        { ...(instance?.getViewport() ?? { x: 0, y: 0, zoom: 1 }), width, height, focusAddresses });
      const file = await downloadClusterGraphPng(svg, width, height);
      setPngFile(file);
      triggerClusterDownload(file);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "PNG export failed. Try SVG export instead.");
    } finally {
      setExporting(false);
    }
  };
  const exportSvg = () => {
    setExportError("");
    try {
      const file = downloadClusterGraph(buildClusterGraphSvg(instance?.getNodes() ?? nodes, clusterNodes, flows, mainPath));
      setSvgFile(file);
      triggerClusterDownload(file);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "SVG export failed. Please try again.");
    }
  };
  const depth = new Map<string, number>();
  const primary = clusterNodes.find((node) => node.role === "primary")?.address;
  if (primary) depth.set(primary, 0);
  const queue = primary ? [primary] : [];
  const neighbors = new Map<string, Set<string>>();
  for (const flow of flows) {
    if (!neighbors.has(flow.from)) neighbors.set(flow.from, new Set());
    if (!neighbors.has(flow.to)) neighbors.set(flow.to, new Set());
    neighbors.get(flow.from)!.add(flow.to);
    neighbors.get(flow.to)!.add(flow.from);
  }
  // Layout follows connectivity, not transfer direction: outgoing-only
  // branches must be visible alongside incoming branches.
  let layoutIndex = 0;
  const expandLayout = () => {
    while (layoutIndex < queue.length) {
      const current = queue[layoutIndex++];
      for (const neighbor of neighbors.get(current) ?? []) {
        if (depth.has(neighbor)) continue;
        depth.set(neighbor, depth.get(current)! + 1);
        queue.push(neighbor);
      }
    }
  };
  expandLayout();
  for (const node of clusterNodes) {
    if (depth.has(node.address)) continue;
    depth.set(node.address, 0);
    queue.push(node.address);
    expandLayout();
  }
  const levels = new Map<number, ClusterNode[]>();
  clusterNodes.forEach((node) => {
    const level = depth.get(node.address) ?? 0;
    levels.set(level, [...(levels.get(level) ?? []), node]);
  });
  const positions = new Map<string, { x: number; y: number }>();
  [...levels.entries()].sort(([a], [b]) => b - a).forEach(([level, levelNodes]) => {
    levelNodes.forEach((node, index) => positions.set(node.address, {
      x: 70 + level * 420,
      y: 54 + index * 128,
    }));
  });

  const nodes: Node[] = clusterNodes.map((node) => {
    const isPrimary = node.role === "primary";
    const selected = selectedPath.includes(node.address) || focusNodes.has(node.address);
    const appearance = clusterNodeAppearance(node);
    const color = appearance.color;
    const title = focusAddresses.includes(node.address) ? `FOCUS · ${node.label ?? "WALLET"}` : node.label ?? (isPrimary ? "LEAD WALLET" : node.role === "input" ? "INPUT WALLET" : "PRIVATE WALLET");
    return {
      id: node.address,
      type: "clusterWallet",
      position: positions.get(node.address) ?? { x: 70, y: 54 },
      sourcePosition: Position.Left,
      targetPosition: Position.Right,
      data: {
        label: (
          <div style={{ minWidth: 148, maxWidth: 180, textAlign: "left", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
            <div style={{ color, fontSize: 9, letterSpacing: "0.14em", fontWeight: 700, marginBottom: 7, textTransform: "uppercase" }}>{title}</div>
            {node.label && <div style={{ color: "#a9b7c8", fontSize: 8, marginBottom: 4 }}>Inferred · App label catalog</div>}
            <div title={node.address} style={{ color: "#d8e1ec", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis" }}>{shorten(node.address)}</div>
            <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 8, letterSpacing: "0.08em" }}>{appearance.label.toUpperCase()} · {node.role.toUpperCase()}</div>
          </div>
        ),
      },
      style: {
        background: appearance.background,
        border: `1px solid ${selected ? color : `${color}72`}`,
        borderRadius: 3,
        padding: "12px 13px",
        boxShadow: selected ? `0 0 0 1px ${color}30` : "none",
        width: 202,
      },
    };
  });

  const edges: Edge[] = flows.map((flow) => {
    const selected = mainFlowIds.has(flow.id);
    const caption = clusterFlowCaption(flow);
    const { sourcePosition, targetPosition } = clusterGraphHandleSides(
      positions.get(flow.from) ?? { x: 0, y: 0 }, positions.get(flow.to) ?? { x: 0, y: 0 });
    return {
      id: flow.id,
      source: flow.from,
      target: flow.to,
      sourceHandle: `${sourcePosition}-out`,
      targetHandle: `${targetPosition}-in`,
      type: "clusterTransfer",
      animated: selected,
      label: caption.lines.join("\n"),
      labelStyle: { fill: selected ? "#dce8ef" : "#8493a3", fontFamily: "ui-monospace, monospace", fontSize: 9 },
      labelBgStyle: { fill: "#101923", fillOpacity: 0.95 },
      style: { stroke: selected ? MAIN_PATH_COLOR : "#526477", strokeWidth: selected ? 2.5 : 1.35 },
      markerEnd: { type: MarkerType.ArrowClosed, color: selected ? MAIN_PATH_COLOR : "#526477", width: 12, height: 12 },
    };
  });
  const height = Math.max(380, Math.max(1, ...[...levels.values()].map((items) => items.length)) * 128 + 100);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} data-testid="toggle-cluster-all-trails" />
          Show all trails
        </label>
      {nodes.length > 0 && (
        <>
        <Button type="button" variant="outline" size="sm" disabled={exporting}
          data-testid="button-export-cluster-png" title="Capture the current graph view, zoom and pan as PNG"
          onClick={exportPng}>
          <Download className="mr-2 h-3.5 w-3.5" /> {exporting ? "Exporting…" : "Download View (PNG)"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-background"
          data-testid="button-export-cluster-graph"
          title="Download the entire graph as an SVG image, including highlighted routes and a full wallet address key"
          onClick={exportSvg}
        >
          <Download className="mr-2 h-3.5 w-3.5" /> Download Graph (SVG)
        </Button>
        </>
      )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{focusAddresses.length ? "Focus view: observed shortest lead-to-focus routes within the selected hop depth. Show all trails to see the rest of the scan." : "Default: trails reaching 3+ hops from the nearest starting wallet, plus shorter connections between entered wallets. Display only; scan data and printed reports are unchanged."} PNG captures the current viewport; SVG includes the full displayed graph.</p>
      {exportError && <p role="alert" className="mb-3 text-xs text-red-400">{exportError}</p>}
      {pngFile && <ClusterFinderDownloadLinks file={pngFile} label="PNG graph" />}
      {svgFile && <ClusterFinderDownloadLinks file={svgFile} label="SVG graph" />}
      <div ref={graphRef} className="relative h-[420px] w-full overflow-hidden border border-border/70 bg-[#0b1118] sm:h-[500px]" data-testid="graph-private-flows" aria-label="Private wallet flow graph">
      {nodes.length ? (
        <ReactFlow
          onInit={setInstance}
          nodes={nodes}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.2, minZoom: 0.25 }}
          onlyRenderVisibleElements
          minZoom={0.25}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#334151" gap={28} size={1} variant={BackgroundVariant.Dots} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      ) : (
        <div className="flex h-full min-h-[380px] items-center justify-center px-6 text-center">
          <div>
            <div className="mx-auto mb-3 h-px w-12 bg-amber-300/50" />
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">No connecting private-wallet flows</p>
            <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground/70">Eligible wallets and observed IN/OUT flows within the selected hop depth appear here.</p>
          </div>
        </div>
      )}
      <span className="sr-only">Graph canvas height {height}px</span>
        <div aria-label="Graph legend" data-testid="cluster-graph-legend" className="pointer-events-none absolute bottom-3 left-3 z-10 rounded border border-[#334151] bg-[#101923]/95 p-2 font-mono text-[9px] text-[#d8e1ec]" style={{ width: 288, maxWidth: "calc(100% - 84px)" }}>
          <div className="mb-1 text-[8px] uppercase tracking-widest text-[#94a3b8]">Wallet types · observed flows</div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {GRAPH_LEGEND.map((item) => <span key={item.key} className="flex items-center gap-1.5"><span style={{ background: item.color }} className="h-2 w-2 shrink-0 rounded-full" />{item.label}</span>)}
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-2 shrink-0" style={{ background: MAIN_PATH_COLOR }} />Main observed path</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">Arrow amounts are transfer totals by asset symbol; dates are UTC. Red highlights the selected directed trail or a representative observed route toward the lead, not proof of ownership. Exchange categories do not add excluded wallets to this graph.</p>
    </div>
  );
});
