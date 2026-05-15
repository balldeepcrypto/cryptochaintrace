import { Router, type IRouter, type Response as ExpressResponse } from "express";
import {
  GetWalletParams,
  GetWalletQueryParams,
  GetWalletTransactionsParams,
  GetWalletTransactionsQueryParams,
  GetWalletConnectionsParams,
  GetWalletConnectionsQueryParams,
  GetWalletResponse,
  GetWalletTransactionsResponse,
  GetWalletConnectionsResponse,
} from "@workspace/api-zod";
import { walletCache, txCache, connCache, WALLET_TTL, TX_TTL, CONN_TTL } from "../lib/cache";

const router: IRouter = Router();

const ETHERSCAN_BASE = "https://api.etherscan.io/api";
const ETHERSCAN_KEY = process.env["ETHERSCAN_API_KEY"] || "YourApiKeyToken";
const COINSTATS_KEY = process.env["COINSTATS_API_KEY"] || "";

const PRICE_MAP: Record<string, number> = {
  ethereum: 2400,
  bitcoin: 60000,
  polygon: 0.85,
  bsc: 290,
  xrp: 0.52,
  xlm: 0.11,
  hbar: 0.08,
  xdc: 0.04,
  dag: 0.07,
};

const COIN_ID_MAP: Record<string, string> = {
  xlm: "stellar",
  hbar: "hedera-hashgraph",
  xdc: "xdce-crowd-sale",
  dag: "constellation-labs",
};

// XRP uses XRPL JSON-RPC; DAG uses Constellation Network API; XDC uses its own RPC+BlocksScan; HBAR uses Hedera Mirror Node
const COINSTATS_CHAINS: string[] = [];
const DAG_BASES = [
  "https://be-mainnet.constellationnetwork.io",  // primary block explorer API
  "https://be2-mainnet.constellationnetwork.io", // secondary (parallel infra)
];

function weiToEth(wei: string): string {
  const val = BigInt(wei);
  return (Number(val) / 1e18).toFixed(6);
}

function weiToUsd(wei: string, priceUsd: number): number {
  return parseFloat(((Number(BigInt(wei)) / 1e18) * priceUsd).toFixed(2));
}

function satToBtc(sat: string | number): string {
  return (Number(sat) / 1e8).toFixed(8);
}

function dropToXrp(drops: string | number): string {
  return (Number(drops) / 1e6).toFixed(6);
}

function computeRiskScore(txCount: number, tags: string[]): number | null {
  if (tags.includes("flagged")) return Math.floor(Math.random() * 30) + 70;
  if (tags.includes("exchange")) return Math.floor(Math.random() * 20) + 10;
  if (txCount > 10000) return Math.floor(Math.random() * 20) + 40;
  if (txCount < 5) return Math.floor(Math.random() * 20) + 5;
  return Math.floor(Math.random() * 50) + 10;
}

function guessTags(isContract: boolean, txCount: number): string[] {
  const tags: string[] = [];
  if (isContract) tags.push("contract");
  if (txCount > 50000) tags.push("exchange");
  if (txCount === 0) tags.push("dormant");
  return tags;
}

/**
 * Strip characters that could cause injection or unexpected API behaviour.
 * Allow: alphanumeric, dots, dashes, underscores, colons (for HBAR 0.0.xxx format).
 * Returns null if the address looks malformed (too short, too long, bad chars).
 */
function sanitizeAddress(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < 5 || trimmed.length > 200) return null;
  const cleaned = trimmed.replace(/[^\w.\-:]/g, "");
  if (cleaned !== trimmed) return null; // reject if any suspicious chars were stripped
  return cleaned;
}

/**
 * Intercept res.json to write a successful (2xx) response body to `cache`
 * under `key` with TTL `ttlMs`. Must be called before any res.json in the handler.
 */
function interceptCache(res: ExpressResponse, cache: typeof walletCache, key: string, ttlMs: number): void {
  const orig = res.json.bind(res) as (body: unknown) => ExpressResponse;
  (res as unknown as { json: (body: unknown) => ExpressResponse }).json = (body: unknown) => {
    if (res.statusCode < 400 && body !== undefined) cache.set(key, body, ttlMs);
    return orig(body);
  };
}

// ── Blockscout v2 — free, no API key, covers ETH and Polygon ──────────────
const BLOCKSCOUT_BASES: Record<string, string> = {
  ethereum: "https://eth.blockscout.com",
  polygon: "https://polygon.blockscout.com",
};

async function blockscoutFetchAddress(address: string, chain: string): Promise<Record<string, unknown>> {
  const base = BLOCKSCOUT_BASES[chain];
  if (!base) throw new Error(`No Blockscout endpoint for chain: ${chain}`);
  return withRetry(`Blockscout:${chain}:addr`, async () => {
    const resp = await fetchWithTimeout(`${base}/api/v2/addresses/${address}`, {}, 10000);
    if (!resp.ok) throw new Error(`Blockscout address HTTP ${resp.status} (${chain})`);
    return await resp.json() as Record<string, unknown>;
  });
}

interface BlockscoutTxsResult {
  items: Record<string, unknown>[];
  nextPageParams: Record<string, unknown> | null;
}

async function blockscoutFetchTxs(address: string, chain: string, cursor?: string): Promise<BlockscoutTxsResult> {
  const base = BLOCKSCOUT_BASES[chain];
  if (!base) throw new Error(`No Blockscout endpoint for chain: ${chain}`);
  const url = new URL(`${base}/api/v2/addresses/${address}/transactions`);
  if (cursor) {
    const params = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  }
  return withRetry(`Blockscout:${chain}:txs`, async () => {
    const resp = await fetchWithTimeout(url.toString(), {}, 10000);
    if (!resp.ok) throw new Error(`Blockscout txs HTTP ${resp.status} (${chain})`);
    const data = await resp.json() as { items?: Record<string, unknown>[]; next_page_params?: Record<string, unknown> | null };
    return { items: data.items ?? [], nextPageParams: data.next_page_params ?? null };
  });
}

function parseBlockscoutTx(tx: Record<string, unknown>, address: string, priceUsd: number) {
  const fromHash = String((tx["from"] as Record<string, unknown> | null)?.["hash"] ?? "");
  const toRaw = tx["to"] as Record<string, unknown> | null;
  const toHash = toRaw?.["hash"] != null ? String(toRaw["hash"]) : null;
  const weiValue = String(tx["value"] ?? "0");
  const feeValue = String((tx["fee"] as Record<string, unknown> | null)?.["value"] ?? "0");
  const addrLower = address.toLowerCase();
  const direction: "in" | "out" | "self" =
    fromHash.toLowerCase() === addrLower
      ? toHash?.toLowerCase() === addrLower ? "self" : "out"
      : "in";
  const status: "success" | "failed" | "pending" =
    tx["status"] === "ok" ? "success" : tx["status"] === "error" ? "failed" : "pending";
  return {
    hash: String(tx["hash"] ?? ""),
    from: fromHash, to: toHash,
    value: weiToEth(weiValue), valueUsd: weiToUsd(weiValue, priceUsd),
    fee: weiToEth(feeValue), feeUsd: weiToUsd(feeValue, priceUsd),
    timestamp: String(tx["timestamp"] ?? new Date().toISOString()),
    blockNumber: Number(tx["block_number"] ?? 0),
    status, direction,
    tokenSymbol: null as string | null, tokenName: null as string | null,
  };
}

async function etherscanFetch(params: Record<string, string>, chain: string): Promise<Record<string, unknown>> {
  let baseUrl = ETHERSCAN_BASE;
  if (chain === "polygon") baseUrl = "https://api.polygonscan.com/api";
  if (chain === "bsc") baseUrl = "https://api.bscscan.com/api";
  const url = new URL(baseUrl);
  url.searchParams.set("apikey", ETHERSCAN_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return withRetry(`Etherscan:${chain}`, async () => {
    const resp = await fetchWithTimeout(url.toString(), {}, 10000);
    if (resp.status === 429) throw new Error(`Etherscan 429 rate-limit (${chain})`);
    if (!resp.ok) throw new Error(`Etherscan HTTP ${resp.status} (${chain})`);
    const data = await resp.json() as Record<string, unknown>;
    // Etherscan returns status:"0" with message:"NOTOK" for API errors
    if (data["status"] === "0" && data["message"] === "NOTOK") {
      const result = String(data["result"] ?? "");
      // Rate-limit is retryable; "No transactions found" is a valid empty response
      if (result.toLowerCase().includes("rate limit") || result.toLowerCase().includes("max rate")) {
        throw new Error(`Etherscan rate-limit (${chain}): ${result}`);
      }
    }
    return data;
  });
}

// ── BTC Explorer APIs: blockstream.info (primary) → mempool.space (fallback) ─
// Both use identical response formats. mempool.space returns up to 50 txs/page.
const BTC_BASES = ["https://blockstream.info", "https://mempool.space"];

async function btcFetchAddress(address: string): Promise<Record<string, unknown>> {
  let lastErr: Error = new Error("BTC explorer unavailable");
  for (const base of BTC_BASES) {
    try {
      return await withRetry(`BTC:addr:${base.slice(8, 22)}`, async () => {
        const resp = await fetchWithTimeout(`${base}/api/address/${address}`, {}, 10000);
        if (!resp.ok) throw new Error(`BTC address HTTP ${resp.status} (${base})`);
        return await resp.json() as Record<string, unknown>;
      });
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.warn(`[BTC] Address fetch failed on ${base}: ${lastErr.message}`);
    }
  }
  throw lastErr;
}

async function btcFetchTxs(address: string, afterTxid?: string): Promise<Array<Record<string, unknown>>> {
  const path = afterTxid
    ? `/api/address/${address}/txs/chain/${afterTxid}`
    : `/api/address/${address}/txs`;
  let lastErr: Error = new Error("BTC txs API unavailable");
  for (const base of BTC_BASES) {
    try {
      return await withRetry(`BTC:txs:${base.slice(8, 22)}`, async () => {
        const resp = await fetchWithTimeout(`${base}${path}`, {}, 10000);
        if (!resp.ok) throw new Error(`BTC txs HTTP ${resp.status} (${base})`);
        return await resp.json() as Array<Record<string, unknown>>;
      });
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.warn(`[BTC] Txs fetch failed on ${base}: ${lastErr.message}`);
    }
  }
  throw lastErr;
}

function parseBtcTx(tx: Record<string, unknown>, address: string, priceUsd: number) {
  const vin = (tx["vin"] as Array<Record<string, unknown>>) ?? [];
  const vout = (tx["vout"] as Array<Record<string, unknown>>) ?? [];
  const status = (tx["status"] as Record<string, unknown>) ?? {};
  const isCoinbase = vin.some((v) => v["is_coinbase"] === true);
  const isOutgoing = !isCoinbase && vin.some((v) => {
    const prevout = v["prevout"] as Record<string, unknown> | undefined;
    return String(prevout?.["scriptpubkey_address"] ?? "") === address;
  });
  const valueToSelf = vout
    .filter((o) => String(o["scriptpubkey_address"] ?? "") === address)
    .reduce((sum, o) => sum + Number(o["value"] ?? 0), 0);
  const valueSentOut = vout
    .filter((o) => String(o["scriptpubkey_address"] ?? "") !== address)
    .reduce((sum, o) => sum + Number(o["value"] ?? 0), 0);
  const valueSat = isOutgoing ? valueSentOut : valueToSelf;
  const value = satToBtc(valueSat);
  const valueUsd = parseFloat((parseFloat(value) * priceUsd).toFixed(2));
  const fromAddr = isCoinbase ? "coinbase"
    : isOutgoing ? address
    : String((vin[0]?.["prevout"] as Record<string, unknown> | undefined)?.["scriptpubkey_address"] ?? "unknown");
  const toAddr: string | null = isOutgoing
    ? (String(vout.find((o) => String(o["scriptpubkey_address"] ?? "") !== address)?.["scriptpubkey_address"] ?? "") || null)
    : (valueToSelf > 0 ? address : null);
  const blockTime = Number(status["block_time"] ?? 0);
  const timestamp = blockTime ? new Date(blockTime * 1000).toISOString() : new Date().toISOString();
  const isSelf = isOutgoing && valueSentOut === 0 && valueToSelf > 0;
  return {
    hash: String(tx["txid"] ?? ""),
    from: fromAddr, to: toAddr, value, valueUsd,
    fee: satToBtc(Number(tx["fee"] ?? 0)),
    feeUsd: parseFloat((Number(tx["fee"] ?? 0) / 1e8 * priceUsd).toFixed(4)),
    timestamp, blockNumber: Number(status["block_height"] ?? 0),
    status: (status["confirmed"] ? "success" : "pending") as "success" | "pending" | "failed",
    direction: (isCoinbase ? "in" : isSelf ? "self" : isOutgoing ? "out" : "in") as "in" | "out" | "self",
    tokenSymbol: "BTC", tokenName: null as string | null,
  };
}

// Fetch with a hard timeout (ms)
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retry fn up to `attempts` times with exponential backoff.
 * - Detects HTTP 429 / "rate limit" errors and applies an extended jitter delay.
 * - Only retries on thrown errors; sentinel-value functions should never throw.
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastErr: Error = new Error(`[${label}] exhausted`);
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (i < attempts - 1) {
        const isRateLimit = /429|rate.?limit/i.test(lastErr.message);
        // Exponential: 500ms → 1000ms; rate-limit: 3–4 s with jitter
        const delay = isRateLimit
          ? 3000 + Math.random() * 1000
          : baseDelayMs * Math.pow(2, i);
        console.warn(`[${label}] attempt ${i + 1}/${attempts} failed — retry in ${Math.round(delay)}ms: ${lastErr.message}`);
        await sleep(delay);
      }
    }
  }
  console.error(`[${label}] all ${attempts} attempts failed: ${lastErr.message}`);
  throw lastErr;
}

// XRPL cluster JSON-RPC — multiple public nodes, tried in order on failure
const XRPL_ENDPOINTS = [
  "https://xrplcluster.com/",      // community cluster (primary)
  "https://s1.ripple.com:51234/",  // Ripple's own node
  "https://s2.ripple.com:51234/",  // Ripple's own node (clio)
  "https://xrpl.ws/",              // community WebSocket-compatible HTTP fallback
];

async function xrplRpc(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  let lastErr: Error = new Error("No XRPL endpoints available");
  for (const endpoint of XRPL_ENDPOINTS) {
    try {
      return await withRetry(`XRP:${endpoint.slice(8, 24)}`, async () => {
        const resp = await fetchWithTimeout(
          endpoint,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method, params: [params] }),
          },
          10000,
        );
        if (!resp.ok) throw new Error(`XRPL HTTP ${resp.status} (${endpoint})`);
        const data = await resp.json() as Record<string, unknown>;
        const result = data["result"] as Record<string, unknown>;
        if (result?.["status"] === "error") {
          throw new Error(`XRPL error: ${result["error_message"] ?? result["error"]}`);
        }
        return result;
      });
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.warn(`[XRP] Endpoint ${endpoint.slice(8, 28)} failed: ${lastErr.message}`);
    }
  }
  throw lastErr;
}

async function coinstatsFetch(path: string): Promise<Record<string, unknown>> {
  const resp = await fetchWithTimeout(`https://openapiv1.coinstats.app${path}`, {
    headers: { "X-API-KEY": COINSTATS_KEY, accept: "application/json" },
  }, 8000);
  if (!resp.ok) throw new Error(`CoinStats request failed: ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
}

// ── XDC Network: RPC + BlocksScan etherscan-compat API ────────────────────
const XDC_RPC_ENDPOINTS = [
  "https://rpc.xinfin.network",
  "https://erpc.xinfin.network",
  "https://rpc.ankr.com/xdc",
];
const XDC_BLOCKSSCAN = "https://api.xdcscan.io/api";

// ── Hedera (HBAR) Mirror Node — primary + fallback ────────────────────────────
// CRITICAL: order=desc is broken on the public mirror node for ALL accounts.
// Only order=asc&timestamp=gte:{created_ts} works reliably.
const HBAR_MIRROR_NODES = [
  "https://mainnet.hashio.io",                      // HashIO (Hedera-funded, most reliable)
  "https://mainnet-public.mirrornode.hedera.com",   // Hedera official public
  "https://mainnet.mirrornode.hedera.com",          // Hedera official alternate
];

async function hbarFetch(path: string): Promise<Record<string, unknown>> {
  let lastErr: Error = new Error("HBAR mirror node unavailable");
  for (const base of HBAR_MIRROR_NODES) {
    try {
      return await withRetry(`HBAR:${base.slice(8, 24)}`, async () => {
        const resp = await fetchWithTimeout(`${base}${path}`, {
          headers: { Accept: "application/json" },
        }, 8000);
        if (!resp.ok) throw new Error(`HBAR mirror HTTP ${resp.status} (${base}): ${path.slice(0, 60)}`);
        return await resp.json() as Record<string, unknown>;
      });
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.warn(`[HBAR] Mirror node ${base.slice(8, 30)} failed: ${lastErr.message}`);
    }
  }
  throw lastErr;
}

/** Extract net HBAR amount (tinybars) for a given account from a transfer list */
function hbarNetAmount(transfers: Record<string, unknown>[], accountId: string): number {
  return transfers.reduce((sum, tr) => {
    if (String(tr["account"]) === accountId) return sum + Number(tr["amount"] ?? 0);
    return sum;
  }, 0);
}

/** Find the primary counterparty (not our address, not system accounts) */
function hbarCounterparty(transfers: Record<string, unknown>[], accountId: string, isOutgoing: boolean): string {
  const SYSTEM = new Set(["0.0.98", "0.0.800", "0.0.801", "0.0.802"]);
  const others = transfers.filter(
    (tr) => String(tr["account"]) !== accountId && !SYSTEM.has(String(tr["account"]))
  );
  if (isOutgoing) {
    const recipient = others.find((tr) => Number(tr["amount"]) > 0);
    return String(recipient?.["account"] ?? "");
  }
  const sender = others.find((tr) => Number(tr["amount"]) < 0);
  return String(sender?.["account"] ?? "");
}

// ── XDC ───────────────────────────────────────────────────────────────────────
function normalizeXdcAddress(addr: string): string {
  return addr.startsWith("xdc") ? "0x" + addr.slice(3) : addr;
}

async function xdcRpc(method: string, params: unknown[]): Promise<unknown> {
  let lastErr: Error = new Error("XDC RPC unavailable");
  for (const ep of XDC_RPC_ENDPOINTS) {
    try {
      return await withRetry(`XDC:rpc:${ep.slice(8, 22)}`, async () => {
        const resp = await fetchWithTimeout(ep, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
        }, 8000);
        if (!resp.ok) throw new Error(`XDC RPC HTTP ${resp.status} at ${ep}`);
        const data = await resp.json() as { result?: unknown; error?: { message: string } };
        if (data.error) throw new Error(`XDC RPC error: ${data.error.message}`);
        return data.result;
      });
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.warn(`[XDC] RPC ${ep.slice(8, 28)} failed: ${lastErr.message}`);
    }
  }
  throw lastErr;
}

async function xdcBlocksScanFetch(params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(params).toString();
  return withRetry("XDC:blocksscan", async () => {
    const resp = await fetchWithTimeout(`${XDC_BLOCKSSCAN}?${qs}`, {
      headers: { "User-Agent": "CryptoChainTrace/1.0", "Accept": "application/json" },
    }, 12000);
    if (!resp.ok) throw new Error(`BlocksScan HTTP ${resp.status}`);
    const data = await resp.json() as Record<string, unknown>;
    const msg = String(data["message"] ?? "");
    if (msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("error")) {
      throw new Error(`BlocksScan error: ${msg}`);
    }
    return data;
  });
}

// Constellation Network DAG public explorer API — primary + fallback
async function dagFetch(path: string): Promise<Record<string, unknown>> {
  let lastErr: Error = new Error("DAG API unavailable");
  for (const base of DAG_BASES) {
    try {
      return await withRetry(`DAG:${base.slice(8, 22)}`, async () => {
        const resp = await fetchWithTimeout(`${base}${path}`, {
          headers: { accept: "application/json" },
        }, 25000);
        if (!resp.ok) throw new Error(`DAG API HTTP ${resp.status} (${base})`);
        return await resp.json() as Record<string, unknown>;
      });
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.warn(`[DAG] Endpoint ${base.slice(8, 30)} failed: ${lastErr.message}`);
    }
  }
  throw lastErr;
}

function datumToDag(datum: number | string): string {
  return (Number(datum) / 1e8).toFixed(8);
}

// ── Stellar Horizon API — primary + fallback nodes ────────────────────────────
const STELLAR_BASES = [
  "https://horizon.stellar.org",      // official SDF node (primary)
  "https://horizon-eu.stellar.org",   // official EU node
  "https://stellar.publicnode.org",   // community public node
];

async function stellarFetch(path: string): Promise<Record<string, unknown>> {
  let lastErr: Error = new Error("Stellar Horizon unavailable");
  for (const base of STELLAR_BASES) {
    try {
      // withRetry handles transient network/5xx failures; 400/404 return sentinel (no retry)
      const result = await withRetry(`XLM:${base.slice(8, 26)}`, async () => {
        const resp = await fetchWithTimeout(`${base}${path}`, {
          headers: { accept: "application/json" },
        }, 12000);
        // 400 = invalid address / bad params, 404 = account not found — return empty gracefully
        if (resp.status === 400 || resp.status === 404) {
          const errBody = await resp.json().catch(() => ({})) as Record<string, unknown>;
          const extras = errBody["extras"] as Record<string, unknown> | undefined;
          const reason = String(extras?.["reason"] ?? errBody["detail"] ?? errBody["title"] ?? resp.status);
          console.warn(`[XLM] Horizon ${resp.status} ${base}${path.slice(0, 80)} — ${reason}`);
          // Return sentinel — do NOT throw (withRetry would retry, but 400/404 is definitive)
          return { _empty: true, _status: resp.status, _reason: reason } as Record<string, unknown>;
        }
        if (!resp.ok) throw new Error(`Stellar Horizon HTTP ${resp.status} (${base})`);
        return await resp.json() as Record<string, unknown>;
      });
      // _empty from 400/404 — stop trying other nodes; it's the same invalid address everywhere
      if (result["_empty"]) return result;
      return result;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.error(`[XLM] All retries exhausted for ${base}${path.slice(0, 60)} — ${lastErr.message}`);
    }
  }
  throw lastErr;
}

// Stellar op types that carry a value transfer (we skip change_trust, manage_offer, etc.)
const STELLAR_VALUE_OPS = new Set([
  "payment", "create_account",
  "path_payment_strict_receive", "path_payment_strict_send",
  "account_merge",
  "create_claimable_balance", "claim_claimable_balance",
]);

/** Extract the asset symbol from a Stellar asset string like "yXRP:GCFZ..." or "native" */
function stellarAssetSymbol(asset: unknown): string {
  const s = String(asset ?? "native");
  if (s === "native") return "XLM";
  const colon = s.indexOf(":");
  return colon > 0 ? s.slice(0, colon) : s;
}

function parseStellarOp(
  rec: Record<string, unknown>,
  address: string,
  priceUsd: number,
): {
  hash: string; from: string; to: string | null; value: string; valueUsd: number;
  fee: string; feeUsd: number; timestamp: string; blockNumber: number;
  status: "success" | "failed"; direction: "in" | "out" | "self";
  tokenSymbol: string; tokenName: null; memo: string | null;
} | null {
  const type = String(rec["type"] ?? "payment");
  if (!STELLAR_VALUE_OPS.has(type)) return null; // skip non-value ops

  let from: string;
  let to: string | null;
  let rawAmount: string;
  let tokenSymbol = "XLM";

  if (type === "create_account") {
    from = String(rec["funder"] ?? "");
    to = String(rec["account"] ?? "") || null;
    rawAmount = String(rec["starting_balance"] ?? "0");
  } else if (type === "account_merge") {
    from = String(rec["account"] ?? address);
    to = String(rec["into"] ?? "") || null;
    rawAmount = "0"; // merged balance unknown without extra fetch
  } else if (type === "create_claimable_balance") {
    // Someone creates a claimable balance earmarked for specific claimants
    from = String(rec["sponsor"] ?? rec["source_account"] ?? "");
    // Find which claimant is our address (recipient); fall back to first claimant
    const claimants = (rec["claimants"] as Array<{ destination: string }> | undefined) ?? [];
    const ours = claimants.find((c) => c.destination === address);
    to = (ours ?? claimants[0])?.destination ?? null;
    rawAmount = String(rec["amount"] ?? "0");
    tokenSymbol = stellarAssetSymbol(rec["asset"]);
  } else if (type === "claim_claimable_balance") {
    // This address is claiming a previously-created claimable balance (receiving)
    from = String(rec["source_account"] ?? "");
    to = String(rec["claimant"] ?? address);
    rawAmount = "0"; // amount requires a separate lookup of the balance_id
    tokenSymbol = "XLM";
  } else {
    // payment, path_payment_strict_receive, path_payment_strict_send
    from = String(rec["from"] ?? rec["source_account"] ?? "");
    to = String(rec["to"] ?? "") || null;
    // path_payment_strict_send uses source_amount; strict_receive uses amount
    rawAmount = String(rec["amount"] ?? rec["source_amount"] ?? "0");
    tokenSymbol = stellarAssetSymbol(rec["asset_type"] === "native" ? "native" : rec["asset_code"]);
  }

  const value = parseFloat(rawAmount).toFixed(6);
  const valueUsd = parseFloat((parseFloat(value) * priceUsd).toFixed(2));
  const isOut = from === address;
  const isSelf = from === address && (to === null || to === address);
  const direction: "in" | "out" | "self" = isSelf ? "self" : isOut ? "out" : "in";

  // Extract memo from the transaction embedded by join=transactions
  const txEmbed = rec["transaction"] as Record<string, unknown> | undefined;
  const memoType = String(txEmbed?.["memo_type"] ?? "none");
  const memo = (memoType !== "none" && txEmbed?.["memo"]) ? String(txEmbed["memo"]) : null;

  return {
    hash: String(rec["transaction_hash"] ?? ""),
    from, to, value, valueUsd,
    fee: "0.000001", feeUsd: parseFloat((0.000001 * priceUsd).toFixed(6)),
    timestamp: String(rec["created_at"] ?? new Date().toISOString()),
    blockNumber: 0, status: "success" as const,
    direction, tokenSymbol, tokenName: null, memo,
  };
}


// ─── GET /wallets/:address ─────────────────────────────────────────────────

router.get("/wallets/:address", async (req, res): Promise<void> => {
  const params = GetWalletParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const query = GetWalletQueryParams.safeParse(req.query);
  const chain = query.success ? query.data.chain : "ethereum";
  const rawAddress = params.data.address;

  const address = sanitizeAddress(rawAddress);
  if (!address) {
    res.status(400).json({ error: "invalid_address", message: "Address contains invalid characters or is out of range" });
    return;
  }

  const priceUsd = PRICE_MAP[chain] ?? 1;

  // ── Cache check ────────────────────────────────────────────────────────────
  const wCacheKey = `w:${chain}:${address}`;
  const wCacheHit = walletCache.get(wCacheKey);
  if (wCacheHit) { res.setHeader("X-Cache", "HIT"); res.json(wCacheHit); return; }
  interceptCache(res, walletCache, wCacheKey, WALLET_TTL);
  // ──────────────────────────────────────────────────────────────────────────

  try {
    if (chain === "xrp") {
      const [acctResult, txResult] = await Promise.allSettled([
        xrplRpc("account_info", { account: address, ledger_index: "validated" }),
        // limit=200 gives exact count for small wallets; for large wallets we know it's ≥200
        xrplRpc("account_tx", { account: address, limit: 200, forward: false }),
      ]);
      const acct = acctResult.status === "fulfilled"
        ? ((acctResult.value["account_data"] ?? {}) as Record<string, unknown>)
        : {};
      const balanceDrops = String(acct["Balance"] ?? "0");
      const balance = dropToXrp(balanceDrops);
      const balanceUsd = parseFloat((parseFloat(balance) * priceUsd).toFixed(2));
      const txsArr = txResult.status === "fulfilled"
        ? ((txResult.value["transactions"] as Array<Record<string, unknown>>) ?? [])
        : [];
      const hasMoreTxs = txResult.status === "fulfilled" && !!txResult.value["marker"];
      const toIso = (dateVal: unknown) =>
        dateVal ? new Date((Number(dateVal) + 946684800) * 1000).toISOString() : null;
      const firstTx = txsArr[txsArr.length - 1];
      const lastTx = txsArr[0];
      const firstSeen = toIso(firstTx ? (firstTx["tx"] as Record<string, unknown> | undefined)?.["date"] ?? firstTx["date"] : null);
      const lastSeen = toIso(lastTx ? (lastTx["tx"] as Record<string, unknown> | undefined)?.["date"] ?? lastTx["date"] : null);
      // txsArr.length is exact when hasMoreTxs=false; a known minimum when hasMoreTxs=true
      const txCount = txsArr.length;
      const tags = guessTags(false, txCount);
      res.json(GetWalletResponse.parse({
        address, chain, balance, balanceUsd, transactionCount: txCount,
        firstSeen, lastSeen, tags, riskScore: computeRiskScore(txCount, tags), isContract: false,
      }));
      return;
    }

    if (chain === "bitcoin") {
      const [addrData, recentTxs] = await Promise.all([
        btcFetchAddress(address),
        btcFetchTxs(address),
      ]);
      const chainStats = (addrData["chain_stats"] as Record<string, unknown>) ?? {};
      const balanceSat = Math.max(0, Number(chainStats["funded_txo_sum"] ?? 0) - Number(chainStats["spent_txo_sum"] ?? 0));
      const balance = satToBtc(balanceSat);
      const balanceUsd = parseFloat((parseFloat(balance) * priceUsd).toFixed(2));
      const txCount = Number(chainStats["tx_count"] ?? 0);
      const getTs = (t: Record<string, unknown> | undefined) => {
        const bt = Number((t?.["status"] as Record<string, unknown>)?.["block_time"] ?? 0);
        return bt ? new Date(bt * 1000).toISOString() : null;
      };
      const firstSeen = recentTxs.length > 0 ? getTs(recentTxs[recentTxs.length - 1]) : null;
      const lastSeen  = recentTxs.length > 0 ? getTs(recentTxs[0]) : null;
      const tags = guessTags(false, txCount);
      res.json(GetWalletResponse.parse({
        address, chain, balance, balanceUsd, transactionCount: txCount,
        firstSeen, lastSeen, tags, riskScore: computeRiskScore(txCount, tags), isContract: false,
      }));
      return;
    }

    if (chain === "dag") {
      const [balData, txData] = await Promise.allSettled([
        dagFetch(`/addresses/${address}/balance`),
        dagFetch(`/addresses/${address}/transactions?limit=10`),
      ]);
      const dagBalData = (balData.status === "fulfilled" ? balData.value["data"] : null) as Record<string, unknown> | null;
      const dagBalDatum = Number(dagBalData?.["balance"] ?? 0);
      const balance = datumToDag(dagBalDatum);
      const balanceUsd = parseFloat((parseFloat(balance) * priceUsd).toFixed(2));
      const dagTxArr = txData.status === "fulfilled"
        ? ((txData.value["data"] as Array<Record<string, unknown>>) ?? [])
        : [];
      const firstSeen = dagTxArr.length > 0 ? String(dagTxArr[dagTxArr.length - 1]["timestamp"] ?? "") || null : null;
      const lastSeen = dagTxArr.length > 0 ? String(dagTxArr[0]["timestamp"] ?? "") || null : null;
      const txCount = dagTxArr.length;
      const tags = guessTags(false, txCount);
      res.json(GetWalletResponse.parse({
        address, chain, balance, balanceUsd, transactionCount: txCount,
        firstSeen, lastSeen, tags, riskScore: computeRiskScore(txCount, tags), isContract: false,
      }));
      return;
    }

    if (chain === "xlm") {
      const [acctResult, lastTxResult, firstTxResult] = await Promise.allSettled([
        stellarFetch(`/accounts/${address}`),
        stellarFetch(`/accounts/${address}/transactions?limit=1&order=desc`),
        stellarFetch(`/accounts/${address}/transactions?limit=1&order=asc`),
      ]);
      const acct = acctResult.status === "fulfilled" ? acctResult.value : {};
      // If account not found or invalid, return empty wallet
      if (acct["_empty"]) {
        res.json(GetWalletResponse.parse({
          address, chain, balance: "0.000000", balanceUsd: 0, transactionCount: 0,
          firstSeen: null, lastSeen: null, tags: [], riskScore: null, isContract: false,
        }));
        return;
      }
      const balances = (acct["balances"] as Array<Record<string, unknown>>) ?? [];
      const nativeBal = balances.find((b) => b["asset_type"] === "native");
      const balance = parseFloat(String(nativeBal?.["balance"] ?? "0")).toFixed(6);
      const balanceUsd = parseFloat((parseFloat(balance) * priceUsd).toFixed(2));
      const lastTxRecs = lastTxResult.status === "fulfilled"
        ? ((lastTxResult.value["_embedded"] as Record<string, unknown> | undefined)?.["records"] as Array<Record<string, unknown>>) ?? []
        : [];
      const firstTxRecs = firstTxResult.status === "fulfilled"
        ? ((firstTxResult.value["_embedded"] as Record<string, unknown> | undefined)?.["records"] as Array<Record<string, unknown>>) ?? []
        : [];
      const lastSeen = lastTxRecs[0]?.["created_at"] ? String(lastTxRecs[0]["created_at"]) : null;
      const firstSeen = firstTxRecs[0]?.["created_at"] ? String(firstTxRecs[0]["created_at"]) : null;
      // Estimate tx count from sequence number delta (Stellar sequence is per-account, starts at account creation ledger)
      // Use sequence to derive approximate tx count; clamp 0 for brand-new accounts
      const seqStr = String(acct["sequence"] ?? "0");
      const seqNum = BigInt(seqStr.replace(/\D/g, "") || "0");
      const txCount = lastTxRecs.length > 0 ? Math.max(1, Number(seqNum & BigInt(0xffffffff))) : 0;
      const tags = guessTags(false, txCount);
      res.json(GetWalletResponse.parse({
        address, chain, balance, balanceUsd, transactionCount: txCount,
        firstSeen, lastSeen, tags, riskScore: computeRiskScore(txCount, tags), isContract: false,
      }));
      return;
    }

    if (chain === "xdc") {
      const rpcAddr = normalizeXdcAddress(address);
      // Fetch balance + recent txs from api.xdcscan.io in parallel
      const [balData, recentData] = await Promise.allSettled([
        xdcBlocksScanFetch({ module: "account", action: "balance", address: rpcAddr }),
        xdcBlocksScanFetch({ module: "account", action: "txlist", address: rpcAddr, page: "1", offset: "100", sort: "desc" }),
      ]);
      // Balance: api.xdcscan.io returns decimal wei string; RPC fallback returns hex (BigInt handles both)
      let rawBal = balData.status === "fulfilled" ? String(balData.value["result"] ?? "") : "";
      if (!rawBal || rawBal === "0") {
        try {
          const rpcBal = await xdcRpc("eth_getBalance", [rpcAddr, "latest"]);
          if (rpcBal && String(rpcBal) !== "0x0") rawBal = String(rpcBal);
        } catch { /* keep empty — weiToEth will default to "0" */ }
      }
      const balance = weiToEth(rawBal === "" ? "0" : rawBal);
      const balanceUsd = parseFloat((parseFloat(balance) * priceUsd).toFixed(2));
      // Tx list for first/last seen and count
      const recentTxs = recentData.status === "fulfilled" && Array.isArray(recentData.value["result"])
        ? recentData.value["result"] as Record<string, unknown>[]
        : [];
      // api.xdcscan.io may return all results at once; estimate count from result length
      let txCount = recentTxs.length;
      if (txCount >= 100) txCount = 101; // signal "100+" — frontend shows it as high-volume
      const lastSeen = recentTxs.length > 0 ? new Date(Number(recentTxs[0]["timeStamp"]) * 1000).toISOString() : null;
      // First seen: fetch oldest tx separately
      let firstSeen: string | null = null;
      if (recentTxs.length > 0) {
        try {
          const firstData = await xdcBlocksScanFetch({ module: "account", action: "txlist", address: rpcAddr, page: "1", offset: "1", sort: "asc" });
          const firstTxs = Array.isArray(firstData["result"]) ? firstData["result"] as Record<string, unknown>[] : [];
          if (firstTxs.length > 0) firstSeen = new Date(Number(firstTxs[0]["timeStamp"]) * 1000).toISOString();
        } catch { firstSeen = recentTxs.length > 0 ? new Date(Number(recentTxs[recentTxs.length - 1]["timeStamp"]) * 1000).toISOString() : null; }
      }
      const tags = guessTags(false, txCount);
      res.json(GetWalletResponse.parse({
        address, chain, balance, balanceUsd, transactionCount: txCount,
        firstSeen, lastSeen, tags, riskScore: computeRiskScore(txCount, tags), isContract: false,
      }));
      return;
    }

    if (chain === "hbar") {
      try {
        const acctData = await hbarFetch(`/api/v1/accounts/${address}`);
        const tinybars = Number((acctData["balance"] as Record<string, unknown>)?.["balance"] ?? 0);
        const balance = (tinybars / 1e8).toFixed(6);
        const balanceUsd = parseFloat((tinybars / 1e8 * priceUsd).toFixed(2));
        const createdTs = String(acctData["created_timestamp"] ?? "0").split(".")[0];
        // firstSeen from account creation timestamp (reliable)
        const firstSeen: string | null = createdTs !== "0"
          ? new Date(Number(createdTs) * 1000).toISOString() : null;
        let lastSeen: string | null = null;
        let txCount = 0;
        try {
          // Use desc to get most-recent-first — gives correct lastSeen and count estimate
          const txData = await hbarFetch(
            `/api/v1/transactions?account.id=${address}&order=desc&limit=100`
          );
          const txsArr = (txData["transactions"] as Record<string, unknown>[]) ?? [];
          txCount = txsArr.length;
          if (txCount >= 100) txCount = 101;
          if (txsArr.length > 0) {
            lastSeen = new Date(Number(String(txsArr[0]["consensus_timestamp"]).split(".")[0]) * 1000).toISOString();
          }
        } catch (txErr) { console.warn(`[HBAR] tx count fetch failed for ${address}: ${txErr instanceof Error ? txErr.message : String(txErr)}`); }
        const tags = guessTags(false, txCount);
        res.json(GetWalletResponse.parse({
          address, chain, balance, balanceUsd, transactionCount: txCount,
          firstSeen, lastSeen, tags, riskScore: computeRiskScore(txCount, tags), isContract: false,
        }));
      } catch (err) {
        req.log.error({ err, address, chain: "hbar" }, "[HBAR] wallet info fetch failed");
        res.json(GetWalletResponse.parse({
          address, chain, balance: "0.000000", balanceUsd: 0, transactionCount: 0,
          firstSeen: null, lastSeen: null, tags: [], riskScore: null, isContract: false,
        }));
      }
      return;
    }

    if (COINSTATS_CHAINS.includes(chain)) {
      const connectionId = COIN_ID_MAP[chain] ?? chain;
      try {
        const [balData, txData] = await Promise.allSettled([
          coinstatsFetch(`/wallet/balance?address=${address}&connectionId=${connectionId}`),
          coinstatsFetch(`/wallet/transactions?address=${address}&connectionId=${connectionId}&limit=5`),
        ]);
        const balance = balData.status === "fulfilled"
          ? parseFloat(String(balData.value["balance"] ?? "0")).toFixed(6)
          : "0.000000";
        const balanceUsd = parseFloat((parseFloat(balance) * priceUsd).toFixed(2));
        const txsArr = txData.status === "fulfilled"
          ? ((txData.value["transactions"] as Array<Record<string, unknown>>) ?? [])
          : [];
        const firstSeen = txsArr.length > 0
          ? new Date(String(txsArr[txsArr.length - 1]["date"] ?? "")).toISOString()
          : null;
        const lastSeen = txsArr.length > 0
          ? new Date(String(txsArr[0]["date"] ?? "")).toISOString()
          : null;
        const txCount = txData.status === "fulfilled"
          ? Number(txData.value["total"] ?? txsArr.length)
          : 0;
        const tags = guessTags(false, txCount);
        res.json(GetWalletResponse.parse({
          address, chain, balance, balanceUsd, transactionCount: txCount,
          firstSeen, lastSeen, tags, riskScore: computeRiskScore(txCount, tags), isContract: false,
        }));
      } catch (err) {
        req.log.error({ err, address, chain }, "[CoinStats] wallet info fetch failed");
        res.json(GetWalletResponse.parse({
          address, chain, balance: "0.000000", balanceUsd: 0, transactionCount: 0,
          firstSeen: null, lastSeen: null, tags: [], riskScore: null, isContract: false,
        }));
      }
      return;
    }

    if (BLOCKSCOUT_BASES[chain]) {
      // ETH / Polygon — Blockscout v2 (no API key required)
      const [addrData, txData] = await Promise.allSettled([
        blockscoutFetchAddress(address, chain),
        blockscoutFetchTxs(address, chain),
      ]);
      const addrInfo = addrData.status === "fulfilled" ? addrData.value : {};
      const weiBalance = String(addrInfo["coin_balance"] ?? "0");
      const balance = weiToEth(weiBalance);
      const balanceUsd = weiToUsd(weiBalance, priceUsd);
      const isContract = addrInfo["is_contract"] === true;
      const txItems = txData.status === "fulfilled" ? txData.value.items : [];
      const txCount = Number(addrInfo["transaction_count"] ?? txItems.length);
      const tags = guessTags(isContract, txCount);
      const lastSeen = txItems.length > 0 ? String(txItems[0]["timestamp"] ?? "") || null : null;
      res.json(GetWalletResponse.parse({
        address, chain, balance, balanceUsd, transactionCount: txCount,
        firstSeen: null, lastSeen, tags, riskScore: computeRiskScore(txCount, tags), isContract,
      }));
      return;
    }

    // BSC (and any future EVM chain) — Etherscan-style (requires API key)
    const [balRes, txCountRes, codeRes] = await Promise.all([
      etherscanFetch({ module: "account", action: "balance", address, tag: "latest" }, chain),
      etherscanFetch({ module: "proxy", action: "eth_getTransactionCount", address, tag: "latest" }, chain),
      etherscanFetch({ module: "contract", action: "getabi", address }, chain),
    ]);

    const rawBalance = String(balRes["result"] ?? "0");
    const balance = weiToEth(rawBalance === "0" ? "0" : rawBalance);
    const balanceUsd = weiToUsd(rawBalance === "0" ? "0" : rawBalance, priceUsd);
    const txCountHex = String(txCountRes["result"] ?? "0x0");
    const txCount = parseInt(txCountHex, 16);
    const isContract = codeRes["status"] === "1";
    const tags = guessTags(isContract, txCount);

    const txRes = await etherscanFetch({
      module: "account", action: "txlist",
      address, startblock: "0", endblock: "99999999", page: "1", offset: "5", sort: "asc",
    }, chain);
    const txs = Array.isArray(txRes["result"]) ? (txRes["result"] as Array<Record<string, unknown>>) : [];
    const firstSeen = txs.length > 0 ? new Date(Number(txs[0]["timeStamp"]) * 1000).toISOString() : null;
    const lastSeen = txs.length > 0 ? new Date(Number(txs[txs.length - 1]["timeStamp"]) * 1000).toISOString() : null;

    res.json(GetWalletResponse.parse({
      address, chain, balance, balanceUsd, transactionCount: txCount,
      firstSeen, lastSeen, tags, riskScore: computeRiskScore(txCount, tags), isContract,
    }));
  } catch (err) {
    req.log.error({ err, address, chain }, `[${chain.toUpperCase()}] wallet info fetch failed — returning empty profile`);
    res.json(GetWalletResponse.parse({
      address, chain, balance: "0.000000", balanceUsd: 0, transactionCount: 0,
      firstSeen: null, lastSeen: null, tags: [], riskScore: null, isContract: false,
    }));
  }
});

// ─── GET /wallets/:address/transactions ───────────────────────────────────

router.get("/wallets/:address/transactions", async (req, res): Promise<void> => {
  const params = GetWalletTransactionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const query = GetWalletTransactionsQueryParams.safeParse(req.query);
  const chain = query.success ? query.data.chain : "ethereum";
  const page = query.success ? query.data.page : 1;
  const limit = Math.min(query.success ? (query.data.limit ?? 500) : 500, 500);
  const cursorParam = query.success ? query.data.cursor : undefined;
  // XRP, XLM, HBAR, XDC, DAG addresses are case-sensitive — never lowercase them
  const evmChains = ["ethereum", "polygon", "bsc"];
  const rawAddressTx = params.data.address;

  const sanitized = sanitizeAddress(rawAddressTx);
  if (!sanitized) {
    res.status(400).json({ error: "invalid_address", message: "Address contains invalid characters or is out of range" });
    return;
  }
  const address = evmChains.includes(chain) ? sanitized.toLowerCase() : sanitized;
  const priceUsd = PRICE_MAP[chain] ?? 1;

  // ── Cache check (first page only — cursor pages are too varied to cache usefully) ──
  const txCacheKey = !cursorParam ? `tx:${chain}:${address}:${limit}` : null;
  if (txCacheKey) {
    const txHit = txCache.get(txCacheKey);
    if (txHit) { res.setHeader("X-Cache", "HIT"); res.json(txHit); return; }
    interceptCache(res, txCache, txCacheKey, TX_TTL);
  }
  // ──────────────────────────────────────────────────────────────────────────

  try {
    if (chain === "xrp") {
      // Cursor is a JSON-encoded XRPL marker object
      const xrpMarker = cursorParam ? (() => { try { return JSON.parse(cursorParam); } catch { return undefined; } })() : undefined;
      const result = await xrplRpc("account_tx", {
        account: address,
        limit: Math.min(limit, 1000),
        forward: false,
        ...(xrpMarker ? { marker: xrpMarker } : {}),
      });
      const rawTxs = (result["transactions"] as Array<Record<string, unknown>>) ?? [];
      const xrpNextMarker = result["marker"];
      const nextCursor = xrpNextMarker ? JSON.stringify(xrpNextMarker) : null;
      const hasMore = nextCursor !== null;

      // Deduplicate by hash
      const seen = new Set<string>();
      const unique = rawTxs.filter((entry) => {
        const tx = (entry["tx"] ?? entry["transaction"] ?? entry) as Record<string, unknown>;
        const hash = String(tx["hash"] ?? "");
        if (!hash || seen.has(hash)) return false;
        seen.add(hash);
        return true;
      });

      const total = unique.length;

      const transactions = unique.map((entry) => {
        const tx = (entry["tx"] ?? entry["transaction"] ?? entry) as Record<string, unknown>;
        const meta = (entry["meta"] ?? entry["metadata"]) as Record<string, unknown> | undefined;
        const rawDelivered = meta?.["delivered_amount"] ?? tx["Amount"];
        let value: string;
        let txTokenSymbol = "XRP";
        if (typeof rawDelivered === "object" && rawDelivered !== null) {
          // IOU / non-native token: delivered_amount is {"currency":"USD","value":"1.5","issuer":"r..."}
          const iou = rawDelivered as Record<string, unknown>;
          value = parseFloat(String(iou["value"] ?? "0")).toFixed(6);
          txTokenSymbol = String(iou["currency"] ?? "XRP");
        } else {
          const deliveredStr = String(rawDelivered ?? "0");
          value = /^\d+$/.test(deliveredStr) ? dropToXrp(deliveredStr) : "0.000000";
        }
        const valueUsd = parseFloat((parseFloat(value) * priceUsd).toFixed(2));
        const from = String(tx["Account"] ?? "");
        const to = String(tx["Destination"] ?? "");
        const isOut = from === address;
        const isSelf = from === address && to === address;
        const direction: "in" | "out" | "self" = isSelf ? "self" : isOut ? "out" : "in";
        const dateVal = tx["date"] as number | undefined;
        const timestamp = dateVal
          ? new Date((dateVal + 946684800) * 1000).toISOString()
          : new Date().toISOString();
        const feeDrops = String(tx["Fee"] ?? "0");
        const fee = dropToXrp(feeDrops);
        // Extract destination tag
        const destinationTag = typeof tx["DestinationTag"] === "number" ? (tx["DestinationTag"] as number) : null;
        // Extract and decode hex memos
        const rawMemos = (tx["Memos"] as Array<{ Memo?: { MemoData?: string } }> | undefined) ?? [];
        const memoTexts = rawMemos.flatMap((m) => {
          const hex = m?.Memo?.MemoData;
          if (!hex) return [];
          try { const t = Buffer.from(hex, "hex").toString("utf8").trim(); return t ? [t] : []; } catch { return []; }
        });
        const memo = memoTexts.length > 0 ? memoTexts.join("; ") : null;
        return {
          hash: String(tx["hash"] ?? ""),
          from, to: to || null, value, valueUsd, fee,
          feeUsd: parseFloat((parseFloat(fee) * priceUsd).toFixed(4)),
          timestamp,
          blockNumber: Number(tx["ledger_index"] ?? 0),
          status: ((meta?.["TransactionResult"] as string | undefined) === "tesSUCCESS"
            ? "success" : "failed") as "success" | "failed",
          direction,
          tokenSymbol: txTokenSymbol, tokenName: null, memo, destinationTag,
        };
      });

      res.json(GetWalletTransactionsResponse.parse({ transactions, total, page, limit, nextCursor, hasMore }));
      return;
    }

    if (chain === "dag") {
      // Constellation API pagination:
      // - The response includes meta.next = base64-encoded JSON {hash: "..."} token
      // - Pass as ?next=<token> to get the next zero-overlap page of 100 txs
      // - This is the only correct cursor; search_after causes massive page overlap

      const dagNextToken = cursorParam ?? "";
      const url = `/addresses/${address}/transactions?limit=${limit}${dagNextToken ? `&next=${encodeURIComponent(dagNextToken)}` : ""}`;
      const data = await dagFetch(url);
      const rawTxs = (data["data"] as Array<Record<string, unknown>>) ?? [];
      const metaNext = (data["meta"] as Record<string, unknown> | undefined)?.["next"];
      const nextCursor = (metaNext && typeof metaNext === "string" && rawTxs.length >= limit) ? metaNext : null;
      const hasMore = nextCursor !== null;

      const transactions = rawTxs.map((tx) => {
        const amountDatum = Number(tx["amount"] ?? 0);
        const feeDatum = Number(tx["fee"] ?? 0);
        const value = datumToDag(amountDatum);
        const valueUsd = parseFloat((parseFloat(value) * priceUsd).toFixed(2));
        const fee = datumToDag(feeDatum);
        const from = String(tx["source"] ?? "");
        const to = String(tx["destination"] ?? "");
        const isOut = from === address;
        const isSelf = from === address && to === address;
        const direction: "in" | "out" | "self" = isSelf ? "self" : isOut ? "out" : "in";
        const rawTs = tx["timestamp"];
        const timestamp = rawTs ? new Date(String(rawTs)).toISOString() : new Date().toISOString();
        return {
          hash: String(tx["hash"] ?? ""),
          from, to: to || null, value, valueUsd, fee,
          feeUsd: parseFloat((parseFloat(fee) * priceUsd).toFixed(4)),
          timestamp,
          blockNumber: Number(tx["snapshotOrdinal"] ?? 0),
          status: "success" as const,
          direction,
          tokenSymbol: "DAG", tokenName: null,
        };
      });

      res.json(GetWalletTransactionsResponse.parse({ transactions, total: transactions.length, page, limit, nextCursor, hasMore }));
      return;
    }

    if (chain === "bitcoin") {
      // BTC cursor: pass last txid → /txs/chain/{txid} for next page (25 on blockstream, 50 on mempool.space)
      const [txs, addrData] = await Promise.all([
        btcFetchTxs(address, cursorParam ?? undefined),
        btcFetchAddress(address),
      ]);
      const chainStats = (addrData["chain_stats"] as Record<string, unknown>) ?? {};
      const total = Number(chainStats["tx_count"] ?? txs.length);
      const transactions = txs.map((tx) => parseBtcTx(tx, address, priceUsd));
      const hasMore = txs.length >= 25; // blockstream=25/page, mempool.space=50/page
      const nextCursor = hasMore ? String(txs[txs.length - 1]["txid"] ?? "") : null;
      res.json(GetWalletTransactionsResponse.parse({ transactions, total, page, limit: 25, nextCursor, hasMore }));
      return;
    }

    if (chain === "xlm") {
      // Stellar Horizon /operations endpoint — one record per operation, real amounts
      // (The /transactions envelope endpoint always has value=0; only /operations has actual amounts)
      const stellarLimit = Math.min(limit, 200);
      const cursorSuffix = cursorParam ? `&cursor=${encodeURIComponent(cursorParam)}` : "";
      const opsPath = `/accounts/${address}/operations?limit=${stellarLimit}&order=desc&include_failed=false&join=transactions${cursorSuffix}`;
      let data = await stellarFetch(opsPath);

      // 404 = account not found in current ledger (merged/closed account).
      // Historical payment data is still accessible via the /payments?account= endpoint,
      // which works for both active and merged accounts and returns only value-transfer ops.
      if (data["_empty"] && data["_status"] === 404) {
        const paymentsPath = `/payments?account=${encodeURIComponent(address)}&limit=${stellarLimit}&order=desc&include_failed=false&join=transactions${cursorSuffix}`;
        try {
          const fallback = await stellarFetch(paymentsPath);
          if (!fallback["_empty"]) data = fallback;
        } catch { /* keep data as _empty if fallback also fails */ }
      }

      if (data["_empty"]) {
        // Never cache a failed/empty result — invalidate so next request fetches fresh
        if (txCacheKey) txCache.invalidate(txCacheKey);
        res.json(GetWalletTransactionsResponse.parse({ transactions: [], total: 0, page, limit: stellarLimit, nextCursor: null, hasMore: false }));
        return;
      }
      const records = ((data["_embedded"] as Record<string, unknown> | undefined)?.["records"] as Array<Record<string, unknown>>) ?? [];
      const transactions = records
        .map((rec) => parseStellarOp(rec, address, priceUsd))
        .filter((t): t is NonNullable<typeof t> => t !== null);
      const hasMore = records.length === stellarLimit;
      const lastRec = records[records.length - 1];
      const nextCursor = hasMore && lastRec ? String(lastRec["paging_token"] ?? "") : null;
      // Don't cache empty results (all records were non-value ops like manage_offer/change_trust)
      if (transactions.length === 0 && !hasMore && txCacheKey) txCache.invalidate(txCacheKey);
      res.json(GetWalletTransactionsResponse.parse({
        transactions,
        total: (page - 1) * stellarLimit + transactions.length + (hasMore ? 1 : 0),
        page, limit: stellarLimit, nextCursor, hasMore,
      }));
      return;
    }

    if (chain === "xdc") {
      const rpcAddr = normalizeXdcAddress(address);
      let rawTxs: Record<string, unknown>[] = [];
      let total = 0;
      let usedBlocksScan = false;
      // cursor = page number as string for server-side pagination
      let xdcPageNum = cursorParam ? Math.max(1, parseInt(cursorParam) || 1) : page;
      try {
        // xdcscan may return all results at once regardless of page/offset params,
        // so we always fetch with offset=1000 and apply server-side slicing.
        const bsData = await xdcBlocksScanFetch({
          module: "account", action: "txlist",
          address: rpcAddr, page: "1", offset: "1000", sort: "desc",
        });
        const allTxs = Array.isArray(bsData["result"]) ? bsData["result"] as Record<string, unknown>[] : [];
        total = allTxs.length;
        // Apply server-side pagination slice
        const startIdx = (xdcPageNum - 1) * limit;
        rawTxs = allTxs.slice(startIdx, startIdx + limit);
        usedBlocksScan = true;
      } catch (xdcErr) {
        console.warn(`[XDC] BlocksScan txlist failed: ${xdcErr instanceof Error ? xdcErr.message : String(xdcErr)}`);
        if (COINSTATS_KEY) {
          try {
            const data = await coinstatsFetch(
              `/wallet/transactions?address=${encodeURIComponent(address)}&connectionId=xdce-crowd-sale&limit=${limit}&page=${page}`
            );
            const csTxs = (data["transactions"] as Array<Record<string, unknown>>) ?? [];
            const transactions = csTxs.map((tx) => {
              const value = parseFloat(String(tx["amount"] ?? tx["value"] ?? "0")).toFixed(6);
              const valueUsd = parseFloat((parseFloat(value) * priceUsd).toFixed(2));
              const fromAddr = String(tx["from"] ?? tx["sender"] ?? address);
              const toAddr = String(tx["to"] ?? tx["receiver"] ?? "");
              const isSelf = fromAddr.toLowerCase() === address.toLowerCase() && toAddr.toLowerCase() === address.toLowerCase();
              const isOut = fromAddr.toLowerCase() === address.toLowerCase();
              const direction: "in" | "out" | "self" = isSelf ? "self" : isOut ? "out" : "in";
              return {
                hash: String(tx["hash"] ?? tx["txid"] ?? tx["id"] ?? ""),
                from: fromAddr, to: toAddr || null, value, valueUsd,
                fee: "0.000000", feeUsd: 0,
                timestamp: tx["date"] ? new Date(String(tx["date"])).toISOString() : new Date().toISOString(),
                blockNumber: Number(tx["blockNumber"] ?? 0),
                status: "success" as const, direction,
                tokenSymbol: "XDC", tokenName: null,
              };
            });
            const csHasMore = csTxs.length >= limit;
            res.json(GetWalletTransactionsResponse.parse({
              transactions, total: Number(data["total"] ?? csTxs.length),
              page, limit, nextCursor: csHasMore ? String(page + 1) : null, hasMore: csHasMore,
            }));
            return;
          } catch { /* CoinStats also failed — fall through to empty response */ }
        }
      }
      if (usedBlocksScan) {
        const transactions = rawTxs.map((tx) => {
          const from = String(tx["from"] ?? "");
          const to = String(tx["to"] ?? "");
          const rawVal = String(tx["value"] ?? "0");
          const value = weiToEth(rawVal === "" ? "0" : rawVal);
          const valueUsd = weiToUsd(rawVal === "" ? "0" : rawVal, priceUsd);
          const gpRaw = String(tx["gasPrice"] ?? "0");
          const guRaw = String(tx["gasUsed"] ?? "0");
          const feeWei = String(BigInt(gpRaw === "" ? "0" : gpRaw) * BigInt(guRaw === "" ? "0" : guRaw));
          const fee = weiToEth(feeWei);
          const feeUsd = weiToUsd(feeWei, priceUsd);
          const isSelf = from.toLowerCase() === rpcAddr.toLowerCase() && to.toLowerCase() === rpcAddr.toLowerCase();
          const isOut = from.toLowerCase() === rpcAddr.toLowerCase();
          const direction = (isSelf ? "self" : isOut ? "out" : "in") as "in" | "out" | "self";
          return {
            hash: String(tx["hash"] ?? ""),
            from, to: to || null, value, valueUsd, fee, feeUsd,
            timestamp: new Date(Number(tx["timeStamp"]) * 1000).toISOString(),
            blockNumber: Number(tx["blockNumber"] ?? 0),
            status: tx["isError"] === "1" ? ("failed" as const) : ("success" as const),
            direction, tokenSymbol: null, tokenName: null,
          };
        });
        const hasMore = rawTxs.length >= limit && total > xdcPageNum * limit;
        const calcTotal = total || ((hasMore ? xdcPageNum * limit + 1 : (xdcPageNum - 1) * limit + transactions.length));
        res.json(GetWalletTransactionsResponse.parse({
          transactions, total: calcTotal,
          page, limit, nextCursor: hasMore ? String(xdcPageNum + 1) : null, hasMore,
        }));
        return;
      }
      // No data source available — return empty
      res.json(GetWalletTransactionsResponse.parse({ transactions: [], total: 0, page, limit, nextCursor: null, hasMore: false }));
      return;
    }

    if (chain === "hbar") {
      try {
        // Use order=desc — newest transactions first, no reversal needed.
        // Cursor = consensus_timestamp of the last tx on the current page.
        // Load More appends timestamp=lt:{cursor} to get the next older batch.
        // hasMore is driven by Mirror Node's links.next (authoritative), not rawTxs.length.
        let mirrorUrl: string;
        if (cursorParam) {
          const tsVal = Buffer.from(cursorParam, "base64url").toString("utf8");
          mirrorUrl = `/api/v1/transactions?account.id=${address}&order=desc&limit=${limit}&timestamp=lt:${tsVal}`;
        } else {
          mirrorUrl = `/api/v1/transactions?account.id=${address}&order=desc&limit=${limit}`;
        }

        // On the first page, some accounts have all their transactions in older time windows.
        // Follow links.next up to 10 times until we find actual transactions or exhaust pages.
        let rawTxs: Record<string, unknown>[] = [];
        let mirrorNext: string | null | undefined = null;
        let followAttempts = 0;
        const maxFollowAttempts = cursorParam ? 0 : 10;
        while (followAttempts <= maxFollowAttempts) {
          const txData = await hbarFetch(mirrorUrl);
          rawTxs = (txData["transactions"] as Record<string, unknown>[]) ?? [];
          mirrorNext = (txData["links"] as Record<string, unknown>)?.["next"] as string | null | undefined;
          if (rawTxs.length > 0 || !mirrorNext) break;
          // Empty page but Mirror Node says there are more — follow the cursor
          mirrorUrl = mirrorNext;
          followAttempts++;
        }

        const transactions = rawTxs.map((tx) => {
          const ts = Number(String(tx["consensus_timestamp"] ?? "0").split(".")[0]);
          const transfers = (tx["transfers"] as Record<string, unknown>[]) ?? [];
          const tokenTransfers = (tx["token_transfers"] as Record<string, unknown>[]) ?? [];
          const feeTinybars = Number(tx["charged_tx_fee"] ?? 0);
          const txId = String(tx["transaction_id"] ?? tx["consensus_timestamp"] ?? "");
          const result = String(tx["result"] ?? "SUCCESS");

          // Try HBAR net first; fall back to HTS token transfers
          const netHbar = hbarNetAmount(transfers, address);
          let value: string;
          let valueUsd: number;
          let direction: "in" | "out" | "self";
          let from: string;
          let to: string;
          let tokenSymbol: string | null = null;

          if (netHbar !== 0) {
            const isOutgoing = netHbar < 0;
            direction = isOutgoing ? "out" : "in";
            const counterparty = hbarCounterparty(transfers, address, isOutgoing);
            from = isOutgoing ? address : (counterparty || address);
            to = isOutgoing ? (counterparty || "") : address;
            const absHbar = Math.abs(netHbar) / 1e8;
            value = absHbar.toFixed(6);
            valueUsd = parseFloat((absHbar * priceUsd).toFixed(2));
          } else {
            // Check HTS token_transfers for this account
            const acctTokenTxs = tokenTransfers.filter(t => t["account"] === address);
            const mainTokenId = acctTokenTxs.length > 0 ? String(acctTokenTxs[0]["token_id"] ?? "") : "";
            const netToken = mainTokenId
              ? acctTokenTxs
                  .filter(t => t["token_id"] === mainTokenId)
                  .reduce((s, t) => s + BigInt(String(t["amount"] ?? "0")), 0n)
              : 0n;
            if (netToken !== 0n) {
              const isOutgoing = netToken < 0n;
              direction = isOutgoing ? "out" : "in";
              const others = tokenTransfers.filter(
                t => t["token_id"] === mainTokenId && t["account"] !== address
              );
              const counterparty = isOutgoing
                ? String(others.find(t => BigInt(String(t["amount"] ?? "0")) > 0n)?.["account"] ?? "")
                : String(others.find(t => BigInt(String(t["amount"] ?? "0")) < 0n)?.["account"] ?? "");
              from = isOutgoing ? address : (counterparty || address);
              to = isOutgoing ? (counterparty || "") : address;
              // Display token amount (assume 8 decimals — standard for HTS tokens)
              const absToken = netToken < 0n ? -netToken : netToken;
              value = (Number(absToken) / 1e8).toFixed(6);
              valueUsd = 0;
              tokenSymbol = mainTokenId;
            } else {
              direction = "self";
              from = address; to = address;
              value = "0.000000"; valueUsd = 0;
            }
          }

          return {
            hash: txId, from, to: to || null, value, valueUsd,
            fee: (feeTinybars / 1e8).toFixed(6),
            feeUsd: parseFloat(((feeTinybars / 1e8) * priceUsd).toFixed(2)),
            timestamp: new Date(ts * 1000).toISOString(),
            blockNumber: 0,
            status: result === "SUCCESS" ? ("success" as const) : ("failed" as const),
            direction, tokenSymbol, tokenName: null,
          };
        });

        // Mirror Node explicitly signals hasMore via links.next.
        // Guard: never report hasMore=true when we got 0 transactions (stale/empty cursor).
        const hasMore = rawTxs.length > 0 && !!mirrorNext;
        let nextCursorVal: string | null = null;
        if (hasMore) {
          // Cursor = consensus_timestamp of last tx in this batch
          const lastTs = String(rawTxs[rawTxs.length - 1]["consensus_timestamp"] ?? "");
          nextCursorVal = Buffer.from(lastTs, "utf8").toString("base64url");
        }

        res.json(GetWalletTransactionsResponse.parse({
          transactions,
          total: transactions.length + (hasMore ? 1 : 0),
          page, limit, nextCursor: nextCursorVal, hasMore,
        }));
      } catch (err) {
        req.log.error({ err, address, chain: "hbar" }, "[HBAR] transactions fetch failed");
        res.json(GetWalletTransactionsResponse.parse({ transactions: [], total: 0, page, limit, nextCursor: null, hasMore: false }));
      }
      return;
    }

    if (COINSTATS_CHAINS.includes(chain)) {
      const connectionId = COIN_ID_MAP[chain] ?? chain;
      const data = await coinstatsFetch(
        `/wallet/transactions?address=${encodeURIComponent(address)}&connectionId=${connectionId}&limit=${limit}&page=${page}`
      );
      const rawTxs = (data["transactions"] as Array<Record<string, unknown>>) ?? [];
      const totalFromApi = Number(data["total"] ?? rawTxs.length);

      // Deduplicate by hash on the backend too
      const seen = new Set<string>();
      const deduplicated = rawTxs.filter((tx) => {
        const hash = String(tx["hash"] ?? tx["txid"] ?? tx["id"] ?? "");
        if (!hash) return true;
        if (seen.has(hash)) return false;
        seen.add(hash);
        return true;
      });

      const transactions = deduplicated.map((tx) => {
        const value = parseFloat(String(tx["amount"] ?? tx["value"] ?? "0")).toFixed(6);
        const valueUsd = parseFloat((parseFloat(value) * priceUsd).toFixed(2));
        const fromAddr = String(tx["from"] ?? tx["sender"] ?? address);
        const toAddr = String(tx["to"] ?? tx["receiver"] ?? "");
        // Case-sensitive comparison — XRP/XLM/HBAR addresses must not be lowercased
        const isOutgoing = fromAddr === address;
        const isSelf = fromAddr === address && toAddr === address;
        const direction: "in" | "out" | "self" = isSelf ? "self" : isOutgoing ? "out" : "in";
        return {
          hash: String(tx["hash"] ?? tx["txid"] ?? tx["id"] ?? ""),
          from: fromAddr, to: toAddr || null, value, valueUsd,
          fee: "0.000000", feeUsd: 0,
          timestamp: tx["date"] ? new Date(String(tx["date"])).toISOString() : new Date().toISOString(),
          blockNumber: Number(tx["blockNumber"] ?? tx["ledger"] ?? 0),
          status: "success" as const,
          direction,
          tokenSymbol: chain.toUpperCase(), tokenName: null,
        };
      });

      const csHasMore = transactions.length >= limit;
      const csNextCursor = csHasMore ? String(page + 1) : null;
      res.json(GetWalletTransactionsResponse.parse({ transactions, total: totalFromApi, page, limit, nextCursor: csNextCursor, hasMore: csHasMore }));
      return;
    }

    if (BLOCKSCOUT_BASES[chain]) {
      // ETH / Polygon — Blockscout v2 (no API key required)
      const { items, nextPageParams } = await blockscoutFetchTxs(address, chain, cursorParam ?? undefined);
      const transactions = items.map((tx) => parseBlockscoutTx(tx, address, priceUsd));
      const hasMore = nextPageParams !== null;
      const nextCursor = hasMore
        ? Buffer.from(JSON.stringify(nextPageParams), "utf8").toString("base64url")
        : null;
      res.json(GetWalletTransactionsResponse.parse({
        transactions, total: transactions.length + (hasMore ? 1 : 0),
        page, limit, nextCursor, hasMore,
      }));
      return;
    }

    // BSC (and any future EVM chain) — Etherscan-style (requires API key)
    const data = await etherscanFetch({
      module: "account", action: "txlist",
      address, startblock: "0", endblock: "99999999",
      page: String(page), offset: String(limit), sort: "desc",
    }, chain);

    const rawTxs = Array.isArray(data["result"]) ? (data["result"] as Array<Record<string, unknown>>) : [];
    const transactions = rawTxs.map((tx) => {
      const from = String(tx["from"] ?? "");
      const to = String(tx["to"] ?? "");
      const value = weiToEth(String(tx["value"] ?? "0"));
      const valueUsd = weiToUsd(String(tx["value"] ?? "0"), priceUsd);
      const feeWei = String(BigInt(String(tx["gasPrice"] ?? "0")) * BigInt(String(tx["gasUsed"] ?? "0")));
      const fee = weiToEth(feeWei);
      const feeUsd = weiToUsd(feeWei, priceUsd);
      const direction = from.toLowerCase() === address ? (to.toLowerCase() === address ? "self" : "out") : "in";
      return {
        hash: String(tx["hash"]),
        from, to: to || null, value, valueUsd, fee, feeUsd,
        timestamp: new Date(Number(tx["timeStamp"]) * 1000).toISOString(),
        blockNumber: Number(tx["blockNumber"]),
        status: tx["isError"] === "1" ? ("failed" as const) : ("success" as const),
        direction: direction as "in" | "out" | "self",
        tokenSymbol: null, tokenName: null,
      };
    });

    const evmHasMore = rawTxs.length >= limit;
    const evmNextCursor = evmHasMore ? String(page + 1) : null;
    const total = evmHasMore ? page * limit + 1 : (page - 1) * limit + transactions.length;
    res.json(GetWalletTransactionsResponse.parse({ transactions, total, page, limit, nextCursor: evmNextCursor, hasMore: evmHasMore }));
  } catch (err) {
    req.log.error({ err, address, chain }, `[${chain.toUpperCase()}] transactions fetch failed — returning empty list`);
    res.json(GetWalletTransactionsResponse.parse({ transactions: [], total: 0, page, limit, nextCursor: null, hasMore: false }));
  }
});

// ─── GET /wallets/:address/connections ────────────────────────────────────

router.get("/wallets/:address/connections", async (req, res): Promise<void> => {
  const params = GetWalletConnectionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const query = GetWalletConnectionsQueryParams.safeParse(req.query);
  const chain = query.success ? query.data.chain : "ethereum";
  const evmChainsConn = ["ethereum", "polygon", "bsc"];
  const rawAddressConn = params.data.address;

  const sanitizedConn = sanitizeAddress(rawAddressConn);
  if (!sanitizedConn) {
    res.status(400).json({ error: "invalid_address", message: "Address contains invalid characters or is out of range" });
    return;
  }
  const address = evmChainsConn.includes(chain) ? sanitizedConn.toLowerCase() : sanitizedConn;
  const priceUsd = PRICE_MAP[chain] ?? 1;

  // ── Cache check ────────────────────────────────────────────────────────────
  const cCacheKey = `c:${chain}:${address}`;
  const cCacheHit = connCache.get(cCacheKey);
  if (cCacheHit) { res.setHeader("X-Cache", "HIT"); res.json(cCacheHit); return; }
  interceptCache(res, connCache, cCacheKey, CONN_TTL);
  // ──────────────────────────────────────────────────────────────────────────

  const buildGraph = (
    peers: string[],
    edgeMap: Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>,
    center: string,
    txCount: number,
  ) => {
    const nodes = [center, ...peers].map((addr) => ({
      address: addr, label: addr === center ? "Target" : null,
      balance: "0.000000", transactionCount: 0, isContract: false,
      riskScore: addr === center ? computeRiskScore(txCount, []) : null,
    }));
    const peerSet = new Set([center, ...peers]);
    const edges = Array.from(edgeMap.entries())
      .filter(([key]) => { const [f, t] = key.split(":"); return peerSet.has(f) && peerSet.has(t); })
      .map(([key, info]) => {
        const [from, to] = key.split(":");
        return { from, to, totalValue: info.totalValue, totalValueUsd: info.totalValueUsd, transactionCount: info.count, lastSeen: info.lastSeen };
      });
    return { nodes, edges, centerAddress: center };
  };

  try {
    if (chain === "xrp") {
      const result = await xrplRpc("account_tx", { account: address, limit: 20, forward: false });
      const rawTxs = (result["transactions"] as Array<Record<string, unknown>>) ?? [];
      const peerSet = new Set<string>();
      const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();

      for (const entry of rawTxs) {
        const tx = (entry["tx"] ?? entry["transaction"] ?? entry) as Record<string, unknown>;
        const meta = (entry["meta"] ?? entry["metadata"]) as Record<string, unknown> | undefined;
        const from = String(tx["Account"] ?? "");
        const to = String(tx["Destination"] ?? "");
        if (!from || !to) continue;
        peerSet.add(from); peerSet.add(to);
        const rawDeliveredConn = meta?.["delivered_amount"] ?? tx["Amount"];
        let val: number;
        if (typeof rawDeliveredConn === "object" && rawDeliveredConn !== null) {
          val = parseFloat(String((rawDeliveredConn as Record<string, unknown>)["value"] ?? "0"));
        } else {
          const deliveredStr = String(rawDeliveredConn ?? "0");
          val = /^\d+$/.test(deliveredStr) ? Number(deliveredStr) / 1e6 : 0;
        }
        const dateVal = tx["date"] as number | undefined;
        const ts = dateVal ? new Date((dateVal + 946684800) * 1000).toISOString() : new Date().toISOString();
        const key = `${from}:${to}`;
        const ex = edgeMap.get(key);
        if (ex) { ex.totalValueUsd += val * priceUsd; ex.count += 1; ex.lastSeen = ts; }
        else edgeMap.set(key, { totalValue: val.toFixed(6), totalValueUsd: val * priceUsd, count: 1, lastSeen: ts });
      }

      const peers = Array.from(peerSet).filter((p) => p !== address).slice(0, 10);
      res.json(GetWalletConnectionsResponse.parse(buildGraph(peers, edgeMap, address, rawTxs.length)));
      return;
    }

    if (chain === "bitcoin") {
      const txs = await btcFetchTxs(address);
      const peerSet = new Set<string>();
      const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();
      for (const tx of txs.slice(0, 20)) {
        const parsed = parseBtcTx(tx, address, priceUsd);
        if (!parsed.from || !parsed.to) continue;
        peerSet.add(parsed.from); peerSet.add(parsed.to);
        const key = `${parsed.from}:${parsed.to}`;
        const val = parseFloat(parsed.value);
        const ex = edgeMap.get(key);
        if (ex) { ex.totalValueUsd += val * priceUsd; ex.count += 1; ex.lastSeen = parsed.timestamp; }
        else edgeMap.set(key, { totalValue: parsed.value, totalValueUsd: val * priceUsd, count: 1, lastSeen: parsed.timestamp });
      }
      const peers = Array.from(peerSet).filter((p) => p !== address).slice(0, 10);
      res.json(GetWalletConnectionsResponse.parse(buildGraph(peers, edgeMap, address, txs.length)));
      return;
    }

    if (chain === "dag") {
      const data = await dagFetch(`/addresses/${address}/transactions?limit=30`);
      const rawTxs = (data["data"] as Array<Record<string, unknown>>) ?? [];
      const peerSet = new Set<string>();
      const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();

      for (const tx of rawTxs) {
        const fromAddr = String(tx["source"] ?? "");
        const toAddr = String(tx["destination"] ?? "");
        if (!fromAddr || !toAddr) continue;
        peerSet.add(fromAddr); peerSet.add(toAddr);
        const val = Number(tx["amount"] ?? 0) / 1e8;
        const ts = tx["timestamp"] ? new Date(String(tx["timestamp"])).toISOString() : new Date().toISOString();
        const key = `${fromAddr}:${toAddr}`;
        const ex = edgeMap.get(key);
        if (ex) { ex.totalValueUsd += val * priceUsd; ex.count += 1; ex.lastSeen = ts; }
        else edgeMap.set(key, { totalValue: val.toFixed(8), totalValueUsd: val * priceUsd, count: 1, lastSeen: ts });
      }

      const peers = Array.from(peerSet).filter((p) => p !== address).slice(0, 10);
      res.json(GetWalletConnectionsResponse.parse(buildGraph(peers, edgeMap, address, rawTxs.length)));
      return;
    }

    if (chain === "xlm") {
      const data = await stellarFetch(`/accounts/${address}/operations?limit=30&order=desc&join=transactions`);
      const records = ((data["_empty"] ? [] : (data["_embedded"] as Record<string, unknown> | undefined)?.["records"]) as Array<Record<string, unknown>>) ?? [];
      const peerSet = new Set<string>();
      const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();
      for (const rec of records) {
        const parsed = parseStellarOp(rec, address, priceUsd);
        if (!parsed || !parsed.from || !parsed.to) continue;
        peerSet.add(parsed.from); peerSet.add(parsed.to);
        const val = parseFloat(parsed.value);
        const key = `${parsed.from}:${parsed.to}`;
        const ex = edgeMap.get(key);
        if (ex) { ex.totalValueUsd += val * priceUsd; ex.count += 1; ex.lastSeen = parsed.timestamp; }
        else edgeMap.set(key, { totalValue: parsed.value, totalValueUsd: val * priceUsd, count: 1, lastSeen: parsed.timestamp });
      }
      const peers = Array.from(peerSet).filter((p) => p !== address).slice(0, 10);
      res.json(GetWalletConnectionsResponse.parse(buildGraph(peers, edgeMap, address, records.length)));
      return;
    }

    if (chain === "xdc") {
      const rpcAddr = normalizeXdcAddress(address);
      let txData: Record<string, unknown>[] = [];
      try {
        const bsData = await xdcBlocksScanFetch({
          module: "account", action: "txlist",
          address: rpcAddr, page: "1", offset: "50", sort: "desc",
        });
        txData = Array.isArray(bsData["result"]) ? bsData["result"] as Record<string, unknown>[] : [];
      } catch (xdcErr) {
        console.warn(`[XDC] BlocksScan connections failed: ${xdcErr instanceof Error ? xdcErr.message : String(xdcErr)}`);
        if (COINSTATS_KEY) {
          try {
            const data = await coinstatsFetch(`/wallet/transactions?address=${encodeURIComponent(address)}&connectionId=xdce-crowd-sale&limit=30`);
            const csTxs = (data["transactions"] as Array<Record<string, unknown>>) ?? [];
            const peerSet = new Set<string>();
            const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();
            for (const tx of csTxs) {
              const from = String(tx["from"] ?? tx["sender"] ?? "").toLowerCase();
              const to = String(tx["to"] ?? tx["receiver"] ?? "").toLowerCase();
              if (!from || !to) continue;
              peerSet.add(from); peerSet.add(to);
              const val = parseFloat(String(tx["amount"] ?? tx["value"] ?? "0"));
              const ts = tx["date"] ? new Date(String(tx["date"])).toISOString() : new Date().toISOString();
              const key = `${from}:${to}`;
              const ex = edgeMap.get(key);
              if (ex) { ex.totalValueUsd += val * priceUsd; ex.count += 1; ex.lastSeen = ts; }
              else edgeMap.set(key, { totalValue: val.toFixed(6), totalValueUsd: val * priceUsd, count: 1, lastSeen: ts });
            }
            const peers = Array.from(peerSet).filter((p) => p !== rpcAddr.toLowerCase()).slice(0, 10);
            res.json(GetWalletConnectionsResponse.parse(buildGraph(peers, edgeMap, rpcAddr.toLowerCase(), csTxs.length)));
            return;
          } catch { /* CoinStats also failed — fall through to empty graph */ }
        }
      }
      const peerSet = new Set<string>();
      const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();
      for (const tx of txData) {
        const from = String(tx["from"] ?? "").toLowerCase();
        const to = String(tx["to"] ?? "").toLowerCase();
        if (!from || !to) continue;
        peerSet.add(from); peerSet.add(to);
        const rawVal = String(tx["value"] ?? "0");
        const val = Number(BigInt(rawVal === "" ? "0" : rawVal)) / 1e18;
        const ts = new Date(Number(tx["timeStamp"]) * 1000).toISOString();
        const key = `${from}:${to}`;
        const ex = edgeMap.get(key);
        if (ex) { ex.totalValueUsd += val * priceUsd; ex.count += 1; ex.lastSeen = ts; }
        else edgeMap.set(key, { totalValue: val.toFixed(6), totalValueUsd: val * priceUsd, count: 1, lastSeen: ts });
      }
      const peers = Array.from(peerSet).filter((p) => p !== rpcAddr.toLowerCase()).slice(0, 10);
      res.json(GetWalletConnectionsResponse.parse(buildGraph(peers, edgeMap, rpcAddr.toLowerCase(), txData.length)));
      return;
    }

    if (chain === "hbar") {
      try {
        // Fetch recent txs for connection graph
        const acctData = await hbarFetch(`/api/v1/accounts/${address}`);
        const createdTs = String(acctData["created_timestamp"] ?? "0").split(".")[0];
        const txData = await hbarFetch(
          `/api/v1/transactions?account.id=${address}&order=asc&timestamp=gte:${createdTs}&limit=50`
        );
        const rawTxs = (txData["transactions"] as Record<string, unknown>[]) ?? [];
        const peerSet = new Set<string>();
        const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();
        for (const tx of rawTxs) {
          const transfers = (tx["transfers"] as Record<string, unknown>[]) ?? [];
          const net = hbarNetAmount(transfers, address);
          const isOutgoing = net < 0;
          const counterparty = hbarCounterparty(transfers, address, isOutgoing);
          if (!counterparty) continue;
          peerSet.add(counterparty);
          const absHbar = Math.abs(net) / 1e8;
          const ts = new Date(Number(String(tx["consensus_timestamp"] ?? "0").split(".")[0]) * 1000).toISOString();
          const from = isOutgoing ? address : counterparty;
          const to = isOutgoing ? counterparty : address;
          const key = `${from}:${to}`;
          const ex = edgeMap.get(key);
          if (ex) { ex.totalValueUsd += absHbar * priceUsd; ex.count += 1; ex.lastSeen = ts; }
          else edgeMap.set(key, { totalValue: absHbar.toFixed(6), totalValueUsd: absHbar * priceUsd, count: 1, lastSeen: ts });
        }
        const peers = Array.from(peerSet).filter((p) => p !== address).slice(0, 10);
        res.json(GetWalletConnectionsResponse.parse(buildGraph(peers, edgeMap, address, rawTxs.length)));
      } catch (err) {
        req.log.error({ err, address, chain: "hbar" }, "[HBAR] connections fetch failed");
        res.json(GetWalletConnectionsResponse.parse(buildGraph([], new Map(), address, 0)));
      }
      return;
    }

    if (COINSTATS_CHAINS.includes(chain)) {
      const connectionId = COIN_ID_MAP[chain] ?? chain;
      const data = await coinstatsFetch(`/wallet/transactions?address=${encodeURIComponent(address)}&connectionId=${connectionId}&limit=30`);
      const rawTxs = (data["transactions"] as Array<Record<string, unknown>>) ?? [];
      const peerSet = new Set<string>();
      const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();

      for (const tx of rawTxs) {
        // Preserve original casing — XRP/XLM/HBAR addresses are case-sensitive
        const fromAddr = String(tx["from"] ?? tx["sender"] ?? address);
        const toAddr = String(tx["to"] ?? tx["receiver"] ?? "");
        if (!toAddr) continue;
        peerSet.add(fromAddr); peerSet.add(toAddr);
        const val = parseFloat(String(tx["amount"] ?? tx["value"] ?? "0"));
        const ts = tx["date"] ? new Date(String(tx["date"])).toISOString() : new Date().toISOString();
        const key = `${fromAddr}:${toAddr}`;
        const ex = edgeMap.get(key);
        if (ex) { ex.totalValueUsd += val * priceUsd; ex.count += 1; ex.lastSeen = ts; }
        else edgeMap.set(key, { totalValue: val.toFixed(6), totalValueUsd: val * priceUsd, count: 1, lastSeen: ts });
      }

      const peers = Array.from(peerSet).filter((p) => p !== address).slice(0, 10);
      res.json(GetWalletConnectionsResponse.parse(buildGraph(peers, edgeMap, address, rawTxs.length)));
      return;
    }

    if (BLOCKSCOUT_BASES[chain]) {
      // ETH / Polygon — Blockscout v2 (no API key required)
      const { items } = await blockscoutFetchTxs(address, chain);
      const peerSet = new Set<string>();
      const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();
      for (const tx of items) {
        const from = String((tx["from"] as Record<string, unknown> | null)?.["hash"] ?? "").toLowerCase();
        const toRaw = tx["to"] as Record<string, unknown> | null;
        const to = toRaw?.["hash"] != null ? String(toRaw["hash"]).toLowerCase() : null;
        if (!from || !to) continue;
        peerSet.add(from); peerSet.add(to);
        const weiValue = String(tx["value"] ?? "0");
        const ts = String(tx["timestamp"] ?? new Date().toISOString());
        const key = `${from}:${to}`;
        const ex = edgeMap.get(key);
        if (ex) { ex.totalValueUsd += weiToUsd(weiValue, priceUsd); ex.count += 1; ex.lastSeen = ts; }
        else edgeMap.set(key, { totalValue: weiToEth(weiValue), totalValueUsd: weiToUsd(weiValue, priceUsd), count: 1, lastSeen: ts });
      }
      const peers = Array.from(peerSet).filter((p) => p !== address).slice(0, 10);
      res.json(GetWalletConnectionsResponse.parse(buildGraph(peers, edgeMap, address, items.length)));
      return;
    }

    // BSC (and any future EVM chain) — Etherscan-style (requires API key)
    const data = await etherscanFetch({
      module: "account", action: "txlist",
      address, startblock: "0", endblock: "99999999", page: "1", offset: "50", sort: "desc",
    }, chain);

    const txData = Array.isArray(data["result"]) ? (data["result"] as Array<Record<string, unknown>>) : [];
    const peerSet = new Set<string>();
    const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();

    for (const tx of txData) {
      const from = String(tx["from"] ?? "").toLowerCase();
      const to = String(tx["to"] ?? "").toLowerCase();
      const value = BigInt(String(tx["value"] ?? "0"));
      const ts = new Date(Number(tx["timeStamp"]) * 1000).toISOString();
      if (!from || !to) continue;
      peerSet.add(from); peerSet.add(to);
      const key = `${from}:${to}`;
      const ex = edgeMap.get(key);
      if (ex) { ex.totalValueUsd += weiToUsd(String(value), priceUsd); ex.count += 1; ex.lastSeen = ts; }
      else edgeMap.set(key, {
        totalValue: weiToEth(String(value)),
        totalValueUsd: weiToUsd(String(value), priceUsd),
        count: 1, lastSeen: ts,
      });
    }

    const peers = Array.from(peerSet).filter((p) => p !== address).slice(0, 10);
    res.json(GetWalletConnectionsResponse.parse(buildGraph(peers, edgeMap, address, txData.length)));
  } catch (err) {
    req.log.error({ err, address, chain }, `[${chain.toUpperCase()}] connections fetch failed — returning empty graph`);
    res.json(GetWalletConnectionsResponse.parse(buildGraph([], new Map(), address, 0)));
  }
});

export default router;
