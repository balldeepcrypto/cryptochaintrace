import { findClusterFocusPaths, type ClusterFocusConnection } from "./cluster-finder-focus";
import {
  getWalletTransactions,
  type Transaction,
} from "@workspace/api-client-react";
import { clusterRequest } from "./cluster-finder-requests";
import { createClusterHistoryCache } from "./cluster-finder-history-cache";

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
  resumeFrom?: ClusterScanCheckpoint;
  onCheckpoint?: (checkpoint: ClusterScanCheckpoint) => void | Promise<void>;
  getKnownInfo: (address: string, chain: string) => { label: string; type: string } | null;
  normalizeAddress: (address: string, chain: string) => string;
}

interface ClusterWalletHistory {
  key: string;
  transactions: Transaction[];
  page: number;
  cursor?: string;
  seenCursors: string[];
  hasMore: boolean;
  finished: boolean;
  attempted: boolean;
  truncated: boolean;
  error?: string;
}

/** Serializable traversal state; partial results alone cannot resume a scan. */
export interface ClusterScanCheckpoint {
  version: 1;
  chain: ClusterChain;
  maxHops: ClusterHopDepth;
  primaryKey: string;
  inputKeys: string[];
  focusKeys: string[];
  addresses: Array<[string, string]>;
  queue: string[];
  depths: Array<[string, number]>;
  histories: ClusterWalletHistory[];
  pagesFetched: number;
  scannedTransactions: number;
}

export function canResumeClusterScan(checkpoint?: ClusterScanCheckpoint): boolean {
  if (!checkpoint) return false;
  const finished = new Set(checkpoint.histories.filter((history) => history.finished).map((history) => history.key));
  return checkpoint.queue.some((key) => !finished.has(key));
}

export const MAX_CLUSTER_HISTORY_PER_WALLET = 10_000;
// Accept previously saved observations without discarding them on Resume.
// This is a checkpoint validation ceiling, never a history-fetching limit.
const LEGACY_CLUSTER_CHECKPOINT_HISTORY_LIMIT = 25_000;
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
 * scanned once. Cluster Finder histories fetch at most 10,000 transactions.
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
  const histories = new Map<string, ClusterWalletHistory>();
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

  const saved = options.resumeFrom;
  if (saved) {
    // Never apply a checkpoint to different inputs, focus wallets or limits.
    if (saved.version !== 1 || saved.chain !== chain || saved.maxHops !== maxHops
      || saved.primaryKey !== primaryKey
      || JSON.stringify(saved.inputKeys) !== JSON.stringify(inputKeys)
      || JSON.stringify(saved.focusKeys) !== JSON.stringify(focusKeys)
      || !Array.isArray(saved.queue) || !Array.isArray(saved.depths)
      || !Array.isArray(saved.histories) || !Array.isArray(saved.addresses)) {
      throw new Error("This checkpoint does not match the scan settings. Restore its original settings to resume.");
    }
    const savedDepths = new Map(saved.depths);
    if (new Set(saved.queue).size !== saved.queue.length || !saved.queue.includes(primaryKey)
      || saved.queue.some((key, index) => {
        const depth = savedDepths.get(key);
        return !Number.isInteger(depth) || depth! < 0 || depth! > maxHops
          || (index > 0 && depth! < savedDepths.get(saved.queue[index - 1])!);
      })
      || saved.histories.some((history) => !savedDepths.has(history.key)
        || !Array.isArray(history.transactions) || history.transactions.length > LEGACY_CLUSTER_CHECKPOINT_HISTORY_LIMIT
        || !Array.isArray(history.seenCursors) || !Number.isInteger(history.page) || history.page < 1)
      || !Number.isInteger(saved.pagesFetched) || saved.pagesFetched < 0
      || !Number.isInteger(saved.scannedTransactions) || saved.scannedTransactions < 0) {
      throw new Error("Saved scan traversal state is invalid. Existing partial results have not been changed.");
    }
    for (const [key, address] of saved.addresses) addressByKey.set(key, address);
    queue.splice(0, queue.length, ...saved.queue);
    enqueued.clear();
    depthByKey.clear();
    for (const key of queue) { enqueued.add(key); depthByKey.set(key, savedDepths.get(key)!); }
    for (const history of saved.histories) {
      const restored = { ...history, transactions: history.transactions.slice(), seenCursors: history.seenCursors.slice() };
      // Older runs may already have fetched more than the new cap. Preserve
      // those observations, but never fetch another page for that wallet.
      if (restored.transactions.length >= MAX_CLUSTER_HISTORY_PER_WALLET) {
        restored.finished = true;
        if (restored.hasMore) {
          restored.truncated = true;
          restored.error = undefined;
        }
      }
      histories.set(restored.key, restored);
      if (restored.attempted) scannedWallets += 1;
      if (restored.truncated) truncatedKeys.add(restored.key);
      if (restored.finished && restored.error) {
        fetchErrors.push({ address: addressByKey.get(restored.key) ?? restored.key, message: restored.error });
      }
    }
    pagesFetched = saved.pagesFetched;
    scannedTransactions = saved.scannedTransactions;
  }

  const publishCheckpoint = async () => {
    if (!options.onCheckpoint) return;
    await options.onCheckpoint({
      version: 1, chain, maxHops, primaryKey, inputKeys: inputKeys.slice(), focusKeys: focusKeys.slice(),
      addresses: [...addressByKey], queue: queue.slice(), depths: [...depthByKey],
      histories: [...histories.values()].map((history) => ({
        ...history, transactions: history.transactions.slice(), seenCursors: history.seenCursors.slice(),
      })),
      pagesFetched, scannedTransactions,
    });
  };

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
    const key = canonicalize(address);
    let state = histories.get(key);
    if (!state) {
      state = { key, transactions: [], page: 1, seenCursors: [], hasMore: true, finished: false, attempted: false, truncated: false };
      histories.set(key, state);
    }
    const history = state.transactions;
    if (state.finished) return history;
    let fetchedCount = history.length;
    let { page, cursor, hasMore } = state;
    const seenCursors = new Set(state.seenCursors);
    state.error = undefined;

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
        if (signal.aborted) return history;
        state.error = `${error instanceof Error ? error.message : String(error)} (${fetchedCount.toLocaleString()} fetched transactions retained; history incomplete.)`;
        fetchErrors.push({ address, message: state.error });
        publishSnapshot(true);
        await publishCheckpoint();
        return history;
      }
      reportProgress("scanning", address);
      const pageTransactions = response.transactions.slice(0, limit);
      history.push(...pageTransactions);
      fetchedCount += pageTransactions.length;
      scannedTransactions += pageTransactions.length;
      pagesFetched += 1;
      // Incorporate every page immediately, before waiting for the next one.
      processHistory(canonicalize(address), pageTransactions);
      hasMore = response.hasMore;
      state.hasMore = hasMore;

      if (hasMore && !response.nextCursor) {
        state.error = `The transaction service reported another page without a cursor. ${fetchedCount} fetched transactions retained; history incomplete.`;
      } else if (hasMore && seenCursors.has(response.nextCursor!)) {
        state.error = `The transaction service repeated a pagination cursor. ${fetchedCount} fetched transactions retained; history incomplete.`;
      } else if (hasMore) {
        seenCursors.add(response.nextCursor!);
        cursor = response.nextCursor!;
        page += 1;
        state.cursor = cursor;
        state.page = page;
        state.seenCursors = [...seenCursors];
      }
      if (hasMore && fetchedCount >= MAX_CLUSTER_HISTORY_PER_WALLET) {
        truncatedKeys.add(key);
        state.truncated = true;
      }
      state.finished = !hasMore || Boolean(state.error) || state.truncated;
      if (state.error) fetchErrors.push({ address, message: state.error });
      publishSnapshot(pagesFetched === 1);
      // Persist the NEXT page cursor together with its already-ingested history,
      // before starting another page. Reloading never has to restart page one.
      await publishCheckpoint();
      if (state.finished) break;
      reportProgress("scanning", address);
    }

    if (hasMore && fetchedCount >= MAX_CLUSTER_HISTORY_PER_WALLET) {
      truncatedKeys.add(canonicalize(address));
    }
    return history;
  };
  // One cache per run, never shared across scans or chains. Page ingestion
  // still happens immediately in scanHistory, not again on a cache hit.
  const getHistory = createClusterHistoryCache(canonicalize, scanHistory);

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
      // Resume already rebuilt these observations. Avoid serializing the entire
      // checkpoint again for every unchanged, completed wallet on the frontier.
      const cached = histories.get(currentKey);
      if (cached?.finished && cached.attempted) continue;
      const currentAddress = addressByKey.get(currentKey) ?? currentKey;
      const alreadyAttempted = histories.get(currentKey)?.attempted;
      activeKeys.add(currentKey);
      reportProgress("scanning", currentAddress);
      try {
        await getHistory(currentAddress);
        if (!signal.aborted && !alreadyAttempted) {
          scannedWallets += 1;
          histories.get(currentKey)!.attempted = true;
        }
      } catch (error) {
        if (!signal.aborted) {
          fetchErrors.push({ address: currentAddress, message: error instanceof Error ? error.message : String(error) });
          if (!alreadyAttempted) {
            scannedWallets += 1;
            const history = histories.get(currentKey);
            if (history) history.attempted = true;
          }
        }
      } finally {
        activeKeys.delete(currentKey);
        publishSnapshot();
        await publishCheckpoint();
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
    if (!onSnapshot || (!force && Date.now() - lastSnapshotAt < 2_000)) return;
    lastSnapshotAt = Date.now();
    onSnapshot(buildResult(false, "Scan in progress. Results reflect fetched pages only; queued and active histories may be incomplete."));
  }

  // Rebuild observations from saved pages without refetching them. Queue/depth
  // restoration preserves all branches, including unfinished concurrent wallets.
  if (saved) {
    // Let Safari paint the running state before restoring a large checkpoint.
    // Replaying in bounded batches keeps touch/cancel events responsive without
    // changing transaction order, traversal, deduplication or saved evidence.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    for (const [key, history] of histories) {
      for (let offset = 0; offset < history.transactions.length; offset += 500) {
        processHistory(key, history.transactions.slice(offset, offset + 500));
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  }
  publishSnapshot(true);
  await publishCheckpoint();
  // Keep layer barriers: streaming pages must not start a deeper layer early.
  while (queueIndex < queue.length && !signal.aborted) {
    currentHop = depthByKey.get(queue[queueIndex]) ?? 0;
    let levelEnd = queueIndex;
    while (levelEnd < queue.length && depthByKey.get(queue[levelEnd]) === currentHop) levelEnd += 1;
    await Promise.all(Array.from({ length: 3 }, () => worker(levelEnd)));
  }
  reportProgress("building", null);
  const result = buildResult(!signal.aborted, signal.aborted
    ? "Scan stopped before all discovered wallets were scanned. Fetched transactions are retained."
    : undefined);
  onSnapshot?.(result);
  await publishCheckpoint();
  return result;
}
