import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { 
  useGetWallet, 
  useGetWalletTransactions, 
  getGetWalletQueryKey,
  getGetWalletTransactionsQueryKey
} from "@workspace/api-client-react";
import { AddressDisplay } from "@/components/address-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Network, FileCode, Tag, ShieldAlert, ShieldCheck, Shield } from "lucide-react";
import { Link } from "wouter";

export default function WalletDetail() {
  const params = useParams();
  const address = params.address || "";
  // In a real app we'd get chain from search params, defaulting to ethereum here for simplicity
  const chain = new URLSearchParams(window.location.search).get("chain") || "ethereum";
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: wallet, isLoading: walletLoading, error: walletError } = useGetWallet(address, { chain }, {
    query: {
      enabled: !!address,
      queryKey: getGetWalletQueryKey(address, { chain })
    }
  });

  const { data: transactionsData, isLoading: txLoading } = useGetWalletTransactions(address, { chain, page, limit }, {
    query: {
      enabled: !!address,
      queryKey: getGetWalletTransactionsQueryKey(address, { chain, page, limit })
    }
  });

  const getRiskBadge = (score: number | null) => {
    if (score === null) return <div className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted text-muted-foreground"><Shield className="w-3 h-3" /> UNSCORED</div>;
    if (score <= 30) return <div className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-success/20 text-success"><ShieldCheck className="w-3 h-3" /> LOW RISK ({score})</div>;
    if (score <= 70) return <div className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-warning/20 text-warning"><ShieldAlert className="w-3 h-3" /> MED RISK ({score})</div>;
    return <div className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-destructive/20 text-destructive"><ShieldAlert className="w-3 h-3" /> HIGH RISK ({score})</div>;
  };

  if (walletError) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-destructive opacity-50" />
        <h2 className="text-xl font-mono text-destructive">PROFILE NOT FOUND</h2>
        <p className="text-muted-foreground text-sm max-w-md">Target address could not be resolved on the specified network. Verify the address and chain selection.</p>
        <Link href="/">
          <Button variant="outline" className="font-mono mt-4">RETURN TO SEARCH</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Profile */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight font-mono break-all text-primary">
              <AddressDisplay address={address} truncate={false} />
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-2 py-1 bg-accent text-accent-foreground text-xs font-mono rounded uppercase">
              {chain}
            </span>
            {walletLoading ? (
              <div className="w-24 h-6 bg-muted/50 rounded animate-pulse" />
            ) : (
              getRiskBadge(wallet?.riskScore ?? null)
            )}
            {wallet?.isContract && (
              <span className="flex items-center gap-1 px-2 py-1 bg-primary/20 text-primary text-xs font-mono rounded">
                <FileCode className="w-3 h-3" /> CONTRACT
              </span>
            )}
            {wallet?.tags.map(tag => (
              <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-muted text-muted-foreground text-xs font-mono rounded">
                <Tag className="w-3 h-3" /> {tag.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Link href={`/trace/${address}?chain=${chain}`}>
            <Button className="font-mono bg-primary/20 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/50">
              <Network className="w-4 h-4 mr-2" />
              VIEW TRACE GRAPH
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Native Balance</CardTitle>
          </CardHeader>
          <CardContent>
            {walletLoading ? <div className="h-8 bg-muted/50 rounded animate-pulse" /> : (
              <div>
                <div className="text-2xl font-mono text-foreground">{wallet?.balance || "0"}</div>
                <div className="text-sm font-mono text-success">${wallet?.balanceUsd?.toLocaleString() || "0.00"}</div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {walletLoading ? <div className="h-8 bg-muted/50 rounded animate-pulse" /> : (
              <div className="text-2xl font-mono text-foreground">{wallet?.transactionCount?.toLocaleString() || "0"}</div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">First Seen</CardTitle>
          </CardHeader>
          <CardContent>
            {walletLoading ? <div className="h-8 bg-muted/50 rounded animate-pulse" /> : (
              <div className="text-sm font-mono text-foreground">{wallet?.firstSeen ? new Date(wallet.firstSeen).toLocaleDateString() : 'UNKNOWN'}</div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Last Active</CardTitle>
          </CardHeader>
          <CardContent>
            {walletLoading ? <div className="h-8 bg-muted/50 rounded animate-pulse" /> : (
              <div className="text-sm font-mono text-foreground">{wallet?.lastSeen ? new Date(wallet.lastSeen).toLocaleDateString() : 'UNKNOWN'}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card className="bg-card/40 flex-1 flex flex-col">
        <CardHeader className="border-b border-border/50 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-foreground">Transaction Ledger</CardTitle>
            <div className="text-xs font-mono text-muted-foreground">
              {transactionsData ? `SHOWING ${transactionsData.transactions.length} OF ${transactionsData.total}` : 'LOADING...'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/50 text-xs font-mono text-muted-foreground bg-muted/20">
                <th className="p-4 font-normal">TYPE</th>
                <th className="p-4 font-normal">HASH</th>
                <th className="p-4 font-normal">TIMESTAMP</th>
                <th className="p-4 font-normal">COUNTERPARTY</th>
                <th className="p-4 font-normal text-right">VALUE</th>
                <th className="p-4 font-normal text-right">ASSET</th>
              </tr>
            </thead>
            <tbody className="text-sm font-mono divide-y divide-border/50">
              {txLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="p-4"><div className="h-6 bg-muted/50 rounded animate-pulse" /></td>
                  </tr>
                ))
              ) : transactionsData?.transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">NO TRANSACTIONS FOUND</td>
                </tr>
              ) : (
                transactionsData?.transactions.map((tx) => (
                  <tr key={tx.hash} className="hover:bg-muted/20 transition-colors">
                    <td className="p-4">
                      {tx.direction === 'in' ? (
                        <span className="flex items-center gap-1 text-success bg-success/10 px-2 py-1 rounded w-max"><ArrowDownLeft className="w-3 h-3" /> IN</span>
                      ) : tx.direction === 'out' ? (
                        <span className="flex items-center gap-1 text-destructive bg-destructive/10 px-2 py-1 rounded w-max"><ArrowUpRight className="w-3 h-3" /> OUT</span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground bg-muted px-2 py-1 rounded w-max"><ArrowLeftRight className="w-3 h-3" /> SELF</span>
                      )}
                    </td>
                    <td className="p-4">
                      <AddressDisplay address={tx.hash} showIcon={false} className="text-primary hover:underline" />
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {new Date(tx.timestamp).toLocaleString(undefined, { 
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                      })}
                    </td>
                    <td className="p-4">
                      {tx.direction === 'in' ? (
                        <AddressDisplay address={tx.from} />
                      ) : tx.to ? (
                        <AddressDisplay address={tx.to} />
                      ) : (
                        <span className="text-muted-foreground">CONTRACT CREATION</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div>{tx.value}</div>
                      <div className="text-xs text-success">${tx.valueUsd.toLocaleString()}</div>
                    </td>
                    <td className="p-4 text-right text-muted-foreground">
                      {tx.tokenSymbol || chain.toUpperCase()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
        {transactionsData && transactionsData.total > limit && (
          <div className="p-4 border-t border-border/50 flex items-center justify-between bg-muted/10">
            <Button 
              variant="outline" 
              size="sm" 
              className="font-mono"
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              PREV
            </Button>
            <span className="text-xs font-mono text-muted-foreground">PAGE {page}</span>
            <Button 
              variant="outline" 
              size="sm" 
              className="font-mono"
              disabled={page * limit >= transactionsData.total}
              onClick={() => setPage(p => p + 1)}
            >
              NEXT
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
