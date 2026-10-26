import { getSmoothStepPath, Position, type Node } from "reactflow";
import type { ClusterConnection, ClusterFinderResult, ClusterFlow, ClusterNode } from "./cluster-finder-engine";
import { createClusterDownload, type ClusterDownload } from "./cluster-finder-download";

function escapeMarkup(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function directedTrailDetails(connection: ClusterConnection, title: string): string {
  const text = escapeMarkup;
  return `<section><h2>${text(title)}: ${text(connection.inputAddress)}</h2>
    <p>${connection.flows.length} relevant flow(s) · ${connection.nodes.length} nodes</p>
    ${connection.flows.map((flow) => `
      <h3>Hop ${flow.hop} — ${flow.transactions.length} observed transaction(s)</h3>
      <p class="address"><strong>Direction:</strong> ${text(flow.from)} → ${text(flow.to)}</p>
      <table><thead><tr><th>TX hash</th><th>Exact amount</th><th>Date/time (UTC)</th></tr></thead><tbody>
      ${flow.transactions.map((tx) => {
        const date = new Date(tx.timestamp);
        return `<tr><td class="hash">${text(tx.hash)}</td><td>${text(tx.value)} ${text(tx.tokenSymbol)}</td><td>${text(Number.isNaN(date.getTime()) ? tx.timestamp : date.toISOString())}</td></tr>`;
      }).join("")}
      </tbody></table>
    `).join("")}</section>`;
}

export function buildClusterReport(result: ClusterFinderResult): string {
  const text = escapeMarkup;
  const hopName = ({ 3: "three", 4: "four", 6: "six" } as const)[result.maxHops ?? 6];
  const list = (title: string, addresses: string[]) => addresses.length
    ? `<h3>${title}</h3><ul>${addresses.map((address) => `<li>${text(address)}</li>`).join("")}</ul>`
    : "";
  const sections = result.connections.map((connection, index) =>
    directedTrailDetails(connection, `Input ${index + 1}`)).join("");
  const directedIndex = `<section><h2>Directed Input-to-Lead Index</h2>
    <p>${result.connections.length} observed path(s) · Lead: <span class="address">${text(result.primaryAddress)}</span></p>
    ${result.connections.length ? `<table><thead><tr><th>Input wallet</th><th>Relevant flows</th><th>Nodes</th></tr></thead><tbody>
      ${result.connections.map((connection) => `<tr><td class="address">${text(connection.inputAddress)}</td><td>${connection.flows.length}</td><td>${connection.nodes.length}</td></tr>`).join("")}
    </tbody></table>` : "<p>No input wallet has a confirmed private-wallet path to the lead in the scanned history.</p>"}</section>`;
  const focusSection = result.focusAddresses?.length ? `<section><h2>Focus wallet connections</h2>
    <p>Observed shortest IN/OUT routes between the lead and focus wallets, within ${text(result.maxHops ?? 6)} transfers. Arrows retain the actual sender → recipient direction; these are connectivity paths, not proof of chronological flow or ownership.</p>
    ${result.focusAddresses.map((address) => {
      const connection = result.focusConnections?.find((item) => item.focusAddress === address);
      return `<h3>Focus wallet: <span class="address">${text(address)}</span></h3>${connection
        ? `<p>${connection.hopCount} hop(s) from lead. Alternate shortest routes are grouped by hop.</p>
          ${connection.flows.map((flow) => `<h4>Hop ${flow.hop}: <span class="address">${text(flow.from)} → ${text(flow.to)}</span></h4>
          <table><thead><tr><th>TX hash</th><th>Exact amount</th><th>Date/time (UTC)</th><th>Direction</th></tr></thead><tbody>
          ${flow.transactions.map((tx) => `<tr><td class="hash">${text(tx.hash)}</td><td>${text(tx.value)} ${text(tx.tokenSymbol)}</td><td>${text(Number.isNaN(Date.parse(tx.timestamp)) ? tx.timestamp : new Date(tx.timestamp).toISOString())}</td><td class="address">${text(flow.from)} → ${text(flow.to)}</td></tr>`).join("")}</tbody></table>`).join("")}`
        : `<p class="warning">${result.excludedAddresses.includes(address) ? "Excluded by existing allowed-wallet rules." : "No connection observed within the selected lead-to-focus hop depth. Incomplete histories may hide paths."}</p>`}`;
    }).join("")}</section>` : "";
  const trailSection = `<section><h2>Complete recursive IN/OUT trail</h2>
    <p>Expansion follows both transfer directions up to ${hopName} hops from the lead and additional starting wallets (hop 0).
    Each wallet is scanned once. Discovery hops indicate minimum expansion depth from any starting wallet, not chronological transfer order.
    Separate starting-wallet components are shown without implying a connection between them.</p>
    ${result.flows.map((flow) => `<h3>Discovery hop ${text(flow.discoveryHop ?? "—")} — ${flow.transactions.length} observed transaction(s)</h3>
      <p class="address"><strong>Direction:</strong> ${text(flow.from)} → ${text(flow.to)}</p>
      <table><thead><tr><th>TX hash</th><th>Exact amount</th><th>Date/time (UTC)</th></tr></thead><tbody>
      ${flow.transactions.map((tx) => {
        const date = new Date(tx.timestamp);
        return `<tr><td class="hash">${text(tx.hash)}</td><td>${text(tx.value)} ${text(tx.tokenSymbol)}</td><td>${text(Number.isNaN(date.getTime()) ? tx.timestamp : date.toISOString())}</td></tr>`;
      }).join("")}</tbody></table>`).join("") || "<p>No eligible transfers were observed.</p>"}</section>`;
  const exchangeTransactions = result.usExchangeTransactions ?? [];
  const exchangeSection = `<section><h2>US exchange IN/OUT transactions</h2>
    <p>Observed in the fetched histories of scanned eligible wallets, including wallets without an observed connection to the lead.
    Uses the application's existing US-exchange reporting classification and known wallet labels, not a live verification of exchange headquarters.
    Exchange wallets are excluded from path traversal and the graph; no additional histories are fetched.</p>
    <p><strong>Direction is relative to the listed wallet:</strong> IN = exchange → wallet; OUT = wallet → exchange.
    Successful transfers only. The scan's incomplete-history warnings also apply to this section.</p>
    ${exchangeTransactions.length ? `<table class="exchange-table"><thead><tr>
      <th>Wallet address</th><th>Exchange name / address</th><th>Exact amount</th><th>TX hash</th><th>Date/time (UTC)</th><th>Direction</th>
    </tr></thead><tbody>${exchangeTransactions.map((entry) => {
      const tx = entry.transaction;
      const date = new Date(tx.timestamp);
      return `<tr><td class="hash">${text(entry.walletAddress)}</td>
        <td>${text(entry.exchangeName)}<br><span class="hash">${text(entry.exchangeAddress)}</span></td>
        <td>${text(tx.value)} ${text(tx.tokenSymbol)}</td><td class="hash">${text(tx.hash)}</td>
        <td>${text(Number.isNaN(date.getTime()) ? tx.timestamp : date.toISOString())}</td><td>${text(entry.direction)}</td></tr>`;
    }).join("")}</tbody></table>` : "<p>No US-exchange transactions were observed in the fetched histories. This is not proof that none exist.</p>"}
    </section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cluster Finder Report</title>
    <style>
      @page { size: landscape; margin: 14mm; }
      body { font: 12px/1.5 Arial,sans-serif; color:#17212c; margin:24px; }
      h1 { font-size:24px; } h2 { font-size:16px; margin-top:28px; overflow-wrap:anywhere; }
      h3 { font-size:13px; margin-top:20px; } .address,li { overflow-wrap:anywhere; }
      table { width:100%; border-collapse:collapse; table-layout:fixed; margin-bottom:18px; }
      th,td { border:1px solid #bac5cf; padding:8px; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
      th:first-child { width:48%; } thead { display:table-header-group; } tr { break-inside:avoid; }
      .exchange-table th:first-child { width:20%; }
      .exchange-table th:nth-child(2),.exchange-table th:nth-child(3) { width:12%; }
      .exchange-table th:nth-child(4) { width:28%; } .exchange-table th:nth-child(5) { width:18%; }
      .exchange-table th:nth-child(6) { width:10%; }
      h2,h3,.address { break-after:avoid; } .hash,.address { font-family:monospace; }
      .warning { border:1px solid #96722e; padding:10px; background:#fff9e9; }
      @media print { body { margin:0; } }
    </style></head><body>
    <h1>Cluster Finder — Observed Private-Wallet Paths</h1>
    <p>Generated: ${text(new Date().toISOString())} · Chain: ${text(result.chain)}</p>
    <p class="address"><strong>Lead wallet:</strong> ${text(result.primaryAddress)}</p>
    <p>${result.scannedWallets} wallets scanned · ${result.scannedTransactions} transactions scanned · ${result.connections.length} connected inputs</p>
    <p class="${result.complete ? "" : "warning"}"><strong>${result.complete ? `Scan complete within the ${hopName}-hop boundary and configured history cap.` : "INCOMPLETE SCAN — paths may be missing."}</strong></p>
    ${result.incompleteReason ? `<p class="warning">${text(result.incompleteReason)}</p>` : ""}
    <p>Hop-by-hop paths show only observed successful transfers between unlabeled wallets or wallets labeled Treasury, Stardust Collective, or Team Foundation. Arrows indicate sender → recipient.
    Hop numbers are minimum distance from each input; branches and cycles are listed as observed flows, not proof of a single chronological path or common ownership.
    Histories are limited to 25,000 transactions per wallet; recursive IN/OUT expansion stops at ${hopName} hops from any starting wallet.
    Wallets at hop ${hopName} are scanned, but links to wallets beyond the boundary are not followed.</p>
    ${list("Input wallets", result.inputAddresses)}
    ${list("No directed input-to-lead path within scanned boundary (IN/OUT links may still exist)", result.disconnectedAddresses)}
    ${list("Known infrastructure excluded", result.excludedAddresses)}
    ${list("Histories that reached the 25,000 transaction cap", result.truncatedAddresses)}
    ${result.fetchErrors.length ? `<h3>Incomplete history warnings</h3><ul>${result.fetchErrors.map((error) => `<li>${text(error.address)}: ${text(error.message)}</li>`).join("")}</ul>` : ""}
    ${focusSection}
    ${trailSection}
    ${directedIndex}
    <h2>Directed input-to-lead paths</h2>
    ${sections || "<p>No directed input-to-lead paths were observed in this scan.</p>"}
    ${exchangeSection}
    </body></html>`;
}

export function printClusterReport(result: ClusterFinderResult): ClusterDownload {
  // A real printable HTML file avoids hidden-iframe print restrictions.
  // The caller also exposes persistent links if automatic downloads are blocked.
  return createClusterDownload(
    new Blob([buildClusterReport(result)], { type: "text/html;charset=utf-8" }),
    `cluster-finder-report-${new Date().toISOString().replace(/[:.]/g, "-")}.html`,
  );
}

export function buildClusterSelectedTrailReport(result: ClusterFinderResult, inputAddress: string): string {
  const connection = result.connections.find((item) => item.inputAddress === inputAddress);
  if (!connection) throw new Error("The selected trail is no longer available. Select a trail and try again.");
  const text = escapeMarkup;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cluster Finder Selected Trail Report</title>
    <style>
      @page { size: landscape; margin:14mm; }
      body { font:12px/1.5 Arial,sans-serif; color:#17212c; margin:24px; }
      h1 { font-size:24px; } h2 { font-size:16px; } h3 { font-size:13px; }
      .address,.hash { font-family:monospace; overflow-wrap:anywhere; }
      table { width:100%; border-collapse:collapse; table-layout:fixed; margin-bottom:18px; }
      th,td { border:1px solid #bac5cf; padding:8px; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
      th:first-child { width:48%; } thead { display:table-header-group; } tr { break-inside:avoid; }
      .warning { border:1px solid #96722e; padding:10px; background:#fff9e9; }
      @media print { body { margin:0; } }
    </style></head><body>
    <h1>Cluster Finder — Selected Directed Input-to-Lead Trail</h1>
    <p>Generated: ${text(new Date().toISOString())} · Chain: ${text(result.chain)}</p>
    <p class="address"><strong>Lead wallet:</strong> ${text(result.primaryAddress)}</p>
    <p><strong>${result.complete ? "Scan complete within the selected hop boundary and configured history cap." : "INCOMPLETE SCAN — paths may be missing."}</strong></p>
    ${result.incompleteReason ? `<p class="warning">${text(result.incompleteReason)}</p>` : ""}
    <p>Only the selected input's observed routes toward the lead are included. Every observed flow that can continue toward the lead is listed.
    Hop numbers show minimum distance from this input; branches and cycles are not proof of a single chronological path or common ownership.
    Arrows indicate actual sender → recipient. Dates are UTC and amounts are exact.
    Histories are limited to 25,000 transactions per wallet.</p>
    ${directedTrailDetails(connection, "Selected input")}
    </body></html>`;
}

export function printClusterSelectedTrail(result: ClusterFinderResult, inputAddress: string): ClusterDownload {
  return createClusterDownload(
    new Blob([buildClusterSelectedTrailReport(result, inputAddress)], { type: "text/html;charset=utf-8" }),
    `cluster-finder-selected-trail-${new Date().toISOString().replace(/[:.]/g, "-")}.html`,
  );
}

export function clusterGraphHandleSides(source: { x: number; y: number }, target: { x: number; y: number }) {
  if (source.x === target.x) {
    return target.y >= source.y
      ? { sourcePosition: Position.Bottom, targetPosition: Position.Top }
      : { sourcePosition: Position.Top, targetPosition: Position.Bottom };
  }
  return target.x > source.x
    ? { sourcePosition: Position.Right, targetPosition: Position.Left }
    : { sourcePosition: Position.Left, targetPosition: Position.Right };
}

export function buildClusterGraphSvg(
  nodes: Node[],
  wallets: ClusterNode[],
  flows: ClusterFlow[],
  selectedPath: string[],
  view?: { x: number; y: number; zoom: number; width: number; height: number; focusAddresses?: string[] },
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
    const { sourcePosition, targetPosition } = clusterGraphHandleSides(source.position, target.position);
    const port = (node: Node, side: Position) => ({
      x: node.position.x + (side === Position.Right ? (node.width ?? 202) : side === Position.Left ? 0 : (node.width ?? 202) / 2),
      y: node.position.y + (side === Position.Bottom ? (node.height ?? 100) : side === Position.Top ? 0 : (node.height ?? 100) / 2),
    });
    const start = port(source, sourcePosition);
    const end = port(target, targetPosition);
    const [path, x, y] = getSmoothStepPath({
      sourceX: start.x, sourceY: start.y,
      targetX: end.x, targetY: end.y,
      sourcePosition, targetPosition,
    });
    const selected = selectedPath.includes(flow.from) && selectedPath.includes(flow.to);
    return `<path d="${escapeMarkup(path)}" fill="none" stroke="${selected ? "#e4b568" : "#8493a3"}" stroke-width="${selected ? 2 : 1.35}" marker-end="url(#arrow)"/>
      <text x="${x}" y="${y - 6}" text-anchor="middle" fill="#dce8ef" font-size="10" stroke="#0b1118" stroke-width="3" paint-order="stroke">${flow.transactions.length} TX</text>`;
  }).join("");
  const boxes = wallets.map((wallet, index) => {
    const node = byId.get(wallet.address);
    if (!node) return "";
    const color = wallet.role === "primary" ? "#f0b85b" : wallet.role === "input" ? "#71c4bd" : "#91a8c5";
    const background = wallet.role === "primary" ? "#29251e" : wallet.role === "input" ? "#182b2c" : "#1b2532";
    const short = wallet.address.length > 24 ? `${wallet.address.slice(0, 10)}…${wallet.address.slice(-8)}` : wallet.address;
    const title = view?.focusAddresses?.includes(wallet.address) ? `FOCUS · ${wallet.label ?? "WALLET"}` : wallet.label ?? (wallet.role === "primary" ? "LEAD WALLET" : wallet.role === "input" ? "INPUT WALLET" : "PRIVATE WALLET");
    return `<g transform="translate(${node.position.x},${node.position.y})">
      <title>${escapeMarkup(wallet.address)}</title>
      <rect width="${node.width ?? 202}" height="${node.height ?? 100}" rx="3" fill="${background}" stroke="${color}" stroke-opacity="${selectedPath.includes(wallet.address) ? 1 : 0.45}" stroke-width="${selectedPath.includes(wallet.address) ? 2 : 1}"/>
      <clipPath id="node-label-${index}"><rect x="12" y="0" width="${(node.width ?? 202) - 24}" height="${node.height ?? 100}"/></clipPath>
      <g clip-path="url(#node-label-${index})">
      <text x="13" y="25" fill="${color}" font-size="9" font-weight="700" letter-spacing="1.2">${escapeMarkup(view ? title.toUpperCase() : `${index + 1}. ${wallet.role.toUpperCase()} WALLET`)}</text>
      <text x="13" y="48" fill="#d8e1ec" font-size="10">${escapeMarkup(short)}</text>
      <text x="13" y="70" fill="${view ? "#697b8f" : color}" font-size="${view ? 8 : 9}">${escapeMarkup(view ? `${wallet.role.toUpperCase()} NODE` : wallet.label ?? "")}</text>
      </g></g>`;
  }).join("");
  const key = wallets.map((wallet, index) => `<text x="${minX + 15}" y="${maxY + 40 + index * 24}" fill="#d8e1ec" font-size="11">${index + 1}. ${escapeMarkup(wallet.address)}${wallet.label ? ` — ${escapeMarkup(wallet.label)}` : ""}</text>`).join("");
  const bounds = view ? { x: -view.x / view.zoom, y: -view.y / view.zoom, width: view.width / view.zoom, height: view.height / view.zoom } : { x: minX, y: minY, width, height };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${view?.width ?? width}" height="${view?.height ?? height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" font-family="monospace">
    <title>Cluster Finder — Observed private-wallet flows</title>
    <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#0b1118"/>
    ${view ? `<defs><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="0.5" fill="#334151"/></pattern></defs><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="url(#grid)"/>` : ""}
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#dce8ef"/></marker></defs>
    ${view ? "" : `<text x="${minX + 15}" y="${minY + 25}" fill="#dce8ef" font-size="14">Cluster Finder · Observed private-wallet flows · Sender → recipient</text>`}
    ${paths}${boxes}${view ? "" : key}</svg>`;
}

export function downloadClusterGraph(svg: string): ClusterDownload {
  return createClusterDownload(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    `cluster-finder-graph-${new Date().toISOString().replace(/[:.]/g, "-")}.svg`,
  );
}
