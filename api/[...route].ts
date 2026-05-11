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
  const start = Date.now();
  const { method, url, headers } = req;

  console.log(`[api] --> ${method} ${url}`);
  console.log(`[api]     host=${headers.host} origin=${headers.origin ?? "-"}`);

  const originalEnd = res.end.bind(res);
  res.end = function (...args) {
    console.log(`[api] <-- ${method} ${url} ${res.statusCode} (${Date.now() - start}ms)`);
    return originalEnd(...args);
  };

  try {
    app(req, res);
  } catch (err) {
    console.error(`[api] CRASH ${method} ${url}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error", detail: String(err) });
    }
  }
}
