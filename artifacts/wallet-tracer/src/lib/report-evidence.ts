export interface EvidenceTransfer {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  timestamp: string;
  tokenSymbol?: string | null;
  assetId?: string | null;
  operationId?: string | null;
  memo?: string | null;
  destinationTag?: number | null;
  status?: string;
  fee?: string;
  blockNumber?: number;
}

export function transferIdentity(tx: EvidenceTransfer): string {
  return JSON.stringify([tx.hash, tx.operationId ?? null, tx.from, tx.to, tx.value,
    tx.assetId ?? tx.tokenSymbol, tx.timestamp, tx.memo ?? null, tx.destinationTag ?? null]);
}

export function explorerTransactionUrl(chain: string, hash: string): string | null {
  const bases: Record<string, string> = {
    xrp: "https://xrpscan.com/tx/", xlm: "https://stellar.expert/explorer/public/tx/",
    ethereum: "https://etherscan.io/tx/", bitcoin: "https://mempool.space/tx/",
    polygon: "https://polygonscan.com/tx/", bsc: "https://bscscan.com/tx/",
    xdc: "https://xdcscan.com/tx/", hbar: "https://hashscan.io/mainnet/transaction/",
    dag: "https://dagexplorer.io/transactions/",
  };
  return bases[chain] && hash ? bases[chain] + encodeURIComponent(hash) : null;
}

export function evidenceTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? `Unavailable / invalid: ${timestamp || "not supplied"}`
    : `${date.toISOString()} (UTC) | ${date.toLocaleString(undefined, { timeZoneName: "long" })} (local)`;
}

// Existing labels have no independently recorded provider verification.
// An explorer link is a lookup reference, NOT evidence that it supplied a label.
export const CATALOG_PROVENANCE = "Inferred — source: CryptoChainTrace app label catalog; independent verification not recorded";

export function evidenceTransferLines(tx: EvidenceTransfer, chain: string): string[] {
  return [
    `TX ID: ${tx.hash || "not supplied"}${tx.operationId ? ` | Operation: ${tx.operationId}` : ""}`,
    `From: ${tx.from} → To: ${tx.to ?? "not supplied"}`,
    `Exact amount: ${tx.value} ${tx.tokenSymbol ?? chain.toUpperCase()}${tx.assetId ? ` | Asset: ${tx.assetId}` : ""}`,
    `Time: ${evidenceTime(tx.timestamp)}`,
    `Explorer: ${explorerTransactionUrl(chain, tx.hash) ?? "not available"}`,
    `Memo: ${tx.memo == null ? "not supplied" : JSON.stringify(tx.memo)}`,
    `Destination tag: ${tx.destinationTag == null ? "not supplied" : tx.destinationTag}`,
  ];
}

/** Preserve observed values; remove instructions and claims not established by ledger data. */
export function neutralReportText(content: string): string {
  const lines = content.replace(/^\s*MASTER DATA REQUEST[\s\S]*?(?=^\s*1\. COMMINGLING CHECK SUMMARY)/m, "").split("\n");
  let omitRequest = false;
  return lines.flatMap((line) => {
    if (/following categories constitute|data categories.*(?:request|subpoena)|comprehensive data request/i.test(line)) omitRequest = true;
    if (omitRequest && /^(?:═|─){6,}$/.test(line.trim())) { omitRequest = false; return []; }
    if (omitRequest || /subpoena|18 U\.S\.C|§\s*2703|MLAT|legal hold|common control|conspiracy|criminal|immediate.*(?:action|request)|ACTION\s*:|recommended action|investigative action|should be|must be|ready.to.file|account.holder records|law enforcement edition|Monitor for|Load full TX|Run Full Package|trace .*separately|establish .*identity|prove[sn]?\b|law.enforcement access/i.test(line)) return [];
    return [line
      .replace(/VICTIM\s*→\s*THIEF/gi, "USER-SPECIFIED TRANSFER")
      .replace(/\bTHIEF\b/gi, "RECIPIENT")
      .replace(/\bVICTIM\b/gi, "REPORTED SOURCE")
      .replace(/CONNECTION CONFIRMED/gi, "OBSERVED CONNECTION")
      .replace(/(?:potential|possible) (?:mixing|laundering)/gi, "observed transfer pattern")
      .replace(/money laundering|laundering risk|layering risk/gi, "transfer-pattern indicator")
      .replace(/US-regulated/gi, "app-classified US exchange")
      .replace(/For Official Investigative Use Only/gi, "Observed blockchain data; limitations apply")
      .replace(/DIGITAL SIGNATURE \/ TAMPER-EVIDENT SEAL/g, "CONTENT CHECKSUM (SHA-256)")
      .replace(/cryptographically signed and tamper-evident/gi, "accompanied by a content checksum, not an authenticated digital signature")
      .replace(/AUDIT LOG — CHAIN OF CUSTODY/g, "REPORT GENERATION RECORD")
      .replace(/full combined transaction history/gi, "loaded transaction records")
      .replace(/complete hop-by-hop records wherever/gi, "observed hop-by-hop records where")];
  }).join("\n");
}
