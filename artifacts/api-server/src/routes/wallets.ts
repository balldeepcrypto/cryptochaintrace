import { Router, type IRouter } from "express";
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

// XRP uses XRPL JSON-RPC; DAG uses Constellation Network API; others use CoinStats
const COINSTATS_CHAINS = ["hbar", "xdc"];
const DAG_API = "https://be-mainnet.constellationnetwork.io";

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

async function etherscanFetch(params: Record<string, string>, chain: string): Promise<Record<string, unknown>> {
  let baseUrl = ETHERSCAN_BASE;
  if (chain === "polygon") baseUrl = "https://api.polygonscan.com/api";
  if (chain === "bsc") baseUrl = "https://api.bscscan.com/api";
  const url = new URL(baseUrl);
  url.searchParams.set("apikey", ETHERSCAN_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`Etherscan request failed: ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
}

// ── Blockstream.info BTC API (cursor-based, 25 txs/page, no overlap) ─────────
async function blockstreamAddress(address: string): Promise<Record<string, unknown>> {
  const resp = await fetchWithTimeout(`https://blockstream.info/api/address/${address}`, {}, 10000);
  if (!resp.ok) throw new Error(`Blockstream address API ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
}

async function blockstreamTxs(address: string, afterTxid?: string): Promise<Array<Record<string, unknown>>> {
  const path = afterTxid
    ? `/api/address/${address}/txs/chain/${afterTxid}`
    : `/api/address/${address}/txs`;
  const resp = await fetchWithTimeout(`https://blockstream.info${path}`, {}, 10000);
  if (!resp.ok) throw new Error(`Blockstream txs API ${resp.status}`);
  return resp.json() as Promise<Array<Record<string, unknown>>>;
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

// XRPL cluster JSON-RPC — publicly accessible on port 443
async function xrplRpc(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resp = await fetchWithTimeout(
    "https://xrplcluster.com/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params: [params] }),
    },
    8000,
  );
  if (!resp.ok) throw new Error(`XRPL cluster request failed: ${resp.status}`);
  const data = await resp.json() as Record<string, unknown>;
  const result = data["result"] as Record<string, unknown>;
  if (result?.["status"] === "error") throw new Error(`XRPL error: ${result["error_message"] ?? result["error"]}`);
  return result;
}

async function coinstatsFetch(path: string): Promise<Record<string, unknown>> {
  const resp = await fetchWithTimeout(`https://openapiv1.coinstats.app${path}`, {
    headers: { "X-API-KEY": COINSTATS_KEY, accept: "application/json" },
  }, 8000);
  if (!resp.ok) throw new Error(`CoinStats request failed: ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
}

// Constellation Network DAG public explorer API
async function dagFetch(path: string): Promise<Record<string, unknown>> {
  const resp = await fetchWithTimeout(`${DAG_API}${path}`, {
    headers: { accept: "application/json" },
  }, 25000);
  if (!resp.ok) throw new Error(`DAG API request failed: ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
}

function datumToDag(datum: number | string): string {
  return (Number(datum) / 1e8).toFixed(8);
}

// ── Stellar Horizon API (cursor-based via paging_token) ───────────────────
async function stellarFetch(path: string): Promise<Record<string, unknown>> {
  const resp = await fetchWithTimeout(`https://horizon.stellar.org${path}`, {
    headers: { accept: "application/json" },
  }, 12000);
  // 400 = invalid address format, 404 = account not found — return empty gracefully
  if (resp.status === 400 || resp.status === 404) return { _empty: true, _status: resp.status };
  if (!resp.ok) throw new Error(`Stellar Horizon request failed: ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
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
  tokenSymbol: string; tokenName: null;
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

  return {
    hash: String(rec["transaction_hash"] ?? ""),
    from, to, value, valueUsd,
    fee: "0.000001", feeUsd: parseFloat((0.000001 * priceUsd).toFixed(6)),
    timestamp: String(rec["created_at"] ?? new Date().toISOString()),
    blockNumber: 0, status: "success" as const,
    direction, tokenSymbol, tokenName: null,
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
  const address = params.data.address;
  const priceUsd = PRICE_MAP[chain] ?? 1;

  try {
    if (chain === "xrp") {
      const [acctResult, txResult] = await Promise.allSettled([
        xrplRpc("account_info", { account: address, ledger_index: "validated" }),
        xrplRpc("account_tx", { account: address, limit: 5, forward: false }),
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
      const toIso = (dateVal: unknown) =>
        dateVal ? new Date((Number(dateVal) + 946684800) * 1000).toISOString() : null;
      const firstTx = txsArr[txsArr.length - 1];
      const lastTx = txsArr[0];
      const firstSeen = toIso(firstTx ? (firstTx["tx"] as Record<string, unknown> | undefined)?.["date"] ?? firstTx["date"] : null);
      const lastSeen = toIso(lastTx ? (lastTx["tx"] as Record<string, unknown> | undefined)?.["date"] ?? lastTx["date"] : null);
      const txCount = acctResult.status === "fulfilled"
        ? Number(acctResult.value["ledger_index"] ?? 0)
        : txsArr.length;
      const tags = guessTags(false, txCount);
      res.json(GetWalletResponse.parse({
        address, chain, balance, balanceUsd, transactionCount: txCount,
        firstSeen, lastSeen, tags, riskScore: computeRiskScore(txCount, tags), isContract: false,
      }));
      return;
    }

    if (chain === "bitcoin") {
      const [addrData, recentTxs] = await Promise.all([
        blockstreamAddress(address),
        blockstreamTxs(address),
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
      const [acctResult, lastOpResult, firstOpResult] = await Promise.allSettled([
        stellarFetch(`/accounts/${address}`),
        stellarFetch(`/accounts/${address}/operations?limit=1&order=desc`),
        stellarFetch(`/accounts/${address}/operations?limit=1&order=asc`),
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
      const lastOpRecs = lastOpResult.status === "fulfilled"
        ? ((lastOpResult.value["_embedded"] as Record<string, unknown> | undefined)?.["records"] as Array<Record<string, unknown>>) ?? []
        : [];
      const firstOpRecs = firstOpResult.status === "fulfilled"
        ? ((firstOpResult.value["_embedded"] as Record<string, unknown> | undefined)?.["records"] as Array<Record<string, unknown>>) ?? []
        : [];
      const lastSeen = lastOpRecs[0]?.["created_at"] ? String(lastOpRecs[0]["created_at"]) : null;
      const firstSeen = firstOpRecs[0]?.["created_at"] ? String(firstOpRecs[0]["created_at"]) : null;
      const subentryCount = Number(acct["subentry_count"] ?? 0);
      const txCount = Math.max(subentryCount, lastOpRecs.length);
      const tags = guessTags(false, txCount);
      res.json(GetWalletResponse.parse({
        address, chain, balance, balanceUsd, transactionCount: txCount,
        firstSeen, lastSeen, tags, riskScore: computeRiskScore(txCount, tags), isContract: false,
      }));
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
      } catch {
        res.json(GetWalletResponse.parse({
          address, chain, balance: "0.000000", balanceUsd: 0, transactionCount: 0,
          firstSeen: null, lastSeen: null, tags: [], riskScore: null, isContract: false,
        }));
      }
      return;
    }

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
    req.log.error({ err, address, chain }, "Failed to fetch wallet info");
    res.status(404).json({ error: "not_found", message: "Could not retrieve wallet data" });
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
  const rawAddress = params.data.address;
  const address = evmChains.includes(chain) ? rawAddress.toLowerCase() : rawAddress;
  const priceUsd = PRICE_MAP[chain] ?? 1;

  try {
    if (chain === "xrp") {
      // Cursor is a JSON-encoded XRPL marker object
      const xrpMarker = cursorParam ? (() => { try { return JSON.parse(cursorParam); } catch { return undefined; } })() : undefined;
      const result = await xrplRpc("account_tx", {
        account: address,
        limit: Math.min(limit, 400),
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

      const total = Number(result["ledger_index_max"] ?? unique.length);

      const transactions = unique.map((entry) => {
        const tx = (entry["tx"] ?? entry["transaction"] ?? entry) as Record<string, unknown>;
        const meta = (entry["meta"] ?? entry["metadata"]) as Record<string, unknown> | undefined;
        const deliveredAmt = String(meta?.["delivered_amount"] ?? tx["Amount"] ?? "0");
        const value = /^\d+$/.test(deliveredAmt) ? dropToXrp(deliveredAmt) : "0.000000";
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
          tokenSymbol: "XRP", tokenName: null, memo, destinationTag,
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
      // Blockstream cursor: pass last txid as cursor → /txs/chain/{txid} for next page of 25
      const [txs, addrData] = await Promise.all([
        blockstreamTxs(address, cursorParam ?? undefined),
        blockstreamAddress(address),
      ]);
      const chainStats = (addrData["chain_stats"] as Record<string, unknown>) ?? {};
      const total = Number(chainStats["tx_count"] ?? txs.length);
      const transactions = txs.map((tx) => parseBtcTx(tx, address, priceUsd));
      const hasMore = txs.length === 25;
      const nextCursor = hasMore ? String(txs[txs.length - 1]["txid"] ?? "") : null;
      res.json(GetWalletTransactionsResponse.parse({ transactions, total, page, limit: 25, nextCursor, hasMore }));
      return;
    }

    if (chain === "xlm") {
      // Stellar Horizon operations endpoint — broader than /payments (catches path payments, merges, etc.)
      // cursor = paging_token of last record, up to 200 per page, no overlap
      const stellarLimit = Math.min(limit, 200);
      const path = `/accounts/${address}/operations?limit=${stellarLimit}&order=desc${cursorParam ? `&cursor=${encodeURIComponent(cursorParam)}` : ""}`;
      const data = await stellarFetch(path);
      if (data["_empty"]) {
        res.json(GetWalletTransactionsResponse.parse({ transactions: [], total: 0, page, limit: stellarLimit, nextCursor: null, hasMore: false }));
        return;
      }
      const records = ((data["_embedded"] as Record<string, unknown> | undefined)?.["records"] as Array<Record<string, unknown>>) ?? [];
      // Filter to value-bearing ops only (skip change_trust, manage_offer, etc.)
      const transactions = records.flatMap((rec) => {
        const parsed = parseStellarOp(rec, address, priceUsd);
        return parsed ? [parsed] : [];
      });
      const hasMore = records.length === stellarLimit;
      const lastRec = records[records.length - 1];
      const nextCursor = hasMore && lastRec ? String(lastRec["paging_token"] ?? "") : null;
      res.json(GetWalletTransactionsResponse.parse({ transactions, total: transactions.length, page, limit: stellarLimit, nextCursor, hasMore }));
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
    req.log.error({ err }, "Failed to fetch transactions");
    res.status(500).json({ error: "fetch_error", message: "Could not retrieve transactions" });
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
  const address = evmChainsConn.includes(chain) ? rawAddressConn.toLowerCase() : rawAddressConn;
  const priceUsd = PRICE_MAP[chain] ?? 1;

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
        const deliveredAmt = String(meta?.["delivered_amount"] ?? tx["Amount"] ?? "0");
        const val = /^\d+$/.test(deliveredAmt) ? Number(deliveredAmt) / 1e6 : 0;
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
      const txs = await blockstreamTxs(address);
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
      const data = await stellarFetch(`/accounts/${address}/operations?limit=30&order=desc`);
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
    req.log.error({ err }, "Failed to fetch connections");
    res.status(500).json({ error: "fetch_error", message: "Could not retrieve connections" });
  }
});

export default router;
