import { getSmoothStepPath, Position, type Node } from "reactflow";
import type { ClusterFinderResult, ClusterFlow, ClusterNode } from "./cluster-finder-engine";

function escapeMarkup(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function buildClusterReport(result: ClusterFinderResult): string {
  const text = escapeMarkup;
  const list = (title: string, addresses: string[]) => addresses.length
    ? `<h3>${title}</h3><ul>${addresses.map((address) => `<li>${text(address)}</li>`).join("")}</ul>`
    : "";
  const sections = result.connections.map((connection, index) => `
    <section><h2>Input ${index + 1}: ${text(connection.inputAddress)}</h2>
    ${connection.flows.map((flow) => `
      <h3>Hop ${flow.hop} — ${flow.transactions.length} observed transaction(s)</h3>
      <p class="address"><strong>Direction:</strong> ${text(flow.from)} → ${text(flow.to)}</p>
      <table><thead><tr><th>TX hash</th><th>Exact amount</th><th>Date/time (UTC)</th></tr></thead><tbody>
      ${flow.transactions.map((tx) => {
        const date = new Date(tx.timestamp);
        return `<tr><td class="hash">${text(tx.hash)}</td><td>${text(tx.value)} ${text(tx.tokenSymbol)}</td><td>${text(Number.isNaN(date.getTime()) ? tx.timestamp : date.toISOString())}</td></tr>`;
      }).join("")}
      </tbody></table>
    `).join("")}</section>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cluster Finder Report</title>
    <style>
      @page { size: landscape; margin: 14mm; }
      body { font: 12px/1.5 Arial,sans-serif; color:#17212c; margin:24px; }
      h1 { font-size:24px; } h2 { font-size:16px; margin-top:28px; overflow-wrap:anywhere; }
      h3 { font-size:13px; margin-top:20px; } .address,li { overflow-wrap:anywhere; }
      table { width:100%; border-collapse:collapse; table-layout:fixed; margin-bottom:18px; }
      th,td { border:1px solid #bac5cf; padding:8px; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
      th:first-child { width:48%; } thead { display:table-header-group; } tr { break-inside:avoid; }
      h2,h3,.address { break-after:avoid; } .hash,.address { font-family:monospace; }
      .warning { border:1px solid #96722e; padding:10px; background:#fff9e9; }
      @media print { body { margin:0; } }
    </style></head><body>
    <h1>Cluster Finder — Observed Private-Wallet Paths</h1>
    <p>Generated: ${text(new Date().toISOString())} · Chain: ${text(result.chain)}</p>
    <p class="address"><strong>Lead wallet:</strong> ${text(result.primaryAddress)}</p>
    <p>${result.scannedWallets} wallets scanned · ${result.scannedTransactions} transactions scanned · ${result.connections.length} connected inputs</p>
    <p class="${result.complete ? "" : "warning"}"><strong>${result.complete ? "Scan complete within the configured history cap." : "INCOMPLETE SCAN — paths may be missing."}</strong></p>
    <p>Only observed successful private-wallet transfers are shown. Arrows indicate sender → recipient.
    Hop numbers are minimum distance from each input; branches and cycles are listed as observed flows, not proof of a single chronological path or common ownership.
    Histories are limited to 25,000 transactions per wallet; traversal has no artificial hop limit.</p>
    ${list("Input wallets", result.inputAddresses)}
    ${list("No observed connection (not proof of no relationship)", result.disconnectedAddresses)}
    ${list("Known infrastructure excluded", result.excludedAddresses)}
    ${list("Histories that reached the 25,000 transaction cap", result.truncatedAddresses)}
    ${result.fetchErrors.length ? `<h3>Incomplete history warnings</h3><ul>${result.fetchErrors.map((error) => `<li>${text(error.address)}: ${text(error.message)}</li>`).join("")}</ul>` : ""}
    ${sections || "<p>No connecting private-wallet paths were observed in this scan.</p>"}
    </body></html>`;
}

export function printClusterReport(result: ClusterFinderResult): void {
  // A separate print document avoids application chrome, scroll clipping, and
  // popup blockers. No wallet data is sent to a third-party export service.
  const frame = document.createElement("iframe");
  frame.title = "Cluster Finder print report";
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;left:-10000px;top:0";
  let cleanupTimer: ReturnType<typeof setTimeout>;
  const cleanup = () => {
    clearTimeout(cleanupTimer);
    frame.remove();
  };
  frame.onload = () => {
    const target = frame.contentWindow;
    if (!target) { cleanup(); return; }
    target.addEventListener("afterprint", cleanup, { once: true });
    cleanupTimer = setTimeout(cleanup, 300_000);
    target.focus();
    target.print();
  };
  frame.srcdoc = buildClusterReport(result);
  document.body.appendChild(frame);
}

export function buildClusterGraphSvg(
  nodes: Node[],
  wallets: ClusterNode[],
  flows: ClusterFlow[],
  selectedPath: string[],
): string {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const minX = Math.min(...nodes.map((node) => node.position.x)) - 35;
  const minY = Math.min(...nodes.map((node) => node.position.y)) - 60;
  const maxX = Math.max(...nodes.map((node) => node.position.x + (node.width ?? 202))) + 35;
  const maxY = Math.max(...nodes.map((node) => node.position.y + (node.height ?? 100))) + 35;
  const graphHeight = maxY - minY;
  const width = Math.max(700, maxX - minX);
  // Preserve the entire graph, rather than exporting only its zoomed viewport.
  const height = graphHeight + 55 + wallets.length * 24;
  const paths = flows.map((flow) => {
    const source = byId.get(flow.from);
    const target = byId.get(flow.to);
    if (!source || !target) return "";
    const [path, x, y] = getSmoothStepPath({
      sourceX: source.position.x, sourceY: source.position.y + (source.height ?? 100) / 2,
      targetX: target.position.x + (target.width ?? 202), targetY: target.position.y + (target.height ?? 100) / 2,
      sourcePosition: Position.Left, targetPosition: Position.Right,
    });
    const selected = selectedPath.includes(flow.from) && selectedPath.includes(flow.to);
    return `<path d="${escapeMarkup(path)}" fill="none" stroke="${selected ? "#e4b568" : "#8493a3"}" stroke-width="${selected ? 2 : 1.35}" marker-end="url(#arrow)"/>
      <text x="${x}" y="${y - 6}" text-anchor="middle" fill="#dce8ef" font-size="10" stroke="#0b1118" stroke-width="3" paint-order="stroke">${flow.transactions.length} TX</text>`;
  }).join("");
  const boxes = wallets.map((wallet, index) => {
    const node = byId.get(wallet.address);
    if (!node) return "";
    const color = wallet.role === "primary" ? "#f0b85b" : wallet.role === "input" ? "#71c4bd" : "#91a8c5";
    const short = wallet.address.length > 24 ? `${wallet.address.slice(0, 10)}…${wallet.address.slice(-8)}` : wallet.address;
    return `<g transform="translate(${node.position.x},${node.position.y})">
      <title>${escapeMarkup(wallet.address)}</title>
      <rect width="${node.width ?? 202}" height="${node.height ?? 100}" rx="3" fill="#1b2532" stroke="${color}" stroke-width="${selectedPath.includes(wallet.address) ? 2 : 1}"/>
      <text x="13" y="25" fill="${color}" font-size="10">${index + 1}. ${escapeMarkup(wallet.role.toUpperCase())} WALLET</text>
      <text x="13" y="48" fill="#d8e1ec" font-size="10">${escapeMarkup(short)}</text>
      <text x="13" y="70" fill="${color}" font-size="9">${escapeMarkup(wallet.label ?? "")}</text>
      </g>`;
  }).join("");
  const key = wallets.map((wallet, index) => `<text x="${minX + 15}" y="${maxY + 40 + index * 24}" fill="#d8e1ec" font-size="11">${index + 1}. ${escapeMarkup(wallet.address)}${wallet.label ? ` — ${escapeMarkup(wallet.label)}` : ""}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" font-family="monospace">
    <title>Cluster Finder — Observed private-wallet flows</title>
    <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#0b1118"/>
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#dce8ef"/></marker></defs>
    <text x="${minX + 15}" y="${minY + 25}" fill="#dce8ef" font-size="14">Cluster Finder · Observed private-wallet flows · Sender → recipient</text>
    ${paths}${boxes}${key}</svg>`;
}

export function downloadClusterGraph(svg: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `cluster-finder-graph-${new Date().toISOString().replace(/[:.]/g, "-")}.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
