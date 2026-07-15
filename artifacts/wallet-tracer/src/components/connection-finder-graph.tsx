import ReactFlow, { type Node, type Edge, Background, Controls, MarkerType } from "reactflow";
import "reactflow/dist/style.css";

interface Hop {
  address: string;
  tx: unknown;
}

export interface ConnectionFinderGraphProps {
  walletA: string;
  walletB: string;
  commonNodes: Array<{
    address: string;
    pathFromA: Hop[];
    pathFromB: Hop[];
  }>;
  getLabel?: (address: string) => string | null;
}

function short(addr: string) {
  return addr.length > 16 ? addr.slice(0, 8) + "…" + addr.slice(-4) : addr;
}

export function ConnectionFinderGraph({
  walletA,
  walletB,
  commonNodes,
  getLabel,
}: ConnectionFinderGraphProps) {
  const n = commonNodes.length;
  const totalH = Math.max(1, n) * 130;
  const centerY = (totalH - 130) / 2;

  const nodes: Node[] = [
    {
      id: "wallet-a",
      position: { x: 20, y: centerY },
      data: {
        label: (
          <div style={{ textAlign: "center", lineHeight: 1.5 }}>
            <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 9, letterSpacing: "0.08em", marginBottom: 3 }}>
              WALLET A
            </div>
            <div style={{ color: "#86efac", fontSize: 9, fontFamily: "monospace" }}>{short(walletA)}</div>
          </div>
        ),
      },
      style: {
        background: "#052e16",
        border: "1.5px solid #16a34a",
        borderRadius: 8,
        padding: "8px 10px",
        width: 155,
        cursor: "default",
      },
    },
    {
      id: "wallet-b",
      position: { x: 525, y: centerY },
      data: {
        label: (
          <div style={{ textAlign: "center", lineHeight: 1.5 }}>
            <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 9, letterSpacing: "0.08em", marginBottom: 3 }}>
              WALLET B
            </div>
            <div style={{ color: "#fde68a", fontSize: 9, fontFamily: "monospace" }}>{short(walletB)}</div>
          </div>
        ),
      },
      style: {
        background: "#451a03",
        border: "1.5px solid #d97706",
        borderRadius: 8,
        padding: "8px 10px",
        width: 155,
        cursor: "default",
      },
    },
    ...commonNodes.map((node, i) => {
      const label = getLabel?.(node.address) ?? null;
      const hopsA = node.pathFromA.length - 1;
      const hopsB = node.pathFromB.length - 1;
      const isDirect = hopsA === 1 || hopsB === 1;
      return {
        id: `common-${i}`,
        position: { x: 265, y: i * 130 },
        data: {
          label: (
            <div style={{ textAlign: "center", lineHeight: 1.5 }}>
              <div
                style={{
                  color: isDirect ? "#a78bfa" : "#38bdf8",
                  fontWeight: 700,
                  fontSize: 9,
                  letterSpacing: "0.06em",
                  marginBottom: 3,
                }}
              >
                {label ?? (isDirect ? "DIRECT HUB" : "SHARED NODE")}
              </div>
              <div style={{ color: isDirect ? "#c4b5fd" : "#7dd3fc", fontSize: 9, fontFamily: "monospace", marginBottom: 3 }}>
                {short(node.address)}
              </div>
              <div style={{ color: "#475569", fontSize: 8 }}>
                {hopsA}h from A · {hopsB}h from B
              </div>
            </div>
          ),
        },
        style: {
          background: isDirect ? "#1e1b4b" : "#082f49",
          border: isDirect ? "1.5px solid #7c3aed" : "1.5px solid #0284c7",
          borderRadius: 8,
          padding: "8px 10px",
          width: 155,
          cursor: "default",
        },
      } as Node;
    }),
  ];

  const edges: Edge[] = commonNodes.flatMap((node, i) => {
    const hopsA = node.pathFromA.length - 1;
    const hopsB = node.pathFromB.length - 1;
    return [
      {
        id: `ea-${i}`,
        source: "wallet-a",
        target: `common-${i}`,
        type: "smoothstep",
        label: hopsA === 1 ? "direct" : `${hopsA} hops`,
        labelStyle: { fill: "#4ade80", fontFamily: "monospace", fontSize: 9, fontWeight: 600 },
        labelBgStyle: { fill: "#052e16", fillOpacity: 0.9 },
        style: {
          stroke: "#16a34a",
          strokeWidth: hopsA === 1 ? 2.5 : 1.5,
          strokeDasharray: hopsA > 1 ? "5 3" : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#16a34a", width: 12, height: 12 },
      } as Edge,
      {
        id: `eb-${i}`,
        source: "wallet-b",
        target: `common-${i}`,
        type: "smoothstep",
        label: hopsB === 1 ? "direct" : `${hopsB} hops`,
        labelStyle: { fill: "#fbbf24", fontFamily: "monospace", fontSize: 9, fontWeight: 600 },
        labelBgStyle: { fill: "#451a03", fillOpacity: 0.9 },
        style: {
          stroke: "#d97706",
          strokeWidth: hopsB === 1 ? 2.5 : 1.5,
          strokeDasharray: hopsB > 1 ? "5 3" : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#d97706", width: 12, height: 12 },
      } as Edge,
    ];
  });

  const containerH = Math.max(220, n * 130 + 80);

  return (
    <div
      style={{
        height: containerH,
        background: "#020812",
        borderRadius: 8,
        border: "1px solid rgba(14,165,233,0.2)",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll={false}
        zoomOnScroll={false}
        preventScrolling={false}
      >
        <Background color="#1e293b" gap={24} size={1} style={{ opacity: 0.35 }} />
        <Controls showInteractive={false} position="bottom-right" style={{ bottom: 8, right: 8 }} />
      </ReactFlow>
    </div>
  );
}
