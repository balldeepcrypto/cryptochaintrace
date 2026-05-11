// @ts-nocheck
//
// Vercel catch-all serverless function for all /api/* routes.
//
// WHY pure module.exports (no export default, no import):
//   Vercel's @vercel/node can compile .ts files as either ESM or CJS depending
//   on context.  Using "export default" introduces ESM syntax that causes Vercel
//   to emit an ES module where `require` is not defined in scope — meaning the
//   very first line `require('./_handler.js')` would throw
//   "ReferenceError: require is not defined in ES module scope".
//   Using `module.exports = function(...)` is unambiguously CommonJS.
//
// WHY './_handler.js' (same-directory, not '../artifacts/...'):
//   Vercel bundles this function file and places the Lambda bundle at an
//   internal path like /var/task/index.js.  At that point __dirname is /var/task,
//   so any path starting with '../' resolves against /var/task, NOT the repo root.
//   api/_handler.js is co-located: Vercel automatically ships every file in api/
//   with the function, so './_handler.js' always resolves correctly.
//
// WHY api/_handler.js exists:
//   Built by `pnpm --filter @workspace/api-server run build` (which runs as part
//   of Vercel's buildCommand before function bundling).  esbuild compiles the
//   entire Express app + all deps into a single self-contained CJS file with no
//   ESM syntax anywhere.  Files starting with _ are excluded from Vercel's route
//   discovery so it will not be treated as a separate API endpoint.

const mod = require("./_handler.js");
const app = mod.default ?? mod;

console.log("[api/init] _handler.js loaded — app type:", typeof app);
if (typeof app !== "function") {
  console.error("[api/init] FATAL: _handler.js did not export a function. Keys:", Object.keys(mod));
}

module.exports = function handler(req, res) {
  const start = Date.now();
  const { method, url } = req;
  console.log(`[api] --> ${method} ${url}  host=${req.headers && req.headers.host}  origin=${(req.headers && req.headers.origin) || "-"}`);

  const origEnd = res.end.bind(res);
  res.end = function (...args) {
    console.log(`[api] <-- ${method} ${url}  status=${res.statusCode}  (${Date.now() - start}ms)`);
    return origEnd(...args);
  };

  if (typeof app !== "function") {
    console.error("[api] Cannot handle request: app is not a function");
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Handler not ready", detail: "app export was " + typeof app }));
    return;
  }

  try {
    app(req, res);
  } catch (err) {
    const msg = (err && err.message) || String(err);
    console.error("[api] CRASH:", msg);
    console.error("[api] Stack:", err && err.stack);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Internal server error", detail: msg }));
    }
  }
};
