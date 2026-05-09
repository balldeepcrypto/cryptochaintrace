# CryptoChainTrace

A crypto blockchain wallet tracing tool with a dark intelligence-dashboard UI. Users search wallet addresses across 9 chains, view transaction history, trace wallet connections graphically, and save searches to a database.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/wallet-tracer run dev` — run the frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec (always run after changing `openapi.yaml`)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080, proxied at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite + Wouter + TailwindCSS + shadcn/ui
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/api-zod/src/generated/api.ts` — generated Zod schemas (run codegen, don't edit)
- `lib/api-client-react/src/generated/api.ts` — generated React Query hooks (run codegen, don't edit)
- `artifacts/api-server/src/routes/wallets.ts` — all 3 wallet endpoints (info, transactions, connections)
- `artifacts/api-server/src/routes/searches.ts` — search history routes using DB
- `artifacts/wallet-tracer/src/pages/wallet-detail.tsx` — profile/ledger page with trail trace
- `artifacts/wallet-tracer/src/pages/trace-graph.tsx` — canvas-based connection graph
- `artifacts/wallet-tracer/src/pages/home.tsx` — search home with 9-chain selector

## Architecture decisions

- **Contract-first**: All API shapes live in `openapi.yaml`; never hand-write request/response types
- **DAG via Constellation Network API**: `https://be-mainnet.constellationnetwork.io` (NOT CoinStats). Balance in DATUM (÷1e8). Transactions use `meta.next` token as cursor (base64-encoded JSON `{hash:"..."}`), passed as `?next=<token>` — zero overlap between pages. Do NOT use `search_after` — it causes massive page overlap (95-99 duplicate txs per page).
- **BTC via Blockstream → mempool.space fallback**: Primary `https://blockstream.info/api`, fallback `https://mempool.space/api` (identical response format). Balance = `chain_stats.funded_txo_sum - chain_stats.spent_txo_sum` (satoshis ÷1e8). Page 1: `GET /address/{addr}/txs`; subsequent pages: `GET /address/{addr}/txs/chain/{last_txid}`. Blockstream returns 25 txs/page, mempool.space returns 50 — `hasMore = txs.length >= 25` handles both. Cursor = `txid` of last tx in the batch. Do NOT use blockchain.info.
- **HBAR via Hedera Mirror Node**: `https://mainnet-public.mirrornode.hedera.com`. Account info (balance in tinybars ÷1e8 = HBAR, created_timestamp) via `GET /api/v1/accounts/{id}`. Transactions via `GET /api/v1/transactions?account.id={id}&order=asc&timestamp=gte:{created_ts}&limit={limit}` — CRITICAL: `order=desc` is broken on the public mirror node (returns 0 for ALL accounts including major exchanges). Only `order=asc&timestamp=gte:{created_ts}` works. Results are reversed server-side to show newest first. Transfer amounts are in tinybars; system accounts 0.0.98/800/801/802 are filtered from counterparty detection. Cursor for Load More = base64url of mirror node's `links.next` path. NOT in `COINSTATS_CHAINS` (removed).
- **XDC via api.xdcscan.io**: Balance and transactions via `https://api.xdcscan.io/api` (etherscan-compat format). Balance endpoint returns decimal wei string (not hex). The `txlist` endpoint may return ALL results ignoring page/offset — server applies slice for pagination. Falls back to CoinStats (`connectionId=xdce-crowd-sale`) if primary fails and `COINSTATS_API_KEY` is set. XDC addresses can be `0x`-prefixed or `xdc`-prefixed — `normalizeXdcAddress()` converts xdc→0x. NOT in `COINSTATS_CHAINS` (removed). Both CoinStats fallback calls are wrapped in try/catch.
- **XRP via XRPL JSON-RPC (4-node failover)**: `xrplcluster.com` (primary) → `s1.ripple.com:51234` → `s2.ripple.com:51234` → `xrpl.ws`. Tried in order; first successful response wins. Cursor pagination uses XRPL marker objects (JSON-encoded) as cursor strings; marker returned by `account_tx` is stringified and returned as `nextCursor`.
- **XLM via Stellar Horizon (3-node failover)**: `horizon.stellar.org` (primary) → `horizon-eu.stellar.org` → `stellar.publicnode.org`. All share the same REST API; 400/404 returns `{_empty: true}` gracefully.
- **HBAR via Hedera Mirror Node (2-node failover)**: `mainnet-public.mirrornode.hedera.com` (primary) → `mainnet.mirrornode.hedera.com`. See HBAR-specific notes above.
- **XDC via api.xdcscan.io + RPC balance fallback**: If api.xdcscan.io balance returns empty/0, falls back to XDC JSON-RPC `eth_getBalance` (hex result — BigInt handles both decimal and 0x-prefixed hex in `weiToEth`).
- **Address case sensitivity**: Only EVM chains (ethereum/polygon/bsc) get `.toLowerCase()`. XRP, XLM, HBAR, XDC, DAG are case-sensitive — never lowercase them.
- **Transaction accumulation**: Frontend accumulates transactions across pages in local state (`allTxs`). React Query fetches page 1; "Load More" and "Load All History" buttons fetch subsequent pages via direct `fetch()` with cursor params.
- **savedWallets**: Persisted to `localStorage` as `chaintrace-saved-wallets` (JSON array of address strings). Shown with bookmark icon in counterparty cells.

## Product

- Search any wallet across 9 chains: Ethereum, Bitcoin, Polygon, BSC, XRP, XLM, HBAR, XDC, DAG
- Profile page: balance, risk score, tags, first/last seen, full transaction ledger
- Transaction ledger: individual view OR group-by-counterparty (one row per unique wallet per direction — IN and OUT are separate rows)
- Load More / Load All History: cursor-based pagination to fetch full transaction history (up to 2000 txs)
- Counterparty context menu: View Profile, Continue Trail on this Wallet, Save/Remove from Saved, Open in Explorer
- Saved wallets: bookmark counterparties with `localStorage` persistence, shown with bookmark icon
- START TRAIL TRACE: recursive depth-5 connection expansion with commingling detection and known exchange labels
- TRACE GRAPH: canvas-based force-directed graph of connected wallets

## Gotchas

- Run codegen after ANY change to `openapi.yaml` — generated files in `lib/` must match the spec
- DAG `balance` and `amount` are in DATUM (1 DAG = 1e8 DATUM) — always divide by 1e8
- XRP `date` field is Ripple epoch (add 946684800 seconds to get Unix time)
- XRP `nextCursor` is `JSON.stringify(marker)` — parse with `JSON.parse` before sending to XRPL RPC
- All external fetches use `fetchWithTimeout(url, options, 8000)` — 8 second limit
- `COINSTATS_CHAINS = ["xlm", "hbar", "xdc"]` — DAG is NOT in this list (uses its own API); BTC is NOT in this list (uses Blockstream)
- `evmChains = ["ethereum", "polygon", "bsc"]` — only these get `.toLowerCase()` on addresses; BTC addresses are case-sensitive
- `KNOWN_LABELS` in `wallet-detail.tsx` covers XRP (16 entries), XLM (9 entries), HBAR (5 entries), EVM (18 entries), BTC (12 entries)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
