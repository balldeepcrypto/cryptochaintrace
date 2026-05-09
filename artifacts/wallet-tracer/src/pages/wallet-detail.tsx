import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetWallet,
  useGetWalletTransactions,
  getGetWalletQueryKey,
  getGetWalletTransactionsQueryKey,
} from "@workspace/api-client-react";
import { AddressDisplay } from "@/components/address-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftRight, ArrowDownLeft, ArrowUpRight,
  Network, GitFork, FileCode, Tag, ShieldAlert, ShieldCheck, Shield,
  ExternalLink, Users, ChevronRight, ChevronDown, Loader2,
  AlertTriangle, X, Zap, Bookmark, BookmarkCheck, Copy, Heart, MessageSquare,
  Plus, GitMerge, Layers,
} from "lucide-react";
import { Link } from "wouter";

// ─── Known entity labels ──────────────────────────────────────────────────────
const KNOWN_LABELS: Record<string, { label: string; type: "exchange" | "genesis" | "defi" | "flagged" }> = {
  // ── XRP ────────────────────────────────────────────────────────────────────
  rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh: { label: "XRP Genesis", type: "genesis" },
  r3kmLJN5D28dHuH8vZNUZpMC4JPgrKQBkR: { label: "Ripple Inc.", type: "genesis" },
  r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59: { label: "Ripple Cold 1", type: "genesis" },
  rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh: { label: "Bitstamp XRP",   type: "exchange" },
  rG6FZ31hDHN1K5Dkbma3PSB5uVCuVVRzfn: { label: "Bitfinex XRP",   type: "exchange" },
  rBndiPPKs9k5rjBb7HsEiqXKVZ9MMhGmhM: { label: "Kraken XRP",     type: "exchange" },
  rKmBGxocj9Abgy25J51Mk1iqFzW9aVF9Tc: { label: "Kraken XRP 2",   type: "exchange" },
  rLHzPsX6oXkzU2qL12kHCH8G8cnZv1rBJh: { label: "Binance XRP",    type: "exchange" },
  rrpNnNLKrartuEqfJGpqyDwPj1BBN1ybNn: { label: "Binance XRP 2",  type: "exchange" },
  rHXuEaRYnnJom5RS9K5pMrfFSmXwcjALBF: { label: "Coinbase XRP",   type: "exchange" },
  rJb5KsHsDHF1YS5B5DU6QCkH5NsPaKQTcy: { label: "OKX XRP",        type: "exchange" },
  rPVMhWBsfF9iMXYj3aAzJVkPDTFNSyWdKy: { label: "Huobi XRP",      type: "exchange" },
  r4FuDeXifHAZork5KcEQKKBqmBWPGiFmJC: { label: "Uphold XRP",     type: "exchange" },
  rMQ98K56yXJbDGv49ZSmW51sLn94Xe1mu1: { label: "Bitstamp XRP 2", type: "exchange" },
  rGFuMiw48HdbnrUbkRToR1yMBZkjbqvUhQ: { label: "MEXC XRP",       type: "exchange" },
  rHcFoo6a9qT5NHiVn1THwuhbekk8ovtWiL: { label: "Bybit XRP",      type: "exchange" },
  rNxp4h8apvRis6mJf9Sh8C6iRxfrDWN7AV: { label: "KuCoin XRP",     type: "exchange" },
  rGsxGQNdaDyFhZQ5JqDGPkT3VGFFexCaM3: { label: "Gate.io XRP",    type: "exchange" },
  rBx5RkPh2KR3JqBtZWoU25ZxGHaJzYMD84: { label: "KrakenXRP 3",    type: "exchange" },
  // ── XLM (Stellar) ──────────────────────────────────────────────────────────
  GDDEAH46MNFO6JD7NTQ5FWJBC4ZSA47YEK3RKFHQWADYTS6NDVD5NZN: { label: "Binance XLM",     type: "exchange" },
  GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN: { label: "Coinbase XLM",    type: "exchange" },
  GA5XIGA5C7QTPTWXQHY6T19HSGZDQXPKFBM7NZQND4KHZFVU5HY6KKK: { label: "Kraken XLM",     type: "exchange" },
  GAP5LETOV6YIE62YAM56STDANPRDO7ZFDBGSNHJQIYGGKSMOZAHOOS2S: { label: "Bitstamp XLM",    type: "exchange" },
  GBVOL67TMUQBGL4TZYNMY3ZQ5WGQYFPFD5VJRWXR72VA33VFNL225PL: { label: "Huobi XLM",       type: "exchange" },
  GBZ35ZJRIKJGYH5PBKLKOZ5L5GQXCDIARHV3LIJEV7MIRUCQIRLVVB6: { label: "Bitfinex XLM",    type: "exchange" },
  GCGNWKCJ3KHRLPM3TM6N7D3W5YKDJFL6A2YCXFXNMRTZ4Q66MEMGHMN: { label: "OKX XLM",         type: "exchange" },
  GDKIJJIKXLOM2NRMPNQZUUYK24ZPVFC6426GZAEP3KUK6KEJLACCWNMX: { label: "MEXC XLM",        type: "exchange" },
  GAHK7EEG2WWHVKDNT4CEQFZGKF2LGDSW2IVM4S5DP42RBW3K6BTODB4: { label: "Uphold XLM",      type: "exchange" },
  GCNSGHUCG5VMGLT5RIYYZSO7VQULQKAJ62QA7EC7KH6X7HJR3BXCRRY: { label: "KuCoin XLM",      type: "exchange" },
  GBUQWP3BOUZX34TOND2QV7QQ7K7VJTM6DBYRD3UI1FAB6B5OKKWKFKP: { label: "Bybit XLM",       type: "exchange" },
  GBEZDAOKKUDLLNR4EGZFGLCDBQBQLQCQS72LKRNKRUAWPDBPXJVBJV74: { label: "KuCoin XLM 2",    type: "exchange" },
  // Coinbase XLM (additional hot wallets)
  GA3CINHTGMUMRVPJPVHYJWQJ2EF7EX2PCRAFN4H4ZPO77WB6RHXEHMJT: { label: "Coinbase XLM 2",  type: "exchange" },
  GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37: { label: "Coinbase XLM 3",  type: "exchange" },
  GDT7ARDYZRBXXYOCSQ3MUMISTITSSRWZI6KR2A5L5Q3KB4QIZHGYMTIH: { label: "Coinbase XLM 4",  type: "exchange" },
  GCGMJ63NTBSQKW7OEQ3J2RZH6PYXSTEUK4TVE35IPXLB7XWNI2PUDCY6: { label: "Coinbase XLM 5",  type: "exchange" },
  GDUQXQAR4ECNAYCTGZAS4TH4KJJIZDLXPR5V2YYRFRGGQ3LTXBFTBVW6: { label: "Coinbase XLM 6",  type: "exchange" },
  GDF4UGQSY6VHWN7T4XJEZ6WYJEREMZYLNYZ5CCKYVS3V3MNYIBMTB354: { label: "Coinbase XLM 7",  type: "exchange" },
  // Bybit XLM (additional)
  GBDUXW4E5WRM5EM6UXBLE7Y5XGSXJX472BSSBPKFPQ3PJCJHRIA6SH4C: { label: "Bybit XLM 2",     type: "exchange" },
  // Uphold XLM (additional hot wallets)
  GBJDVTWUXRNDK35X7A6XYHB2XYXEM7XRH776KK6VYOYY5JL2PJCZPZ3O: { label: "Uphold XLM 2",    type: "exchange" },
  GBW5AENWI5PFJRYEIAIRYDB62MVEHDYHEBXKFN3TI64RSL2L6GYOYFG4: { label: "Uphold XLM 3",     type: "exchange" },
  // ── HBAR (Hedera) ──────────────────────────────────────────────────────────
  "0.0.23576":   { label: "Binance HBAR",   type: "exchange" },
  "0.0.726513":  { label: "OKX HBAR",       type: "exchange" },
  "0.0.3664683": { label: "Coinbase HBAR",  type: "exchange" },
  "0.0.1649540": { label: "KuCoin HBAR",    type: "exchange" },
  "0.0.3014985": { label: "Bybit HBAR",     type: "exchange" },
  "0.0.2764670": { label: "Uphold HBAR",    type: "exchange" },
  "0.0.34140":   { label: "Binance HBAR 2", type: "exchange" },
  "0.0.5094":    { label: "Hedera Foundation",   type: "genesis" },
  "0.0.98":      { label: "Hedera Fee Collector", type: "genesis" },
  "0.0.800":     { label: "Hedera Rewards",       type: "genesis" },
  // ── XDC (XinFin) ───────────────────────────────────────────────────────────
  xdc1c5808a8c6a24dd5e9d7af4c1bb92e3a7fcb5f55: { label: "Bitrue XDC",  type: "exchange" },
  xdcadf8f46f6d9b480e1f91c02c0cAfec9d37d3aa:   { label: "AscendEX XDC", type: "exchange" },
  xdc4a62f8ceEF3F2ea81E32e0EAce2e16e8c8BEbC54: { label: "KuCoin XDC",  type: "exchange" },
  xdc2a0f8B4D3ac1D66a72A0e29eCFd60b79Fe54f7Cc: { label: "Gate.io XDC", type: "exchange" },
  // ── Ethereum / EVM ─────────────────────────────────────────────────────────
  "0x28c6c06298d514db089934071355e5743bf21d60": { label: "Binance Hot", type: "exchange" },
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": { label: "Binance Cold", type: "exchange" },
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": { label: "Binance 2", type: "exchange" },
  "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8": { label: "Binance Cold 3", type: "exchange" },
  "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be": { label: "Binance Legacy", type: "exchange" },
  "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": { label: "Coinbase Hot", type: "exchange" },
  "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": { label: "Coinbase 2", type: "exchange" },
  "0x503828976d22510aad0201ac7ec88293211d23da": { label: "Coinbase 3", type: "exchange" },
  "0xd688aea8f7d450909adeb20364e860db13647ed7": { label: "Coinbase 4", type: "exchange" },
  "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": { label: "Kraken ETH", type: "exchange" },
  "0x2910543af39aba0cd09dbb2d50200b3e800a63d2": { label: "Kraken 2", type: "exchange" },
  "0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13": { label: "Kraken 3", type: "exchange" },
  "0x0681d8db095565fe8a346fa0277bffde9c0edbbf": { label: "OKX Hot", type: "exchange" },
  "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": { label: "OKX 2", type: "exchange" },
  "0xe93381fb4c4f14bda253907b18fad305d799241a": { label: "Huobi 1", type: "exchange" },
  "0x46705dfff24256421a05d056c29e81bdc09723b8": { label: "Huobi 2", type: "exchange" },
  "0xab5c66752a9e8167967685f1450532fb96d5d24f": { label: "Huobi 3", type: "exchange" },
  "0x77134cbc06cb00b66f4c7e623d5fdbf6777635ec": { label: "MEXC ETH", type: "exchange" },
  "0x4fdaf3ef3af2b3c3b4e5f94c0e6d70fed7b3c830": { label: "Bybit ETH", type: "exchange" },
  "0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2": { label: "FTX (defunct)", type: "flagged" },
  // ── Bitcoin ────────────────────────────────────────────────────────────────
  "1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s": { label: "Binance BTC Hot", type: "exchange" },
  "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": { label: "Binance BTC Cold", type: "exchange" },
  "bc1qgdjqv0av3q56jvd82tkdjpy7gd6f0tdn5n8vy5": { label: "BitMEX BTC", type: "exchange" },
  "3E35SFZkfLMGo4qX5aVs1iBnpEiFLSZmBP": { label: "Kraken BTC", type: "exchange" },
  "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h": { label: "Coinbase BTC", type: "exchange" },
  "3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS": { label: "Bitstamp BTC", type: "exchange" },
  "1LQoWist8KkaUXSPKZHNvEyfrEkPHzSsCd": { label: "Huobi BTC Cold", type: "exchange" },
  "1HckjUpRGcrrRAtFaaCAUaGjsPx9oYmLaZ": { label: "OKX BTC", type: "exchange" },
  "3QW95MafXv9SqkXxhpKBgqXCgVzugdwsGt": { label: "Bybit BTC", type: "exchange" },
  "385cR5DM96n1HvBDMDc1XnYedsFZa8zT4T": { label: "Bitfinex BTC", type: "exchange" },
  "1LdRcdxfbSnmCYYNdeYpUnztiYzVfBEQeC": { label: "Huobi BTC 2", type: "exchange" },
  "bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6": { label: "Robinhood BTC", type: "exchange" },
  // ── DAG (Constellation Network) ────────────────────────────────────────────
  // DOR Metagraph
  DAG0o6WSyvc7XfzujwJB1e25mfyzgXoLYDD6wqnk: { label: "DOR Metagraph",   type: "defi" },
  DAG4nBD5J3Pr2uHgtS1sa16PqemHrwCcvjdR31Xe: { label: "DOR Metagraph 2", type: "defi" },
  DAG4YD6rkExLwYyAZzwjYJMxe36PAptKuUKq9uc7: { label: "DOR Metagraph 3", type: "defi" },
  DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM: { label: "DOR Metagraph 4", type: "defi" },
  DAG5fqiGq9L5iLH5R5eV7gBjkucewrcaQ1jVnKYD: { label: "DOR Metagraph 5", type: "defi" },
  DAG5uDuGhPuh4mQZGNLFCEcdy69txSF4iSfFbdWJ: { label: "DOR Metagraph 6", type: "defi" },
  DAG6B5mBMoEu3Habtb2ts3QGUD2UquywrQSLSubU: { label: "DOR Metagraph 7", type: "defi" },
  // DTM Enterprise
  DAG8s4uKsTKV5hNVv9oHWophX1CYKVqJ88hM9MZE: { label: "DTM Enterprise",   type: "defi" },
  DAG06pFXdTtqrx2H11oHyH5rBe6Ccx7XG8WSsPSA: { label: "DTM Enterprise 2", type: "defi" },
  // DOR Validator
  DAG045Bmio7Jrv3aErTKjAisRnpBKvp16pp1wSqT: { label: "DOR Validator Tax Pool", type: "defi" },
  DAG2JsH1QKj8LrzmcgX2pf9MAcdhQWuihYnZMUNW: { label: "DOR Validator Tax",      type: "defi" },
  // DTM Reward Pool
  DAG0U7R9jXMSiNMU5mgqpvCVuaBwfRBzY77nJZM1: { label: "DTM Reward Pool",   type: "defi" },
  DAG0Njmo6JZ3FhkLsipJSppepUHPuTXcSifARfvK: { label: "DTM Reward Pool 2", type: "defi" },
  // Team Foundation
  DAG8UsoSR14peffVJKAsf3mqJFnkKSoQEUQDAQKN: { label: "Team Foundation",    type: "genesis" },
  DAG07znCvSyM2xhxPZECrGhVF6WVPMvFWe6Z6EWW: { label: "Team Foundation 2",  type: "genesis" },
  DAG38whfr5CWzMoQg8PajuiukNNojySqyXtZdBhK: { label: "Team Foundation 3",  type: "genesis" },
  DAG7teqwiZjuBivJi7Mx8AkhwnF6w3Q1poUTCViK: { label: "Team Foundation 4",  type: "genesis" },
  DAG7uFTujXArFTuTqELGYGcthacpfQykBX7wsgFv: { label: "Team Foundation 5",  type: "genesis" },
  DAG8MWCDLPxjufRE2tkg3qpWSd7iJKFfsg9H5nCE: { label: "Team Foundation 6",  type: "genesis" },
  DAG3yzY9252n8Fkxix7pZo5TH6F9paxSVLsDARK4: { label: "Team Foundation 7",  type: "genesis" },
  DAG2eFDjZ2CMA3M4KMfLw6Vnn7kaJPJqcSCpHU25: { label: "Team Foundation 8",  type: "genesis" },
  DAG2ttEXvYHsMP5qu7ejoBTbuCPmHoDhU5fZi3YL: { label: "Team Foundation 9",  type: "genesis" },
  DAG1ZieMRm7ALEbSjmvwztvtZYu7srPaXwxbC14U: { label: "Team Foundation 10", type: "genesis" },
  // Treasury
  DAG3tC21XtXvoUD8hTMQzHm7T21MHahuFPVrPBtR: { label: "DAG Treasury",   type: "genesis" },
  DAG1nw5WkZdQf96Df3PkrjLxeHj2EV3oLkWPZQcD: { label: "DAG Treasury 2", type: "genesis" },
  // DAG Exchanges
  DAG6Yxge8Tzd8DJDJeL4hMLntnhheHGR4DYSPQvf: { label: "MEXC DAG",       type: "exchange" },
  DAG4TETUwraLYX1mYdC8ymUxxWsoNZPffUpDf4Ar: { label: "Gate.io DAG",     type: "exchange" },
  DAG3Lcv4GEhPH34VHVgbEAf21Y3L2rtjLpXh7QD4: { label: "CoinEX DAG",      type: "exchange" },
  DAG6cStT1VYZdUhpoME23U5zbTveYq78tj7EihFV: { label: "KuCoin DAG",      type: "exchange" },
  DAG5yqn4JRkW5oAMthhBayBtkZzfAvRQnkH1dCG4: { label: "KuCoin DAG 2",    type: "exchange" },
  DAG2rMPHX4w1cMMjowmewRMjD1in53yRURt6Eijh: { label: "KuCoin DAG 3",    type: "exchange" },
  DAG2Evedeb9cS7d28bxF4wwgeryiEqfDo8diZMZg: { label: "KuCoin DAG 4",    type: "exchange" },
  DAG6LvxLSdWoC9uJZPgXtcmkcWBaGYypF6smaPyH: { label: "BitForex DAG",    type: "exchange" },
  DAG1pLpkyX7aTtFZtbF98kgA9QTZRzrsGaFmf4BT: { label: "Uphold DAG",      type: "exchange" },
};

const EXPLORER_MAP: Record<string, (h: string) => string> = {
  ethereum: (h) => `https://etherscan.io/tx/${h}`,
  bitcoin: (h) => `https://blockchair.com/bitcoin/transaction/${h}`,
  polygon: (h) => `https://polygonscan.com/tx/${h}`,
  bsc: (h) => `https://bscscan.com/tx/${h}`,
  xrp: (h) => `https://xrpscan.com/tx/${h}`,
  xlm: (h) => `https://stellarchain.io/transactions/${h}`,
  hbar: (h) => `https://hashscan.io/mainnet/transaction/${h}`,
  xdc: (h) => `https://xdcscan.io/txs/${h}`,
  dag: (h) => `https://dagexplorer.io/transaction/${h}`,
};

const WALLET_EXPLORER_MAP: Record<string, (a: string) => string> = {
  ethereum: (a) => `https://etherscan.io/address/${a}`,
  bitcoin: (a) => `https://blockchair.com/bitcoin/address/${a}`,
  polygon: (a) => `https://polygonscan.com/address/${a}`,
  bsc: (a) => `https://bscscan.com/address/${a}`,
  xrp: (a) => `https://xrpscan.com/account/${a}`,
  xlm: (a) => `https://stellarchain.io/accounts/${a}`,
  hbar: (a) => `https://hashscan.io/mainnet/account/${a}`,
  xdc: (a) => `https://xdcscan.io/address/${a}`,
  dag: (a) => `https://dagexplorer.io/address/${a}`,
};

// ─── Trail types ──────────────────────────────────────────────────────────────
interface TrailEntry {
  address: string;
  depth: number;
  parentAddress: string | null;
  knownInfo?: { label: string; type: string };
  isExpanded: boolean;
  isLoading: boolean;
  error?: boolean;
  totalValueUsd: number;
  txCount: number;
  childAddresses: string[];
}

// ─── Transaction type (from API) ──────────────────────────────────────────────
interface Tx {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  valueUsd: number;
  fee: string;
  feeUsd: number;
  timestamp: string;
  blockNumber: number;
  status: "success" | "failed" | "pending";
  direction: "in" | "out" | "self";
  tokenSymbol: string | null;
  tokenName: string | null;
  memo?: string | null;
  destinationTag?: number | null;
}

// ─── Grouped by (address + direction) ─────────────────────────────────────────
interface GroupedRow {
  address: string;
  direction: "in" | "out";
  totalValue: number;
  txCount: number;
  latestTs: string;
  asset: string;
}

// ─── Multi-wallet analysis color palette ─────────────────────────────────────
const WALLET_COLORS = [
  { dot: "bg-emerald-400", text: "text-emerald-300", bg: "bg-emerald-950/40", border: "border-emerald-500/30" },
  { dot: "bg-blue-400",    text: "text-blue-300",    bg: "bg-blue-950/40",    border: "border-blue-500/30"    },
  { dot: "bg-amber-400",   text: "text-amber-300",   bg: "bg-amber-950/40",   border: "border-amber-500/30"   },
  { dot: "bg-purple-400",  text: "text-purple-300",  bg: "bg-purple-950/40",  border: "border-purple-500/30"  },
  { dot: "bg-rose-400",    text: "text-rose-300",    bg: "bg-rose-950/40",    border: "border-rose-500/30"    },
] as const;

// ─── Multi-wallet commingling types ──────────────────────────────────────────
interface MultiGraphNode {
  address: string;
  depth: number;
  via: string | null;
  txCount: number;
  totalValueUsd: number;
}

interface MultiSharedEntry {
  address: string;
  knownInfo?: { label: string; type: "exchange" | "genesis" | "defi" | "flagged" };
  appearances: Array<{
    wallet: string;
    depth: number;
    txCount: number;
    totalValueUsd: number;
    via: string | null;
  }>;
}

interface MultiAnalysisResult {
  trackedWallets: string[];
  sharedCounterparties: MultiSharedEntry[];
  commonEndpoints: MultiSharedEntry[];
  patterns: Array<{
    id: number;
    sharedAddr: string;
    knownInfo?: { label: string; type: "exchange" | "genesis" | "defi" | "flagged" };
    totalTxCount: number;
    totalValueUsd: number;
    paths: Array<{ wallet: string; path: string[] }>;
  }>;
}

const DAG_BATCH = 250;
const OTHER_BATCH = 1000;
const MAX_TOTAL = 25000;

export default function WalletDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const address = params.address || "";
  type ChainId = "ethereum" | "bitcoin" | "polygon" | "bsc" | "xrp" | "xlm" | "hbar" | "xdc" | "dag";
  const chain = (new URLSearchParams(window.location.search).get("chain") || "ethereum") as ChainId;

  // ── Ledger view toggles ──
  const [groupByCounterparty, setGroupByCounterparty] = useState(true);
  type ViewMode = "in-first" | "out-first" | "mixed";
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem("chaintrace-view-mode") as ViewMode) ?? "in-first"; }
    catch { return "in-first"; }
  });
  function setAndSaveViewMode(m: ViewMode) {
    setViewMode(m);
    try { localStorage.setItem("chaintrace-view-mode", m); } catch { /* noop */ }
  }

  // ── Group sort (only active when groupByCounterparty is ON) ──
  type GroupSort = "most-txs" | "highest-value" | "recent" | "exchange-first";
  const [groupSort, setGroupSort] = useState<GroupSort>("most-txs");

  // ── Minimum amount filter — default 0 (show all txs) ──
  const [minAmount, setMinAmount] = useState(0);
  const [minAmountInput, setMinAmountInput] = useState("0");

  // ── All pagination state in one ref — plain mutable object, zero stale-closure risk ──
  // Reading page.current in render always gives the latest value.
  // setAllTxs(page.current.txs) is the only state update needed to trigger a re-render.
  const page = useRef({
    txs: [] as Tx[],
    cursor: null as string | null,
    hasMore: false,
    busy: false,
    error: null as string | null,
    status: null as string | null,
  });

  // allTxs is state ONLY so useMemo dependencies (filteredTxs, groupedRows) re-run on changes.
  // Everything else is read directly from page.current in the render.
  const [allTxs, setAllTxs] = useState<Tx[]>([]);
  const [showDonate, setShowDonate] = useState(false);

  // Commit new pagination data: sort newest-first, mutate the ref, trigger re-render.
  function commit(txs: Tx[], cursor: string | null, more: boolean) {
    const sorted = [...txs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    page.current.txs = sorted;
    page.current.cursor = cursor;
    page.current.hasMore = more;
    setAllTxs(sorted); // single state update → one React re-render
  }

  // ── Saved wallets (localStorage) ──
  const [savedWallets, setSavedWallets] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("chaintrace-saved-wallets");
      return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const toggleSavedWallet = useCallback((addr: string) => {
    setSavedWallets((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      try { localStorage.setItem("chaintrace-saved-wallets", JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ── Counterparty context menu ──
  const [activeMenu, setActiveMenu] = useState<{ addr: string; x: number; y: number } | null>(null);

  // ── Trail trace ──
  const [showTrailPanel, setShowTrailPanel] = useState(false);
  const [trailEntries, setTrailEntries] = useState<TrailEntry[]>([]);
  const [showNodeTree, setShowNodeTree] = useState(true);
  const fetchingRef = useRef(new Set<string>());
  const trailPanelRef = useRef<HTMLDivElement>(null);
  const multiPanelRef = useRef<HTMLDivElement>(null);

  // ── Multi-wallet commingling analysis ──
  const [showMultiPanel, setShowMultiPanel] = useState(false);
  const [multiWallets, setMultiWallets] = useState<string[]>([]);
  const [multiWalletInput, setMultiWalletInput] = useState("");
  const [multiResult, setMultiResult] = useState<MultiAnalysisResult | null>(null);
  const [multiLoading, setMultiLoading] = useState(false);
  const [multiProgress, setMultiProgress] = useState("");
  const [multiError, setMultiError] = useState<string | null>(null);

  // ── Blocks React Query background-refetches from overwriting accumulated txs ──
  const txInitializedRef = useRef(false);

  // Close menu on outside click
  useEffect(() => {
    const handler = () => setActiveMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  // ── Reset everything when the wallet address or chain changes ──
  useEffect(() => {
    txInitializedRef.current = false;
    page.current = { txs: [], cursor: null, hasMore: false, busy: false, error: null, status: null };
    setAllTxs([]);
    setMinAmount(0);
    setMinAmountInput("0");
  }, [address, chain]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: wallet, isLoading: walletLoading, error: walletError } = useGetWallet(
    address, { chain },
    { query: { enabled: !!address, queryKey: getGetWalletQueryKey(address, { chain }) } }
  );

  // Initial page — DAG uses 100 to stay well within Constellation API limits.
  // staleTime: Infinity + refetchOnWindowFocus: false prevent background refetches from
  // racing with accumulated Load More state.
  const initLimit = chain === "dag" ? DAG_BATCH : OTHER_BATCH;
  const { data: transactionsData, isLoading: txLoading } = useGetWalletTransactions(
    address, { chain, page: 1, limit: initLimit },
    {
      query: {
        enabled: !!address,
        queryKey: getGetWalletTransactionsQueryKey(address, { chain, page: 1, limit: initLimit }),
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
      },
    }
  );

  // ── Sync initial React Query page into local state (once per wallet/chain) ──
  // txInitializedRef blocks subsequent RQ background-refetches from overwriting
  // transactions already accumulated by Load More clicks.
  useEffect(() => {
    if (!transactionsData?.transactions || txInitializedRef.current) return;
    txInitializedRef.current = true;
    commit(
      transactionsData.transactions as Tx[],
      transactionsData.nextCursor ?? null,
      transactionsData.hasMore ?? false,
    );
  }, [transactionsData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch one page from the backend ──
  async function fetchPage(cursor: string, limit: number): Promise<{ transactions: Tx[]; nextCursor: string | null; hasMore: boolean }> {
    const url = `/api/wallets/${encodeURIComponent(address)}/transactions?chain=${chain}&limit=${limit}&cursor=${encodeURIComponent(cursor)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 100)}` : ""}`);
    }
    return res.json() as Promise<{ transactions: Tx[]; nextCursor: string | null; hasMore: boolean }>;
  }

  const loadMoreLabel = chain === "dag" ? "LOAD MORE (+250)" : "LOAD MORE (+1000)";

  // ── Load More: fetch one batch, append, re-render ──
  // page.current is always current — no stale closure possible.
  async function loadMore() {
    if (page.current.busy || !page.current.hasMore || !page.current.cursor) return;

    // Snapshot cursor + existing list at call time
    const cursor = page.current.cursor;
    const existing = page.current.txs;

    page.current.busy = true;
    page.current.error = null;
    page.current.status = null;
    setAllTxs([...existing]); // force re-render so button goes to LOADING state

    const limit = chain === "dag" ? DAG_BATCH : OTHER_BATCH;
    try {
      const data = await fetchPage(cursor, limit);
      const seen = new Set(existing.map((t) => t.hash || `${t.from}:${t.to}:${t.timestamp}`));
      const newTxs = (data.transactions ?? []).filter(
        (t) => !seen.has(t.hash || `${t.from}:${t.to}:${t.timestamp}`)
      );
      const merged = [...existing, ...newTxs]; // append — never replace
      page.current.status = `Added ${newTxs.length} transactions · Total: ${merged.length.toLocaleString()}`;
      commit(merged, data.nextCursor ?? null, data.hasMore && merged.length < MAX_TOTAL);
    } catch (err) {
      page.current.error = err instanceof Error ? err.message : "Unknown error — try again";
      setAllTxs([...existing]); // re-render to show error
    } finally {
      page.current.busy = false;
      setAllTxs([...page.current.txs]); // ensure final re-render with busy=false
    }
  }

  // ── Load All: loop one batch at a time, commit after each page ──
  async function loadAll() {
    if (page.current.busy || !page.current.hasMore || !page.current.cursor) return;
    if (page.current.txs.length > 20000) {
      if (!window.confirm(
        `You already have ${page.current.txs.length.toLocaleString()} transactions.\nLoading more may slow your browser.\n\nContinue?`
      )) return;
    }

    page.current.busy = true;
    page.current.error = null;

    const limit = chain === "dag" ? DAG_BATCH : OTHER_BATCH;
    let cursor: string | null = page.current.cursor;
    let accumulated = [...page.current.txs];
    let pageNum = 0;

    try {
      while (cursor && accumulated.length < MAX_TOTAL) {
        pageNum++;
        page.current.status = `Loading page ${pageNum} · ${accumulated.length.toLocaleString()} loaded so far…`;
        setAllTxs([...accumulated].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())); // live sorted update

        const data = await fetchPage(cursor, limit);
        const seen = new Set(accumulated.map((t) => t.hash || `${t.from}:${t.to}:${t.timestamp}`));
        const newTxs = (data.transactions ?? []).filter(
          (t) => !seen.has(t.hash || `${t.from}:${t.to}:${t.timestamp}`)
        );
        accumulated = [...accumulated, ...newTxs];
        cursor = data.nextCursor ?? null;
        commit([...accumulated], cursor, data.hasMore && accumulated.length < MAX_TOTAL);
        if (!data.hasMore || !cursor) break;
      }
      page.current.status = `Full history loaded · ${accumulated.length.toLocaleString()} total`;
    } catch (err) {
      page.current.error = err instanceof Error ? err.message : "Unknown error — try again";
    } finally {
      page.current.busy = false;
      setAllTxs([...page.current.txs]);
    }
  }

  // ── Apply minimum amount filter + view mode sort ──
  const filteredTxs = useMemo(() => {
    const base = minAmount <= 0 ? allTxs : allTxs.filter((tx) => parseFloat(tx.value) >= minAmount);
    if (viewMode === "mixed") return base; // already newest-first from commit()
    // Partition into IN, OUT, self — each sub-list is already newest-first (stable after partition)
    const ins = base.filter((t) => t.direction === "in");
    const outs = base.filter((t) => t.direction === "out");
    const self = base.filter((t) => t.direction === "self");
    if (viewMode === "in-first") return [...ins, ...outs, ...self];
    return [...outs, ...ins, ...self]; // out-first
  }, [allTxs, minAmount, viewMode]);

  // ── Group by (address + direction) ──
  const groupedRows = useMemo((): GroupedRow[] => {
    const map = new Map<string, GroupedRow>();
    for (const tx of allTxs) {
      if (tx.direction === "self") continue;
      const cp = tx.direction === "in" ? tx.from : tx.to;
      if (!cp) continue;
      const val = parseFloat(tx.value) || 0;
      if (val < minAmount) continue;
      const key = `${cp}:${tx.direction}`;
      const existing = map.get(key);
      if (existing) {
        existing.txCount++;
        existing.totalValue += val;
        if (tx.timestamp && tx.timestamp > existing.latestTs) existing.latestTs = tx.timestamp;
      } else {
        map.set(key, {
          address: cp,
          direction: tx.direction as "in" | "out",
          totalValue: val,
          txCount: 1,
          latestTs: tx.timestamp || "",
          asset: tx.tokenSymbol || chain.toUpperCase(),
        });
      }
    }
    const rows = Array.from(map.values());
    // Direction grouping (viewMode) as primary, groupSort as secondary within each group
    rows.sort((a, b) => {
      if (viewMode !== "mixed" && a.direction !== b.direction) {
        if (viewMode === "in-first") return a.direction === "in" ? -1 : 1;
        if (viewMode === "out-first") return a.direction === "out" ? -1 : 1;
      }
      if (groupSort === "exchange-first") {
        const aKnown = KNOWN_LABELS[a.address];
        const bKnown = KNOWN_LABELS[b.address];
        const aIsExchange = aKnown?.type === "exchange" ? 0 : aKnown ? 1 : 2;
        const bIsExchange = bKnown?.type === "exchange" ? 0 : bKnown ? 1 : 2;
        if (aIsExchange !== bIsExchange) return aIsExchange - bIsExchange;
        return b.txCount - a.txCount;
      }
      if (groupSort === "most-txs")      return b.txCount - a.txCount;
      if (groupSort === "highest-value") return b.totalValue - a.totalValue;
      return new Date(b.latestTs).getTime() - new Date(a.latestTs).getTime();
    });
    return rows;
  }, [allTxs, minAmount, viewMode, groupSort, chain]);

  // ── Commingling detection ──
  const comminglingAddresses = useMemo(() => {
    const parentSets = new Map<string, Set<string>>();
    for (const e of trailEntries) {
      if (!e.parentAddress) continue;
      if (!parentSets.has(e.address)) parentSets.set(e.address, new Set());
      parentSets.get(e.address)!.add(e.parentAddress);
    }
    return new Set(
      Array.from(parentSets.entries())
        .filter(([, parents]) => parents.size > 1)
        .map(([addr]) => addr)
    );
  }, [trailEntries]);

  // ── Intersection / Commingling Analysis ──
  // Computes all 3 sections purely from data already in memory — no extra API calls.
  const intersectionData = useMemo(() => {
    if (!showTrailPanel || trailEntries.length === 0) return null;
    const rootAddr = trailEntries[0].address;

    // Build per-counterparty stats from loaded transactions
    const cpMap = new Map<string, {
      txCount: number; totalValue: number;
      firstTs: string; lastTs: string;
      sampleHash: string; sampleDate: string;
    }>();
    for (const tx of allTxs) {
      const cp = tx.direction === "in" ? tx.from : (tx.to ?? null);
      if (!cp || cp === rootAddr) continue;
      const v = parseFloat(tx.value) || 0;
      const ex = cpMap.get(cp);
      if (ex) {
        ex.txCount++;
        ex.totalValue += v;
        if (tx.timestamp && tx.timestamp < ex.firstTs) ex.firstTs = tx.timestamp;
        if (tx.timestamp && tx.timestamp > ex.lastTs) {
          ex.lastTs = tx.timestamp;
          ex.sampleHash = tx.hash || ex.sampleHash;
          ex.sampleDate = tx.timestamp;
        }
      } else {
        cpMap.set(cp, {
          txCount: 1, totalValue: v,
          firstTs: tx.timestamp || "", lastTs: tx.timestamp || "",
          sampleHash: tx.hash || "", sampleDate: tx.timestamp || "",
        });
      }
    }

    // § 1 — Direct Intersections: trail nodes whose address also appears in allTxs
    const trailNodes = trailEntries.filter((e) => e.depth > 0);
    const directIntersections = trailNodes
      .filter((e) => cpMap.has(e.address))
      .map((e) => ({ ...e, cp: cpMap.get(e.address)! }))
      .sort((a, b) => b.cp.totalValue - a.cp.totalValue);
    const intersectionAddrs = new Set(directIntersections.map((d) => d.address));

    // § 2 — Common Endpoints: nodes reached via 2+ different parents
    const parentSets = new Map<string, Set<string>>();
    for (const e of trailEntries) {
      if (!e.parentAddress) continue;
      if (!parentSets.has(e.address)) parentSets.set(e.address, new Set());
      parentSets.get(e.address)!.add(e.parentAddress);
    }
    const commonEndpoints = Array.from(parentSets.entries())
      .filter(([, parents]) => parents.size > 1)
      .map(([addr, parents]) => ({
        address: addr,
        parents: Array.from(parents),
        trailEntry: trailEntries.find((e) => e.address === addr),
        cpData: cpMap.get(addr),
      }));

    // § 3 — Numbered Trail Paths: DFS root→leaf, prefer paths with intersections
    const allPaths: string[][] = [];
    const dfs = (addr: string, path: string[]) => {
      const children = trailEntries.filter((e) => e.parentAddress === addr);
      if (children.length === 0) { allPaths.push([...path]); return; }
      for (const c of children) dfs(c.address, [...path, c.address]);
    };
    dfs(rootAddr, [rootAddr]);
    allPaths.sort((a, b) => {
      const score = (p: string[]) =>
        p.filter((addr) => intersectionAddrs.has(addr)).length * 2 +
        p.filter((addr) => commonEndpoints.some((c) => c.address === addr)).length;
      return score(b) - score(a);
    });

    return {
      directIntersections, commonEndpoints,
      paths: allPaths.slice(0, 12),
      intersectionAddrs, rootAddr,
      totalTxsLoaded: allTxs.length,
    };
  }, [showTrailPanel, trailEntries, allTxs]);

  // ── Trail trace ──
  const expandTrailNode = useCallback(async (entry: TrailEntry) => {
    if (fetchingRef.current.has(entry.address) || entry.depth >= 5) return;
    fetchingRef.current.add(entry.address);
    setTrailEntries((prev) =>
      prev.map((e) => e.address === entry.address ? { ...e, isLoading: true } : e)
    );
    try {
      const resp = await fetch(`/api/wallets/${encodeURIComponent(entry.address)}/connections?chain=${chain}`);
      if (!resp.ok) throw new Error("fetch failed");
      const data = await resp.json() as {
        nodes: Array<{ address: string; riskScore: number | null }>;
        edges: Array<{ from: string; to: string; totalValueUsd: number; transactionCount: number }>;
        centerAddress: string;
      };
      const peers = (data.nodes || []).filter((n) => n.address !== entry.address).slice(0, 12);
      const edges = data.edges || [];
      setTrailEntries((prev) => {
        const existingAddrs = new Set(prev.map((e) => e.address));
        const updated = prev.map((e) =>
          e.address === entry.address
            ? { ...e, isLoading: false, isExpanded: true, childAddresses: peers.map((p) => p.address) }
            : e
        );
        const newEntries: TrailEntry[] = [];
        for (const peer of peers) {
          if (!existingAddrs.has(peer.address)) {
            const edge = edges.find(
              (ed) =>
                (ed.from === entry.address && ed.to === peer.address) ||
                (ed.to === entry.address && ed.from === peer.address)
            );
            newEntries.push({
              address: peer.address, depth: entry.depth + 1, parentAddress: entry.address,
              knownInfo: KNOWN_LABELS[peer.address],
              isExpanded: false, isLoading: false,
              totalValueUsd: edge?.totalValueUsd ?? 0, txCount: edge?.transactionCount ?? 0,
              childAddresses: [],
            });
          }
        }
        return [...updated, ...newEntries];
      });
    } catch {
      setTrailEntries((prev) =>
        prev.map((e) => e.address === entry.address ? { ...e, isLoading: false, error: true } : e)
      );
    } finally {
      fetchingRef.current.delete(entry.address);
    }
  }, [chain]);

  const startTrailTrace = useCallback(async (targetAddr: string) => {
    setShowTrailPanel(true);
    fetchingRef.current.clear();
    const rootEntry: TrailEntry = {
      address: targetAddr, depth: 0, parentAddress: null,
      knownInfo: KNOWN_LABELS[targetAddr],
      isExpanded: false, isLoading: true,
      totalValueUsd: 0, txCount: 0, childAddresses: [],
    };
    setTrailEntries([rootEntry]);
    try {
      const resp = await fetch(`/api/wallets/${encodeURIComponent(targetAddr)}/connections?chain=${chain}`);
      if (!resp.ok) throw new Error("fetch failed");
      const data = await resp.json() as {
        nodes: Array<{ address: string; riskScore: number | null }>;
        edges: Array<{ from: string; to: string; totalValueUsd: number; transactionCount: number }>;
        centerAddress: string;
      };
      const peers = (data.nodes || []).filter((n) => n.address !== targetAddr).slice(0, 12);
      const edges = data.edges || [];
      const rootExpanded: TrailEntry = {
        ...rootEntry, isLoading: false, isExpanded: true,
        childAddresses: peers.map((p) => p.address),
      };
      const peerEntries: TrailEntry[] = peers.map((peer) => {
        const edge = edges.find(
          (ed) =>
            (ed.from === targetAddr && ed.to === peer.address) ||
            (ed.to === targetAddr && ed.from === peer.address)
        );
        return {
          address: peer.address, depth: 1, parentAddress: targetAddr,
          knownInfo: KNOWN_LABELS[peer.address],
          isExpanded: false, isLoading: false,
          totalValueUsd: edge?.totalValueUsd ?? 0, txCount: edge?.transactionCount ?? 0,
          childAddresses: [],
        };
      });
      setTrailEntries([rootExpanded, ...peerEntries]);
    } catch {
      setTrailEntries([{ ...rootEntry, isLoading: false, error: true }]);
    }
    setTimeout(() => {
      trailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  }, [chain]);

  const continueTrailOnWallet = useCallback((addr: string) => {
    setActiveMenu(null);
    startTrailTrace(addr);
  }, [startTrailTrace]);

  // ── Multi-wallet commingling analysis ──
  const runMultiAnalysis = useCallback(async () => {
    const allWallets = [address, ...multiWallets].filter(Boolean);
    if (allWallets.length < 2) {
      setMultiError("Add at least one additional wallet address to compare.");
      return;
    }
    setMultiLoading(true);
    setMultiError(null);
    setMultiResult(null);

    const fetchConns = async (addr: string) => {
      try {
        const resp = await fetch(`/api/wallets/${encodeURIComponent(addr)}/connections?chain=${chain}`);
        if (!resp.ok) return { nodes: [] as Array<{ address: string }>, edges: [] as Array<{ from: string; to: string; totalValueUsd: number; transactionCount: number }> };
        return resp.json() as Promise<{ nodes: Array<{ address: string }>; edges: Array<{ from: string; to: string; totalValueUsd: number; transactionCount: number }> }>;
      } catch { return { nodes: [], edges: [] }; }
    };

    try {
      // Build a per-wallet map: address → MultiGraphNode (depth 1 + 2)
      const walletNodeMaps: Array<{ wallet: string; nodes: Map<string, MultiGraphNode> }> = [];

      for (const wallet of allWallets) {
        setMultiProgress(`Depth-1: ${wallet.slice(0, 10)}…`);
        const nodeMap = new Map<string, MultiGraphNode>();

        const d1 = await fetchConns(wallet);
        const d1peers = d1.nodes.filter((n) => n.address !== wallet && !allWallets.includes(n.address)).slice(0, 12);
        for (const peer of d1peers) {
          const edge = d1.edges.find((e) => (e.from === wallet && e.to === peer.address) || (e.to === wallet && e.from === peer.address));
          nodeMap.set(peer.address, { address: peer.address, depth: 1, via: wallet, txCount: edge?.transactionCount ?? 0, totalValueUsd: edge?.totalValueUsd ?? 0 });
        }

        // Depth-2: top 6 depth-1 peers in parallel
        const top6 = d1peers.slice(0, 6);
        const d2results = await Promise.all(top6.map((p) => fetchConns(p.address)));
        for (let pi = 0; pi < top6.length; pi++) {
          const peer = top6[pi];
          setMultiProgress(`Depth-2: ${peer.address.slice(0, 10)}…`);
          const d2 = d2results[pi];
          const d2peers = d2.nodes.filter((n) => n.address !== peer.address && !allWallets.includes(n.address)).slice(0, 8);
          for (const node of d2peers) {
            if (!nodeMap.has(node.address)) {
              const edge = d2.edges.find((e) => (e.from === peer.address && e.to === node.address) || (e.to === peer.address && e.from === node.address));
              nodeMap.set(node.address, { address: node.address, depth: 2, via: peer.address, txCount: edge?.transactionCount ?? 0, totalValueUsd: edge?.totalValueUsd ?? 0 });
            }
          }
        }
        walletNodeMaps.push({ wallet, nodes: nodeMap });
      }

      // Aggregate: address → all wallet appearances
      const addressMap = new Map<string, MultiSharedEntry>();
      for (const { wallet, nodes } of walletNodeMaps) {
        for (const [addr, node] of nodes) {
          if (!addressMap.has(addr)) {
            addressMap.set(addr, { address: addr, knownInfo: KNOWN_LABELS[addr], appearances: [] });
          }
          addressMap.get(addr)!.appearances.push({ wallet, depth: node.depth, txCount: node.txCount, totalValueUsd: node.totalValueUsd, via: node.via });
        }
      }

      const shared = Array.from(addressMap.values()).filter((e) => e.appearances.length >= 2);

      const sharedCounterparties = shared
        .filter((s) => s.appearances.some((a) => a.depth === 1))
        .sort((a, b) => b.appearances.length - a.appearances.length || b.appearances.reduce((s, x) => s + x.txCount, 0) - a.appearances.reduce((s, x) => s + x.txCount, 0));

      const commonEndpoints = shared
        .filter((s) => s.appearances.every((a) => a.depth === 2))
        .sort((a, b) => b.appearances.length - a.appearances.length || b.appearances.reduce((s, x) => s + x.txCount, 0) - a.appearances.reduce((s, x) => s + x.txCount, 0));

      const patterns = shared
        .sort((a, b) => b.appearances.length - a.appearances.length || b.appearances.reduce((s, x) => s + x.txCount, 0) - a.appearances.reduce((s, x) => s + x.txCount, 0))
        .slice(0, 20)
        .map((s, i) => ({
          id: i + 1,
          sharedAddr: s.address,
          knownInfo: s.knownInfo,
          totalTxCount: s.appearances.reduce((sum, a) => sum + a.txCount, 0),
          totalValueUsd: s.appearances.reduce((sum, a) => sum + a.totalValueUsd, 0),
          paths: s.appearances.map((a) => ({
            wallet: a.wallet,
            path: a.depth === 1 ? [a.wallet, s.address] : [a.wallet, a.via ?? "?", s.address],
          })),
        }));

      setMultiResult({ trackedWallets: allWallets, sharedCounterparties, commonEndpoints, patterns });
      setTimeout(() => multiPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    } catch (err) {
      setMultiError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setMultiLoading(false);
      setMultiProgress("");
    }
  }, [address, multiWallets, chain]);

  // ── Helpers ──
  const getRiskBadge = (score: number | null) => {
    if (score === null)
      return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono"><Shield className="w-3 h-3" /> UNSCORED</span>;
    if (score <= 30)
      return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-950/60 text-green-400 font-mono"><ShieldCheck className="w-3 h-3" /> LOW RISK ({score})</span>;
    if (score <= 70)
      return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-yellow-950/60 text-yellow-400 font-mono"><ShieldAlert className="w-3 h-3" /> MED RISK ({score})</span>;
    return <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-950/60 text-red-400 font-mono"><ShieldAlert className="w-3 h-3" /> HIGH RISK ({score})</span>;
  };

  const getKnownBadge = (info?: { label: string; type: string }, size: "sm" | "md" | "lg" = "sm") => {
    if (!info) return null;
    const config: Record<string, { bg: string; text: string; border: string; glow: string; emoji: string; ring: string }> = {
      exchange: { bg: "bg-blue-600/95",   text: "text-white",        border: "border-blue-300/80",   glow: "shadow-blue-400/40",   ring: "ring-1 ring-blue-400/30",   emoji: "🏦" },
      genesis:  { bg: "bg-purple-700/95", text: "text-white",        border: "border-purple-300/80", glow: "shadow-purple-400/40", ring: "ring-1 ring-purple-400/30", emoji: "⚡" },
      defi:     { bg: "bg-teal-700/95",   text: "text-white",        border: "border-teal-300/80",   glow: "shadow-teal-400/40",   ring: "ring-1 ring-teal-400/30",   emoji: "🔄" },
      flagged:  { bg: "bg-red-600/95",    text: "text-white",        border: "border-red-300/80",    glow: "shadow-red-400/40",    ring: "ring-1 ring-red-400/30",    emoji: "🚨" },
    };
    const c = config[info.type] ?? config.exchange;
    const sz = size === "lg"
      ? "text-sm px-3.5 py-1.5 gap-2 rounded-lg font-extrabold tracking-wide shadow-lg"
      : size === "md"
      ? "text-xs px-2.5 py-1 gap-1.5 rounded-md font-bold shadow-md"
      : "text-[11px] px-2 py-0.5 gap-1 rounded font-bold shadow-sm";
    return (
      <span className={`inline-flex items-center shrink-0 font-mono border ${sz} ${c.bg} ${c.text} ${c.border} ${c.glow} ${c.ring}`}>
        <span>{c.emoji}</span>
        <span>{info.label}</span>
      </span>
    );
  };

  const renderCounterpartyCell = (addr: string | null, dir: string) => {
    if (!addr) {
      return dir === "out"
        ? <span className="text-muted-foreground text-xs">CONTRACT CREATION</span>
        : <span className="text-muted-foreground text-xs">—</span>;
    }
    const known = KNOWN_LABELS[addr];
    const saved = savedWallets.has(addr);
    const explorerAddrUrl = WALLET_EXPLORER_MAP[chain];
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setActiveMenu({ addr, x: rect.left, y: rect.bottom + 4 });
          }}
          className="text-primary/80 hover:text-primary text-xs hover:underline transition-colors font-mono"
          title={addr}
        >
          {addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr}
        </button>
        {known && getKnownBadge(known, "md")}
        {saved && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
        {explorerAddrUrl && (
          <a
            href={explorerAddrUrl(addr)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    );
  };

  const explorerTxUrl = EXPLORER_MAP[chain];

  if (walletError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <ShieldAlert className="w-16 h-16 text-destructive opacity-40" />
        <h2 className="text-xl font-mono text-destructive tracking-widest">PROFILE NOT FOUND</h2>
        <p className="text-muted-foreground text-sm max-w-md font-mono">
          Target address could not be resolved on the{" "}
          <span className="text-primary uppercase">{chain}</span> network.
        </p>
        <Link href="/">
          <Button variant="outline" className="font-mono mt-4 tracking-wider">RETURN TO SEARCH</Button>
        </Link>
      </div>
    );
  }

  const inCount = filteredTxs.filter((t) => t.direction === "in").length;
  const outCount = filteredTxs.filter((t) => t.direction === "out").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" onClick={() => setActiveMenu(null)}>

      {/* ── Counterparty context menu ── */}
      {activeMenu && (
        <div
          className="fixed z-50 bg-card border border-border/60 rounded-lg shadow-xl shadow-black/40 overflow-hidden min-w-[220px]"
          style={{ top: Math.min(activeMenu.y, window.innerHeight - 160), left: Math.min(activeMenu.x, window.innerWidth - 240) }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-border/40 bg-muted/20">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Counterparty</p>
            <p className="text-xs font-mono text-primary truncate max-w-[200px]">{activeMenu.addr}</p>
          </div>
          <div className="p-1">
            <button
              onClick={() => { setActiveMenu(null); setLocation(`/wallet/${activeMenu.addr}?chain=${chain}`); }}
              className="w-full text-left px-3 py-2 text-xs font-mono text-foreground hover:bg-muted/40 rounded-md transition-colors flex items-center gap-2"
            >
              <Network className="w-3 h-3 text-muted-foreground" /> View Profile
            </button>
            <button
              onClick={() => continueTrailOnWallet(activeMenu.addr)}
              className="w-full text-left px-3 py-2 text-xs font-mono text-primary hover:bg-primary/10 rounded-md transition-colors flex items-center gap-2"
            >
              <GitFork className="w-3 h-3" /> Continue Trail on this Wallet
            </button>
            <button
              onClick={() => { toggleSavedWallet(activeMenu.addr); setActiveMenu(null); }}
              className={`w-full text-left px-3 py-2 text-xs font-mono rounded-md transition-colors flex items-center gap-2 ${
                savedWallets.has(activeMenu.addr)
                  ? "text-yellow-400 hover:bg-yellow-950/30"
                  : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {savedWallets.has(activeMenu.addr)
                ? <><BookmarkCheck className="w-3 h-3" /> Remove from Saved</>
                : <><Bookmark className="w-3 h-3" /> Save / Add to Trail Wallet</>
              }
            </button>
            <a
              href={WALLET_EXPLORER_MAP[chain]?.(activeMenu.addr) ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setActiveMenu(null)}
              className="w-full text-left px-3 py-2 text-xs font-mono text-muted-foreground hover:bg-muted/40 rounded-md transition-colors flex items-center gap-2 block"
            >
              <ExternalLink className="w-3 h-3" /> Open in Explorer
            </a>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-3 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-mono rounded uppercase border border-primary/20">{chain}</span>
            {walletLoading ? <div className="w-28 h-5 bg-muted/50 rounded animate-pulse" /> : getRiskBadge(wallet?.riskScore ?? null)}
            {wallet?.isContract && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-950/50 text-blue-400 text-xs font-mono rounded border border-blue-500/20">
                <FileCode className="w-3 h-3" /> CONTRACT
              </span>
            )}
            {wallet?.tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-muted text-muted-foreground text-xs font-mono rounded">
                <Tag className="w-3 h-3" /> {tag.toUpperCase()}
              </span>
            ))}
            {KNOWN_LABELS[address] && getKnownBadge(KNOWN_LABELS[address])}
            {savedWallets.has(address) && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-950/50 text-yellow-400 text-xs font-mono rounded border border-yellow-500/20">
                <Bookmark className="w-3 h-3 fill-yellow-400" /> SAVED
              </span>
            )}
          </div>
          <div className="font-mono text-sm text-foreground break-all bg-muted/20 px-3 py-2 rounded border border-border/40">
            <AddressDisplay address={address} truncate={false} showIcon />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Button
            variant="outline"
            className={`font-mono text-xs ${
              savedWallets.has(address)
                ? "border-yellow-500/50 text-yellow-400 hover:bg-yellow-950/30 bg-yellow-950/20"
                : "border-border/40 text-muted-foreground hover:border-yellow-500/50 hover:text-yellow-400"
            }`}
            onClick={() => toggleSavedWallet(address)}
          >
            {savedWallets.has(address)
              ? <><BookmarkCheck className="w-3.5 h-3.5 mr-1.5" /> WATCHLISTED</>
              : <><Bookmark className="w-3.5 h-3.5 mr-1.5" /> ADD TO WATCHLIST</>
            }
          </Button>
          <Link href={`/trace/${address}?chain=${chain}`}>
            <Button variant="outline" className="font-mono border-primary/30 text-primary hover:bg-primary/10 text-xs">
              <Network className="w-3.5 h-3.5 mr-1.5" /> TRACE GRAPH
            </Button>
          </Link>
          <Button
            variant="outline"
            className={`font-mono text-xs ${showMultiPanel ? "border-violet-500/60 text-violet-300 bg-violet-950/30 hover:bg-violet-950/50" : "border-violet-500/30 text-violet-400 hover:bg-violet-950/30 hover:border-violet-500/60"}`}
            onClick={() => { setShowMultiPanel((v) => !v); if (!showMultiPanel) setTimeout(() => multiPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }}
          >
            <Layers className="w-3.5 h-3.5 mr-1.5" /> MULTI-WALLET ANALYSIS
          </Button>
          <Button
            className="font-mono bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
            onClick={() => startTrailTrace(address)}
          >
            <GitFork className="w-3.5 h-3.5 mr-1.5" /> START TRAIL TRACE
          </Button>
        </div>
      </div>

      {/* ── Support Banner ── */}
      <div className="rounded-lg border border-pink-500/30 bg-gradient-to-r from-pink-950/30 via-pink-950/20 to-transparent overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-9 h-9 rounded-full bg-pink-500/15 border border-pink-500/30 flex items-center justify-center mt-0.5">
              <Heart className="w-4 h-4 text-pink-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-bold text-pink-300 tracking-wide mb-0.5">
                Support This Free Tool
              </p>
              <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                <span className="text-pink-400">100% free</span> — no fees, ads, or data selling. If CryptoChainTrace helped your investigation, even a small donation keeps the servers running.
              </p>
            </div>
            <button
              onClick={() => setShowDonate((v) => !v)}
              className="shrink-0 text-[10px] font-mono text-pink-400 hover:text-pink-300 border border-pink-500/30 hover:border-pink-400/60 bg-pink-950/40 hover:bg-pink-950/60 px-3 py-1.5 rounded transition-colors font-semibold tracking-wider"
            >
              {showDonate ? "HIDE ↑" : "DONATE ↓"}
            </button>
          </div>
          {showDonate && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { symbol: "XRP",  label: "Ripple",        address: "YOUR_XRP_DONATION_ADDRESS_HERE",  color: "text-cyan-300",   bg: "bg-cyan-950/30",   border: "border-cyan-500/25" },
                { symbol: "XLM",  label: "Stellar",       address: "YOUR_XLM_DONATION_ADDRESS_HERE",  color: "text-sky-300",    bg: "bg-sky-950/30",    border: "border-sky-500/25" },
                { symbol: "HBAR", label: "Hedera",        address: "YOUR_HBAR_DONATION_ADDRESS_HERE", color: "text-violet-300", bg: "bg-violet-950/30", border: "border-violet-500/25" },
                { symbol: "BTC",  label: "Bitcoin",       address: "YOUR_BTC_DONATION_ADDRESS_HERE",  color: "text-orange-300", bg: "bg-orange-950/30", border: "border-orange-500/25" },
                { symbol: "XDC",  label: "XinFin",        address: "YOUR_XDC_DONATION_ADDRESS_HERE",  color: "text-teal-300",   bg: "bg-teal-950/30",   border: "border-teal-500/25" },
                { symbol: "ETH",  label: "Ethereum",      address: "YOUR_ETH_DONATION_ADDRESS_HERE",  color: "text-blue-300",   bg: "bg-blue-950/30",   border: "border-blue-500/25" },
              ] as { symbol: string; label: string; address: string; color: string; bg: string; border: string }[]).map((d) => (
                <div key={d.symbol} className={`flex items-center gap-3 ${d.bg} border ${d.border} px-3 py-2.5 rounded-lg`}>
                  <div className="shrink-0 text-center w-10">
                    <span className={`text-xs font-mono font-bold ${d.color} block leading-none`}>{d.symbol}</span>
                    <span className="text-[9px] font-mono text-muted-foreground/50 block mt-0.5">{d.label}</span>
                  </div>
                  <code className="text-[10px] font-mono text-muted-foreground/70 truncate flex-1 min-w-0">{d.address}</code>
                  <button
                    onClick={() => void navigator.clipboard.writeText(d.address)}
                    className={`${d.color} opacity-60 hover:opacity-100 transition-opacity shrink-0`}
                    title={`Copy ${d.symbol} address`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "BALANCE", value: wallet?.balance ?? "0", sub: `$${(wallet?.balanceUsd ?? 0).toLocaleString()}`, subClass: "text-green-400" },
          { label: "TRANSACTIONS", value: (wallet?.transactionCount ?? 0).toLocaleString(), sub: null },
          { label: "FIRST SEEN", value: wallet?.firstSeen ? new Date(wallet.firstSeen).toLocaleDateString() : "UNKNOWN", sub: null },
          { label: "LAST ACTIVE", value: wallet?.lastSeen ? new Date(wallet.lastSeen).toLocaleDateString() : "UNKNOWN", sub: null },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card/40 border-border/40">
            <CardContent className="p-4">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">{stat.label}</div>
              {walletLoading ? (
                <div className="h-7 bg-muted/50 rounded animate-pulse" />
              ) : (
                <>
                  <div className="text-xl font-mono text-foreground truncate">{stat.value}</div>
                  {stat.sub && <div className={`text-xs font-mono mt-0.5 ${stat.subClass ?? "text-muted-foreground"}`}>{stat.sub}</div>}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Transaction Ledger ── */}
      <Card className="bg-card/40 border-border/40">
        <CardHeader className="border-b border-border/40 pb-4 px-5 pt-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-foreground">Transaction Ledger</CardTitle>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {allTxs.length} loaded{page.current.hasMore ? ` · more available` : " · complete"}
                <span className="ml-2 text-muted-foreground/40">· max 25,000 for performance — Load More available</span>
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* ── Minimum Amount Filter ── */}
              <div className="flex items-center gap-1.5 bg-muted/20 border border-border/40 rounded px-2 py-1">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  Min Amount
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={minAmountInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setMinAmountInput(raw);
                    const parsed = parseFloat(raw);
                    if (!isNaN(parsed) && parsed >= 0) setMinAmount(parsed);
                    else if (raw === "" || raw === "0") setMinAmount(0);
                  }}
                  className="w-16 bg-transparent text-xs font-mono text-foreground outline-none text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  placeholder="1"
                />
                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">{chain}</span>
              </div>

              {/* ── View Mode Segmented Control — always visible ── */}
              <div className="flex items-center rounded border border-border/40 overflow-hidden text-[10px] font-mono">
                {(["in-first", "out-first", "mixed"] as const).map((m) => {
                  const labels: Record<string, string> = { "in-first": "IN FIRST", "out-first": "OUT FIRST", mixed: "MIXED" };
                  const colors: Record<string, string> = {
                    "in-first": viewMode === m ? "bg-green-950/60 text-green-400" : "bg-muted/10 text-muted-foreground hover:text-green-400",
                    "out-first": viewMode === m ? "bg-red-950/60 text-red-400" : "bg-muted/10 text-muted-foreground hover:text-red-400",
                    mixed: viewMode === m ? "bg-primary/20 text-primary" : "bg-muted/10 text-muted-foreground hover:text-primary",
                  };
                  return (
                    <button
                      key={m}
                      onClick={() => setAndSaveViewMode(m)}
                      className={`px-2.5 py-1.5 transition-colors border-r last:border-r-0 border-border/40 ${colors[m]}`}
                    >
                      {labels[m]}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setGroupByCounterparty((v) => !v)}
                className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border transition-colors ${
                  groupByCounterparty
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-muted/20 text-muted-foreground border-border/40 hover:border-primary/30 hover:text-primary"
                }`}
              >
                <Users className="w-3 h-3" />
                GROUP BY COUNTERPARTY
              </button>
              <div className="text-right">
                <div className="text-xs font-mono text-muted-foreground">
                  {txLoading ? "LOADING..." : groupByCounterparty
                    ? `${groupedRows.length} COUNTERPARTY ROWS`
                    : `${filteredTxs.length} TXS`}
                </div>
                <div className="flex gap-3 mt-0.5 text-xs font-mono justify-end">
                  <span className="text-green-400">↓ {inCount} IN</span>
                  <span className="text-red-400">↑ {outCount} OUT</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Group sort controls — only visible when Group By Counterparty is ON ── */}
          {groupByCounterparty && (
            <div className="flex items-center gap-2.5 pt-3 mt-1 border-t border-border/30 flex-wrap">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">Sort Counterparties:</span>
              <div className="flex items-center rounded border border-border/40 overflow-hidden text-[10px] font-mono flex-wrap">
                {(["most-txs", "highest-value", "recent", "exchange-first"] as const).map((key) => {
                  const label = {
                    "most-txs":       "⬆ MOST TXS",
                    "highest-value":  "💰 HIGHEST VALUE",
                    "recent":         "🕐 RECENT",
                    "exchange-first": "🏦 EXCHANGES FIRST",
                  }[key];
                  return (
                    <button
                      key={key}
                      onClick={() => setGroupSort(key)}
                      className={`px-3 py-1.5 border-r last:border-r-0 border-border/40 transition-colors whitespace-nowrap ${
                        groupSort === key
                          ? key === "exchange-first"
                            ? "bg-blue-900/40 text-blue-300 font-semibold"
                            : "bg-primary/20 text-primary font-semibold"
                          : "bg-muted/10 text-muted-foreground hover:text-primary hover:bg-muted/20"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[10px] font-mono text-muted-foreground/50 hidden sm:inline">
                + {viewMode === "in-first" ? "IN first" : viewMode === "out-first" ? "OUT first" : "mixed order"}
              </span>
            </div>
          )}
        </CardHeader>

        <div className="overflow-x-auto">
          {groupByCounterparty ? (
            /* ── GROUPED BY (address + direction) VIEW ── */
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-xs font-mono text-muted-foreground bg-muted/10">
                  <th className="px-5 py-3 font-normal w-20">DIR</th>
                  <th className="px-5 py-3 font-normal">COUNTERPARTY</th>
                  <th className="px-5 py-3 font-normal">LABEL</th>
                  <th className="px-5 py-3 font-normal text-center">TXS</th>
                  <th className="px-5 py-3 font-normal text-right">TOTAL AMOUNT</th>
                  <th className="px-5 py-3 font-normal text-right">ASSET</th>
                  <th className="px-5 py-3 font-normal text-right">LAST SEEN</th>
                  <th className="px-5 py-3 font-normal"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {txLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={8} className="px-5 py-3"><div className="h-5 bg-muted/40 rounded animate-pulse" /></td></tr>
                  ))
                ) : groupedRows.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground font-mono text-sm">
                    {allTxs.length > 0 ? `ALL ${allTxs.length} TXS BELOW MIN AMOUNT (${minAmount} ${chain.toUpperCase()})` : "NO TRANSACTIONS FOUND"}
                  </td></tr>
                ) : (
                  groupedRows.map((row, idx) => {
                    const known = KNOWN_LABELS[row.address];
                    const saved = savedWallets.has(row.address);
                    return (
                      <tr key={`${row.address}:${row.direction}:${idx}`} className={`hover:bg-muted/10 transition-colors text-sm font-mono ${known ? "bg-muted/5" : ""}`}>
                        <td className="px-5 py-3">
                          {row.direction === "in" ? (
                            <span className="inline-flex items-center gap-1 text-green-400 bg-green-950/40 border border-green-500/20 px-2 py-0.5 rounded text-xs"><ArrowDownLeft className="w-3 h-3" /> IN</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-400 bg-red-950/40 border border-red-500/20 px-2 py-0.5 rounded text-xs"><ArrowUpRight className="w-3 h-3" /> OUT</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveMenu({ addr: row.address, x: rect.left, y: rect.bottom + 4 });
                              }}
                              className="text-primary/80 hover:text-primary text-xs hover:underline font-mono"
                            >
                              {row.address.length > 16 ? `${row.address.slice(0, 10)}…${row.address.slice(-4)}` : row.address}
                            </button>
                            {saved && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                            <a
                              href={WALLET_EXPLORER_MAP[chain]?.(row.address) ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-muted-foreground hover:text-primary transition-colors"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {known ? getKnownBadge(known, "lg") : <span className="text-muted-foreground/30 text-xs font-mono">—</span>}
                        </td>
                        <td className="px-5 py-3 text-center text-muted-foreground">{row.txCount}</td>
                        <td className={`px-5 py-3 text-right text-xs ${row.direction === "in" ? "text-green-400" : "text-red-400"}`}>
                          {row.direction === "in" ? "+" : "−"}{row.totalValue.toFixed(4)}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground text-xs uppercase">{row.asset}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground text-xs">
                          {row.latestTs ? new Date(row.latestTs).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleSavedWallet(row.address); }}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors whitespace-nowrap ${
                                savedWallets.has(row.address)
                                  ? "text-yellow-400 border-yellow-500/40 bg-yellow-950/20 hover:bg-yellow-950/40"
                                  : "text-muted-foreground border-border/30 hover:text-yellow-400 hover:border-yellow-500/40"
                              }`}
                              title={savedWallets.has(row.address) ? "Remove from watchlist" : "Add to watchlist"}
                            >
                              {savedWallets.has(row.address) ? <BookmarkCheck className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={() => continueTrailOnWallet(row.address)}
                              className="text-[10px] font-mono text-primary/70 hover:text-primary border border-primary/20 hover:border-primary/50 px-2 py-0.5 rounded transition-colors whitespace-nowrap"
                            >
                              TRAIL →
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            /* ── INDIVIDUAL TX VIEW ── */
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-xs font-mono text-muted-foreground bg-muted/10">
                  <th className="px-5 py-3 font-normal w-20">DIR</th>
                  <th className="px-5 py-3 font-normal">TX HASH</th>
                  <th className="px-5 py-3 font-normal">TIMESTAMP</th>
                  <th className="px-5 py-3 font-normal">COUNTERPARTY</th>
                  <th className="px-5 py-3 font-normal text-right">AMOUNT</th>
                  <th className="px-5 py-3 font-normal text-right">ASSET</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {txLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-5 py-3"><div className="h-5 bg-muted/40 rounded animate-pulse" /></td></tr>
                  ))
                ) : filteredTxs.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground font-mono text-sm">
                    {allTxs.length > 0 ? `ALL ${allTxs.length} TXS BELOW MIN AMOUNT (${minAmount} ${chain.toUpperCase()})` : "NO TRANSACTIONS FOUND"}
                  </td></tr>
                ) : (
                  filteredTxs.map((tx, idx) => {
                    const counterparty = tx.direction === "in" ? tx.from : tx.to;
                    const isIn = tx.direction === "in";
                    const isOut = tx.direction === "out";
                    const val = parseFloat(tx.value);
                    return (
                      <tr key={tx.hash || idx} className="hover:bg-muted/10 transition-colors text-sm font-mono">
                        <td className="px-5 py-3">
                          {isIn ? (
                            <span className="inline-flex items-center gap-1 text-green-400 bg-green-950/40 border border-green-500/20 px-2 py-0.5 rounded text-xs font-bold">
                              <ArrowDownLeft className="w-3 h-3" /> IN
                            </span>
                          ) : isOut ? (
                            <span className="inline-flex items-center gap-1 text-red-400 bg-red-950/40 border border-red-500/20 px-2 py-0.5 rounded text-xs font-bold">
                              <ArrowUpRight className="w-3 h-3" /> OUT
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground bg-muted/40 border border-border/40 px-2 py-0.5 rounded text-xs">
                              <ArrowLeftRight className="w-3 h-3" /> SELF
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {tx.hash ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-primary/80 text-xs">
                                {tx.hash.length > 12 ? `${tx.hash.slice(0, 8)}…${tx.hash.slice(-4)}` : tx.hash}
                              </span>
                              {explorerTxUrl && (
                                <a href={explorerTxUrl(tx.hash)} target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                          {tx.destinationTag != null && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-cyan-200 bg-cyan-900/70 border border-cyan-400/50 px-2 py-0.5 rounded-md shadow-sm whitespace-nowrap">
                                🏷 TAG {tx.destinationTag}
                              </span>
                            </div>
                          )}
                          {tx.memo && (
                            <div className="flex items-center gap-1 mt-1 max-w-[200px]">
                              <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-200 bg-amber-900/60 border border-amber-400/40 px-2 py-0.5 rounded-md shadow-sm truncate w-full" title={tx.memo}>
                                <MessageSquare className="w-3 h-3 shrink-0 text-amber-300" />
                                {tx.memo}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">
                          {tx.timestamp ? new Date(tx.timestamp).toLocaleString(undefined, {
                            month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
                          }) : "—"}
                        </td>
                        <td className="px-5 py-3">{renderCounterpartyCell(counterparty ?? null, tx.direction)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className={val > 0 ? isIn ? "text-green-400" : isOut ? "text-red-400" : "text-foreground" : "text-muted-foreground"}>
                            {isIn ? "+" : isOut ? "−" : ""}{tx.value}
                          </div>
                          {tx.valueUsd > 0 && <div className="text-xs text-muted-foreground mt-0.5">${tx.valueUsd.toLocaleString()}</div>}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground text-xs uppercase">
                          {tx.tokenSymbol || chain.toUpperCase()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Load More / Load All ── */}
        {page.current.error && !txLoading && (
          <div className="px-5 py-3 border-t border-border/40 bg-red-950/10 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-mono text-red-400">{page.current.error}</span>
              <span className="text-xs font-mono text-muted-foreground ml-2">— cursor preserved, click to retry</span>
            </div>
            <button
              onClick={() => { page.current.error = null; setAllTxs([...page.current.txs]); }}
              className="text-muted-foreground/40 hover:text-muted-foreground shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {page.current.hasMore && !txLoading && (
          <div className="px-5 py-4 border-t border-border/40 bg-muted/5">
            {allTxs.length >= 20000 && (
              <div className="mb-2.5 flex items-center gap-1.5 text-xs font-mono text-yellow-400">
                <AlertTriangle className="w-3 h-3" />
                {allTxs.length.toLocaleString()} transactions loaded — loading more may slow your browser.
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-mono text-muted-foreground">
                  {allTxs.length.toLocaleString()} loaded · more available
                </span>
                {page.current.status && (
                  <span className="text-[10px] font-mono text-primary/70">{page.current.status}</span>
                )}
                {page.current.cursor && !page.current.busy && (
                  <span className="text-[10px] font-mono text-muted-foreground/40 break-all">
                    CURSOR: {page.current.cursor.length > 20
                      ? `${page.current.cursor.slice(0, 20)}…${page.current.cursor.slice(-8)}`
                      : page.current.cursor}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs"
                  disabled={page.current.busy}
                  onClick={loadMore}
                >
                  {page.current.busy
                    ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> LOADING…</>
                    : loadMoreLabel}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs border-primary/30 text-primary hover:bg-primary/10"
                  disabled={page.current.busy}
                  onClick={loadAll}
                >
                  {page.current.busy
                    ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> LOADING…</>
                    : "LOAD ALL (UP TO 25K)"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {!page.current.hasMore && allTxs.length > 0 && !txLoading && (
          <div className="px-5 py-3 border-t border-border/40 text-center text-xs font-mono text-muted-foreground/60">
            FULL HISTORY LOADED · {allTxs.length.toLocaleString()} TRANSACTIONS
          </div>
        )}
      </Card>

      {/* ── Trail Trace Panel ── */}
      {showTrailPanel && (
        <Card ref={trailPanelRef} className="bg-card/40 border-border/40 border-primary/20">
          <CardHeader className="border-b border-border/40 pb-4 px-5 pt-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-primary">
                  Trail Trace // Active
                </CardTitle>
                <span className="text-xs font-mono text-muted-foreground">
                  MAX DEPTH 5 · {trailEntries.length} NODES
                </span>
                {comminglingAddresses.size > 0 && (
                  <span className="flex items-center gap-1 text-xs font-mono text-yellow-400 bg-yellow-950/40 border border-yellow-500/20 px-2 py-0.5 rounded">
                    <AlertTriangle className="w-3 h-3" />
                    {comminglingAddresses.size} COMMINGLING DETECTED
                  </span>
                )}
              </div>
              <button onClick={() => setShowTrailPanel(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-4 mt-3 text-[10px] font-mono text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" /> Target</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Exchange</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Commingling</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" /> Standard Wallet</span>
            </div>
          </CardHeader>

          {/* ── Analysis Sections ─────────────────────────────────────── */}
          {intersectionData && !trailEntries[0]?.isLoading && trailEntries.length > 1 && (
            <div className="divide-y divide-border/20 border-b border-border/30">

              {/* ── § 1 Direct Intersections ──────────────────────────────── */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-green-500 rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-green-400 font-bold tracking-widest uppercase">
                    § 1 — Direct Intersections
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {intersectionData.directIntersections.length > 0
                      ? `${intersectionData.directIntersections.length} wallet${intersectionData.directIntersections.length > 1 ? "s" : ""} found in both trail + tx history`
                      : "none found"}
                  </span>
                  {intersectionData.totalTxsLoaded === 0 && (
                    <span className="text-[10px] font-mono text-yellow-400 bg-yellow-950/30 px-1.5 py-0.5 rounded border border-yellow-500/20">
                      load transactions first
                    </span>
                  )}
                </div>
                {intersectionData.directIntersections.length === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground/40 pl-3 leading-relaxed">
                    A direct intersection means a wallet appears in both this address's transaction history AND the connection graph.
                    Expand more trail nodes and load more transactions to surface them.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {intersectionData.directIntersections.map((d, i) => (
                      <div key={d.address} className="bg-green-950/20 border border-green-500/20 rounded p-3">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="text-[10px] font-mono bg-green-900/60 text-green-300 px-1.5 py-0.5 rounded font-bold shrink-0">
                            #{i + 1}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: d.address, x: r.left, y: r.bottom + 4 }); }}
                            className="text-primary/80 hover:text-primary text-xs font-mono hover:underline transition-colors"
                          >
                            {d.address.length > 16 ? `${d.address.slice(0, 8)}…${d.address.slice(-6)}` : d.address}
                          </button>
                          {d.knownInfo && getKnownBadge(d.knownInfo)}
                          {savedWallets.has(d.address) && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                          <span className="ml-auto text-[10px] font-mono text-muted-foreground shrink-0">TRAIL DEPTH {d.depth}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-[10px] font-mono pl-1">
                          <div><span className="text-muted-foreground">TXS </span><span className="text-green-300 font-bold">{d.cp.txCount}</span></div>
                          <div><span className="text-muted-foreground">TOTAL </span><span className="text-foreground font-bold">{d.cp.totalValue.toFixed(4)} {chain.toUpperCase()}</span></div>
                          <div><span className="text-muted-foreground">FIRST </span><span className="text-foreground">{d.cp.firstTs.slice(0, 10)}</span></div>
                          <div><span className="text-muted-foreground">LAST </span><span className="text-foreground">{d.cp.lastTs.slice(0, 10)}</span></div>
                        </div>
                        {d.cp.sampleHash && (
                          <div className="text-[10px] font-mono text-muted-foreground/60 mt-1.5 flex items-center gap-1.5 flex-wrap pl-1">
                            <span>SAMPLE TX:</span>
                            <span className="text-primary/60">{d.cp.sampleHash.slice(0, 16)}…</span>
                            {explorerTxUrl && (
                              <a href={explorerTxUrl(d.cp.sampleHash)} target="_blank" rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors">
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            <span className="text-muted-foreground/40">{d.cp.sampleDate.slice(0, 16).replace("T", " ")} UTC</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── § 2 Common Endpoints ──────────────────────────────────── */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-orange-500 rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-orange-400 font-bold tracking-widest uppercase">
                    § 2 — Common Endpoints
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {intersectionData.commonEndpoints.length > 0
                      ? `${intersectionData.commonEndpoints.length} wallet${intersectionData.commonEndpoints.length > 1 ? "s" : ""} reachable via multiple paths — potential commingling`
                      : "none detected"}
                  </span>
                </div>
                {intersectionData.commonEndpoints.length === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground/40 pl-3 leading-relaxed">
                    Expand more trail nodes to detect wallets reachable from multiple independent paths — a classic indicator of fund commingling or round-tripping.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {intersectionData.commonEndpoints.map((ep, i) => (
                      <div key={ep.address} className="bg-orange-950/20 border border-orange-500/30 rounded p-3">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-[10px] font-mono bg-orange-900/60 text-orange-300 px-1.5 py-0.5 rounded font-bold shrink-0">
                            #{i + 1}
                          </span>
                          <AlertTriangle className="w-3 h-3 text-orange-400 shrink-0" />
                          <button
                            onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: ep.address, x: r.left, y: r.bottom + 4 }); }}
                            className="text-primary/80 hover:text-primary text-xs font-mono hover:underline transition-colors"
                          >
                            {ep.address.length > 16 ? `${ep.address.slice(0, 8)}…${ep.address.slice(-6)}` : ep.address}
                          </button>
                          {ep.trailEntry?.knownInfo && getKnownBadge(ep.trailEntry.knownInfo)}
                          <span className="text-[10px] font-mono text-orange-400 font-bold ml-auto shrink-0">{ep.parents.length} PATHS CONVERGE</span>
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground pl-1 flex flex-wrap gap-1 items-center">
                          <span className="text-muted-foreground/50">VIA:</span>
                          {ep.parents.map((p, pi) => (
                            <span key={p} className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: p, x: r.left, y: r.bottom + 4 }); }}
                                className="text-primary/60 hover:text-primary hover:underline font-mono transition-colors"
                              >
                                {p.length > 12 ? `${p.slice(0, 6)}…${p.slice(-4)}` : p}
                              </button>
                              {pi < ep.parents.length - 1 && <span className="text-muted-foreground/30">·</span>}
                            </span>
                          ))}
                        </div>
                        {ep.cpData && (
                          <div className="grid grid-cols-2 gap-x-6 text-[10px] font-mono mt-1.5 pl-1">
                            <div><span className="text-muted-foreground">TXS </span><span className="text-foreground">{ep.cpData.txCount}</span></div>
                            <div><span className="text-muted-foreground">TOTAL </span><span className="text-foreground">{ep.cpData.totalValue.toFixed(4)} {chain.toUpperCase()}</span></div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── § 3 Numbered Trail Paths ──────────────────────────────── */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-primary rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-primary font-bold tracking-widest uppercase">
                    § 3 — Trail Paths
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {intersectionData.paths.length} path{intersectionData.paths.length !== 1 ? "s" : ""} · ⚡ intersection · ⚠ commingling
                  </span>
                </div>
                <div className="space-y-1.5">
                  {intersectionData.paths.map((path, pi) => (
                    <div key={pi} className="flex items-start gap-2 flex-wrap text-[10px] font-mono">
                      <span className="text-muted-foreground/40 shrink-0 w-5 text-right mt-0.5">#{pi + 1}</span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {path.map((addr, ai) => {
                          const isInt = intersectionData.intersectionAddrs.has(addr);
                          const isComEP = intersectionData.commonEndpoints.some((c) => c.address === addr);
                          const isRoot = ai === 0;
                          const known = KNOWN_LABELS[addr];
                          const short = addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
                          return (
                            <span key={addr + ai} className="flex items-center gap-1">
                              {ai > 0 && <span className="text-muted-foreground/25">→</span>}
                              <button
                                onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr, x: r.left, y: r.bottom + 4 }); }}
                                className={`px-1.5 py-0.5 rounded border transition-colors ${
                                  isRoot
                                    ? "bg-primary/20 text-primary border-primary/30"
                                    : isInt
                                    ? "bg-green-950/60 text-green-300 border-green-500/40 font-bold"
                                    : isComEP
                                    ? "bg-orange-950/60 text-orange-300 border-orange-500/40"
                                    : "text-muted-foreground hover:text-foreground border-transparent hover:border-border/30"
                                }`}
                              >
                                {isInt && <span className="mr-0.5">⚡</span>}
                                {isComEP && !isInt && <span className="mr-0.5">⚠</span>}
                                {known ? known.label : short}
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ── § 4 Full Connection Tree (collapsible) ────────────────────── */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowNodeTree((v) => !v); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-[10px] font-mono text-muted-foreground hover:text-foreground border-b border-border/20 hover:bg-muted/10 transition-colors"
          >
            {showNodeTree ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
            <span className="uppercase tracking-wider">§ 4 — Full Connection Tree</span>
            <span className="text-muted-foreground/40">{trailEntries.length} nodes · click to {showNodeTree ? "collapse" : "expand"}</span>
          </button>
          {showNodeTree && (
            <div className="p-4 space-y-1 max-h-[420px] overflow-y-auto">
              {trailEntries.map((entry) => {
                const isCommingling = comminglingAddresses.has(entry.address);
                const isExchange = entry.knownInfo?.type === "exchange";
                const isGenesis = entry.knownInfo?.type === "genesis";
                const isRoot = entry.depth === 0;

                let dotColor = "bg-muted-foreground";
                if (isRoot) dotColor = "bg-primary";
                else if (isExchange) dotColor = "bg-blue-500";
                else if (isGenesis) dotColor = "bg-purple-500";
                else if (isCommingling) dotColor = "bg-yellow-500";
                else if (intersectionData?.intersectionAddrs.has(entry.address)) dotColor = "bg-green-500";

                let rowBg = "hover:bg-muted/10";
                if (isCommingling) rowBg = "bg-yellow-950/20 hover:bg-yellow-950/30 border-l-2 border-yellow-500/40";
                else if (intersectionData?.intersectionAddrs.has(entry.address)) rowBg = "bg-green-950/20 hover:bg-green-950/30 border-l-2 border-green-500/40";
                else if (isExchange) rowBg = "bg-blue-950/10 hover:bg-blue-950/20";
                else if (isRoot) rowBg = "bg-primary/5 border-l-2 border-primary/40";

                return (
                  <div
                    key={`${entry.address}-${entry.depth}-${entry.parentAddress}`}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-xs font-mono transition-colors ${rowBg}`}
                    style={{ paddingLeft: `${12 + entry.depth * 20}px` }}
                  >
                    {entry.depth > 0 && (
                      <span className="text-border/60 shrink-0">{"└─"}</span>
                    )}
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${entry.isLoading ? "animate-pulse" : ""}`} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setActiveMenu({ addr: entry.address, x: rect.left, y: rect.bottom + 4 });
                      }}
                      className="text-primary/80 hover:text-primary hover:underline transition-colors truncate max-w-[200px]"
                    >
                      {entry.address.length > 20 ? `${entry.address.slice(0, 10)}…${entry.address.slice(-6)}` : entry.address}
                    </button>
                    {entry.knownInfo && getKnownBadge(entry.knownInfo)}
                    {savedWallets.has(entry.address) && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                    {intersectionData?.intersectionAddrs.has(entry.address) && (
                      <span className="flex items-center gap-1 text-green-400 bg-green-950/40 px-1.5 py-0.5 rounded border border-green-500/20 text-[10px]">
                        ⚡ INTERSECTION
                      </span>
                    )}
                    {isCommingling && !intersectionData?.intersectionAddrs.has(entry.address) && (
                      <span className="flex items-center gap-1 text-yellow-400 bg-yellow-950/40 px-1.5 py-0.5 rounded border border-yellow-500/20 text-[10px]">
                        <AlertTriangle className="w-2.5 h-2.5" /> COMMINGLING
                      </span>
                    )}
                    <span className="text-muted-foreground/60 shrink-0">D{entry.depth}</span>
                    {entry.totalValueUsd > 0 && (
                      <span className="text-muted-foreground shrink-0">${entry.totalValueUsd.toFixed(0)}</span>
                    )}
                    {entry.txCount > 0 && (
                      <span className="text-muted-foreground/60 shrink-0">{entry.txCount} tx</span>
                    )}
                    {entry.error && <span className="text-red-400 text-[10px]">FETCH FAILED</span>}
                    {entry.isLoading && <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />}
                    {!entry.isLoading && !entry.isExpanded && !entry.error && entry.depth < 5 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); expandTrailNode(entry); }}
                        className="ml-auto shrink-0 flex items-center gap-1 text-[10px] text-primary/60 hover:text-primary border border-primary/20 hover:border-primary/50 px-1.5 py-0.5 rounded transition-colors"
                      >
                        <ChevronRight className="w-2.5 h-2.5" /> EXPAND
                      </button>
                    )}
                    {entry.isExpanded && entry.childAddresses.length > 0 && (
                      <span className="ml-auto shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <ChevronDown className="w-2.5 h-2.5" /> {entry.childAddresses.length} peers
                      </span>
                    )}
                    {entry.isExpanded && entry.childAddresses.length === 0 && (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/40">NO CONNECTIONS</span>
                    )}
                    {entry.depth >= 5 && (
                      <span className="ml-auto shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground/40">
                        <Zap className="w-2.5 h-2.5" /> MAX DEPTH
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
      {/* ── Multi-Wallet Commingling Analysis Panel ── */}
      {showMultiPanel && (
        <Card ref={multiPanelRef} className="bg-card/40 border-violet-500/30 shadow-lg shadow-violet-500/5">
          <CardHeader className="border-b border-border/40 pb-4 px-5 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                <CardTitle className="text-sm font-mono uppercase tracking-widest text-violet-300">
                  Multi-Wallet Commingling Analysis
                </CardTitle>
                {multiResult && (
                  <span className="text-xs font-mono text-muted-foreground">
                    {multiResult.trackedWallets.length} wallets · {multiResult.sharedCounterparties.length + multiResult.commonEndpoints.length} shared nodes
                  </span>
                )}
              </div>
              <button onClick={() => setShowMultiPanel(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-1.5 leading-relaxed">
              Map depth-2 connections for multiple wallets and surface shared counterparties, common endpoints, and commingling paths. Add up to 4 additional wallets to cross-reference.
            </p>

            {/* ── Tracked Wallet List ── */}
            <div className="mt-4 space-y-2.5">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Tracked Wallets</div>

              {/* Primary wallet (always included) */}
              {(() => { const c = WALLET_COLORS[0]; return (
                <div className={`flex items-center gap-2.5 ${c.bg} border ${c.border} rounded-lg px-3 py-2`}>
                  <div className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                  <span className={`text-xs font-mono ${c.text} flex-1 truncate min-w-0`}>{address}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 uppercase">Primary</span>
                  {KNOWN_LABELS[address] && <span className="shrink-0">{getKnownBadge(KNOWN_LABELS[address])}</span>}
                </div>
              ); })()}

              {/* Additional wallets */}
              {multiWallets.map((w, i) => {
                const c = WALLET_COLORS[(i + 1) % WALLET_COLORS.length];
                return (
                  <div key={w} className={`flex items-center gap-2.5 ${c.bg} border ${c.border} rounded-lg px-3 py-2`}>
                    <div className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                    <span className={`text-xs font-mono ${c.text} flex-1 truncate min-w-0`}>{w}</span>
                    <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">Wallet {i + 2}</span>
                    {KNOWN_LABELS[w] && <span className="shrink-0">{getKnownBadge(KNOWN_LABELS[w])}</span>}
                    <button
                      onClick={() => setMultiWallets((prev) => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground/60 hover:text-red-400 transition-colors shrink-0 ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}

              {/* Add wallet input */}
              {multiWallets.length < 4 && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={multiWalletInput}
                    onChange={(e) => setMultiWalletInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && multiWalletInput.trim() && !multiWallets.includes(multiWalletInput.trim())) {
                        setMultiWallets((prev) => [...prev, multiWalletInput.trim()]);
                        setMultiWalletInput("");
                      }
                    }}
                    placeholder="Paste additional wallet address…"
                    className="flex-1 bg-muted/20 border border-border/40 focus:border-violet-500/50 rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors"
                  />
                  <button
                    onClick={() => {
                      const trimmed = multiWalletInput.trim();
                      if (trimmed && !multiWallets.includes(trimmed)) {
                        setMultiWallets((prev) => [...prev, trimmed]);
                        setMultiWalletInput("");
                      }
                    }}
                    disabled={!multiWalletInput.trim()}
                    className="px-3 py-2 rounded-lg bg-violet-900/60 border border-violet-500/40 text-violet-300 hover:bg-violet-900/80 disabled:opacity-40 transition-colors shrink-0"
                    title="Add wallet"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Analyze button */}
              <button
                onClick={runMultiAnalysis}
                disabled={multiLoading || multiWallets.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:bg-muted/30 disabled:text-muted-foreground/60 text-white font-mono text-xs font-bold tracking-widest transition-colors mt-1"
              >
                {multiLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>ANALYZING…</span>
                    {multiProgress && <span className="opacity-60 truncate max-w-[240px] font-normal">{multiProgress}</span>}
                  </>
                ) : (
                  <><GitMerge className="w-3.5 h-3.5" /> RUN COMMINGLING ANALYSIS</>
                )}
              </button>
              {multiError && (
                <p className="text-xs font-mono text-red-400 flex items-center gap-1.5 mt-0.5">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {multiError}
                </p>
              )}
            </div>
          </CardHeader>

          {multiResult && (
            <div className="divide-y divide-border/20">

              {/* ── Wallet legend ── */}
              <div className="px-5 py-3 flex items-center gap-4 flex-wrap bg-muted/5">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Legend:</span>
                {multiResult.trackedWallets.map((w, i) => {
                  const c = WALLET_COLORS[i % WALLET_COLORS.length];
                  return (
                    <div key={w} className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                      <span className={`text-[10px] font-mono ${c.text}`}>
                        {i === 0 ? "PRIMARY" : `W${i + 1}`}: {w.length > 18 ? `${w.slice(0, 10)}…${w.slice(-4)}` : w}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* ── § 1 Shared Counterparties (depth-1 overlap) ── */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-violet-500 rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-violet-300 font-bold tracking-widest uppercase">§ 1 — Shared Counterparties</span>
                  <span className="text-[10px] font-mono text-muted-foreground">wallets all targets transact with directly</span>
                  <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${multiResult.sharedCounterparties.length > 0 ? "bg-violet-950/60 text-violet-200 border-violet-400/40" : "text-muted-foreground border-border/30"}`}>
                    {multiResult.sharedCounterparties.length} found
                  </span>
                </div>
                {multiResult.sharedCounterparties.length === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground/40 pl-3 leading-relaxed">
                    No direct shared counterparties. These wallets may be connected at depth-2 — check Common Endpoints below.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {multiResult.sharedCounterparties.map((entry, i) => (
                      <div key={entry.address} className="bg-violet-950/20 border border-violet-500/20 rounded-lg p-3">
                        <div className="flex items-center gap-2 flex-wrap mb-2.5">
                          <span className="text-[10px] font-mono bg-violet-900/70 text-violet-200 px-1.5 py-0.5 rounded border border-violet-400/40 font-bold shrink-0">
                            #{i + 1}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: entry.address, x: r.left, y: r.bottom + 4 }); }}
                            className="text-primary/80 hover:text-primary text-xs font-mono hover:underline transition-colors"
                          >
                            {entry.address.length > 20 ? `${entry.address.slice(0, 10)}…${entry.address.slice(-6)}` : entry.address}
                          </button>
                          {entry.knownInfo && getKnownBadge(entry.knownInfo, "md")}
                          {savedWallets.has(entry.address) && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                          <span className="ml-auto text-[10px] font-mono text-violet-400 font-bold shrink-0">
                            {entry.appearances.length}/{multiResult.trackedWallets.length} wallets
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {entry.appearances.map((app) => {
                            const idx = multiResult.trackedWallets.indexOf(app.wallet);
                            const c = WALLET_COLORS[idx % WALLET_COLORS.length];
                            return (
                              <div key={app.wallet} className={`flex items-center gap-1.5 ${c.bg} border ${c.border} rounded px-2 py-1 text-[10px] font-mono`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0`} />
                                <span className={`${c.text} font-bold`}>{idx === 0 ? "PRIMARY" : `W${idx + 1}`}</span>
                                <span className="text-muted-foreground/60">·</span>
                                <span className="text-foreground font-bold">{app.txCount} tx</span>
                                {app.totalValueUsd > 0 && <span className="text-muted-foreground">${app.totalValueUsd.toFixed(0)}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── § 2 Common Endpoints (depth-2 overlap) ── */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-orange-500 rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-orange-300 font-bold tracking-widest uppercase">§ 2 — Common Endpoints</span>
                  <span className="text-[10px] font-mono text-muted-foreground">reached by 2+ wallets at depth-2</span>
                  <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${multiResult.commonEndpoints.length > 0 ? "bg-orange-950/60 text-orange-200 border-orange-400/40" : "text-muted-foreground border-border/30"}`}>
                    {multiResult.commonEndpoints.length} found
                  </span>
                </div>
                {multiResult.commonEndpoints.length === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground/40 pl-3 leading-relaxed">
                    No depth-2 common endpoints found. The wallets may not share 2nd-degree connections.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {multiResult.commonEndpoints.slice(0, 25).map((entry, i) => (
                      <div key={entry.address} className="bg-orange-950/15 border border-orange-500/20 rounded-lg p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono bg-orange-900/70 text-orange-200 px-1.5 py-0.5 rounded border border-orange-400/40 font-bold shrink-0">
                            #{i + 1}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: entry.address, x: r.left, y: r.bottom + 4 }); }}
                            className="text-primary/80 hover:text-primary text-xs font-mono hover:underline transition-colors"
                          >
                            {entry.address.length > 20 ? `${entry.address.slice(0, 10)}…${entry.address.slice(-6)}` : entry.address}
                          </button>
                          {entry.knownInfo && getKnownBadge(entry.knownInfo)}
                          {savedWallets.has(entry.address) && <Bookmark className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                          <div className="ml-auto flex gap-1.5 flex-wrap">
                            {entry.appearances.map((app) => {
                              const idx = multiResult.trackedWallets.indexOf(app.wallet);
                              const c = WALLET_COLORS[idx % WALLET_COLORS.length];
                              return (
                                <div key={app.wallet} className={`flex items-center gap-1 ${c.bg} border ${c.border} rounded px-1.5 py-0.5 text-[10px] font-mono`}>
                                  <div className={`w-1 h-1 rounded-full ${c.dot}`} />
                                  <span className={`${c.text} font-bold`}>{idx === 0 ? "P" : `W${idx + 1}`}</span>
                                  {app.via && <span className="text-muted-foreground/60">via {app.via.slice(0, 6)}…</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── § 3 Commingling Patterns ── */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-1.5 h-4 bg-red-500 rounded-sm shrink-0" />
                  <span className="text-[10px] font-mono text-red-300 font-bold tracking-widest uppercase">§ 3 — Commingling Patterns</span>
                  <span className="text-[10px] font-mono text-muted-foreground">traced paths to shared nodes</span>
                  <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${multiResult.patterns.length > 0 ? "bg-red-950/60 text-red-200 border-red-400/40" : "text-muted-foreground border-border/30"}`}>
                    {multiResult.patterns.length} patterns
                  </span>
                </div>
                {multiResult.patterns.length === 0 ? (
                  <p className="text-[11px] font-mono text-muted-foreground/40 pl-3">No commingling patterns detected.</p>
                ) : (
                  <div className="space-y-3">
                    {multiResult.patterns.map((pat) => (
                      <div key={pat.sharedAddr} className="bg-red-950/10 border border-red-500/15 rounded-lg p-3">
                        <div className="flex items-center gap-2 flex-wrap mb-2.5">
                          <span className="text-[10px] font-mono bg-red-900/70 text-red-200 px-1.5 py-0.5 rounded border border-red-400/40 font-bold shrink-0">
                            PATTERN #{pat.id}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setActiveMenu({ addr: pat.sharedAddr, x: r.left, y: r.bottom + 4 }); }}
                            className="text-primary/80 hover:text-primary text-xs font-mono hover:underline transition-colors"
                          >
                            {pat.sharedAddr.length > 20 ? `${pat.sharedAddr.slice(0, 10)}…${pat.sharedAddr.slice(-6)}` : pat.sharedAddr}
                          </button>
                          {pat.knownInfo && getKnownBadge(pat.knownInfo, "md")}
                          <div className="ml-auto flex items-center gap-3 text-[10px] font-mono shrink-0">
                            {pat.totalTxCount > 0 && <span className="text-foreground font-bold">{pat.totalTxCount} tx</span>}
                            {pat.totalValueUsd > 0 && <span className="text-muted-foreground">${pat.totalValueUsd.toFixed(0)}</span>}
                            <span className="text-red-400 font-bold">{pat.paths.length} paths converge</span>
                          </div>
                        </div>
                        <div className="space-y-1.5 pl-2 border-l-2 border-red-500/20">
                          {pat.paths.map((p) => {
                            const idx = multiResult.trackedWallets.indexOf(p.wallet);
                            const c = WALLET_COLORS[idx % WALLET_COLORS.length];
                            return (
                              <div key={p.wallet} className="flex items-center gap-1 flex-wrap text-[10px] font-mono">
                                <span className={`${c.text} font-bold shrink-0`}>{idx === 0 ? "PRIMARY" : `WALLET ${idx + 1}`}</span>
                                {p.path.map((step, si) => (
                                  <span key={si} className="flex items-center gap-1">
                                    {si > 0 && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />}
                                    <span className={
                                      si === 0 ? `${c.text}/70` :
                                      si === p.path.length - 1 ? "text-red-300 font-bold" :
                                      "text-muted-foreground"
                                    }>
                                      {step.length > 14 ? `${step.slice(0, 8)}…${step.slice(-4)}` : step}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </Card>
      )}

    </div>
  );
}
