// @ts-nocheck
// Vercel serverless entry point.
//
// handler.mjs is a self-contained esbuild bundle produced by:
//   pnpm --filter @workspace/api-server run build
// It exports the Express app WITHOUT starting a server.
// The buildCommand in vercel.json builds it before this function is bundled.
// includeFiles in vercel.json ensures dist/** (incl. pino worker .mjs files)
// are deployed alongside this function.

import app from "../artifacts/api-server/dist/handler.mjs";

export default function handler(req, res) {
  console.log(`[api] ${req.method} ${req.url}`);
  try {
    app(req, res);
  } catch (err) {
    console.error("[api] Unhandled error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error", detail: String(err) });
    }
  }
}
