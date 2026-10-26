import { memo, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, BackgroundVariant, Controls, MarkerType, Position, type Edge, type Node, type ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import type { ClusterFlow, ClusterNode } from "@/lib/cluster-finder-engine";
import { buildClusterGraphSvg, downloadClusterGraph } from "@/lib/cluster-finder-exports";
import { filterClusterGraph } from "@/lib/cluster-finder-display";
import { downloadClusterGraphPng } from "@/lib/cluster-finder-image";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface ClusterFinderGraphProps {
  nodes: ClusterNode[];
  flows: ClusterFlow[];
  selectedPath?: string[];
}

function shorten(address: string) {
  return address.length > 24 ? `${address.slice(0, 10)}…${address.slice(-8)}` : address;
}

export const ClusterFinderGraph = memo(function ClusterFinderGraph({ nodes: allNodes, flows: allFlows, selectedPath = [] }: ClusterFinderGraphProps) {
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const graphRef = useRef<HTMLDivElement>(null);
  const { nodes: clusterNodes, flows } = useMemo(
    () => showAll ? { nodes: allNodes, flows: allFlows } : filterClusterGraph(allNodes, allFlows),
    [allNodes, allFlows, showAll],
  );
  const exportPng = async () => {
    if (!graphRef.current) return;
    setExporting(true);
    setExportError("");
    try {
      await downloadClusterGraphPng(graphRef.current);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "PNG export failed. Try SVG export instead.");
    } finally {
      setExporting(false);
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
      x: 70 + level * 245,
      y: 54 + index * 128,
    }));
  });

  const nodes: Node[] = clusterNodes.map((node) => {
    const isPrimary = node.role === "primary";
    const selected = selectedPath.includes(node.address);
    const color = isPrimary ? "#f0b85b" : node.role === "input" ? "#71c4bd" : "#91a8c5";
    const title = node.label ?? (isPrimary ? "LEAD WALLET" : node.role === "input" ? "INPUT WALLET" : "PRIVATE WALLET");
    return {
      id: node.address,
      position: positions.get(node.address) ?? { x: 70, y: 54 },
      sourcePosition: Position.Left,
      targetPosition: Position.Right,
      data: {
        label: (
          <div style={{ minWidth: 148, maxWidth: 180, textAlign: "left", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
            <div style={{ color, fontSize: 9, letterSpacing: "0.14em", fontWeight: 700, marginBottom: 7, textTransform: "uppercase" }}>{title}</div>
            <div title={node.address} style={{ color: "#d8e1ec", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis" }}>{shorten(node.address)}</div>
            <div style={{ marginTop: 8, color: "#697b8f", fontSize: 8, letterSpacing: "0.12em" }}>{node.role.toUpperCase()} NODE</div>
          </div>
        ),
      },
      style: {
        background: isPrimary ? "#29251e" : node.role === "input" ? "#182b2c" : "#1b2532",
        border: `1px solid ${selected ? color : `${color}72`}`,
        borderRadius: 3,
        padding: "12px 13px",
        boxShadow: selected ? `0 0 0 1px ${color}30` : "none",
        width: 202,
      },
    };
  });

  const edges: Edge[] = flows.map((flow) => {
    const selected = selectedPath.includes(flow.from) && selectedPath.includes(flow.to);
    const count = flow.transactions.length;
    return {
      id: flow.id,
      source: flow.from,
      target: flow.to,
      type: "smoothstep",
      animated: selected,
      label: `${count} ${count === 1 ? "TX" : "TXS"}`,
      labelStyle: { fill: selected ? "#dce8ef" : "#8493a3", fontFamily: "ui-monospace, monospace", fontSize: 9 },
      labelBgStyle: { fill: "#101923", fillOpacity: 0.95 },
      style: { stroke: selected ? "#e4b568" : "#526477", strokeWidth: selected ? 2 : 1.35 },
      markerEnd: { type: MarkerType.ArrowClosed, color: selected ? "#e4b568" : "#526477", width: 12, height: 12 },
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
          onClick={() => downloadClusterGraph(buildClusterGraphSvg(instance?.getNodes() ?? nodes, clusterNodes, flows, selectedPath))}
        >
          <Download className="mr-2 h-3.5 w-3.5" /> Download Graph (SVG)
        </Button>
        </>
      )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Default: trails reaching 3+ hops from the nearest starting wallet, plus shorter connections between entered wallets. Display only; scan data and printed reports are unchanged. PNG captures the current viewport; SVG includes the full displayed graph.</p>
      {exportError && <p role="alert" className="mb-3 text-xs text-red-400">{exportError}</p>}
      <div ref={graphRef} className="relative h-[420px] w-full overflow-hidden border border-border/70 bg-[#0b1118] sm:h-[500px]" data-testid="graph-private-flows" aria-label="Private wallet flow graph">
      {nodes.length ? (
        <ReactFlow
          onInit={setInstance}
          nodes={nodes}
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
      </div>
    </div>
  );
});
