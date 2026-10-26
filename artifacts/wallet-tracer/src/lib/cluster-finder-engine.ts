import { findClusterFocusPaths, type ClusterFocusConnection } from "./cluster-finder-focus";
import {
  getWalletTransactions,
  type Transaction,
} from "@workspace/api-client-react";
import { clusterRequest } from "./cluster-finder-requests";

// Cluster Finder deployment refresh.
export const CLUSTER_CHAIN_OPTIONS = [
  { value: "ethereum", label: "Ethereum" },
  { value: "bitcoin", label: "Bitcoin" },
  { value: "polygon", label: "Polygon" },
  { value: "bsc", label: "BNB Smart Chain" },
  { value: "xrp", label: "XRP Ledger" },
  { value: "xlm", label: "Stellar" },
  { value: "hbar", label: "Hedera" },
  { value: "xdc", label: "XDC" },
  { value: "dag", label: "Constellation DAG" },
] as const;

export type ClusterChain = (typeof CLUSTER_CHAIN_OPTIONS)[number]["value"];
export type ClusterTransaction = Pick<
  Transaction,
  "hash" | "from" | "to" | "value" | "valueUsd" | "timestamp" | "tokenSymbol" | "status"
>;

export interface ClusterNode {
  address: string;
  label: string | null;
  role: "primary" | "input" | "proxy";
}

export interface ClusterFlow {
  id: string;
  from: string;
  to: string;
  discoveryHop?: number;
  transactions: ClusterTransaction[];
}

export interface ClusterConnection {
  inputAddress: string;
  nodes: string[];
  flows: ClusterConnectionFlow[];
}

export interface ClusterConnectionFlow extends ClusterFlow {
  hop: number;
}

export interface ClusterUsExchangeTransaction {
  walletAddress: string;
  exchangeAddress: string;
  exchangeName: string;
  direction: "IN" | "OUT";
  transaction: ClusterTransaction;
}

export interface ClusterProgress {
  phase: "scanning" | "building";
  requestStatus?: string;
  activeAddress: string | null;
  scannedWallets: number;
  transactionCount: number;
  queuedWallets: number;
  connectedInputs: number;
  totalInputs: number;
  discoveredWallets: number;
  activeWallets: number;
  currentHop: number;
  pagesFetched: number;
}

export interface ClusterFinderResult {
  chain: ClusterChain;
  maxHops?: ClusterHopDepth;
  focusAddresses?: string[];
  focusConnections?: ClusterFocusConnection[];
  primaryAddress: string;
  inputAddresses: string[];
  nodes: ClusterNode[];
  flows: ClusterFlow[];
  connections: ClusterConnection[];
  usExchangeTransactions: ClusterUsExchangeTransaction[];
  disconnectedAddresses: string[];
  excludedAddresses: string[];
  truncatedAddresses: string[];
  fetchErrors: Array<{ address: string; message: string }>;
  scannedWallets: number;
  scannedTransactions: number;
  complete: boolean;
  incompleteReason?: string;
}

export interface ClusterFinderOptions {
  addresses: string[];
  primaryAddress: string;
  chain: ClusterChain;
  maxHops?: ClusterHopDepth;
  focusAddresses?: string[];
  signal: AbortSignal;
  onProgress?: (progress: ClusterProgress) => void;
  onSnapshot?: (result: ClusterFinderResult) => void;
  getKnownInfo: (address: string, chain: string) => { label: string; type: string } | null;
  normalizeAddress: (address: string, chain: string) => string;
}

export const MAX_CLUSTER_HISTORY_PER_WALLET = 25_000;
export const MAX_CLUSTER_HOPS = 6;
export const DEFAULT_CLUSTER_HOPS = 4;
export type ClusterHopDepth = 3 | 4 | 6;

const INFRASTRUCTURE_TYPES = new Set(["exchange", "bridge", "genesis"]);
const PRIVATE_ENTITY_LABEL = /\btreasury\b|\bteam\s+(?:foundation|fdn)\b|\bstardust\s+collective\b/i;
// Match the existing wallet-detail report's US_REGULATED classification.
// Keep this Cluster Finder-only; other reports and shared labels are unchanged.
const US_EXCHANGE_NAMES = new Map([
  "Coinbase", "Kraken", "Gemini", "Bitstamp", "Uphold",
  "Robinhood", "Binance.US", "Bittrex", "eToro",
].map((name) => [name.toLowerCase(), name]));
const PAGE_SIZE: Record<ClusterChain, number> = {
  bitcoin: 25,
  dag: 250,
  xrp: 500,
  ethereum: 500,
  polygon: 500,
  bsc: 500,
  xlm: 500,
  hbar: 500,
  xdc: 500,
};

function abortError(): Error {
  return new DOMException("Cluster scan cancelled", "AbortError");
}

function transactionKey(tx: ClusterTransaction, fromKey: string, toKey: string): string {
  return [
    tx.hash,
    fromKey,
    toKey,
    tx.tokenSymbol ?? "",
    tx.value,
    tx.timestamp,
  ].join("|");
}

function buildConnectionFlows(
  inputKey: string,
  primaryKey: string,
  flowsByFrom: Map<string, ClusterFlow[]>,
  canReachPrimary: Set<string>,
): { nodes: string[]; flows: ClusterConnectionFlow[] } | null {
  const queue = [inputKey];
  const distance = new Map([[inputKey, 0]]);
  const connectionFlows: ClusterConnectionFlow[] = [];

  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    if (current === primaryKey) continue;
    for (const flow of flowsByFrom.get(current) ?? []) {
      if (!canReachPrimary.has(flow.to)) continue;
      connectionFlows.push({ ...flow, hop: (distance.get(current) ?? 0) + 1 });
      if (distance.has(flow.to)) continue;
      distance.set(flow.to, (distance.get(current) ?? 0) + 1);
      queue.push(flow.to);
    }
  }

  if (!distance.has(primaryKey)) return null;
  return {
    nodes: [...distance.keys()],
    flows: connectionFlows.sort((a, b) => a.hop - b.hop || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
  };
}

/**
 * Breadth-first expansion in both transfer directions from every starting
 * wallet. Starting wallets are depth zero; wallets through the selected depth are
 * scanned once. Histories retain the existing 25,000 transaction cap.
 */
export async function runClusterFinder(
  options: ClusterFinderOptions,
): Promise<ClusterFinderResult> {
  const {
    addresses,
    primaryAddress,
    chain,
    signal,
    onProgress,
    onSnapshot,
    getKnownInfo,
    normalizeAddress,
  } = options;
  const maxHops = options.maxHops ?? DEFAULT_CLUSTER_HOPS;
  if (![3, 4, 6].includes(maxHops)) throw new Error("Choose a maximum hop depth of 3, 4, or 6.");
  const evmChains = new Set(["ethereum", "polygon", "bsc"]);

  const canonicalize = (address: string): string => {
    const normalized = normalizeAddress(address.trim(), chain).trim();
    return evmChains.has(chain) ? normalized.toLowerCase() : normalized;
  };
  const knownInfo = (address: string) => getKnownInfo(address, chain);
  const isPrivate = (address: string) => {
    if (chain === "dag" && canonicalize(address) === "DAG4nBMH7KwFAnpfB6VaFRaKEwACNSidzeMuPtgV") return false;
    const info = knownInfo(address);
    if (!info) return true;
    const type = info.type.toLowerCase();
    // Exchange/bridge/genesis classifications take precedence over any label.
    if (INFRASTRUCTURE_TYPES.has(type)) return false;
    // Only the named entity labels are allowed; every other known label is
    // excluded, regardless of type. Legacy Foundation/Fdn labels still match.
    return PRIVATE_ENTITY_LABEL.test(info.label);
  };

  const primaryKey = canonicalize(primaryAddress);
  const addressByKey = new Map<string, string>();
  const rememberAddress = (address: string): string => {
    const key = canonicalize(address);
    if (key && !addressByKey.has(key)) addressByKey.set(key, normalizeAddress(address.trim(), chain));
    return key;
  };

  const requestedFocusKeys = [...new Set((options.focusAddresses ?? []).map(rememberAddress).filter((key) => key && key !== primaryKey))];
  const requestedKeys = [...new Set([...addresses, primaryAddress, ...requestedFocusKeys].map(rememberAddress).filter(Boolean))];
  if (!primaryKey) {
    throw new Error("Enter a primary wallet.");
  }
  if (!isPrivate(addressByKey.get(primaryKey) ?? primaryAddress)) {
    const label = knownInfo(addressByKey.get(primaryKey) ?? primaryAddress)?.label ?? "known infrastructure wallet";
    throw new Error(`The primary wallet is labeled ${label} and is excluded from private-wallet paths.`);
  }

  const excludedAddresses = requestedKeys
    .filter((key) => !isPrivate(addressByKey.get(key) ?? key))
    .map((key) => addressByKey.get(key) ?? key);
  const inputKeys = requestedKeys.filter(
    (key) => key !== primaryKey && isPrivate(addressByKey.get(key) ?? key),
  );
  const inputKeySet = new Set(inputKeys);
  const inputAddresses = inputKeys.map((key) => addressByKey.get(key) ?? key);
  const focusKeys = requestedFocusKeys.filter((key) => inputKeySet.has(key));

  const flowBuckets = new Map<string, {
    fromKey: string;
    toKey: string;
    transactions: Map<string, ClusterTransaction>;
  }>();
  const queue = [...new Set([primaryKey, ...focusKeys, ...inputKeys])];
  const enqueued = new Set(queue);
  const depthByKey = new Map(queue.map((key) => [key, 0]));
  let queueIndex = 0;
  let scannedWallets = 0;
  let scannedTransactions = 0;
  let connectedInputs = 0;
  let pagesFetched = 0;
  let currentHop = 0;
  let lastSnapshotAt = 0;
  const activeKeys = new Set<string>();
  const truncatedKeys = new Set<string>();
  const fetchErrors: Array<{ address: string; message: string }> = [];
  const usExchangeTransactions = new Map<string, ClusterUsExchangeTransaction>();

  const reportProgress = (phase: ClusterProgress["phase"], activeAddress: string | null, requestStatus?: string) => {
    onProgress?.({
      phase,
      requestStatus,
      activeAddress,
      scannedWallets,
      transactionCount: scannedTransactions,
      queuedWallets: Math.max(0, queue.length - queueIndex),
      connectedInputs,
      totalInputs: inputKeys.length,
      discoveredWallets: queue.length,
      activeWallets: activeKeys.size,
      currentHop,
      pagesFetched,
    });
  };

  const scanHistory = async (address: string): Promise<Transaction[]> => {
    let fetchedCount = 0;
    let page = 1;
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    let hasMore = true;

    while (hasMore && fetchedCount < MAX_CLUSTER_HISTORY_PER_WALLET) {
      if (signal.aborted) throw abortError();
      const limit = Math.min(
        PAGE_SIZE[chain],
        MAX_CLUSTER_HISTORY_PER_WALLET - fetchedCount,
      );
      let response;
      try {
        response = await clusterRequest(
          (requestSignal) => getWalletTransactions(address, { chain, page, limit, cursor }, { signal: requestSignal }),
          signal,
          (message) => reportProgress("scanning", address, message),
        );
      } catch (error) {
        if (signal.aborted) return [];
        fetchErrors.push({
          address,
          message: `${error instanceof Error ? error.message : String(error)} (${fetchedCount.toLocaleString()} fetched transactions retained; history incomplete.)`,
        });
        publishSnapshot(true);
        return [];
      }
      reportProgress("scanning", address);
      const pageTransactions = response.transactions.slice(0, limit);
      fetchedCount += pageTransactions.length;
      scannedTransactions += pageTransactions.length;
      pagesFetched += 1;
      // Incorporate every page immediately, before waiting for the next one.
      processHistory(canonicalize(address), pageTransactions);
      publishSnapshot(pagesFetched === 1);
      hasMore = response.hasMore;

      if (!hasMore) break;
      if (!response.nextCursor) {
        fetchErrors.push({ address, message: `The transaction service reported another page without a cursor. ${fetchedCount} fetched transactions retained; history incomplete.` });
        break;
      }
      if (seenCursors.has(response.nextCursor)) {
        fetchErrors.push({ address, message: `The transaction service repeated a pagination cursor. ${fetchedCount} fetched transactions retained; history incomplete.` });
        break;
      }
      seenCursors.add(response.nextCursor);
      cursor = response.nextCursor;
      page += 1;
      reportProgress("scanning", address);
    }

    if (hasMore && fetchedCount >= MAX_CLUSTER_HISTORY_PER_WALLET) {
      truncatedKeys.add(canonicalize(address));
    }
    return [];
  };

  const processHistory = (currentKey: string, history: Transaction[]) => {
      const currentAddress = addressByKey.get(currentKey) ?? currentKey;
      for (const tx of history) {
        if (tx.status !== "success" || !tx.from || !tx.to || tx.from === tx.to) continue;
        const fromKey = rememberAddress(tx.from);
        const toKey = rememberAddress(tx.to);
        if (!fromKey || !toKey || fromKey === toKey) continue;
        // Ignore unrelated entries in a provider's wallet-history response.
        if (fromKey !== currentKey && toKey !== currentKey) continue;

        const compactTx: ClusterTransaction = {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value,
          valueUsd: tx.valueUsd,
          timestamp: tx.timestamp,
          tokenSymbol: tx.tokenSymbol,
          status: tx.status,
        };
        // Record exchange touches from this eligible wallet's already-fetched
        // history only. Exchanges never become traversal nodes or graph edges.
        const direction = fromKey === currentKey ? "OUT" : toKey === currentKey ? "IN" : null;
        if (direction) {
          const exchangeAddress = direction === "OUT" ? tx.to : tx.from;
          const exchange = knownInfo(exchangeAddress);
          const exchangeName = exchange?.type.toLowerCase() === "exchange"
            ? US_EXCHANGE_NAMES.get(exchange.label.trim().split(/\s+/)[0].toLowerCase())
            : undefined;
          if (exchangeName) {
            const key = `${currentKey}|${direction}|${transactionKey(compactTx, fromKey, toKey)}`;
            usExchangeTransactions.set(key, {
              walletAddress: currentAddress,
              exchangeAddress: addressByKey.get(direction === "OUT" ? toKey : fromKey) ?? exchangeAddress,
              exchangeName,
              direction,
              transaction: compactTx,
            });
          }
        }
        if (!isPrivate(tx.from) || !isPrivate(tx.to)) continue;

        const neighborKey = fromKey === currentKey ? toKey : fromKey;
        const depth = depthByKey.get(currentKey)!;
        if (!enqueued.has(neighborKey) && depth < maxHops) {
          enqueued.add(neighborKey);
          depthByKey.set(neighborKey, depth + 1);
          queue.push(neighborKey);
        }
        const bucketKey = `${fromKey}\u0000${toKey}`;
        let bucket = flowBuckets.get(bucketKey);
        if (!bucket) {
          bucket = { fromKey, toKey, transactions: new Map() };
          flowBuckets.set(bucketKey, bucket);
        }
        bucket.transactions.set(transactionKey(compactTx, fromKey, toKey), compactTx);
      }
  };
  const worker = async (levelEnd: number) => {
    while (queueIndex < levelEnd && !signal.aborted) {
      const currentKey = queue[queueIndex++];
      const currentAddress = addressByKey.get(currentKey) ?? currentKey;
      activeKeys.add(currentKey);
      reportProgress("scanning", currentAddress);
      try {
        await scanHistory(currentAddress);
        if (!signal.aborted) scannedWallets += 1;
      } catch (error) {
        if (!signal.aborted) {
          fetchErrors.push({ address: currentAddress, message: error instanceof Error ? error.message : String(error) });
          scannedWallets += 1;
        }
      } finally {
        activeKeys.delete(currentKey);
        publishSnapshot();
        reportProgress("scanning", null);
      }
    }
  };

  function buildResult(finished: boolean, incompleteReason?: string): ClusterFinderResult {
  const flowList: ClusterFlow[] = [...flowBuckets.values()]
    // A boundary history may expose a neighbor beyond the selected depth.
    // Retain a flow only if both ends were discovered inside the scan boundary.
    .filter((bucket) => depthByKey.has(bucket.fromKey) && depthByKey.has(bucket.toKey))
    .sort((a, b) => a.fromKey.localeCompare(b.fromKey) || a.toKey.localeCompare(b.toKey))
    .map((bucket, index) => ({
    id: `flow-${index + 1}`,
    from: bucket.fromKey,
    to: bucket.toKey,
    discoveryHop: Math.max(1, depthByKey.get(bucket.fromKey)!, depthByKey.get(bucket.toKey)!),
    transactions: [...bucket.transactions.values()].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
    ),
    }));
  const flowsByTo = new Map<string, ClusterFlow[]>();
  for (const flow of flowList) {
    const incoming = flowsByTo.get(flow.to) ?? [];
    incoming.push(flow);
    flowsByTo.set(flow.to, incoming);
  }

  const canReachPrimary = new Set<string>([primaryKey]);
  const reverseQueue = [primaryKey];
  for (let i = 0; i < reverseQueue.length; i += 1) {
    for (const flow of flowsByTo.get(reverseQueue[i]) ?? []) {
      if (canReachPrimary.has(flow.from)) continue;
      canReachPrimary.add(flow.from);
      reverseQueue.push(flow.from);
    }
  }

  // The graph/report retain the entire observed IN/OUT trail, not just
  // input-to-lead directed paths. The connection index remains supplementary.
  const relevantFlows = flowList;
  const relevantFlowsByFrom = new Map<string, ClusterFlow[]>();
  for (const flow of relevantFlows) {
    const outgoing = relevantFlowsByFrom.get(flow.from) ?? [];
    outgoing.push(flow);
    relevantFlowsByFrom.set(flow.from, outgoing);
  }

  const connections: ClusterConnection[] = [];
  for (const inputKey of inputKeys) {
    const path = buildConnectionFlows(
      inputKey,
      primaryKey,
      relevantFlowsByFrom,
      canReachPrimary,
    );
    if (!path) continue;
    connections.push({
      inputAddress: addressByKey.get(inputKey) ?? inputKey,
      nodes: path.nodes.map((key) => addressByKey.get(key) ?? key),
      flows: path.flows.map((flow) => ({
        ...flow,
        from: addressByKey.get(flow.from) ?? flow.from,
        to: addressByKey.get(flow.to) ?? flow.to,
      })),
    });
  }
  connectedInputs = connections.length;

  const nodeKeys = new Set<string>(depthByKey.keys());
  for (const flow of relevantFlows) {
    nodeKeys.add(flow.from);
    nodeKeys.add(flow.to);
  }
  const nodes: ClusterNode[] = [...nodeKeys].map((key) => {
    const address = addressByKey.get(key) ?? key;
    return {
      address,
      label: knownInfo(address)?.label ?? null,
      role: key === primaryKey ? "primary" : inputKeySet.has(key) ? "input" : "proxy",
    };
  });
  const truncatedAddresses = [...truncatedKeys].map((key) => addressByKey.get(key) ?? key);
  const disconnectedAddresses = inputKeys
    .filter((key) => !connections.some((connection) => canonicalize(connection.inputAddress) === key))
    .map((key) => addressByKey.get(key) ?? key);

  return {
    chain,
    maxHops,
    focusAddresses: requestedFocusKeys.map((key) => addressByKey.get(key) ?? key),
    focusConnections: findClusterFocusPaths(primaryKey, focusKeys, relevantFlows, maxHops).map((connection) => ({
      ...connection,
      focusAddress: addressByKey.get(connection.focusAddress) ?? connection.focusAddress,
      nodes: connection.nodes.map((key) => addressByKey.get(key) ?? key),
      flows: connection.flows.map((flow) => ({
        ...flow, from: addressByKey.get(flow.from) ?? flow.from, to: addressByKey.get(flow.to) ?? flow.to,
      })),
    })),
    primaryAddress: addressByKey.get(primaryKey) ?? primaryAddress,
    inputAddresses,
    nodes,
    flows: relevantFlows.map((flow) => ({
      ...flow,
      from: addressByKey.get(flow.from) ?? flow.from,
      to: addressByKey.get(flow.to) ?? flow.to,
    })),
    connections,
    usExchangeTransactions: [...usExchangeTransactions.values()].sort(
      (a, b) => Date.parse(a.transaction.timestamp) - Date.parse(b.transaction.timestamp)
        || a.walletAddress.localeCompare(b.walletAddress)
        || a.transaction.hash.localeCompare(b.transaction.hash),
    ),
    disconnectedAddresses,
    excludedAddresses,
    truncatedAddresses,
    fetchErrors: [...fetchErrors],
    scannedWallets,
    scannedTransactions,
    complete: finished && fetchErrors.length === 0 && truncatedAddresses.length === 0,
    incompleteReason,
  };
  }

  function publishSnapshot(force = false) {
    if (!onSnapshot || (!force && Date.now() - lastSnapshotAt < 5_000)) return;
    lastSnapshotAt = Date.now();
    onSnapshot(buildResult(false, "Scan in progress. Results reflect fetched pages only; queued and active histories may be incomplete."));
  }

  publishSnapshot(true);
  // Keep layer barriers: streaming pages must not start a deeper layer early.
  while (queueIndex < queue.length && !signal.aborted) {
    currentHop = depthByKey.get(queue[queueIndex]) ?? 0;
    const levelEnd = queue.length;
    await Promise.all(Array.from({ length: 3 }, () => worker(levelEnd)));
  }
  reportProgress("building", null);
  const result = buildResult(!signal.aborted, signal.aborted
    ? "Scan stopped before all discovered wallets were scanned. Fetched transactions are retained."
    : undefined);
  onSnapshot?.(result);
  return result;
}
