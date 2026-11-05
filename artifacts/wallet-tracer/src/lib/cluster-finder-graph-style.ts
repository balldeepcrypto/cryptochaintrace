import type { ClusterFlow, ClusterNode } from "./cluster-finder-engine";

export const MAIN_PATH_COLOR = "#ef4444";
export const GRAPH_LEGEND = [
  { key: "victim", label: "Victim / lead", color: "#4ade80", background: "#142b20" },
  { key: "private", label: "Private wallet", color: "#a3a3a3", background: "#23262b" },
  { key: "possibleExchange", label: "Possible exchange", color: "#facc15", background: "#302b16" },
  { key: "confirmedExchange", label: "Confirmed exchange", color: "#f87171", background: "#321c21" },
  { key: "organization", label: "Known org", color: "#60a5fa", background: "#182a42" },
] as const;

/** Display metadata only: never promotes an inferred catalog label to confirmed.
 * Exchange nodes remain absent when excluded by the scanner. */
export function clusterNodeAppearance(node: ClusterNode & {
  walletType?: string; labelConfidence?: "Confirmed" | "Inferred";
}) {
  if (node.role === "primary") return GRAPH_LEGEND[0];
  const exchange = node.walletType === "exchange" ||
    /\b(exchange|kucoin|coinbase|kraken|binance|gate(?:\.io)?|uphold|robinhood|bitstamp|bittrex|bitfinex|okx|bybit|crypto\.com)\b/i.test(node.label ?? "");
  if (exchange) return node.labelConfidence === "Confirmed" ? GRAPH_LEGEND[3] : GRAPH_LEGEND[2];
  return node.label ? GRAPH_LEGEND[4] : GRAPH_LEGEND[1];
}

/** A representative directed route toward the lead, not an ownership claim.
 * Explicitly selected routes win, then focus inputs, other inputs, and proxies.
 * Reverse BFS never invents reverse transfers or follows a cycle indefinitely. */
export function mainObservedGraphPath(nodes: ClusterNode[], flows: ClusterFlow[], selected: string[] = [], focus: string[] = []): string[] {
  const lead = nodes.find((node) => node.role === "primary")?.address;
  if (!lead) return [];
  const pairs = new Set(flows.map((flow) => JSON.stringify([flow.from, flow.to])));
  if (selected.length > 1 && selected.at(-1) === lead &&
      selected.slice(1).every((address, index) => pairs.has(JSON.stringify([selected[index], address])))) return [...selected];
  const incoming = new Map<string, Set<string>>();
  for (const flow of flows) {
    if (!incoming.has(flow.to)) incoming.set(flow.to, new Set());
    incoming.get(flow.to)!.add(flow.from);
  }
  const distances = new Map([[lead, 0]]);
  const next = new Map<string, string>();
  const queue = [lead];
  for (let i = 0; i < queue.length; i++) {
    for (const from of [...(incoming.get(queue[i]) ?? [])].sort()) {
      if (distances.has(from)) continue;
      distances.set(from, distances.get(queue[i])! + 1);
      next.set(from, queue[i]);
      queue.push(from);
    }
  }
  const candidates = nodes.filter((node) => node.address !== lead && next.has(node.address));
  const priority = (node: ClusterNode) => focus.includes(node.address) ? 0 : node.role === "input" ? 1 : 2;
  candidates.sort((a, b) => priority(a) - priority(b) ||
    distances.get(b.address)! - distances.get(a.address)! || a.address.localeCompare(b.address));
  if (!candidates.length) return [];
  const path = [candidates[0].address];
  while (next.has(path[path.length - 1])) path.push(next.get(path[path.length - 1])!);
  return path;
}

export function mainPathFlowIds(flows: ClusterFlow[], path: string[]): Set<string> {
  const pairs = new Set(path.slice(1).map((address, index) => JSON.stringify([path[index], address])));
  return new Set(flows.filter((flow) => pairs.has(JSON.stringify([flow.from, flow.to]))).map((flow) => flow.id));
}

// Exact decimal sums for display, kept separate from scan/report calculations.
function scaled(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) return null;
  const exponent = Number(match[3] ?? 0), fraction = match[2] ?? "";
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) return null;
  const shift = 36 - fraction.length + exponent;
  const digits = BigInt(match[1] + fraction);
  if (shift >= 0) return digits * 10n ** BigInt(shift);
  const divisor = 10n ** BigInt(-shift);
  return digits % divisor === 0n ? digits / divisor : null;
}
function decimal(value: bigint): string {
  const scale = 10n ** 36n;
  const fraction = (value % scale).toString().padStart(36, "0").replace(/0+$/, "");
  return `${value / scale}${fraction ? `.${fraction}` : ""}`;
}

export function clusterFlowCaption(flow: ClusterFlow): { amount: string; dates: string; lines: [string, string] } {
  const totals = new Map<string, bigint>();
  const unavailable = new Set<string>();
  let min = Infinity, max = -Infinity, unknownDates = false;
  for (const tx of flow.transactions) {
    const symbol = tx.tokenSymbol || "asset unspecified";
    const value = scaled(tx.value);
    if (value === null) unavailable.add(symbol);
    else totals.set(symbol, (totals.get(symbol) ?? 0n) + value);
    const time = Date.parse(tx.timestamp);
    if (!Number.isFinite(time)) unknownDates = true;
    else { min = Math.min(min, time); max = Math.max(max, time); }
  }
  const symbols = [...new Set([...totals.keys(), ...unavailable])].sort();
  const amount = symbols.map((symbol) => unavailable.has(symbol) ? `${symbol}: amount unavailable` : `${decimal(totals.get(symbol)!)} ${symbol}`).join(" + ") || "Amount unavailable";
  const first = Number.isFinite(min) ? new Date(min).toISOString().slice(0, 10) : null;
  const last = Number.isFinite(max) ? new Date(max).toISOString().slice(0, 10) : null;
  const dates = first ? `${first}${first !== last ? ` → ${last}` : ""} UTC${unknownDates ? " · some dates unavailable" : ""}` : "Date unavailable";
  const count = flow.transactions.length;
  return { amount, dates, lines: [`${count} ${count === 1 ? "TX" : "TXS"} · ${amount}`, dates] };
}
