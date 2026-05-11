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
- **ETH/Polygon via Blockscout v2**: `https://eth.blockscout.com` (ETH) and `https://polygon.blockscout.com` (Polygon). Free, no API key. Address info: `GET /api/v2/addresses/{addr}` → `coin_balance` (wei), `is_contract`, `transaction_count` (may be 0 for some). Transactions: `GET /api/v2/addresses/{addr}/transactions` → `{items, next_page_params}`. Pagination cursor = base64url(JSON.stringify(next_page_params)); pass as query params for next page. Tx fields: `hash`, `value` (wei string), `from.hash`, `to?.hash`, `fee.value` (wei), `timestamp` (ISO), `status` ("ok"/"error"), `block_number`. BSC falls back to Etherscan-style (requires ETHERSCAN_API_KEY env var which is not set — returns empty). Do NOT use Etherscan v1 (`api.etherscan.io`) — deprecated.
- **Min Amount default**: Chain-specific — 0.001 for BTC and ETH (small/expensive coins), 1.0 for all others (XRP, XLM, HBAR, XDC, DAG, Polygon, BSC).
- **DAG via Constellation Network API**: `https://be-mainnet.constellationnetwork.io` (NOT CoinStats). Balance in DATUM (÷1e8). Transactions use `meta.next` token as cursor (base64-encoded JSON `{hash:"..."}`), passed as `?next=<token>` — zero overlap between pages. Do NOT use `search_after` — it causes massive page overlap (95-99 duplicate txs per page).
- **BTC via Blockstream → mempool.space fallback**: Primary `https://blockstream.info/api`, fallback `https://mempool.space/api` (identical response format). Balance = `chain_stats.funded_txo_sum - chain_stats.spent_txo_sum` (satoshis ÷1e8). Page 1: `GET /address/{addr}/txs`; subsequent pages: `GET /address/{addr}/txs/chain/{last_txid}`. Blockstream returns 25 txs/page, mempool.space returns 50 — `hasMore = txs.length >= 25` handles both. Cursor = `txid` of last tx in the batch. Do NOT use blockchain.info.
- **HBAR via Hedera Mirror Node**: `https://mainnet-public.mirrornode.hedera.com`. Account info (balance in tinybars ÷1e8 = HBAR, created_timestamp) via `GET /api/v1/accounts/{id}`. Transactions via `GET /api/v1/transactions?account.id={id}&order=desc&limit={limit}` — newest first, no reversal needed. Load More cursor = base64url of last tx's `consensus_timestamp`; subsequent pages use `&timestamp=lt:{cursor}`. `hasMore` = `rawTxs.length > 0 && !!links.next` (Mirror Node's `links.next` is authoritative but can be stale/false-positive when rawTxs is empty). On the first page, if Mirror Node returns 0 txs but provides `links.next` (account has only old transactions), the server follows the cursor up to 10 times to find the actual transactions. Transfer amounts are in tinybars; system accounts 0.0.98/800/801/802 are filtered from counterparty detection. HTS token transfers (`token_transfers` array) are parsed when HBAR net = 0 — direction/counterparty from token transfer, amount assumed 8 decimals (standard HTS), tokenSymbol = token_id. Wallet info firstSeen = created_timestamp; lastSeen = first result of `order=desc&limit=100` (most recent activity). NOT in `COINSTATS_CHAINS` (removed).
- **XDC via api.xdcscan.io**: Balance and transactions via `https://api.xdcscan.io/api` (etherscan-compat format). Balance endpoint returns decimal wei string (not hex). The `txlist` endpoint is called with `offset=1000` to get up to 1000 txs; may return ALL results at once ignoring page/offset — server applies slice for server-side pagination. Cursor = page number as string (e.g., "2", "3") — each Load More re-fetches with same offset=1000 and slices to the correct range. Falls back to CoinStats (`connectionId=xdce-crowd-sale`) if primary fails and `COINSTATS_API_KEY` is set. XDC addresses can be `0x`-prefixed or `xdc`-prefixed — `normalizeXdcAddress()` converts xdc→0x. NOT in `COINSTATS_CHAINS` (removed). Both CoinStats fallback calls are wrapped in try/catch.
- **XRP via XRPL JSON-RPC (4-node failover)**: `xrplcluster.com` (primary) → `s1.ripple.com:51234` → `s2.ripple.com:51234` → `xrpl.ws`. Tried in order; first successful response wins. Cursor pagination uses XRPL marker objects (JSON-encoded) as cursor strings; marker returned by `account_tx` is stringified and returned as `nextCursor`.
- **XLM via Stellar Horizon (3-node failover)**: `horizon.stellar.org` (primary) → `horizon-eu.stellar.org` → `stellar.publicnode.org`. All share the same REST API; 400/404 returns `{_empty: true}` gracefully (400 reason is logged via `console.warn` for Vercel visibility). Transaction list uses `/accounts/{address}/operations?limit=200&order=desc&include_failed=false&join=transactions` — one record per operation with real amounts (the `/transactions` envelope endpoint always returns `value="0.000000"` which breaks the min-amount filter). `join=transactions` embeds the full parent transaction in each operation record, giving access to `memo` and `memo_type`. Each operation is parsed by `parseStellarOp()` which filters non-value ops (change_trust, manage_offer etc.) and returns null for them; memos are extracted from the embedded `transaction.memo` field. Cursor = `paging_token` of last record.
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
