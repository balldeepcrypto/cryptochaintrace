import { useState, useMemo } from "react";
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
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  Network,
  GitFork,
  FileCode,
  Tag,
  ShieldAlert,
  ShieldCheck,
  Shield,
  ExternalLink,
} from "lucide-react";
import { Link } from "wouter";

const EXPLORER_MAP: Record<string, (hash: string) => string> = {
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

const WALLET_EXPLORER_MAP: Record<string, (addr: string) => string> = {
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

export default function WalletDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const address = params.address || "";
  const chain = new URLSearchParams(window.location.search).get("chain") || "ethereum";
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data: wallet, isLoading: walletLoading, error: walletError } = useGetWallet(
    address,
    { chain },
    { query: { enabled: !!address, queryKey: getGetWalletQueryKey(address, { chain }) } }
  );

  const { data: transactionsData, isLoading: txLoading } = useGetWalletTransactions(
    address,
    { chain, page, limit },
    { query: { enabled: !!address, queryKey: getGetWalletTransactionsQueryKey(address, { chain, page, limit }) } }
  );

  const deduplicatedTxs = useMemo(() => {
    if (!transactionsData?.transactions) return [];
    const seen = new Set<string>();
    return transactionsData.transactions.filter((tx) => {
      const key = tx.hash || `${tx.from}:${tx.to}:${tx.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [transactionsData]);

  const getRiskBadge = (score: number | null) => {
    if (score === null)
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted text-muted-foreground font-mono">
          <Shield className="w-3 h-3" /> UNSCORED
        </span>
      );
    if (score <= 30)
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-950/60 text-green-400 font-mono">
          <ShieldCheck className="w-3 h-3" /> LOW RISK ({score})
        </span>
      );
    if (score <= 70)
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-yellow-950/60 text-yellow-400 font-mono">
          <ShieldAlert className="w-3 h-3" /> MED RISK ({score})
        </span>
      );
    return (
      <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-950/60 text-red-400 font-mono">
        <ShieldAlert className="w-3 h-3" /> HIGH RISK ({score})
      </span>
    );
  };

  const explorerTxUrl = EXPLORER_MAP[chain];
  const explorerAddrUrl = WALLET_EXPLORER_MAP[chain];

  const handleCounterpartyClick = (addr: string) => {
    setLocation(`/wallet/${addr}?chain=${chain}`);
  };

  if (walletError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <ShieldAlert className="w-16 h-16 text-destructive opacity-40" />
        <h2 className="text-xl font-mono text-destructive tracking-widest">PROFILE NOT FOUND</h2>
        <p className="text-muted-foreground text-sm max-w-md font-mono">
          Target address could not be resolved on the{" "}
          <span className="text-primary uppercase">{chain}</span> network.
          Verify the address and chain selection.
        </p>
        <Link href="/">
          <Button variant="outline" className="font-mono mt-4 tracking-wider">
            RETURN TO SEARCH
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-3 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-mono rounded uppercase border border-primary/20">
              {chain}
            </span>
            {walletLoading ? (
              <div className="w-28 h-5 bg-muted/50 rounded animate-pulse" />
            ) : (
              getRiskBadge(wallet?.riskScore ?? null)
            )}
            {wallet?.isContract && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-950/50 text-blue-400 text-xs font-mono rounded border border-blue-500/20">
                <FileCode className="w-3 h-3" /> CONTRACT
              </span>
            )}
            {wallet?.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 px-2 py-0.5 bg-muted text-muted-foreground text-xs font-mono rounded"
              >
                <Tag className="w-3 h-3" /> {tag.toUpperCase()}
              </span>
            ))}
          </div>
          <div className="font-mono text-sm text-foreground break-all bg-muted/20 px-3 py-2 rounded border border-border/40">
            <AddressDisplay address={address} truncate={false} showIcon />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/trace/${address}?chain=${chain}`}>
            <Button
              variant="outline"
              className="font-mono border-primary/30 text-primary hover:bg-primary/10 text-xs"
            >
              <Network className="w-3.5 h-3.5 mr-1.5" />
              TRACE GRAPH
            </Button>
          </Link>
          <Link href={`/trace/${address}?chain=${chain}`}>
            <Button className="font-mono bg-primary text-primary-foreground hover:bg-primary/90 text-xs">
              <GitFork className="w-3.5 h-3.5 mr-1.5" />
              START TRAIL TRACE
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "BALANCE",
            value: walletLoading ? null : wallet?.balance ?? "0",
            sub: walletLoading ? null : `$${(wallet?.balanceUsd ?? 0).toLocaleString()}`,
            subClass: "text-green-400",
          },
          {
            label: "TRANSACTIONS",
            value: walletLoading ? null : (wallet?.transactionCount ?? 0).toLocaleString(),
            sub: null,
          },
          {
            label: "FIRST SEEN",
            value: walletLoading
              ? null
              : wallet?.firstSeen
              ? new Date(wallet.firstSeen).toLocaleDateString()
              : "UNKNOWN",
            sub: null,
          },
          {
            label: "LAST ACTIVE",
            value: walletLoading
              ? null
              : wallet?.lastSeen
              ? new Date(wallet.lastSeen).toLocaleDateString()
              : "UNKNOWN",
            sub: null,
          },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card/40 border-border/40">
            <CardContent className="p-4">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1.5">
                {stat.label}
              </div>
              {stat.value === null ? (
                <div className="h-7 bg-muted/50 rounded animate-pulse" />
              ) : (
                <>
                  <div className="text-xl font-mono text-foreground truncate">{stat.value}</div>
                  {stat.sub && (
                    <div className={`text-xs font-mono mt-0.5 ${stat.subClass ?? "text-muted-foreground"}`}>
                      {stat.sub}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Transaction Ledger */}
      <Card className="bg-card/40 border-border/40">
        <CardHeader className="border-b border-border/40 pb-4 px-5 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-foreground">
                Transaction Ledger
              </CardTitle>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                Deduplicated by tx hash
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono text-muted-foreground">
                {txLoading
                  ? "LOADING..."
                  : `${deduplicatedTxs.length} TXS${transactionsData?.total && transactionsData.total > deduplicatedTxs.length ? ` / ${transactionsData.total} TOTAL` : ""}`}
              </div>
              <div className="flex gap-3 mt-1 text-xs font-mono">
                <span className="text-green-400">
                  ↓ {deduplicatedTxs.filter((t) => t.direction === "in").length} IN
                </span>
                <span className="text-red-400">
                  ↑ {deduplicatedTxs.filter((t) => t.direction === "out").length} OUT
                </span>
              </div>
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
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
                  <tr key={i}>
                    <td colSpan={6} className="px-5 py-3">
                      <div className="h-5 bg-muted/40 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : deduplicatedTxs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground font-mono text-sm">
                    NO TRANSACTIONS FOUND
                  </td>
                </tr>
              ) : (
                deduplicatedTxs.map((tx, idx) => {
                  const counterparty = tx.direction === "in" ? tx.from : tx.to;
                  const isIn = tx.direction === "in";
                  const isOut = tx.direction === "out";
                  const valueNum = parseFloat(tx.value);
                  const hasValue = valueNum > 0;

                  return (
                    <tr
                      key={tx.hash || idx}
                      className="hover:bg-muted/10 transition-colors text-sm font-mono"
                    >
                      {/* Direction */}
                      <td className="px-5 py-3">
                        {isIn ? (
                          <span className="inline-flex items-center gap-1 text-green-400 bg-green-950/40 border border-green-500/20 px-2 py-0.5 rounded text-xs font-bold">
                            <ArrowDownLeft className="w-3 h-3" />
                            IN
                          </span>
                        ) : isOut ? (
                          <span className="inline-flex items-center gap-1 text-red-400 bg-red-950/40 border border-red-500/20 px-2 py-0.5 rounded text-xs font-bold">
                            <ArrowUpRight className="w-3 h-3" />
                            OUT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground bg-muted/40 border border-border/40 px-2 py-0.5 rounded text-xs">
                            <ArrowLeftRight className="w-3 h-3" />
                            SELF
                          </span>
                        )}
                      </td>

                      {/* Tx Hash */}
                      <td className="px-5 py-3">
                        {tx.hash ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-primary/80 text-xs">
                              {tx.hash.length > 12
                                ? `${tx.hash.slice(0, 8)}…${tx.hash.slice(-4)}`
                                : tx.hash}
                            </span>
                            {explorerTxUrl && (
                              <a
                                href={explorerTxUrl(tx.hash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-muted-foreground hover:text-primary transition-colors"
                                title="View on explorer"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* Timestamp */}
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {tx.timestamp
                          ? new Date(tx.timestamp).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>

                      {/* Counterparty */}
                      <td className="px-5 py-3">
                        {counterparty ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleCounterpartyClick(counterparty)}
                              className="text-primary/80 hover:text-primary text-xs hover:underline transition-colors font-mono"
                              title={`Trace ${counterparty}`}
                            >
                              {counterparty.length > 14
                                ? `${counterparty.slice(0, 8)}…${counterparty.slice(-4)}`
                                : counterparty}
                            </button>
                            {explorerAddrUrl && (
                              <a
                                href={explorerAddrUrl(counterparty)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors"
                                title="View on explorer"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        ) : tx.direction === "out" ? (
                          <span className="text-muted-foreground text-xs">CONTRACT CREATION</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-5 py-3 text-right">
                        <div
                          className={
                            hasValue
                              ? isIn
                                ? "text-green-400"
                                : isOut
                                ? "text-red-400"
                                : "text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {isIn ? "+" : isOut ? "−" : ""}
                          {tx.value}
                        </div>
                        {tx.valueUsd > 0 && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            ${tx.valueUsd.toLocaleString()}
                          </div>
                        )}
                      </td>

                      {/* Asset */}
                      <td className="px-5 py-3 text-right text-muted-foreground text-xs uppercase">
                        {tx.tokenSymbol || chain.toUpperCase()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {transactionsData && transactionsData.total > limit && (
          <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between bg-muted/5">
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              PREV
            </Button>
            <span className="text-xs font-mono text-muted-foreground">
              PAGE {page} · {deduplicatedTxs.length} RECORDS
            </span>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              disabled={page * limit >= transactionsData.total}
              onClick={() => setPage((p) => p + 1)}
            >
              NEXT
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
