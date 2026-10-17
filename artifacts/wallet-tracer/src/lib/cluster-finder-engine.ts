import {
  getWalletTransactions,
  type Transaction,
} from "@workspace/api-client-react";

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

export interface ClusterProgress {
  phase: "scanning" | "building";
  activeAddress: string | null;
  scannedWallets: number;
  transactionCount: number;
  queuedWallets: number;
  connectedInputs: number;
  totalInputs: number;
}

export interface ClusterFinderResult {
  chain: ClusterChain;
  primaryAddress: string;
  inputAddresses: string[];
  nodes: ClusterNode[];
  flows: ClusterFlow[];
  connections: ClusterConnection[];
  disconnectedAddresses: string[];
  excludedAddresses: string[];
  truncatedAddresses: string[];
  fetchErrors: Array<{ address: string; message: string }>;
  scannedWallets: number;
  scannedTransactions: number;
  complete: boolean;
}

export interface ClusterFinderOptions {
  addresses: string[];
  primaryAddress: string;
  chain: ClusterChain;
  signal: AbortSignal;
  onProgress?: (progress: ClusterProgress) => void;
  getKnownInfo: (address: string, chain: string) => { label: string; type: string } | null;
  normalizeAddress: (address: string, chain: string) => string;
}

export const MAX_CLUSTER_HISTORY_PER_WALLET = 25_000;

const INFRASTRUCTURE_TYPES = new Set(["exchange", "bridge", "genesis"]);
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
 * Walks incoming private-wallet flows backwards from the primary wallet until
 * every relevant branch reaches a supplied wallet or a dead end. Each wallet's
 * history is capped at the same 25,000 transactions as the existing wallet UI;
 * there is intentionally no hop-depth limit.
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
    getKnownInfo,
    normalizeAddress,
  } = options;
  const evmChains = new Set(["ethereum", "polygon", "bsc"]);

  const canonicalize = (address: string): string => {
    const normalized = normalizeAddress(address.trim(), chain).trim();
    return evmChains.has(chain) ? normalized.toLowerCase() : normalized;
  };
  const knownInfo = (address: string) => getKnownInfo(address, chain);
  const isPrivate = (address: string) => {
    const type = knownInfo(address)?.type.toLowerCase();
    return !type || !INFRASTRUCTURE_TYPES.has(type);
  };

  const primaryKey = canonicalize(primaryAddress);
  const addressByKey = new Map<string, string>();
  const rememberAddress = (address: string): string => {
    const key = canonicalize(address);
    if (key && !addressByKey.has(key)) addressByKey.set(key, normalizeAddress(address.trim(), chain));
    return key;
  };

  const requestedKeys = [...new Set(addresses.map(rememberAddress).filter(Boolean))];
  if (!primaryKey || !requestedKeys.includes(primaryKey)) {
    throw new Error("Choose a primary wallet from the entered address list.");
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

  const flowBuckets = new Map<string, {
    fromKey: string;
    toKey: string;
    transactions: Map<string, ClusterTransaction>;
  }>();
  const queue = [primaryKey, ...inputKeys];
  const enqueued = new Set(queue);
  let queueIndex = 0;
  let scannedWallets = 0;
  let scannedTransactions = 0;
  let connectedInputs = 0;
  const truncatedKeys = new Set<string>();
  const fetchErrors: Array<{ address: string; message: string }> = [];

  const reportProgress = (phase: ClusterProgress["phase"], activeAddress: string | null) => {
    onProgress?.({
      phase,
      activeAddress,
      scannedWallets,
      transactionCount: scannedTransactions,
      queuedWallets: Math.max(0, queue.length - queueIndex),
      connectedInputs,
      totalInputs: inputKeys.length,
    });
  };

  const scanHistory = async (address: string): Promise<Transaction[]> => {
    const transactions: Transaction[] = [];
    let page = 1;
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    let hasMore = true;

    while (hasMore && transactions.length < MAX_CLUSTER_HISTORY_PER_WALLET) {
      if (signal.aborted) throw abortError();
      const limit = Math.min(
        PAGE_SIZE[chain],
        MAX_CLUSTER_HISTORY_PER_WALLET - transactions.length,
      );
      const response = await getWalletTransactions(
        address,
        { chain, page, limit, cursor },
        { signal },
      );
      const pageTransactions = response.transactions.slice(0, limit);
      transactions.push(...pageTransactions);
      scannedTransactions += pageTransactions.length;
      hasMore = response.hasMore;

      if (!hasMore) break;
      if (!response.nextCursor) {
        throw new Error("The transaction service reported another page without a cursor.");
      }
      if (seenCursors.has(response.nextCursor)) {
        throw new Error("The transaction service repeated a pagination cursor.");
      }
      seenCursors.add(response.nextCursor);
      cursor = response.nextCursor;
      page += 1;
      reportProgress("scanning", address);
    }

    if (hasMore && transactions.length >= MAX_CLUSTER_HISTORY_PER_WALLET) {
      truncatedKeys.add(canonicalize(address));
    }
    return transactions;
  };

  const worker = async () => {
    while (queueIndex < queue.length) {
      if (signal.aborted) throw abortError();
      const currentKey = queue[queueIndex++];
      const currentAddress = addressByKey.get(currentKey) ?? currentKey;
      reportProgress("scanning", currentAddress);

      let history: Transaction[];
      try {
        history = await scanHistory(currentAddress);
      } catch (error) {
        if (signal.aborted) throw abortError();
        fetchErrors.push({
          address: currentAddress,
          message: error instanceof Error ? error.message : String(error),
        });
        scannedWallets += 1;
        reportProgress("scanning", null);
        continue;
      }
      scannedWallets += 1;

      for (const tx of history) {
        if (tx.status !== "success" || !tx.from || !tx.to || tx.from === tx.to) continue;
        const fromKey = rememberAddress(tx.from);
        const toKey = rememberAddress(tx.to);
        if (!fromKey || !toKey || !isPrivate(tx.from) || !isPrivate(tx.to)) continue;

        const bucketKey = `${fromKey}\u0000${toKey}`;
        let bucket = flowBuckets.get(bucketKey);
        if (!bucket) {
          bucket = { fromKey, toKey, transactions: new Map() };
          flowBuckets.set(bucketKey, bucket);
        }
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
        bucket.transactions.set(transactionKey(compactTx, fromKey, toKey), compactTx);

        // The transaction response is for the current wallet. Follow only
        // incoming flows toward the primary; supplied wallets are roots.
        if (
          currentKey !== primaryKey &&
          inputKeySet.has(currentKey)
        ) continue;
        if (toKey !== currentKey || !isPrivate(tx.from) || enqueued.has(fromKey)) continue;
        enqueued.add(fromKey);
        queue.push(fromKey);
      }
      reportProgress("scanning", null);
    }
  };

  await Promise.all(Array.from({ length: 3 }, () => worker()));
  if (signal.aborted) throw abortError();

  reportProgress("building", null);
  const flowList: ClusterFlow[] = [...flowBuckets.values()]
    .sort((a, b) => a.fromKey.localeCompare(b.fromKey) || a.toKey.localeCompare(b.toKey))
    .map((bucket, index) => ({
    id: `flow-${index + 1}`,
    from: bucket.fromKey,
    to: bucket.toKey,
    transactions: [...bucket.transactions.values()].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
    ),
    }));
  const flowsByFrom = new Map<string, ClusterFlow[]>();
  const flowsByTo = new Map<string, ClusterFlow[]>();
  for (const flow of flowList) {
    const outgoing = flowsByFrom.get(flow.from) ?? [];
    outgoing.push(flow);
    flowsByFrom.set(flow.from, outgoing);
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

  const reachableFromInputs = new Set<string>();
  const forwardQueue: string[] = [];
  for (const inputKey of inputKeys) {
    if (canReachPrimary.has(inputKey)) {
      reachableFromInputs.add(inputKey);
      forwardQueue.push(inputKey);
    }
  }
  for (let i = 0; i < forwardQueue.length; i += 1) {
    if (forwardQueue[i] === primaryKey) continue;
    for (const flow of flowsByFrom.get(forwardQueue[i]) ?? []) {
      if (!canReachPrimary.has(flow.to) || reachableFromInputs.has(flow.to)) continue;
      reachableFromInputs.add(flow.to);
      forwardQueue.push(flow.to);
    }
  }

  const relevantFlows = flowList.filter(
    (flow) => flow.from !== primaryKey && reachableFromInputs.has(flow.from) && canReachPrimary.has(flow.to),
  );
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

  const nodeKeys = new Set<string>();
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

  reportProgress("building", null);
  return {
    chain,
    primaryAddress: addressByKey.get(primaryKey) ?? primaryAddress,
    inputAddresses,
    nodes,
    flows: relevantFlows.map((flow) => ({
      ...flow,
      from: addressByKey.get(flow.from) ?? flow.from,
      to: addressByKey.get(flow.to) ?? flow.to,
    })),
    connections,
    disconnectedAddresses,
    excludedAddresses,
    truncatedAddresses,
    fetchErrors,
    scannedWallets,
    scannedTransactions,
    complete: fetchErrors.length === 0 && truncatedAddresses.length === 0,
  };
}
