import { transferIdentity, type EvidenceTransfer } from "./report-evidence";

const SCALE = 10n ** 36n;
function units(value: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match) throw new Error(`Unsupported exact decimal amount: ${value}`);
  const exponent = Number(match[3] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) throw new Error(`Unsupported exact decimal exponent: ${value}`);
  const fraction = match[2] ?? "";
  const digits = BigInt(match[1] + fraction);
  const shift = 36 - fraction.length + exponent;
  if (shift >= 0) return digits * 10n ** BigInt(shift);
  const divisor = 10n ** BigInt(-shift);
  if (digits % divisor !== 0n) throw new Error(`Amount exceeds exact model precision: ${value}`);
  return digits / divisor;
}
function decimal(value: bigint): string {
  const fraction = (value % SCALE).toString().padStart(36, "0").replace(/0+$/, "");
  return `${value / SCALE}${fraction ? `.${fraction}` : ""}`;
}
interface Lot { amount: bigint; tracked: boolean }

/** FIFO is a disclosed allocation model, not identification of particular coins.
 * Requires the selected source transfer, preserves assets, and stops at exchanges. */
export function attributeFifo(
  records: EvidenceTransfer[], origin: EvidenceTransfer,
  isExchange: (address: string) => boolean,
  normalize: (address: string) => string = (address) => address,
  nativeSymbol?: string,
) {
  const warnings = new Set<string>([
    "FIFO allocation estimate, not proof of ownership or of which funds moved. Same-time transfers use block/operation/hash order where available; within-block order may be uncertain.",
    "Fees, swaps, bridges, tokens with identical symbols but unknown issuers, and unobserved opening balances can limit attribution. No cross-asset conversion is inferred.",
  ]);
  const unique = new Map(records.map((tx) => [transferIdentity(tx), tx]));
  unique.set(transferIdentity(origin), origin);
  const asset = (tx: EvidenceTransfer) => tx.assetId ?? tx.tokenSymbol ?? "UNKNOWN";
  const originAsset = asset(origin);
  if (origin.status !== "success" || !origin.to || units(origin.value) <= 0n) throw new Error("Select a successful, positive source transfer with a recipient.");
  const ordered = [...unique.values()].filter((tx) => tx.status === "success" && asset(tx) === originAsset)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
      || (a.blockNumber ?? 0) - (b.blockNumber ?? 0)
      || (a.operationId && b.operationId && /^\d+$/.test(a.operationId) && /^\d+$/.test(b.operationId)
        ? BigInt(a.operationId) < BigInt(b.operationId) ? -1 : BigInt(a.operationId) > BigInt(b.operationId) ? 1 : 0
        : (a.operationId ?? a.hash).localeCompare(b.operationId ?? b.hash)));
  if (ordered.some((tx) => !Number.isFinite(Date.parse(tx.timestamp)))) throw new Error("FIFO needs valid timestamps for every included transfer.");
  const balances = new Map<string, Lot[]>();
  const chargedFees = new Set<string>();
  const arrivals = new Map<string, bigint>();
  const flows: Array<{ transaction: EvidenceTransfer; attributed: string }> = [];
  const consume = (wallet: string, amount: bigint): Lot[] => {
    const lots = balances.get(wallet) ?? [];
    const available = lots.reduce((sum, lot) => sum + lot.amount, 0n);
    if (available < amount) {
      warnings.add(`Unobserved opening/incoming balance at ${wallet}; attribution is incomplete.`);
      lots.unshift({ amount: amount - available, tracked: false });
    }
    let remaining = amount;
    const consumed: Lot[] = [];
    while (remaining > 0n && lots.length) {
      const lot = lots[0];
      const used = lot.amount < remaining ? lot.amount : remaining;
      consumed.push({ amount: used, tracked: lot.tracked });
      lot.amount -= used; remaining -= used;
      if (lot.amount === 0n) lots.shift();
    }
    balances.set(wallet, lots);
    return consumed;
  };
  for (const tx of ordered) {
    if (!tx.to) continue;
    const from = normalize(tx.from), to = normalize(tx.to);
    const amount = units(tx.value);
    if (from === to) continue;
    const seed = transferIdentity(tx) === transferIdentity(origin);
    const consumed = seed ? [{ amount, tracked: true }]
      : isExchange(tx.from) ? [{ amount, tracked: false }] : consume(from, amount);
    if (seed && !isExchange(tx.from)) consume(from, amount);
    const tracked = consumed.reduce((sum, lot) => sum + (lot.tracked ? lot.amount : 0n), 0n);
    const lots = balances.get(to) ?? [];
    lots.push(...consumed);
    balances.set(to, lots);
    if (tracked > 0n) {
      arrivals.set(to, (arrivals.get(to) ?? 0n) + tracked);
      flows.push({ transaction: tx, attributed: decimal(tracked) });
    }
    // Native-asset fees consume FIFO value but never become recipient arrivals.
    if (tx.fee && tx.tokenSymbol === nativeSymbol && tx.fee !== "0" && !isExchange(tx.from) && !chargedFees.has(`${tx.hash}:${from}`)) {
      consume(from, units(tx.fee));
      chargedFees.add(`${tx.hash}:${from}`);
    }
  }
  return {
    sourceAmount: decimal(units(origin.value)), asset: originAsset,
    arrivals: [...arrivals].map(([wallet, amount]) => ({
      wallet, cumulativeArrivals: decimal(amount),
      remaining: decimal((balances.get(wallet) ?? []).reduce((sum, lot) => sum + (lot.tracked ? lot.amount : 0n), 0n)),
      exchangeStop: isExchange(wallet),
    })),
    flows, warnings: [...warnings],
    note: "Cumulative arrivals are not additive across wallets: the same allocated value can move through several wallets or return in a cycle. Remaining balances exclude consumed value.",
  };
}
