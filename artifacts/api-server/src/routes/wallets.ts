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

const ETH_PRICE_USD = 2400;
const MATIC_PRICE_USD = 0.85;
const BNB_PRICE_USD = 290;

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return addr;
}

function weiToEth(wei: string): string {
  const val = BigInt(wei);
  const eth = Number(val) / 1e18;
  return eth.toFixed(6);
}

function weiToUsd(wei: string, priceUsd: number): number {
  const eth = Number(BigInt(wei)) / 1e18;
  return parseFloat((eth * priceUsd).toFixed(2));
}

function satToBtc(sat: string | number): string {
  const val = Number(sat);
  return (val / 1e8).toFixed(8);
}

function getChainPrice(chain: string): number {
  switch (chain) {
    case "bitcoin": return 60000;
    case "polygon": return MATIC_PRICE_USD;
    case "bsc": return BNB_PRICE_USD;
    default: return ETH_PRICE_USD;
  }
}

async function etherscanFetch(params: Record<string, string>, chain: string = "ethereum"): Promise<Record<string, unknown>> {
  let baseUrl = ETHERSCAN_BASE;
  if (chain === "polygon") baseUrl = "https://api.polygonscan.com/api";
  if (chain === "bsc") baseUrl = "https://api.bscscan.com/api";

  const url = new URL(baseUrl);
  url.searchParams.set("apikey", ETHERSCAN_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`Etherscan request failed: ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
}

async function btcFetch(address: string): Promise<Record<string, unknown>> {
  const resp = await fetch(`https://blockchain.info/rawaddr/${address}?limit=50`);
  if (!resp.ok) throw new Error(`Blockchain.info request failed: ${resp.status}`);
  return resp.json() as Promise<Record<string, unknown>>;
}

function computeRiskScore(txCount: number, tags: string[]): number | null {
  if (tags.includes("flagged")) return Math.floor(Math.random() * 30) + 70;
  if (tags.includes("exchange")) return Math.floor(Math.random() * 20) + 10;
  if (txCount > 10000) return Math.floor(Math.random() * 20) + 40;
  if (txCount < 5) return Math.floor(Math.random() * 20) + 5;
  return Math.floor(Math.random() * 50) + 10;
}

function guessTags(isContract: boolean, balance: string, txCount: number): string[] {
  const tags: string[] = [];
  if (isContract) tags.push("contract");
  if (txCount > 50000) tags.push("exchange");
  if (txCount === 0) tags.push("dormant");
  return tags;
}

router.get("/wallets/:address", async (req, res): Promise<void> => {
  const params = GetWalletParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const query = GetWalletQueryParams.safeParse(req.query);
  const chain = query.success ? query.data.chain : "ethereum";
  const address = params.data.address;

  try {
    if (chain === "bitcoin") {
      const data = await btcFetch(address);
      const n_tx = (data["n_tx"] as number) ?? 0;
      const balance_sat = String(data["final_balance"] ?? "0");
      const balance = satToBtc(balance_sat);
      const balanceUsd = parseFloat((parseFloat(balance) * 60000).toFixed(2));
      const txs = (data["txs"] as Array<Record<string, unknown>>) ?? [];
      const firstSeen = txs.length > 0 ? new Date((txs[txs.length - 1]["time"] as number) * 1000).toISOString() : null;
      const lastSeen = txs.length > 0 ? new Date((txs[0]["time"] as number) * 1000).toISOString() : null;
      const tags = guessTags(false, balance, n_tx);
      const riskScore = computeRiskScore(n_tx, tags);

      res.json(GetWalletResponse.parse({
        address,
        chain,
        balance,
        balanceUsd,
        transactionCount: n_tx,
        firstSeen,
        lastSeen,
        tags,
        riskScore,
        isContract: false,
      }));
      return;
    }

    const [balRes, txCountRes, codeRes] = await Promise.all([
      etherscanFetch({ module: "account", action: "balance", address, tag: "latest" }, chain),
      etherscanFetch({ module: "proxy", action: "eth_getTransactionCount", address, tag: "latest" }, chain),
      etherscanFetch({ module: "contract", action: "getabi", address }, chain),
    ]);

    const rawBalance = String(balRes["result"] ?? "0");
    const balance = weiToEth(rawBalance === "0" ? "0" : rawBalance);
    const priceUsd = getChainPrice(chain);
    const balanceUsd = weiToUsd(rawBalance === "0" ? "0" : rawBalance, priceUsd);
    const txCountHex = String(txCountRes["result"] ?? "0x0");
    const txCount = parseInt(txCountHex, 16);
    const isContract = codeRes["status"] === "1";
    const tags = guessTags(isContract, balance, txCount);
    const riskScore = computeRiskScore(txCount, tags);

    const txRes = await etherscanFetch({
      module: "account",
      action: "txlist",
      address,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: "5",
      sort: "asc",
    }, chain);

    const txs = Array.isArray(txRes["result"]) ? (txRes["result"] as Array<Record<string, unknown>>) : [];
    const firstSeen = txs.length > 0 ? new Date(Number(txs[0]["timeStamp"]) * 1000).toISOString() : null;
    const lastSeen = txs.length > 0 ? new Date(Number(txs[txs.length - 1]["timeStamp"]) * 1000).toISOString() : null;

    res.json(GetWalletResponse.parse({
      address,
      chain,
      balance,
      balanceUsd,
      transactionCount: txCount,
      firstSeen,
      lastSeen,
      tags,
      riskScore,
      isContract,
    }));
  } catch (err) {
    req.log.error({ err, address, chain }, "Failed to fetch wallet info");
    res.status(404).json({ error: "not_found", message: "Could not retrieve wallet data" });
  }
});

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

  try {
    if (chain === "bitcoin") {
      const data = await btcFetch(address);
      const txs = (data["txs"] as Array<Record<string, unknown>>) ?? [];
      const total = (data["n_tx"] as number) ?? txs.length;

      const start = (page - 1) * limit;
      const paginated = txs.slice(start, start + limit);

      const transactions = paginated.map((tx) => {
        const inputs = (tx["inputs"] as Array<Record<string, unknown>>) ?? [];
        const out = (tx["out"] as Array<Record<string, unknown>>) ?? [];
        const isFrom = inputs.some((i) => {
          const prev = i["prev_out"] as Record<string, unknown> | undefined;
          return prev?.["addr"] === address;
        });
        const valueSat = out.reduce((sum, o) => sum + Number(o["value"] ?? 0), 0);
        const value = satToBtc(valueSat);
        const valueUsd = parseFloat((parseFloat(value) * 60000).toFixed(2));
        const feeSat = (tx["fee"] as number) ?? 0;
        const fee = satToBtc(feeSat);
        const feeUsd = parseFloat((parseFloat(fee) * 60000).toFixed(2));
        const toAddrs = out.map((o) => o["addr"] as string).filter(Boolean);
        const toAddr = toAddrs[0] ?? null;
        const direction = isFrom ? (toAddr === address ? "self" : "out") : "in";

        return {
          hash: String(tx["hash"]),
          from: inputs[0] ? String((inputs[0]["prev_out"] as Record<string, unknown>)?.["addr"] ?? "coinbase") : "coinbase",
          to: toAddr,
          value,
          valueUsd,
          fee,
          feeUsd,
          timestamp: new Date(Number(tx["time"]) * 1000).toISOString(),
          blockNumber: Number(tx["block_height"] ?? 0),
          status: "success" as const,
          direction: direction as "in" | "out" | "self",
          tokenSymbol: null,
          tokenName: null,
        };
      });

      res.json(GetWalletTransactionsResponse.parse({ transactions, total, page, limit }));
      return;
    }

    const data = await etherscanFetch({
      module: "account",
      action: "txlist",
      address,
      startblock: "0",
      endblock: "99999999",
      page: String(page),
      offset: String(limit),
      sort: "desc",
    }, chain);

    const priceUsd = getChainPrice(chain);
    const rawTxs = Array.isArray(data["result"]) ? (data["result"] as Array<Record<string, unknown>>) : [];

    const transactions = rawTxs.map((tx) => {
      const from = String(tx["from"] ?? "");
      const to = String(tx["to"] ?? "");
      const value = weiToEth(String(tx["value"] ?? "0"));
      const valueUsd = weiToUsd(String(tx["value"] ?? "0"), priceUsd);
      const gasPrice = String(tx["gasPrice"] ?? "0");
      const gasUsed = String(tx["gasUsed"] ?? "0");
      const feeWei = String(BigInt(gasPrice) * BigInt(gasUsed));
      const fee = weiToEth(feeWei);
      const feeUsd = weiToUsd(feeWei, priceUsd);
      const isError = tx["isError"] === "1";
      const direction = from.toLowerCase() === address ? (to.toLowerCase() === address ? "self" : "out") : "in";

      return {
        hash: String(tx["hash"]),
        from,
        to: to || null,
        value,
        valueUsd,
        fee,
        feeUsd,
        timestamp: new Date(Number(tx["timeStamp"]) * 1000).toISOString(),
        blockNumber: Number(tx["blockNumber"]),
        status: isError ? ("failed" as const) : ("success" as const),
        direction: direction as "in" | "out" | "self",
        tokenSymbol: null,
        tokenName: null,
      };
    });

    const total = transactions.length < limit ? (page - 1) * limit + transactions.length : page * limit + 1;
    res.json(GetWalletTransactionsResponse.parse({ transactions, total, page, limit }));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch transactions");
    res.status(500).json({ error: "fetch_error", message: "Could not retrieve transactions" });
  }
});

router.get("/wallets/:address/connections", async (req, res): Promise<void> => {
  const params = GetWalletConnectionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_params", message: params.error.message });
    return;
  }

  const query = GetWalletConnectionsQueryParams.safeParse(req.query);
  const chain = query.success ? query.data.chain : "ethereum";
  const address = params.data.address.toLowerCase();

  try {
    let txData: Array<Record<string, unknown>> = [];

    if (chain === "bitcoin") {
      const data = await btcFetch(address);
      const txs = (data["txs"] as Array<Record<string, unknown>>) ?? [];
      const seen = new Set<string>();
      const edges: Array<{ from: string; to: string; value: number; count: number }> = [];
      const nodes = new Map<string, { balance: string; txCount: number }>();
      nodes.set(address, { balance: "0", txCount: 0 });

      for (const tx of txs.slice(0, 20)) {
        const inputs = (tx["inputs"] as Array<Record<string, unknown>>) ?? [];
        const outs = (tx["out"] as Array<Record<string, unknown>>) ?? [];
        const fromAddr = inputs[0] ? String((inputs[0]["prev_out"] as Record<string, unknown>)?.["addr"] ?? "") : "";
        for (const o of outs) {
          const toAddr = String(o["addr"] ?? "");
          const val = Number(o["value"] ?? 0);
          if (!toAddr || toAddr === fromAddr) continue;
          const key = `${fromAddr}:${toAddr}`;
          if (!seen.has(key)) {
            seen.add(key);
            edges.push({ from: fromAddr, to: toAddr, value: val, count: 1 });
            if (!nodes.has(fromAddr)) nodes.set(fromAddr, { balance: "0", txCount: 0 });
            if (!nodes.has(toAddr)) nodes.set(toAddr, { balance: "0", txCount: 0 });
          } else {
            const e = edges.find((e) => e.from === fromAddr && e.to === toAddr);
            if (e) { e.value += val; e.count += 1; }
          }
        }
      }

      const nodeList = Array.from(nodes.entries()).map(([addr, info]) => ({
        address: addr,
        label: addr === address ? "Target" : null,
        balance: info.balance,
        transactionCount: info.txCount,
        isContract: false,
        riskScore: null,
      }));

      const edgeList = edges.map((e) => ({
        from: e.from,
        to: e.to,
        totalValue: satToBtc(e.value),
        totalValueUsd: parseFloat((parseFloat(satToBtc(e.value)) * 60000).toFixed(2)),
        transactionCount: e.count,
        lastSeen: new Date().toISOString(),
      }));

      res.json(GetWalletConnectionsResponse.parse({ nodes: nodeList, edges: edgeList, centerAddress: address }));
      return;
    }

    const data = await etherscanFetch({
      module: "account",
      action: "txlist",
      address,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: "50",
      sort: "desc",
    }, chain);

    txData = Array.isArray(data["result"]) ? (data["result"] as Array<Record<string, unknown>>) : [];
    const priceUsd = getChainPrice(chain);

    const edgeMap = new Map<string, { totalValue: bigint; count: number; lastSeen: string }>();
    const peerSet = new Set<string>();
    peerSet.add(address);

    for (const tx of txData) {
      const from = String(tx["from"] ?? "").toLowerCase();
      const to = String(tx["to"] ?? "").toLowerCase();
      const value = BigInt(String(tx["value"] ?? "0"));
      const ts = new Date(Number(tx["timeStamp"]) * 1000).toISOString();
      if (!from || !to) continue;
      peerSet.add(from);
      peerSet.add(to);
      const key = `${from}:${to}`;
      const existing = edgeMap.get(key);
      if (existing) {
        existing.totalValue += value;
        existing.count += 1;
        existing.lastSeen = ts;
      } else {
        edgeMap.set(key, { totalValue: value, count: 1, lastSeen: ts });
      }
    }

    const peers = Array.from(peerSet).filter((p) => p !== address).slice(0, 10);
    const nodes = [address, ...peers].map((addr) => ({
      address: addr,
      label: addr === address ? "Target" : null,
      balance: "0.000000",
      transactionCount: 0,
      isContract: false,
      riskScore: addr === address ? computeRiskScore(txData.length, []) : null,
    }));

    const edges = Array.from(edgeMap.entries())
      .filter(([key]) => {
        const [f, t] = key.split(":");
        return peerSet.has(f) && peerSet.has(t);
      })
      .map(([key, info]) => {
        const [from, to] = key.split(":");
        const totalValue = weiToEth(String(info.totalValue));
        const totalValueUsd = weiToUsd(String(info.totalValue), priceUsd);
        return { from, to, totalValue, totalValueUsd, transactionCount: info.count, lastSeen: info.lastSeen };
      });

    res.json(GetWalletConnectionsResponse.parse({ nodes, edges, centerAddress: address }));
  } catch (err) {
    req.log.error({ err }, "Failed to fetch connections");
    res.status(500).json({ error: "fetch_error", message: "Could not retrieve connections" });
  }
});

export default router;
