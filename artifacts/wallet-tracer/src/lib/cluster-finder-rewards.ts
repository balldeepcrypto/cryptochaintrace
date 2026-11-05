/** Cluster Finder only: these DAG catalog labels stop private expansion. */
export function isDagRewardWallet(
  chain: string,
  info: { label: string; type: string } | null,
): boolean {
  if (chain !== "dag" || !info || info.type.toLowerCase() === "exchange") return false;
  return /\b(?:lattice\s+treasury|dor|team\s+(?:foundation|fdn)|stardust\s+(?:collective|team)|rewards?)\b/i.test(info.label);
}

export interface ClusterRewardSummary {
  walletAddress: string;
  rewardAddress: string;
  rewardLabel: string;
  incomingTransactions: number;
  outgoingTransactions: number;
  totalReceived: string;
  totalSent: string;
}

/** Add decimal transfer amounts without floating-point rounding. */
export function addRewardAmounts(left: string, right: string): string {
  const decimal = (value: string) => {
    const match = /^\+?(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(value);
    if (!match) throw new Error("Invalid DAG amount in reward summary.");
    const exponent = Number(match[3] ?? 0);
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) {
      throw new Error("Invalid DAG amount exponent in reward summary.");
    }
    const fraction = match[2] ?? "";
    const scale = fraction.length - exponent;
    return { units: BigInt(match[1] + fraction) * (scale < 0 ? 10n ** BigInt(-scale) : 1n), scale: Math.max(0, scale) };
  };
  const a = decimal(left);
  const b = decimal(right);
  const scale = Math.max(a.scale, b.scale);
  const units = a.units * 10n ** BigInt(scale - a.scale) + b.units * 10n ** BigInt(scale - b.scale);
  if (!scale) return String(units);
  const digits = String(units).padStart(scale + 1, "0");
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, "");
}

export function totalRewardReceived(rows: ClusterRewardSummary[]): string {
  return rows.reduce((total, row) => addRewardAmounts(total, row.totalReceived), "0");
}

/** Only aggregates are exposed in results; raw history stays in the existing checkpoint. */
export function createDagRewardCollector() {
  const seen = new Set<string>();
  const summaries = new Map<string, ClusterRewardSummary>();
  return {
    record(walletAddress: string, rewardAddress: string, rewardLabel: string,
      direction: "IN" | "OUT", amount: string, transferKey: string) {
      const observationKey = `${walletAddress}|${direction}|${transferKey}`;
      if (seen.has(observationKey)) return;
      const pairKey = `${walletAddress}|${rewardAddress}`;
      const previous = summaries.get(pairKey) ?? {
        walletAddress, rewardAddress, rewardLabel,
        incomingTransactions: 0, outgoingTransactions: 0, totalReceived: "0", totalSent: "0",
      };
      const next = { ...previous };
      if (direction === "IN") {
        next.totalReceived = addRewardAmounts(previous.totalReceived, amount);
        next.incomingTransactions++;
      } else {
        next.totalSent = addRewardAmounts(previous.totalSent, amount);
        next.outgoingTransactions++;
      }
      summaries.set(pairKey, next);
      seen.add(observationKey);
    },
    summaries() {
      return [...summaries.values()].sort((a, b) =>
        a.walletAddress.localeCompare(b.walletAddress) || a.rewardAddress.localeCompare(b.rewardAddress));
    },
  };
}
