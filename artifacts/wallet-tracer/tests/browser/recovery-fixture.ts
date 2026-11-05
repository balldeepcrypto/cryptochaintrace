import type { ClusterCheckpoint } from "../../src/lib/cluster-finder-storage";
import type { Transaction } from "@workspace/api-client-react";

export const LEAD = "0x1111111111111111111111111111111111111111";
export const INPUT = "0x2222222222222222222222222222222222222222";
export const FOCUS = "0x3333333333333333333333333333333333333333";
export const CURSOR = "saved/cursor+opaque==";
export const OWNER = "master-owner";

export function transaction(from: string, to: string, hash: string): Transaction {
  return {
    from, to, hash, value: "1", valueUsd: 1, fee: "0", feeUsd: 0,
    timestamp: "2026-10-24T10:20:30.123Z", blockNumber: 1,
    tokenSymbol: "POL", tokenName: "Polygon", status: "success", direction: "out",
  };
}

export function recoveryFixture(state: "running" | "failed"): ClusterCheckpoint {
  const cached = [
    transaction(LEAD, INPUT, "cached-completed-lead"),
    transaction(FOCUS, LEAD, "cached-completed-focus"),
    transaction(INPUT, FOCUS, "cached-input-page-one"),
  ];
  return {
    version: 1, runId: "isolated-recovery-fixture", savedAt: "2026-10-24T10:25:00.000Z",
    state, chain: "polygon", maxHops: 3, addressText: INPUT, focusText: FOCUS, primaryAddress: LEAD,
    error: state === "failed" ? "Fixture: interrupted history request" : "",
    progress: null,
    result: {
      chain: "polygon", maxHops: 3, primaryAddress: LEAD, inputAddresses: [INPUT, FOCUS],
      focusAddresses: [FOCUS], nodes: [], flows: [], connections: [], usExchangeTransactions: [],
      disconnectedAddresses: [INPUT, FOCUS], excludedAddresses: [], truncatedAddresses: [],
      fetchErrors: [], scannedWallets: 3, scannedTransactions: 3, complete: false,
      incompleteReason: "Fixture: partial fetched pages retained",
    },
    scan: {
      version: 1, chain: "polygon", maxHops: 3, primaryKey: LEAD,
      inputKeys: [INPUT, FOCUS], focusKeys: [FOCUS],
      addresses: [[INPUT, INPUT], [LEAD, LEAD], [FOCUS, FOCUS]],
      queue: [LEAD, FOCUS, INPUT], depths: [[LEAD, 0], [FOCUS, 0], [INPUT, 0]],
      histories: [LEAD, FOCUS, INPUT].map((key, index) => ({
        key, transactions: [cached[index]], attempted: true, truncated: false, page: 2,
        finished: key !== INPUT, hasMore: key === INPUT,
        cursor: key === INPUT ? CURSOR : undefined,
        seenCursors: key === INPUT ? [CURSOR] : [],
        error: key === INPUT && state === "failed" ? "Fixture: history interrupted" : undefined,
      })),
      pagesFetched: 3, scannedTransactions: 3,
    },
  };
}
