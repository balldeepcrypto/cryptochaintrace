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
- **DAG via Constellation Network API**: `https://be-mainnet.constellationnetwork.io` (NOT CoinStats). Balance in DATUM (÷1e8). Transactions use `search_after` cursor param.
- **XRP cursor pagination**: Uses XRPL marker objects (JSON-encoded) as cursor strings; marker returned by `account_tx` RPC is stringified and returned as `nextCursor`
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
- `COINSTATS_CHAINS = ["xlm", "hbar", "xdc"]` — DAG is NOT in this list (uses its own API)
- `evmChains = ["ethereum", "polygon", "bsc"]` — only these get `.toLowerCase()` on addresses

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
