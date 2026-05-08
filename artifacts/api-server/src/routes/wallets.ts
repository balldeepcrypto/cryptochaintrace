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

async function btcFetch(address: string): Promise<Record<string, unknown>> {
  const resp = await fetch(`https://blockchain.info/rawaddr/${address}?limit=50`);
  if (!resp.ok) throw new Error(`Blockchain.info request failed: ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
}

async function xrpFetch(address: string, limit = 50): Promise<Record<string, unknown>> {
  const resp = await fetch(`https://api.xrpl.org/v2/accounts/${address}/transactions?limit=${limit}`);
  if (!resp.ok) throw new Error(`XRPL request failed: ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
}

async function xrpAccountFetch(address: string): Promise<Record<string, unknown>> {
  const resp = await fetch(`https://api.xrpl.org/v2/accounts/${address}`);
  if (!resp.ok) throw new Error(`XRPL account request failed: ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
}

async function coinstatsFetch(path: string): Promise<Record<string, unknown>> {
  const resp = await fetch(`https://openapiv1.coinstats.app${path}`, {
    headers: { "X-API-KEY": COINSTATS_KEY, accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`CoinStats request failed: ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
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
      const [acctData, txData] = await Promise.all([
        xrpAccountFetch(address),
        xrpFetch(address, 5),
      ]);
      const acct = (acctData["account_data"] ?? {}) as Record<string, unknown>;
      const balanceDrops = String(acct["Balance"] ?? "0");
      const balance = dropToXrp(balanceDrops);
      const balanceUsd = parseFloat((parseFloat(balance) * priceUsd).toFixed(2));
      const txs = (txData["transactions"] as Array<Record<string, unknown>>) ?? [];
      const firstSeen = txs.length > 0 ? String(txs[txs.length - 1]["date"] ?? "") : null;
      const lastSeen = txs.length > 0 ? String(txs[0]["date"] ?? "") : null;
      const txCount = Number(acctData["ledger_index"] ?? 0);
      const tags = guessTags(false, txCount);
      res.json(GetWalletResponse.parse({
        address, chain, balance, balanceUsd, transactionCount: txCount,
        firstSeen, lastSeen, tags, riskScore: computeRiskScore(txCount, tags), isContract: false,
      }));
      return;
    }

    if (chain === "bitcoin") {
      const data = await btcFetch(address);
      const n_tx = (data["n_tx"] as number) ?? 0;
      const balance = satToBtc(String(data["final_balance"] ?? "0"));
      const balanceUsd = parseFloat((parseFloat(balance) * priceUsd).toFixed(2));
      const txs = (data["txs"] as Array<Record<string, unknown>>) ?? [];
      const firstSeen = txs.length > 0 ? new Date(Number(txs[txs.length - 1]["time"]) * 1000).toISOString() : null;
      const lastSeen = txs.length > 0 ? new Date(Number(txs[0]["time"]) * 1000).toISOString() : null;
      const tags = guessTags(false, n_tx);
      res.json(GetWalletResponse.parse({
        address, chain, balance, balanceUsd, transactionCount: n_tx,
        firstSeen, lastSeen, tags, riskScore: computeRiskScore(n_tx, tags), isContract: false,
      }));
      return;
    }

    if (["xlm", "hbar", "xdc", "dag"].includes(chain)) {
      const connectionId = COIN_ID_MAP[chain] ?? chain;
      try {
        const data = await coinstatsFetch(`/wallet/balance?address=${address}&connectionId=${connectionId}`);
        const balance = parseFloat(String(data["balance"] ?? "0")).toFixed(6);
        const balanceUsd = parseFloat((parseFloat(balance) * priceUsd).toFixed(2));
        const tags = guessTags(false, 0);
        res.json(GetWalletResponse.parse({
          address, chain, balance, balanceUsd, transactionCount: 0,
          firstSeen: null, lastSeen: null, tags, riskScore: null, isContract: false,
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
  const limit = query.success ? query.data.limit : 20;
  const address = params.data.address.toLowerCase();
  const priceUsd = PRICE_MAP[chain] ?? 1;

  try {
    if (chain === "xrp") {
      const data = await xrpFetch(address, 100);
      const rawTxs = (data["transactions"] as Array<Record<string, unknown>>) ?? [];
      const total = rawTxs.length;
      const paginated = rawTxs.slice((page - 1) * limit, page * limit);

      const transactions = paginated.map((entry) => {
        const tx = (entry["tx"] ?? entry) as Record<string, unknown>;
        const meta = entry["meta"] as Record<string, unknown> | undefined;
        const deliveredAmt = String(meta?.["delivered_amount"] ?? tx["Amount"] ?? "0");
        const value = /^\d+$/.test(deliveredAmt) ? dropToXrp(deliveredAmt) : "0.000000";
        const valueUsd = parseFloat((parseFloat(value) * priceUsd).toFixed(2));
        const from = String(tx["Account"] ?? "");
        const to = String(tx["Destination"] ?? "");
        const direction = from.toLowerCase() === address ? (to.toLowerCase() === address ? "self" : "out") : "in";
        const dateVal = tx["date"] as number | undefined;
        const timestamp = dateVal ? new Date((dateVal + 946684800) * 1000).toISOString() : new Date().toISOString();
        const feeDrops = String(tx["Fee"] ?? "0");
        const fee = dropToXrp(feeDrops);
        return {
          hash: String(tx["hash"] ?? ""),
          from, to: to || null, value, valueUsd, fee,
          feeUsd: parseFloat((parseFloat(fee) * priceUsd).toFixed(4)),
          timestamp,
          blockNumber: Number(tx["ledger_index"] ?? 0),
          status: ((meta?.["TransactionResult"] as string | undefined) === "tesSUCCESS" ? "success" : "failed") as "success" | "failed",
          direction: direction as "in" | "out" | "self",
          tokenSymbol: String(tx["TransactionType"] ?? "XRP"),
          tokenName: null,
        };
      });

      res.json(GetWalletTransactionsResponse.parse({ transactions, total, page, limit }));
      return;
    }

    if (chain === "bitcoin") {
      const data = await btcFetch(address);
      const txs = (data["txs"] as Array<Record<string, unknown>>) ?? [];
      const total = (data["n_tx"] as number) ?? txs.length;
      const paginated = txs.slice((page - 1) * limit, page * limit);

      const transactions = paginated.map((tx) => {
        const inputs = (tx["inputs"] as Array<Record<string, unknown>>) ?? [];
        const out = (tx["out"] as Array<Record<string, unknown>>) ?? [];
        const isFrom = inputs.some((i) => {
          const prev = i["prev_out"] as Record<string, unknown> | undefined;
          return prev?.["addr"] === address;
        });
        const valueSat = out.reduce((sum, o) => sum + Number(o["value"] ?? 0), 0);
        const value = satToBtc(valueSat);
        const valueUsd = parseFloat((parseFloat(value) * priceUsd).toFixed(2));
        const feeSat = (tx["fee"] as number) ?? 0;
        const fee = satToBtc(feeSat);
        const toAddr = out.map((o) => o["addr"] as string).filter(Boolean)[0] ?? null;
        const direction = isFrom ? (toAddr === address ? "self" : "out") : "in";
        return {
          hash: String(tx["hash"]),
          from: inputs[0] ? String((inputs[0]["prev_out"] as Record<string, unknown>)?.["addr"] ?? "coinbase") : "coinbase",
          to: toAddr, value, valueUsd, fee,
          feeUsd: parseFloat((parseFloat(fee) * priceUsd).toFixed(2)),
          timestamp: new Date(Number(tx["time"]) * 1000).toISOString(),
          blockNumber: Number(tx["block_height"] ?? 0),
          status: "success" as const,
          direction: direction as "in" | "out" | "self",
          tokenSymbol: null, tokenName: null,
        };
      });

      res.json(GetWalletTransactionsResponse.parse({ transactions, total, page, limit }));
      return;
    }

    if (["xlm", "hbar", "xdc", "dag"].includes(chain)) {
      const connectionId = COIN_ID_MAP[chain] ?? chain;
      const data = await coinstatsFetch(
        `/wallet/transactions?address=${address}&connectionId=${connectionId}&limit=${limit}`
      );
      const rawTxs = (data["transactions"] as Array<Record<string, unknown>>) ?? [];
      const seen = new Set<string>();
      const deduplicated = rawTxs.filter((tx) => {
        const hash = String(tx["hash"] ?? tx["txid"] ?? tx["id"] ?? Math.random());
        if (seen.has(hash)) return false;
        seen.add(hash);
        return true;
      });

      const transactions = deduplicated.map((tx) => {
        const value = parseFloat(String(tx["amount"] ?? "0")).toFixed(6);
        const valueUsd = parseFloat((parseFloat(value) * priceUsd).toFixed(2));
        const fromAddr = String(tx["from"] ?? address);
        const toAddr = String(tx["to"] ?? "");
        const direction = fromAddr.toLowerCase() === address ? "out" : "in";
        return {
          hash: String(tx["hash"] ?? tx["txid"] ?? tx["id"] ?? ""),
          from: fromAddr, to: toAddr || null, value, valueUsd,
          fee: "0.000000", feeUsd: 0,
          timestamp: tx["date"] ? new Date(String(tx["date"])).toISOString() : new Date().toISOString(),
          blockNumber: Number(tx["blockNumber"] ?? 0),
          status: "success" as const,
          direction: direction as "in" | "out" | "self",
          tokenSymbol: chain.toUpperCase(), tokenName: null,
        };
      });

      res.json(GetWalletTransactionsResponse.parse({ transactions, total: transactions.length, page, limit }));
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

    const total = transactions.length < limit ? (page - 1) * limit + transactions.length : page * limit + 1;
    res.json(GetWalletTransactionsResponse.parse({ transactions, total, page, limit }));
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
  const address = params.data.address.toLowerCase();
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
      const data = await xrpFetch(address, 50);
      const rawTxs = (data["transactions"] as Array<Record<string, unknown>>) ?? [];
      const peerSet = new Set<string>();
      const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();

      for (const entry of rawTxs) {
        const tx = (entry["tx"] ?? entry) as Record<string, unknown>;
        const meta = entry["meta"] as Record<string, unknown> | undefined;
        const from = String(tx["Account"] ?? "").toLowerCase();
        const to = String(tx["Destination"] ?? "").toLowerCase();
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
      const data = await btcFetch(address);
      const txs = (data["txs"] as Array<Record<string, unknown>>) ?? [];
      const peerSet = new Set<string>();
      const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();

      for (const tx of txs.slice(0, 20)) {
        const inputs = (tx["inputs"] as Array<Record<string, unknown>>) ?? [];
        const outs = (tx["out"] as Array<Record<string, unknown>>) ?? [];
        const fromAddr = inputs[0] ? String((inputs[0]["prev_out"] as Record<string, unknown>)?.["addr"] ?? "") : "";
        for (const o of outs) {
          const toAddr = String(o["addr"] ?? "");
          const val = Number(o["value"] ?? 0) / 1e8;
          if (!toAddr || toAddr === fromAddr) continue;
          peerSet.add(fromAddr); peerSet.add(toAddr);
          const key = `${fromAddr}:${toAddr}`;
          const ex = edgeMap.get(key);
          if (ex) { ex.totalValueUsd += val * priceUsd; ex.count += 1; }
          else edgeMap.set(key, { totalValue: val.toFixed(8), totalValueUsd: val * priceUsd, count: 1, lastSeen: new Date().toISOString() });
        }
      }

      const peers = Array.from(peerSet).filter((p) => p !== address).slice(0, 10);
      res.json(GetWalletConnectionsResponse.parse(buildGraph(peers, edgeMap, address, txs.length)));
      return;
    }

    if (["xlm", "hbar", "xdc", "dag"].includes(chain)) {
      const connectionId = COIN_ID_MAP[chain] ?? chain;
      const data = await coinstatsFetch(`/wallet/transactions?address=${address}&connectionId=${connectionId}&limit=30`);
      const rawTxs = (data["transactions"] as Array<Record<string, unknown>>) ?? [];
      const peerSet = new Set<string>();
      const edgeMap = new Map<string, { totalValue: string; totalValueUsd: number; count: number; lastSeen: string }>();

      for (const tx of rawTxs) {
        const fromAddr = String(tx["from"] ?? address).toLowerCase();
        const toAddr = String(tx["to"] ?? "").toLowerCase();
        if (!toAddr) continue;
        peerSet.add(fromAddr); peerSet.add(toAddr);
        const val = parseFloat(String(tx["amount"] ?? "0"));
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
