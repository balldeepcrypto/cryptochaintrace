// Run from the workspace root:
// node --test artifacts/wallet-tracer/tests/cluster-finder.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const reactflow = require("../node_modules/reactflow");
const lib = path.join(__dirname, "../src/lib");

function load(name, imports = {}, globals = {}) {
  const source = fs.readFileSync(path.join(lib, `${name}.ts`), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  const context = {
    exports, require: (id) => {
      assert.ok(id in imports, `Unexpected import ${id}`);
      return imports[id];
    },
    AbortController, DOMException, TypeError, Headers, Date, Math, setTimeout, clearTimeout,
    ...globals,
  };
  vm.runInNewContext(output, context, { filename: `${name}.js` });
  return exports;
}

function scheduler() {
  let now = 1_000_000;
  const waits = [];
  const math = Object.create(Math);
  math.random = () => 0;
  const api = load("cluster-finder-requests", {}, {
    Date: class extends Date { static now() { return now; } },
    Math: math,
    // Advance simulated time, not real time; the scheduler has one active
    // request/backoff at a time, even when workers enqueue concurrently.
    setTimeout: (callback, ms) => {
      waits.push(ms);
      now += ms;
      queueMicrotask(callback);
      return waits.length;
    },
    clearTimeout: () => {},
  });
  return { ...api, now: () => now, waits };
}

function failure(status, headers = {}, data) {
  return Object.assign(new Error(`HTTP ${status}`), { status, headers: new Headers(headers), data });
}

test("concurrent workers share a serialized 48/minute request budget", async () => {
  const api = scheduler();
  const starts = [];
  let active = 0;
  let maximum = 0;
  await Promise.all(Array.from({ length: 70 }, () => api.clusterRequest(async () => {
    starts.push(api.now());
    maximum = Math.max(maximum, ++active);
    await Promise.resolve();
    active -= 1;
    return "ok";
  }, new AbortController().signal)));
  assert.equal(maximum, 1);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 1250);
  for (const start of starts) assert.ok(starts.filter((time) => time >= start && time < start + 60_000).length <= 48);
});

test("429 cools down the entire queue, honors Retry-After, and retries the same operation", async () => {
  const api = scheduler();
  const starts = [];
  const messages = [];
  let attempts = 0;
  const signal = new AbortController().signal;
  const first = api.clusterRequest(async () => {
    starts.push(["first", api.now()]);
    if (++attempts === 1) throw failure(429, { "Retry-After": "90" });
    return "recovered";
  }, signal, (message) => messages.push(message));
  const second = api.clusterRequest(async () => { starts.push(["second", api.now()]); return "next"; }, signal);
  assert.deepEqual(await Promise.all([first, second]), ["recovered", "next"]);
  assert.equal(attempts, 2);
  assert.ok(starts[1][1] - starts[0][1] >= 90_000);
  assert.equal(starts[2][0], "second");
  assert.ok(starts[2][1] - starts[1][1] >= 1250);
  assert.match(messages[0], /Rate limit.*retry 1\/6/);
});

test("retry delays support body milliseconds, HTTP dates, exponential backoff and permanent errors", () => {
  const api = scheduler();
  assert.ok(api.clusterRetryDelay(failure(429, {}, { retryAfterMs: 180_000 }), 0) >= 180_000);
  assert.ok(api.clusterRetryDelay(failure(429, { "Retry-After": new Date(api.now() + 180_000).toUTCString() }), 0) >= 180_000);
  assert.ok(api.clusterRetryDelay(failure(429), 1) > api.clusterRetryDelay(failure(429), 0));
  assert.ok(api.clusterRetryDelay(failure(503), 2) > api.clusterRetryDelay(failure(503), 0));
  assert.ok(api.clusterRetryDelay(new TypeError("Failed to fetch"), 0) >= 2000);
  assert.equal(api.clusterRetryDelay(failure(401), 0), null);
  assert.equal(api.clusterRetryDelay(failure(404), 0), null);
});

test("retry exhaustion is bounded and does not poison subsequent requests", async () => {
  const api = scheduler();
  let attempts = 0;
  const signal = new AbortController().signal;
  await assert.rejects(api.clusterRequest(async () => { attempts++; throw failure(429); }, signal), /429/);
  assert.equal(attempts, 7);
  assert.equal(await api.clusterRequest(async () => "still works", signal), "still works");
});

test("cancellation interrupts a live rate-limit cooldown immediately", async () => {
  const api = load("cluster-finder-requests");
  const controller = new AbortController();
  let attempts = 0;
  const request = api.clusterRequest(async () => {
    attempts++;
    throw failure(429);
  }, controller.signal, () => queueMicrotask(() => controller.abort()));
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(attempts, 1);
});

function tx(from, to, hash = `${from}-${to}`) {
  return { hash, from, to, value: "0.000000000000000001", timestamp: "2026-10-24T10:20:30.123Z", tokenSymbol: "DAG", status: "success" };
}

function engine(getWalletTransactions) {
  const requests = scheduler();
  return load("cluster-finder-engine", {
    "@workspace/api-client-react": { getWalletTransactions },
    "./cluster-finder-requests": requests,
  });
}

function options(overrides = {}) {
  return {
    addresses: ["input", "lead"], primaryAddress: "lead", chain: "dag",
    signal: new AbortController().signal,
    getKnownInfo: () => null, normalizeAddress: (address) => address,
    ...overrides,
  };
}

test("page retries keep the exact cursor and do not duplicate or lose history", async () => {
  let attempts = 0;
  const cursors = [];
  const api = engine(async (address, params) => {
    if (address === "input") return { transactions: [], hasMore: false };
    cursors.push(params.cursor);
    if (!params.cursor) return { transactions: [tx("input", "lead", "first")], hasMore: true, nextCursor: "page-2" };
    if (++attempts < 3) throw failure(429);
    return { transactions: [tx("input", "lead", "second")], hasMore: false };
  });
  const result = await api.runClusterFinder(options());
  assert.equal(result.complete, true);
  assert.equal(result.scannedTransactions, 2);
  assert.equal(result.connections[0].flows[0].transactions.length, 2);
  assert.deepEqual(cursors, [undefined, "page-2", "page-2", "page-2"]);
});

test("exhausted page retries retain earlier observed paths and mark history incomplete", async () => {
  const api = engine(async (address, params) => {
    if (address === "input") return { transactions: [], hasMore: false };
    if (params.cursor) throw failure(503);
    return { transactions: [tx("input", "lead")], hasMore: true, nextCursor: "page-2" };
  });
  const result = await api.runClusterFinder(options());
  assert.equal(result.complete, false);
  assert.equal(result.connections.length, 1);
  assert.equal(result.scannedTransactions, 1);
  assert.equal(result.fetchErrors.length, 1);
  assert.match(result.fetchErrors[0].message, /1 fetched transactions retained/);
});

test("long private routes still have no hop cap and exclude exchanges and failed transfers", async () => {
  const route = ["input", ...Array.from({ length: 15 }, (_, i) => `proxy-${i}`), "lead"];
  const transfers = route.slice(0, -1).map((from, i) => tx(from, route[i + 1]));
  const histories = new Map(route.map((address) => [address, transfers.filter((item) => item.from === address || item.to === address)]));
  histories.get("lead").push(tx("exchange", "lead"), { ...tx("failed-private", "lead"), status: "failed" });
  const scanned = [];
  const api = engine(async (address) => {
    scanned.push(address);
    return { transactions: histories.get(address) ?? [], hasMore: false };
  });
  const result = await api.runClusterFinder(options({
    getKnownInfo: (address) => address === "exchange" ? { label: "KuCoin", type: "exchange" } : null,
  }));
  assert.equal(result.complete, true);
  assert.equal(result.connections[0].flows.length, 16);
  assert.equal(Math.max(...result.connections[0].flows.map((flow) => flow.hop)), 16);
  assert.ok(!scanned.includes("exchange") && !scanned.includes("failed-private"));
  assert.equal(result.nodes.length, 17);
});

test("pagination still enforces the existing 25k per-wallet history cap", async () => {
  let pages = 0;
  const api = engine(async (address, params) => {
    if (address === "input") return { transactions: [], hasMore: false };
    pages++;
    assert.equal(params.limit, 250);
    return { transactions: Array.from({ length: 250 }, (_, i) => tx("input", "lead", `${pages}-${i}`)), hasMore: true, nextCursor: String(pages) };
  });
  const result = await api.runClusterFinder(options());
  assert.equal(pages, 100);
  assert.equal(result.scannedTransactions, 25_000);
  assert.equal(result.truncatedAddresses[0], "lead");
  assert.equal(result.complete, false);
});

function exportsModule(globals = {}) {
  return load("cluster-finder-exports", { reactflow }, globals);
}

function reportResult() {
  const transaction = tx("input", "lead", '<unsafe&"hash>');
  const flow = { id: "flow-1", from: "input", to: "lead", hop: 1, transactions: [transaction] };
  return {
    chain: "dag", primaryAddress: "lead", inputAddresses: ["input"], flows: [flow],
    nodes: [{ address: "input", role: "input", label: null }, { address: "lead", role: "primary", label: null }],
    connections: [{ inputAddress: "input", nodes: ["input", "lead"], flows: [flow] }],
    disconnectedAddresses: [], excludedAddresses: [], truncatedAddresses: ["lead"],
    fetchErrors: [{ address: "lead", message: "<service failed>" }],
    scannedWallets: 2, scannedTransactions: 1, complete: false,
  };
}

test("report includes exact amounts, every hop/hash/direction, UTC and incomplete warnings; escapes data", () => {
  const report = exportsModule().buildClusterReport(reportResult());
  for (const value of ["Hop 1", "input → lead", "0.000000000000000001 DAG", "2026-10-24T10:20:30.123Z", "INCOMPLETE SCAN", "25,000", "&lt;unsafe&amp;&quot;hash&gt;", "&lt;service failed&gt;"]) {
    assert.ok(report.includes(value), value);
  }
  assert.ok(!report.includes("<unsafe"));
  assert.match(report, /branches and cycles/);
  assert.match(report, /table-header-group/);
});

test("SVG exports full graph coordinates, directional edges, labels, highlights and address key", () => {
  const result = reportResult();
  result.nodes[0].label = "Label <&>";
  const svg = exportsModule().buildClusterGraphSvg([
    { id: "input", position: { x: 3000, y: 30 }, width: 202, height: 90 },
    { id: "lead", position: { x: 70, y: 30 }, width: 202, height: 90 },
  ], result.nodes, result.flows, ["input", "lead"]);
  assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /width="3202"/);
  assert.match(svg, /marker-end="url\(#arrow\)"/);
  assert.match(svg, /#e4b568/);
  assert.match(svg, /1 TX/);
  assert.match(svg, /Label &lt;&amp;&gt;/);
  assert.match(svg, /1\. input/);
  assert.match(svg, /2\. lead/);
  assert.ok(!svg.includes("foreignObject"));
});

test("print and download actions create a local print document and SVG download", () => {
  const created = [];
  const appended = [];
  let printed = false;
  let clicked = false;
  let afterPrint;
  let downloadedBlob;
  const api = exportsModule({
    Blob,
    setTimeout: () => 1, clearTimeout: () => {},
    URL: { createObjectURL: (blob) => { downloadedBlob = blob; return "blob:local"; }, revokeObjectURL: () => {} },
    document: {
      createElement: (tag) => {
        const element = {
          tag, style: {}, remove() { this.removed = true; },
          click() { clicked = true; },
          contentWindow: {
            addEventListener: (event, callback) => { assert.equal(event, "afterprint"); afterPrint = callback; },
            focus: () => {}, print: () => { printed = true; },
          },
        };
        created.push(element);
        return element;
      },
      body: { appendChild: (element) => appended.push(element) },
    },
  });
  api.printClusterReport(reportResult());
  assert.equal(created[0].tag, "iframe");
  assert.match(created[0].srcdoc, /Cluster Finder Report/);
  created[0].onload();
  assert.equal(printed, true);
  afterPrint();
  assert.equal(created[0].removed, true);
  api.downloadClusterGraph("<svg/>");
  assert.equal(clicked, true);
  assert.match(created[1].download, /^cluster-finder-graph-.*\.svg$/);
  assert.equal(downloadedBlob.type, "image/svg+xml;charset=utf-8");
  assert.equal(appended.length, 2);
});
