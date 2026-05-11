// @ts-nocheck
// Vercel serverless entry point.
//
// WHY handler.cjs instead of handler.mjs:
//   Vercel's @vercel/node compiles TypeScript functions as CommonJS by default.
//   Static ESM `import` statements are converted to require() calls at build time.
//   Calling require() on an .mjs file throws [ERR_REQUIRE_ESM] because Node.js
//   enforces ESM-only semantics for .mjs files.
//   handler.cjs is built by esbuild with format:"cjs" — all ESM deps are inlined
//   as CJS, so require() works perfectly.
//
// IMPORTANT: buildCommand in vercel.json runs `pnpm --filter @workspace/api-server run build`
// BEFORE Vercel bundles this function, so dist/handler.cjs exists at bundle time.
// includeFiles in vercel.json ships dist/** alongside the function for pino workers.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require("../artifacts/api-server/dist/handler.cjs");
const app = mod.default ?? mod;

console.log("[api] handler.cjs loaded, app type:", typeof app);

export default function handler(req, res) {
  const start = Date.now();
  const { method, url } = req;

  console.log(`[api] --> ${method} ${url}`);
  console.log(`[api]     host=${req.headers?.host} origin=${req.headers?.origin ?? "-"}`);

  const originalEnd = res.end.bind(res);
  res.end = function (...args) {
    console.log(`[api] <-- ${method} ${url} status=${res.statusCode} (${Date.now() - start}ms)`);
    return originalEnd(...args);
  };

  try {
    if (typeof app !== "function") {
      throw new Error(`handler.cjs did not export a function — got ${typeof app}. mod keys: ${Object.keys(mod).join(", ")}`);
    }
    app(req, res);
  } catch (err) {
    console.error(`[api] CRASH ${method} ${url}:`, err?.message ?? err);
    console.error(`[api] Stack:`, err?.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error", detail: String(err?.message ?? err) });
    }
  }
}
