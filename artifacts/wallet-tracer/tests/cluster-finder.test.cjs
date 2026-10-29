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
      // Request deadlines are real timers and cancelled by successful requests;
      // only scheduling/backoff delays advance the simulated request clock.
      if (ms === 45_000) return setTimeout(callback, ms);
      waits.push(ms);
      now += ms;
      queueMicrotask(callback);
      return waits.length;
    },
    clearTimeout: (timer) => { if (typeof timer === "object") clearTimeout(timer); },
  });
  return { ...api, now: () => now, waits };
}

function failure(status, headers = {}, data) {
  return Object.assign(new Error(`HTTP ${status}`), { status, headers: new Headers(headers), data });
}

test("concurrent workers share a serialized 72/minute request budget", async () => {
  const api = scheduler();
  const starts = [];
  let active = 0;
  let maximum = 0;
  await Promise.all(Array.from({ length: 150 }, () => api.clusterRequest(async () => {
    starts.push(api.now());
    maximum = Math.max(maximum, ++active);
    await Promise.resolve();
    active -= 1;
    return "ok";
  }, new AbortController().signal)));
  assert.equal(maximum, 1);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= Math.ceil(60_000 / 72));
  for (const start of starts) assert.ok(starts.filter((time) => time >= start && time < start + 60_000).length <= 72);
  assert.equal(starts.filter((time) => time < starts[0] + 60_000).length, 72);
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
  assert.ok(starts[2][1] - starts[1][1] >= Math.ceil(60_000 / 72));
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

test("stalled requests time out even when the provider ignores abort; explicit cancellation is immediate", async () => {
  const api = scheduler();
  let attemptSignal;
  await assert.rejects(api.clusterTimedRequest((signal) => {
    attemptSignal = signal;
    return new Promise(() => {});
  }, new AbortController().signal, 10), /timed out/);
  assert.equal(attemptSignal.aborted, true);
  const controller = new AbortController();
  const pending = api.clusterTimedRequest(() => new Promise(() => {}), controller.signal, 45_000);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
});

function tx(from, to, hash = `${from}-${to}`) {
  return { hash, from, to, value: "0.000000000000000001", timestamp: "2026-10-24T10:20:30.123Z", tokenSymbol: "DAG", status: "success" };
}

function engine(getWalletTransactions) {
  const requests = scheduler();
  return load("cluster-finder-engine", {
    "@workspace/api-client-react": { getWalletTransactions },
    "./cluster-finder-requests": requests,
    "./cluster-finder-focus": load("cluster-finder-focus"),
    "./cluster-finder-history-cache": load("cluster-finder-history-cache"),
  });
}

function options(overrides = {}) {
  return {
    maxHops: 6,
    addresses: ["input", "lead"], primaryAddress: "lead", chain: "dag",
    signal: new AbortController().signal,
    getKnownInfo: () => null, normalizeAddress: (address) => address,
    ...overrides,
  };
}

test("history cache shares in-flight and completed full histories by canonical wallet", async () => {
  const { createClusterHistoryCache } = load("cluster-finder-history-cache");
  let calls = 0;
  let finish;
  const history = [tx("input", "lead", "page-one"), tx("input", "proxy", "page-two")];
  const cached = createClusterHistoryCache((address) => address.trim().toLowerCase(), async () => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  });
  const first = cached(" INPUT ");
  const concurrent = cached("input");
  assert.equal(first, concurrent);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish(history);
  assert.equal(await first, history);
  assert.equal(await cached("Input"), history);
  assert.equal(calls, 1);
});

test("history caches are run-scoped and retain empty, partial and failed fetch outcomes without extra retries", async () => {
  const { createClusterHistoryCache } = load("cluster-finder-history-cache");
  let calls = 0;
  const fetch = async (address) => {
    calls += 1;
    if (address === "failed") throw new Error("loader exhausted retries");
    return address === "empty" ? [] : [tx(address, "lead", `run-${calls}`)];
  };
  const firstRun = createClusterHistoryCache((address) => address, fetch);
  const empty = await firstRun("empty");
  assert.equal(await firstRun("empty"), empty);
  const partial = await firstRun("partial");
  assert.equal(await firstRun("partial"), partial);
  await assert.rejects(firstRun("failed"), /exhausted retries/);
  await assert.rejects(firstRun("failed"), /exhausted retries/);
  assert.equal(calls, 3);
  const secondRun = createClusterHistoryCache((address) => address, fetch);
  assert.notEqual(await secondRun("partial"), partial);
  assert.equal(calls, 4);
});

test("shared paginated wallets scan fully once and still expand every private branch; new runs fetch afresh", async () => {
  const transfers = [
    tx("lead", "left"), tx("lead", "right"),
    tx("left", "shared", "left-shared"), tx("right", "shared", "right-shared"),
    tx("shared", "next-a", "shared-a"), tx("shared", "next-b", "shared-b"),
  ];
  const calls = [];
  const api = engine(async (address, params) => {
    const key = address.toLowerCase();
    calls.push(`${key}:${params.cursor ?? "first"}`);
    const history = transfers.filter((item) => item.from === key || item.to === key);
    if (key === "shared" && !params.cursor) {
      return { transactions: history.slice(0, 2), hasMore: true, nextCursor: "second" };
    }
    return { transactions: key === "shared" ? history.slice(2) : history, hasMore: false };
  });
  const config = () => options({
    addresses: ["LEAD", "lead"], primaryAddress: "lead", chain: "ethereum", maxHops: 3,
  });
  const first = await api.runClusterFinder(config());
  for (const key of ["lead:first", "left:first", "right:first", "shared:first", "shared:second", "next-a:first", "next-b:first"]) {
    assert.equal(calls.filter((call) => call === key).length, 1, key);
  }
  assert.equal(calls.length, 7);
  assert.equal(first.scannedWallets, 6);
  assert.equal(first.complete, true);
  for (const transfer of transfers) {
    assert.ok(first.flows.some((flow) => flow.transactions.some((item) => item.hash === transfer.hash)), transfer.hash);
  }
  const second = await api.runClusterFinder(config());
  assert.equal(calls.length, 14, "no history is shared between runs");
  assert.equal(JSON.stringify(second), JSON.stringify(first));
});

test("page checkpoints resume concurrent unfinished histories at their next cursor and reuse completed wallets", async () => {
  for (const maxHops of [3, 4, 6]) {
    const controller = new AbortController();
    const snapshots = [];
    let checkpoint;
    const calls = [];
    const transfers = [
      tx("lead", "proxy", "lead-proxy"), tx("proxy", "focus", "proxy-focus"),
      ...Array.from({ length: 7 }, (_, index) => tx(`p${index}`, `p${index + 1}`, `chain-${index}`)),
      tx("proxy", "p0", "proxy-chain"), tx("coinbase", "focus", "exchange-touch"),
    ];
    const fetch = async (address, params) => {
      const key = address.toLowerCase();
      calls.push(`${key}:${params.cursor ?? "first"}`);
      const history = transfers.filter((item) => item.from === key || item.to === key);
      if (key === "focus" && !params.cursor) {
        return { transactions: history.slice(0, 1), hasMore: true, nextCursor: "focus-second" };
      }
      return { transactions: key === "focus" ? history.slice(1) : history, hasMore: false };
    };
    const config = {
      addresses: ["LEAD"], primaryAddress: "lead", chain: "ethereum", maxHops,
      focusAddresses: ["FOCUS", "focus"],
      getKnownInfo: (address) => address.toLowerCase() === "coinbase" ? { label: "Coinbase", type: "exchange" } : null,
    };
    const first = await engine(fetch).runClusterFinder(options({
      ...config, signal: controller.signal,
      onCheckpoint: async (state) => {
        checkpoint = JSON.parse(JSON.stringify(state));
        const focus = state.histories.find((item) => item.key === "focus");
        if (focus?.cursor === "focus-second" && state.histories.some((item) => item.key === "lead" && item.finished)) {
          controller.abort();
        }
      },
      onSnapshot: (result) => snapshots.push(result),
    }));
    assert.equal(first.complete, false);
    assert.equal(checkpoint.histories.find((item) => item.key === "focus").transactions.length, 1);
    assert.equal(engine(fetch).canResumeClusterScan(checkpoint), true);
    assert.ok(snapshots.some((result) => result.flows.some((flow) => flow.transactions.some((item) => item.hash === "proxy-focus"))));
    const beforeResume = calls.length;
    const baseline = JSON.stringify(checkpoint);
    let finalCheckpoint;
    // A new engine module simulates a reload, not reuse of a live promise cache.
    const resumed = await engine(fetch).runClusterFinder(options({
      ...config, resumeFrom: checkpoint, onCheckpoint: (state) => { finalCheckpoint = state; },
    }));
    assert.equal(JSON.stringify(checkpoint), baseline, "resuming must not mutate the durable checkpoint");
    assert.equal(resumed.complete, true);
    assert.equal(resumed.maxHops, maxHops);
    assert.ok(!calls.slice(beforeResume).includes("lead:first"), "completed history is not fetched again");
    assert.ok(!calls.slice(beforeResume).includes("focus:first"), "a saved page is not fetched again");
    assert.equal(calls.filter((call) => call === "focus:focus-second").length, 1);
    assert.ok(resumed.flows.some((flow) => flow.transactions.some((item) => item.hash === "proxy-focus")));
    assert.ok(resumed.focusConnections.some((connection) => connection.focusAddress.toLowerCase() === "focus"));
    assert.equal(resumed.usExchangeTransactions[0].transaction.hash, "exchange-touch");
    assert.ok(finalCheckpoint.depths.every(([, depth]) => depth <= maxHops));
    assert.equal(engine(fetch).canResumeClusterScan(finalCheckpoint), false);
    assert.equal(new Set(calls).size, calls.length, "each history page is fetched once across the interruption");
    const fresh = await engine(fetch).runClusterFinder(options(config));
    assert.deepEqual(JSON.parse(JSON.stringify(resumed)), JSON.parse(JSON.stringify(fresh)), "resumption preserves every trail and counter");
  }
});

test("failed histories resume at the failed cursor without replaying pages or duplicating errors and transfers", async () => {
  let failing = true;
  let checkpoint;
  const calls = [];
  const fetch = async (address, params) => {
    calls.push(`${address}:${params.cursor ?? "first"}`);
    if (address !== "lead") return { transactions: [], hasMore: false };
    if (!params.cursor) return { transactions: [tx("input", "lead", "retained")], hasMore: true, nextCursor: "next" };
    if (failing) throw failure(503);
    return { transactions: [tx("input", "lead", "recovered")], hasMore: false };
  };
  const api = engine(fetch);
  const first = await api.runClusterFinder(options({ onCheckpoint: (state) => { checkpoint = state; } }));
  assert.equal(first.complete, false);
  assert.equal(first.fetchErrors.length, 1);
  assert.equal(checkpoint.histories.find((item) => item.key === "lead").cursor, "next");
  assert.equal(api.canResumeClusterScan(checkpoint), true);
  const previousCalls = calls.length;
  failing = false;
  const output = await engine(fetch).runClusterFinder(options({ resumeFrom: checkpoint }));
  assert.deepEqual(calls.slice(previousCalls), ["lead:next"]);
  assert.equal(output.complete, true);
  assert.equal(output.fetchErrors.length, 0);
  assert.equal(output.scannedWallets, 2);
  assert.equal(output.scannedTransactions, 2);
  assert.equal(output.connections[0].flows[0].transactions.length, 2);
});

test("checkpoint writes are awaited before the next page and contain immutable full history plus traversal state", async () => {
  let durableCursor;
  let finalCheckpoint;
  const checkpoints = [];
  await engine(async (address, params) => {
    if (address !== "lead") return { transactions: [], hasMore: false };
    if (params.cursor) {
      assert.equal(durableCursor, params.cursor);
      return { transactions: [tx("lead", "b", "second")], hasMore: false };
    }
    return { transactions: [tx("lead", "a", "first")], hasMore: true, nextCursor: "saved-next" };
  }).runClusterFinder(options({
    addresses: ["lead"],
    onCheckpoint: async (state) => {
      const firstPage = state.histories.find((item) => item.key === "lead");
      await Promise.resolve();
      if (firstPage?.cursor) durableCursor = firstPage.cursor;
      checkpoints.push(state);
      finalCheckpoint = state;
    },
  }));
  const first = checkpoints.find((state) => state.histories.find((item) => item.key === "lead")?.transactions.length === 1);
  assert.equal(first.histories.find((item) => item.key === "lead").transactions.length, 1);
  assert.equal(finalCheckpoint.histories.find((item) => item.key === "lead").transactions.length, 2);
  assert.ok(first.queue.includes("a"));
  assert.ok(first.depths.some(([key, depth]) => key === "a" && depth === 1));
  let called = false;
  const api = engine(async () => { called = true; });
  await assert.rejects(api.runClusterFinder(options({ addresses: ["lead"], primaryAddress: "other", resumeFrom: finalCheckpoint })), /does not match/);
  assert.equal(called, false);
  await assert.rejects(api.runClusterFinder(options({
    addresses: ["lead"], resumeFrom: { ...finalCheckpoint, queue: ["lead", "lead"] },
  })), /invalid/);
});

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

test("page-by-page snapshots expose trails before history completion and cancellation returns fetched data", async () => {
  const controller = new AbortController();
  const snapshots = [];
  const telemetry = [];
  const api = engine(async (address, params) => {
    if (address !== "lead") return { transactions: [], hasMore: false };
    if (!params.cursor) return {
      transactions: [tx("lead", "private-one", "already-fetched"), tx("coinbase", "lead", "us-fetched")],
      hasMore: true, nextCursor: "pending-page",
    };
    const observed = snapshots.find((result) => result.flows.some((flow) => flow.transactions.some((item) => item.hash === "already-fetched")));
    assert.ok(observed, "a fetched trail must be visible before the next page settles");
    assert.equal(observed.complete, false);
    controller.abort();
    throw new DOMException("cancelled", "AbortError");
  });
  const result = await api.runClusterFinder(options({
    addresses: ["lead"], signal: controller.signal,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onProgress: (progress) => telemetry.push(progress),
    getKnownInfo: (address) => address === "coinbase" ? { label: "Coinbase", type: "exchange" } : null,
  }));
  assert.equal(result.complete, false);
  assert.match(result.incompleteReason, /stopped/);
  assert.equal(result.flows[0].transactions[0].hash, "already-fetched");
  assert.equal(result.usExchangeTransactions[0].transaction.hash, "us-fetched");
  assert.ok(telemetry.some((progress) => progress.pagesFetched === 1 && progress.discoveredWallets === 2));
  assert.equal(snapshots[0].flows.length, 0, "earlier snapshots must not mutate");
  assert.equal(snapshots.at(-1), result);
});

test("invalid and repeated pagination cursors retain fetched pages with explicit incomplete warnings", async () => {
  for (const repeat of [false, true]) {
    const api = engine(async (address, params) => {
      if (address !== "lead") return { transactions: [], hasMore: false };
      return {
        transactions: [tx("input", "lead", params.cursor ? "page-two" : "page-one")],
        hasMore: true, nextCursor: repeat ? "same-cursor" : undefined,
      };
    });
    const result = await api.runClusterFinder(options());
    assert.equal(result.complete, false);
    assert.equal(result.flows[0].transactions.length, repeat ? 2 : 1);
    assert.match(result.fetchErrors[0].message, /retained.*incomplete/);
  }
});

test("focus wallets are prioritized, deduplicated and connected within the selected lead-to-focus hop depth", async () => {
  const transfers = [
    tx("lead", "proxy", "lead-proxy"), tx("focus", "proxy", "focus-proxy"),
    tx("other", "lead", "other-lead"),
  ];
  const scanned = [];
  const api = engine(async (address) => {
    scanned.push(address);
    return { transactions: transfers.filter((item) => item.from === address || item.to === address), hasMore: false };
  });
  const result = await api.runClusterFinder(options({
    addresses: ["other", "lead"], focusAddresses: ["focus", "focus", "lead"], maxHops: 3,
  }));
  assert.deepEqual(scanned.slice(0, 3), ["lead", "focus", "other"]);
  assert.equal(new Set(scanned).size, scanned.length);
  assert.deepEqual(Array.from(result.focusAddresses), ["focus"]);
  assert.equal(result.focusConnections.length, 1);
  const connection = result.focusConnections[0];
  assert.equal(connection.hopCount, 2);
  assert.deepEqual(Array.from(connection.nodes), ["lead", "proxy", "focus"]);
  assert.equal(connection.flows[1].from, "focus");
  assert.equal(connection.flows[1].to, "proxy");
  assert.equal(connection.flows[1].transactions[0].hash, "focus-proxy");
  assert.ok(result.flows.some((flow) => flow.from === "other"));
  const report = exportsModule().buildClusterReport(result);
  for (const text of ["Focus wallet connections", "lead-proxy", "focus-proxy", "2 hop(s)", "IN/OUT", "US exchange"]) {
    assert.ok(report.includes(text), text);
  }
});

test("focus matching retains alternate shortest paths, actual directions and excludes routes beyond selected depth", () => {
  const { findClusterFocusPaths } = load("cluster-finder-focus");
  const flows = [
    ["lead", "a"], ["a", "focus"], ["b", "lead"], ["focus", "b"],
    ["focus", "far1"], ["far1", "far2"],
  ].map(([from, to], index) => ({ id: String(index), from, to, transactions: [tx(from, to)] }));
  const found = findClusterFocusPaths("lead", ["focus", "far2", "missing", "lead"], flows, 3);
  assert.equal(found.length, 1);
  assert.equal(found[0].focusAddress, "focus");
  assert.equal(found[0].flows.length, 4);
  assert.equal(found[0].hopCount, 2);
  assert.ok(found[0].flows.some((flow) => flow.from === "focus" && flow.to === "b"));
});

test("focus wallets obey existing exclusions and canonical deduplication; blank focus preserves the normal scan", async () => {
  const lattice = "DAG4nBMH7KwFAnpfB6VaFRaKEwACNSidzeMuPtgV";
  const scanned = [];
  const api = engine(async (address) => { scanned.push(address); return { transactions: [], hasMore: false }; });
  const result = await api.runClusterFinder(options({
    addresses: ["lead"], focusAddresses: [lattice, "exchange"], getKnownInfo: (address) =>
      address === "exchange" ? { type: "exchange", label: "Coinbase" } : null,
  }));
  assert.deepEqual(scanned, ["lead"]);
  assert.equal(result.excludedAddresses.length, 2);
  assert.equal(result.focusConnections.length, 0);
  assert.ok(exportsModule().buildClusterReport(result).includes("Excluded by existing allowed-wallet rules"));
  const canonical = await api.runClusterFinder(options({
    chain: "ethereum", addresses: ["lead"], focusAddresses: ["FOCUS", "focus", "LEAD"],
  }));
  assert.equal(canonical.focusAddresses.length, 1);
  const ordinary = await api.runClusterFinder(options());
  const blank = await api.runClusterFinder(options({ focusAddresses: [] }));
  assert.equal(JSON.stringify(ordinary), JSON.stringify(blank));
});

test("selected 3, 4 and 6 hop boundaries scan each wallet once and retain boundary histories only", async () => {
  for (const maxHops of [3, 4, 6]) {
    const transfers = Array.from({ length: 7 }, (_, index) => tx(
      index === 0 ? "lead" : `wallet-${index}`, `wallet-${index + 1}`, `hop-${index + 1}`,
    ));
    // Repeated transactions and cycles must not cause duplicate wallet scans.
    transfers.push(tx("wallet-2", "wallet-1", "cycle"));
    const scanned = [];
    const snapshots = [];
    const api = engine(async (address) => {
      scanned.push(address);
      const transactions = transfers.filter((item) => item.from === address || item.to === address);
      return { transactions: [...transactions, ...transactions], hasMore: false };
    });
    const result = await api.runClusterFinder(options({
      addresses: ["lead"], maxHops, onSnapshot: (snapshot) => snapshots.push(snapshot),
    }));
    assert.equal(result.maxHops, maxHops);
    assert.equal(result.complete, true);
    assert.equal(scanned.length, maxHops + 1);
    assert.equal(new Set(scanned).size, scanned.length);
    assert.ok(scanned.includes(`wallet-${maxHops}`));
    assert.ok(!scanned.includes(`wallet-${maxHops + 1}`));
    assert.ok(!result.nodes.some((node) => node.address === `wallet-${maxHops + 1}`));
    assert.ok(result.flows.every((flow) => flow.discoveryHop <= maxHops));
    assert.ok(result.flows.every((flow) => flow.transactions.length === 1));
    assert.ok(snapshots.every((snapshot) => snapshot.maxHops === maxHops));
    const report = exportsModule().buildClusterReport(result);
    const name = { 3: "three", 4: "four", 6: "six" }[maxHops];
    assert.ok(report.includes(`within the ${name}-hop boundary`));
    assert.ok(report.includes(`Wallets at hop ${name} are scanned`));
  }
});

test("the default scan boundary is four hops and invalid depths fail before fetching", async () => {
  let requests = 0;
  const api = engine(async () => { requests++; return { transactions: [], hasMore: false }; });
  const withoutDepth = options();
  delete withoutDepth.maxHops;
  assert.equal((await api.runClusterFinder(withoutDepth)).maxHops, 4);
  const before = requests;
  for (const maxHops of [0, 2, 5, 7, "4", NaN]) {
    await assert.rejects(api.runClusterFinder(options({ maxHops })), /hop depth of 3, 4, or 6/);
  }
  assert.equal(requests, before);
});

test("hop selector passes and checkpoints its setting while the existing graph toggle stays default-off", () => {
  const page = fs.readFileSync(path.join(__dirname, "../src/pages/cluster-finder.tsx"), "utf8");
  const graph = fs.readFileSync(path.join(__dirname, "../src/components/cluster-finder-graph.tsx"), "utf8");
  assert.match(page, /useState<ClusterHopDepth>\(DEFAULT_CLUSTER_HOPS\)/);
  assert.match(page, /\[3, 4, 6\]\.map/);
  assert.match(page, /value=\{String\(maxHops\)\}.*disabled=\{scanState === "running"\}/);
  assert.match(page, /chain, maxHops, addressText/);
  assert.match(page, /checkpoint\.maxHops \?\? checkpoint\.result\?\.maxHops \?\? 6/);
  assert.match(graph, /\[showAll, setShowAll\] = useState\(false\)/);
  assert.match(graph, /toggle-cluster-all-trails/);
});

test("six-hop expansion from both starting wallets joins their trails without re-scanning", async () => {
  const route = ["input", ...Array.from({ length: 11 }, (_, i) => `proxy-${i}`), "lead"];
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
  assert.equal(result.connections[0].flows.length, 12);
  assert.equal(Math.max(...result.flows.map((flow) => flow.discoveryHop)), 6);
  assert.ok(!scanned.includes("exchange") && !scanned.includes("failed-private"));
  assert.equal(result.nodes.length, 13);
  assert.equal(scanned.length, new Set(scanned).size);
});

test("lead-only scan recursively follows unique IN/OUT through six hops and retains no seventh-hop nodes", async () => {
  const route = ["lead", ...Array.from({ length: 7 }, (_, i) => `wallet-${i + 1}`)];
  const transfers = route.slice(0, -1).map((from, i) =>
    i % 2 ? tx(route[i + 1], from) : tx(from, route[i + 1]));
  // Duplicate history entries, cycle, self-transfer, failed and unrelated rows.
  transfers.push(tx("wallet-1", "lead", "cycle"));
  const scanned = [];
  const api = engine(async (address) => {
    scanned.push(address);
    const relevant = transfers.filter((item) => item.from === address || item.to === address);
    return {
      transactions: [...relevant, ...relevant, tx(address, address, "self"),
        tx("unrelated-a", "unrelated-b", "unrelated"),
        { ...tx(address, "failed-wallet"), status: "failed" }],
      hasMore: false,
    };
  });
  const result = await api.runClusterFinder(options({ addresses: [], primaryAddress: "lead" }));
  assert.equal(result.complete, true);
  assert.equal(scanned.length, 7);
  assert.equal(new Set(scanned).size, 7);
  assert.ok(scanned.includes("wallet-6"));
  assert.ok(!scanned.includes("wallet-7"));
  assert.equal(result.nodes.length, 7);
  assert.equal(result.flows.length, 7);
  assert.ok(result.flows.every((flow) => flow.transactions.length === 1));
  assert.ok(result.flows.every((flow) => flow.discoveryHop <= 6));
  assert.ok(result.flows.some((flow) => flow.from === "lead" && flow.to === "wallet-1"));
  assert.ok(result.flows.some((flow) => flow.from === "wallet-2" && flow.to === "wallet-1"));
  assert.ok(result.nodes.every((node) => node.address !== "wallet-7"));
});

test("breadth-first layers preserve shortest depths and canonical wallets scan once across shared branches", async () => {
  const transfers = [
    tx("LEAD", "A"), tx("input", "a"), tx("a", "b"),
    tx("b", "c"), tx("c", "d"), tx("d", "e"), tx("e", "f"), tx("f", "g"),
  ];
  const scanned = [];
  const api = engine(async (address) => {
    const key = address.toLowerCase();
    scanned.push(key);
    // Deliberately vary completion times among the workers.
    if (key === "lead") await Promise.resolve().then(() => Promise.resolve());
    return { transactions: transfers.filter((item) =>
      item.from.toLowerCase() === key || item.to.toLowerCase() === key), hasMore: false };
  });
  const result = await api.runClusterFinder(options({
    addresses: ["INPUT", "input", "lead", "LEAD"], primaryAddress: "lead", chain: "ethereum",
  }));
  assert.equal(new Set(scanned).size, scanned.length);
  assert.equal(scanned.filter((address) => address === "a").length, 1);
  assert.ok(scanned.includes("f") && !scanned.includes("g"));
  assert.ok(scanned.indexOf("a") > scanned.indexOf("lead"));
  assert.equal(result.flows.find((flow) => flow.to.toLowerCase() === "f").discoveryHop, 6);
});

test("Treasury, Team Foundation and Stardust Collective are included as inputs, proxies, and leads", async () => {
  for (const [label, type] of [
    ["Treasury", "dag-team"],
    ["[DAG Treasury 2]", "dag-team"],
    ["Lattice Treasury", "dag-team"],
    ["Historical Treasury (2023 Transition)", "dag-team"],
    ["Team Foundation Wallet", "official"],
    ["Stardust Collective Wallet", "official"],
    ["[Stardust Team Foundation]", "dag-team"],
    ["[Stardust Team Fdn 2]", "dag-team"],
    ["[Stardust Team Fdn 7]", "dag-team"],
  ]) {
    const transfers = [tx("input", "proxy"), tx("proxy", "lead")];
    const api = engine(async (address) => ({
      transactions: transfers.filter((item) => item.from === address || item.to === address),
      hasMore: false,
    }));
    const result = await api.runClusterFinder(options({ getKnownInfo: () => ({ label, type }) }));
    assert.equal(result.complete, true, label);
    assert.equal(result.connections.length, 1, label);
    assert.equal(result.connections[0].flows.length, 2, label);
    assert.equal(result.nodes.length, 3, label);
    assert.ok(result.nodes.every((node) => node.label === label), label);
    assert.equal(result.excludedAddresses.length, 0, label);
  }
});

test("the specified Lattice Treasury DAG wallet is excluded as input, proxy, and lead", async () => {
  const lattice = "DAG4nBMH7KwFAnpfB6VaFRaKEwACNSidzeMuPtgV";
  for (const getKnownInfo of [
    (address) => address === lattice ? { label: "Lattice Treasury", type: "dag-team" } : null,
    () => null,
  ]) {
    const scanned = [];
    const transfers = [tx("input", lattice), tx(lattice, "lead"), tx("input", "lead")];
    const api = engine(async (address) => {
      scanned.push(address);
      return {
        transactions: transfers.filter((item) => item.from === address || item.to === address),
        hasMore: false,
      };
    });
    const result = await api.runClusterFinder(options({
      addresses: ["input", lattice, "lead"], getKnownInfo,
    }));
    assert.equal(result.complete, true);
    assert.ok(result.excludedAddresses.includes(lattice));
    assert.ok(!scanned.includes(lattice));
    assert.ok(!result.nodes.some((node) => node.address === lattice));
    assert.ok(result.flows.every((flow) => flow.from !== lattice && flow.to !== lattice));
    assert.equal(result.connections.length, 1);
    assert.equal(result.connections[0].flows.length, 1);
    await assert.rejects(api.runClusterFinder(options({
      primaryAddress: lattice, getKnownInfo,
    })), /primary wallet.*excluded/);
  }
});

test("FULL PKG VICTIM starts blank and remains editable", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/pages/wallet-detail.tsx"), "utf8");
  assert.match(source, /const \[victimWallet, setVictimWallet\] = useState\(""\)/);
  assert.match(source, /value=\{victimWallet\}/);
  assert.match(source, /onChange=\{e => setVictimWallet\(e\.target\.value\.trim\(\)\)\}/);
});

test("other labeled infrastructure stays excluded from inputs, proxies, and lead selection", async () => {
  for (const [label, type] of [
    ["KuCoin", "exchange"],
    ["Team Foundation Exchange", "exchange"],
    ["Stardust Collective Bridge", "bridge"],
    ["Team Foundation Genesis", "genesis"],
    ["Treasury", "exchange"],
    ["PacaSwap METAGRAPH", "defi"],
    ["DOR Metagraph", "official"],
    ["Node Staking Reward Wallet", "official"],
    ["Dor Enterprise Reward Wallet", "official"],
    ["Upsider Reward METAGRAPH Wallet", "official"],
    ["Constellation Distribution Wallet (Node Rewards)", "official"],
    ["DTM Reward Pool", "official"],
    ["TestNet Reward Pool", "official"],
    ["Constellation Protocol Wallet", "official"],
    ["Data Pool Distribution", "dag-team"],
    ["Founder", "founder"],
    ["Flagged private wallet", "flagged"],
    ["Other labeled wallet", "unknown-type"],
  ]) {
    const scanned = [];
    const api = engine(async (address) => {
      scanned.push(address);
      return {
        transactions: address === "lead"
          ? [tx("blocked-input", "lead"), tx("blocked-proxy", "lead")]
          : [tx("input", "blocked-proxy")],
        hasMore: false,
      };
    });
    const getKnownInfo = (address) => address.startsWith("blocked-") ? { label, type } : null;
    const result = await api.runClusterFinder(options({
      addresses: ["input", "blocked-input", "lead"], getKnownInfo,
    }));
    assert.equal(result.excludedAddresses[0], "blocked-input", label);
    assert.ok(!scanned.some((address) => address.startsWith("blocked-")), label);
    assert.equal(result.flows.length, 0, label);
    assert.equal(result.nodes.length, 2, label);
    assert.ok(result.nodes.every((node) => !node.address.startsWith("blocked-")), label);
    await assert.rejects(api.runClusterFinder(options({
      addresses: ["input", "blocked-lead"], primaryAddress: "blocked-lead", getKnownInfo,
    })), /excluded from private-wallet paths/);
  }
});

test("unlabeled private wallets remain eligible", async () => {
  const api = engine(async () => ({ transactions: [tx("input", "lead")], hasMore: false }));
  const result = await api.runClusterFinder(options());
  assert.equal(result.connections.length, 1);
  assert.equal(result.complete, true);
});

test("US exchange touches are recorded IN/OUT without adding exchange paths or requests", async () => {
  const privateTransfers = [tx("input", "treasury"), tx("treasury", "lead")];
  const inbound = tx("coinbase", "input", "coinbase-in");
  const outbound = tx("treasury", "uphold", "uphold-out");
  const orphanExchange = tx("orphan", "kraken", "disconnected-out");
  const foreign = tx("input", "kucoin", "not-us");
  const unrelated = tx("unscanned-private", "coinbase", "unrelated");
  const histories = new Map([
    ["lead", [privateTransfers[1]]],
    ["input", [
      privateTransfers[0], inbound, inbound, foreign, unrelated,
      { ...tx("input", "coinbase", "failed"), status: "failed" },
      tx("input", "imposter", "not-an-exchange"),
    ]],
    ["treasury", [...privateTransfers, outbound]],
    ["orphan", [orphanExchange]],
  ]);
  const labels = {
    treasury: { label: "Lattice Treasury", type: "dag-team" },
    coinbase: { label: "Coinbase ETH 2", type: "exchange" },
    uphold: { label: "Uphold DAG Exchange", type: "exchange" },
    kraken: { label: "KRAKEN BTC", type: "exchange" },
    kucoin: { label: "KuCoin", type: "exchange" },
    imposter: { label: "Coinbase Reward Wallet", type: "official" },
  };
  const scanned = [];
  const api = engine(async (address) => {
    scanned.push(address);
    assert.ok(histories.has(address), `Unexpected extra history request for ${address}`);
    return { transactions: histories.get(address), hasMore: false };
  });
  const result = await api.runClusterFinder(options({
    addresses: ["input", "orphan", "lead"], getKnownInfo: (address) => labels[address] ?? null,
  }));
  assert.equal(result.complete, true);
  assert.equal(scanned.length, 4);
  assert.equal(result.connections.length, 1);
  assert.equal(result.connections[0].flows.length, 2);
  assert.equal(result.nodes.length, 4);
  assert.ok(result.nodes.some((node) => node.address === "orphan"));
  assert.equal(result.flows.length, 2);
  assert.equal(result.disconnectedAddresses[0], "orphan");
  assert.equal(result.usExchangeTransactions.length, 3);
  const entries = new Map(result.usExchangeTransactions.map((entry) => [entry.transaction.hash, entry]));
  for (const [hash, wallet, exchange, name, direction] of [
    ["coinbase-in", "input", "coinbase", "Coinbase", "IN"],
    ["uphold-out", "treasury", "uphold", "Uphold", "OUT"],
    ["disconnected-out", "orphan", "kraken", "Kraken", "OUT"],
  ]) {
    const entry = entries.get(hash);
    assert.equal(entry.walletAddress, wallet);
    assert.equal(entry.exchangeAddress, exchange);
    assert.equal(entry.exchangeName, name);
    assert.equal(entry.direction, direction);
    assert.equal(entry.transaction.value, "0.000000000000000001");
    assert.equal(entry.transaction.timestamp, "2026-10-24T10:20:30.123Z");
  }
});

test("US classification matches the existing report list without classifying global Binance as Binance.US", async () => {
  const names = ["Coinbase", "Kraken", "Gemini", "Bitstamp", "Uphold", "Robinhood", "Binance.US", "Bittrex", "eToro"];
  const transfers = [
    ...names.map((name, index) => tx(`exchange-${index}`, "lead", name)),
    tx("global-binance", "lead", "Binance"),
    tx("unknown-exchange", "lead", "Unknown"),
  ];
  const api = engine(async (address) => ({
    transactions: address === "lead" ? transfers : [],
    hasMore: false,
  }));
  const result = await api.runClusterFinder(options({
    getKnownInfo: (address) => address.startsWith("exchange-")
      ? { label: `${names[Number(address.slice(9))].toUpperCase()} ETH 2`, type: "exchange" }
      : address === "global-binance" ? { label: "Binance ETH", type: "exchange" }
      : address === "unknown-exchange" ? { label: "Unknown", type: "exchange" } : null,
  }));
  assert.equal(result.usExchangeTransactions.length, names.length);
  assert.deepEqual(Array.from(result.usExchangeTransactions.map((entry) => entry.exchangeName)).sort(), [...names].sort());
  assert.equal(result.flows.length, 0);
});

test("US touches from retained partial histories remain reportable with incomplete status", async () => {
  const api = engine(async (address, params) => {
    if (address === "input") return { transactions: [], hasMore: false };
    if (params.cursor) throw failure(503);
    return { transactions: [tx("coinbase", "lead")], hasMore: true, nextCursor: "failed-page" };
  });
  const result = await api.runClusterFinder(options({
    getKnownInfo: (address) => address === "coinbase" ? { label: "Coinbase BTC", type: "exchange" } : null,
  }));
  assert.equal(result.complete, false);
  assert.equal(result.fetchErrors.length, 1);
  assert.equal(result.usExchangeTransactions.length, 1);
  assert.equal(result.usExchangeTransactions[0].direction, "IN");
  assert.equal(result.flows.length, 0);
});

test("Cluster Finder enforces its 10k per-wallet history cap without allowing Resume to bypass it", async () => {
  let pages = 0;
  let checkpoint;
  const api = engine(async (address, params) => {
    if (address === "input") return { transactions: [], hasMore: false };
    pages++;
    assert.equal(params.limit, 250);
    return { transactions: Array.from({ length: 250 }, (_, i) => tx("input", "lead", `${pages}-${i}`)), hasMore: true, nextCursor: String(pages) };
  });
  const result = await api.runClusterFinder(options({ onCheckpoint: (state) => { checkpoint = state; } }));
  assert.equal(api.MAX_CLUSTER_HISTORY_PER_WALLET, 10_000);
  assert.equal(pages, 40);
  assert.equal(result.scannedTransactions, 10_000);
  assert.equal(result.truncatedAddresses[0], "lead");
  assert.equal(result.complete, false);
  assert.equal(checkpoint.histories.find((history) => history.key === "lead").transactions.length, 10_000);
  assert.equal(api.canResumeClusterScan(checkpoint), false, "Resume must never bypass the history cap");
});

test("Resume fetches only the remaining 10k budget and retains older saved evidence without refetching capped wallets", async () => {
  for (const [cachedCount, hasMore] of [[9751, true], [9751, false], [10_000, true], [12_000, true]]) {
    let checkpoint;
    await engine(async () => ({ transactions: [], hasMore: false })).runClusterFinder(options({
      chain: "ethereum", onCheckpoint: (state) => { checkpoint = state; },
    }));
    const lead = checkpoint.histories.find((history) => history.key === "lead");
    Object.assign(lead, {
      transactions: Array.from({ length: cachedCount }, (_, i) => tx("input", "lead", `saved-${i}`)),
      cursor: "saved-next-page", page: 21, seenCursors: ["saved-next-page"],
      hasMore: true, finished: false, truncated: false, error: "Old interrupted request",
    });
    checkpoint.scannedTransactions = cachedCount;
    checkpoint.pagesFetched = 21;
    const original = JSON.stringify(checkpoint);
    const calls = [];
    let finalCheckpoint;
    const api = engine(async (address, params) => {
      calls.push(address);
      assert.equal(address, "lead", "completed input history must be reused");
      assert.equal(params.cursor, "saved-next-page");
      assert.equal(params.limit, 249, "only the remaining budget may be requested");
      return {
        transactions: Array.from({ length: hasMore ? 400 : 249 }, (_, i) => tx("input", "lead", `new-${i}`)),
        hasMore, nextCursor: hasMore ? "must-not-fetch" : undefined,
      };
    });
    const result = await api.runClusterFinder(options({
      chain: "ethereum", resumeFrom: checkpoint,
      onCheckpoint: (state) => { finalCheckpoint = state; },
    }));
    assert.deepEqual(calls, cachedCount < 10_000 ? ["lead"] : []);
    const expectedCount = Math.max(10_000, cachedCount);
    assert.equal(result.scannedTransactions, expectedCount);
    assert.equal(result.flows[0].transactions.length, expectedCount, "retain every saved/new connection");
    assert.equal(result.fetchErrors.length, 0, "capped/recovered requests must not retain transient errors");
    assert.equal(result.complete, !hasMore);
    assert.equal(result.truncatedAddresses.includes("lead"), hasMore);
    assert.equal(finalCheckpoint.histories.find((history) => history.key === "lead").transactions.length, expectedCount);
    assert.equal(api.canResumeClusterScan(finalCheckpoint), false);
    assert.equal(JSON.stringify(checkpoint), original, "never mutate the saved checkpoint");
  }
});

test("resume control uses saved settings and clearly identifies local browser execution and legacy checkpoints", () => {
  const page = fs.readFileSync(path.join(__dirname, "../src/pages/cluster-finder.tsx"), "utf8");
  assert.match(page, /button-resume-cluster-scan/);
  assert.match(page, /startScan\(resumeCheckpoint\)/);
  assert.match(page, /resumeFrom: resume\?\.scan/);
  assert.match(page, /canResumeClusterScan\(resumeCheckpoint\.scan\)/);
  assert.match(page, /older checkpoint contains results only/);
  assert.match(page, /not a server background worker/);
  assert.match(page, /every fetched page is checkpointed/);
  assert.match(page, /visibilitychange/);
  assert.match(page, /pagehide/);
});

function exportsModule(globals = {}) {
  return load("cluster-finder-exports", {
    reactflow,
    "./cluster-finder-download": load("cluster-finder-download", {}, globals),
  }, globals);
}

function reportResult() {
  const transaction = tx("input", "lead", '<unsafe&"hash>');
  const flow = { id: "flow-1", from: "input", to: "lead", hop: 1, transactions: [transaction] };
  return {
    chain: "dag", primaryAddress: "lead", inputAddresses: ["input"], flows: [flow],
    nodes: [{ address: "input", role: "input", label: null }, { address: "lead", role: "primary", label: null }],
    connections: [{ inputAddress: "input", nodes: ["input", "lead"], flows: [flow] }],
    usExchangeTransactions: [],
    disconnectedAddresses: [], excludedAddresses: [], truncatedAddresses: ["lead"],
    fetchErrors: [{ address: "lead", message: "<service failed>" }],
    scannedWallets: 2, scannedTransactions: 1, complete: false,
  };
}

test("report includes exact amounts, every hop/hash/direction, UTC and incomplete warnings; escapes data", () => {
  const report = exportsModule().buildClusterReport(reportResult());
  for (const value of ["Hop 1", "input → lead", "0.000000000000000001 DAG", "2026-10-24T10:20:30.123Z", "INCOMPLETE SCAN", "10,000", "&lt;unsafe&amp;&quot;hash&gt;", "&lt;service failed&gt;"]) {
    assert.ok(report.includes(value), value);
  }
  assert.ok(!report.includes("<unsafe"));
  assert.match(report, /branches and cycles/);
  assert.match(report, /table-header-group/);
});

test("full report includes the on-screen Directed Input-to-Lead Index and its counts", () => {
  const result = reportResult();
  result.connections.push({
    inputAddress: '<second&input>', nodes: ["second", "proxy", "lead"],
    flows: [result.connections[0].flows[0], { ...result.connections[0].flows[0], id: "second-flow", hop: 2 }],
  });
  const before = JSON.stringify(result);
  const report = exportsModule().buildClusterReport(result);
  const index = report.slice(report.indexOf("<section><h2>Directed Input-to-Lead Index"), report.indexOf("<h2>Directed input-to-lead paths"));
  assert.match(index, /2 observed path\(s\)/);
  assert.match(index, /input<\/td><td>1<\/td><td>2<\/td>/);
  assert.match(index, /&lt;second&amp;input&gt;<\/td><td>2<\/td><td>3<\/td>/);
  assert.match(report, /Complete recursive IN\/OUT trail/);
  assert.match(report, /US exchange IN\/OUT transactions/);
  assert.equal(JSON.stringify(result), before);
  result.connections = [];
  assert.match(exportsModule().buildClusterReport(result), /No input wallet has a confirmed private-wallet path/);
});

test("selected-trail report contains only the selected input's flows and exact transaction details", () => {
  const result = reportResult();
  const selected = result.connections[0];
  selected.flows.push({
    id: "selected-second", from: "proxy", to: "lead", hop: 2,
    transactions: [{ ...selected.flows[0].transactions[0], hash: "selected-hop-two", value: "123.000000000000000007" }],
  });
  result.connections.push({
    inputAddress: "UNRELATED-INPUT", nodes: ["UNRELATED-INPUT", "lead"],
    flows: [{ ...selected.flows[0], id: "unrelated", transactions: [{ ...selected.flows[0].transactions[0], hash: "UNRELATED-HASH" }] }],
  });
  result.flows.push({ ...selected.flows[0], id: "other-scan", transactions: [{ ...selected.flows[0].transactions[0], hash: "UNRELATED-SCAN-HASH" }] });
  result.focusAddresses = ["UNRELATED-FOCUS"];
  result.incompleteReason = "Interrupted <timeout>";
  const before = JSON.stringify(result);
  const api = exportsModule();
  const report = api.buildClusterSelectedTrailReport(result, "input");
  for (const text of ["Selected Directed Input-to-Lead Trail", "Hop 1", "Hop 2", "input → lead", "proxy → lead",
    "0.000000000000000001 DAG", "123.000000000000000007 DAG", "2026-10-24T10:20:30.123Z",
    "selected-hop-two", "&lt;unsafe&amp;&quot;hash&gt;", "INCOMPLETE SCAN", "Interrupted &lt;timeout&gt;"]) {
    assert.ok(report.includes(text), text);
  }
  for (const text of ["UNRELATED", "Complete recursive IN/OUT trail", "US exchange IN/OUT transactions", "Focus wallet connections"]) {
    assert.ok(!report.includes(text), text);
  }
  assert.match(report, /table-header-group/);
  assert.match(report, /branches and cycles/);
  assert.equal(JSON.stringify(result), before);
  assert.throws(() => api.buildClusterSelectedTrailReport(result, "missing"), /selected trail is no longer available/);
  result.complete = true;
  result.incompleteReason = undefined;
  assert.match(api.buildClusterSelectedTrailReport(result, "input"), /Scan complete within the selected hop boundary/);
});

test("selected trail downloads printable HTML and the button uses the active index selection", async () => {
  let blob;
  const api = exportsModule({
    Blob,
    URL: { createObjectURL(value) { blob = value; return "blob:selected"; } },
  });
  const file = api.printClusterSelectedTrail(reportResult(), "input");
  assert.equal(file.url, "blob:selected");
  assert.match(file.filename, /^cluster-finder-selected-trail-.*\.html$/);
  assert.equal(blob.type, "text/html;charset=utf-8");
  assert.match(await blob.text(), /Selected Directed Input-to-Lead Trail/);
  const page = fs.readFileSync(path.join(__dirname, "../src/pages/cluster-finder.tsx"), "utf8");
  assert.match(page, /printClusterSelectedTrail\(result, activeSelection\.inputAddress\)/);
  assert.match(page, /onClick=\{exportSelectedTrail\} data-testid="button-print-selected-trail"/);
  assert.match(page, /\{activeSelection && \(/);
  assert.match(page, /const file = printClusterReport\(result\)/);
});

test("full recursive report preserves outgoing-only flows with no directed input-to-lead connection", () => {
  const result = reportResult();
  result.connections = [];
  result.inputAddresses = [];
  result.flows = [{
    id: "outgoing", from: "lead", to: "private-<wallet>", discoveryHop: 6,
    transactions: [tx("lead", "private-<wallet>", "outgoing-hash")],
  }];
  const report = exportsModule().buildClusterReport(result);
  for (const value of ["Complete recursive IN/OUT trail", "Discovery hop 6", "lead → private-&lt;wallet&gt;",
    "outgoing-hash", "0.000000000000000001 DAG", "2026-10-24T10:20:30.123Z",
    "six hops", "US exchange IN/OUT transactions"]) {
    assert.ok(report.includes(value), value);
  }
  assert.ok(!report.includes("no artificial hop limit"));
});

test("printed US exchange section includes every required field, directions and escaped data", () => {
  const result = reportResult();
  result.usExchangeTransactions = [
    {
      walletAddress: "wallet-<unsafe>", exchangeAddress: "exchange-address",
      exchangeName: "Coinbase", direction: "IN",
      transaction: tx("exchange-address", "wallet-<unsafe>", 'hash-<unsafe&">'),
    },
    {
      walletAddress: "treasury-wallet", exchangeAddress: "uphold-address",
      exchangeName: "Uphold", direction: "OUT",
      transaction: { ...tx("treasury-wallet", "uphold-address", "outbound-hash"), value: "123.456789123456789" },
    },
  ];
  const report = exportsModule().buildClusterReport(result);
  const section = report.slice(report.indexOf("<section><h2>US exchange IN/OUT transactions"));
  for (const value of [
    "wallet-&lt;unsafe&gt;", "exchange-address", "Coinbase", "Uphold", "outbound-hash",
    "123.456789123456789 DAG", "hash-&lt;unsafe&amp;&quot;&gt;", "2026-10-24T10:20:30.123Z",
    ">IN</td>", ">OUT</td>", "IN = exchange → wallet", "OUT = wallet → exchange",
    "existing US-exchange reporting classification", "incomplete-history warnings",
  ]) assert.ok(section.includes(value), value);
  assert.ok(!section.includes("<unsafe"));
  assert.match(report, /Hop 1/);
  assert.match(report, /INCOMPLETE SCAN/);
});

test("printed report explicitly states when no US transactions were observed", () => {
  const report = exportsModule().buildClusterReport(reportResult());
  assert.match(report, /US exchange IN\/OUT transactions/);
  assert.match(report, /No US-exchange transactions were observed/);
  assert.match(report, /not proof that none exist/);
});

function checkpointStorage() {
  const records = new Map();
  let failWrites = false;
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          close() {},
          transaction() {
            let aborted = false;
            const transaction = {
              abort() { aborted = true; queueMicrotask(() => transaction.onabort?.()); },
              objectStore() {
                return {
                  put(value, key) {
                    if (failWrites) throw new Error("quota");
                    records.set(key, structuredClone(value));
                  },
                  delete(key) { records.delete(key); },
                  get(key) {
                    const get = {};
                    queueMicrotask(() => { get.result = structuredClone(records.get(key)); get.onsuccess?.(); });
                    return get;
                  },
                };
              },
            };
            queueMicrotask(() => queueMicrotask(() => { if (!aborted) transaction.oncomplete?.(); }));
            return transaction;
          },
        };
        request.onsuccess?.();
      });
      return request;
    },
  };
  const freshModule = () => load("cluster-finder-storage", {}, {
    indexedDB, crypto: require("node:crypto").webcrypto,
  });
  return { freshModule, records, failWrites: () => { failWrites = true; } };
}

test("checkpoints survive module reload, stay account-scoped, and clearing invalidates late scan writes", async () => {
  const storage = checkpointStorage();
  let api = storage.freshModule();
  const runId = api.beginClusterCheckpoint("account-a");
  const checkpoint = {
    version: 1, runId, savedAt: "2026-10-25T10:00:00Z", chain: "dag",
    primaryAddress: "lead", addressText: "input", state: "running",
    result: reportResult(), progress: null, error: "",
  };
  assert.equal(await api.saveClusterCheckpoint("account-a", checkpoint), true);
  api = storage.freshModule(); // Simulates losing module memory on reload.
  const restored = await api.loadClusterCheckpoint("account-a");
  assert.equal(restored.result.flows[0].transactions[0].hash, checkpoint.result.flows[0].transactions[0].hash);
  assert.equal(restored.state, "running"); // UI marks interrupted scans partial, never auto-resumes.
  assert.equal(await api.loadClusterCheckpoint("account-b"), null);
  await api.clearClusterCheckpoint("account-a");
  assert.equal(await api.saveClusterCheckpoint("account-a", checkpoint), false);
  assert.equal(await api.loadClusterCheckpoint("account-a"), null);
  assert.equal(await storage.freshModule().loadClusterCheckpoint("account-a"), null);
});

test("storage failures are explicit while in-memory partial results remain recoverable", async () => {
  const storage = checkpointStorage();
  storage.failWrites();
  const api = storage.freshModule();
  const checkpoint = {
    version: 1, runId: api.beginClusterCheckpoint("account-a"),
    savedAt: "2026-10-25T10:00:00Z", chain: "dag", primaryAddress: "lead",
    addressText: "", state: "cancelled", result: reportResult(), progress: null, error: "",
  };
  await assert.rejects(api.saveClusterCheckpoint("account-a", checkpoint), /browser storage/);
  const recovered = await api.loadClusterCheckpoint("account-a");
  assert.equal(recovered.persistenceError, true);
  assert.equal(recovered.result, checkpoint.result);
  assert.equal(storage.records.size, 0);
});

test("printed partial reports clearly retain interruption reasons", () => {
  const result = reportResult();
  result.incompleteReason = "Interrupted after <timeout>; fetched pages retained.";
  const report = exportsModule().buildClusterReport(result);
  assert.ok(report.includes("Interrupted after &lt;timeout&gt;; fetched pages retained."));
  assert.ok(report.includes("INCOMPLETE SCAN"));
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

test("graph display hides short branches, retains 3+ hop trails and short search-set links without changing data", () => {
  const { filterClusterGraph } = load("cluster-finder-display");
  const nodes = ["lead", "a", "b", "c", "short1", "short2", "input", "connector"].map((address) => ({
    address, label: null, role: address === "lead" ? "primary" : address === "input" ? "input" : "proxy",
  }));
  const flows = [
    ["lead", "a"], ["a", "b"], ["b", "c"],
    ["lead", "short1"], ["short1", "short2"],
    ["input", "connector"], ["connector", "lead"],
  ].map(([from, to], index) => ({ id: `flow-${index}`, from, to, transactions: [tx(from, to)] }));
  const before = JSON.stringify({ nodes, flows });
  const filtered = filterClusterGraph(nodes, flows);
  assert.equal(filtered.nodes.length, 6);
  assert.equal(filtered.flows.length, 5);
  assert.ok(!filtered.nodes.some((node) => node.address.startsWith("short")));
  assert.ok(filtered.nodes.some((node) => node.address === "connector"));
  assert.equal(filtered.flows[0], flows[0]);
  assert.equal(JSON.stringify({ nodes, flows }), before);
});

test("graph filtering keeps both directions, alternate qualifying routes and direct entered-wallet links", () => {
  const { filterClusterGraph } = load("cluster-finder-display");
  const makeNodes = (addresses) => addresses.map((address) => ({
    address, label: null, role: address === "lead" ? "primary" : address === "input" ? "input" : "proxy",
  }));
  const flows = [
    ["a", "lead"], ["b", "a"], ["c", "b"], ["lead", "alt"], ["alt", "b"],
    ["input", "lead"], ["lead", "input"],
  ].map(([from, to], index) => ({ id: String(index), from, to, transactions: [tx(from, to)] }));
  const result = filterClusterGraph(makeNodes(["lead", "input", "a", "b", "c", "alt"]), flows);
  assert.equal(result.flows.length, flows.length);
  const shortOnly = filterClusterGraph(makeNodes(["lead", "a", "b"]), flows.slice(0, 2));
  assert.deepEqual(Array.from(shortOnly.nodes, (node) => node.address), ["lead"]);
  assert.equal(shortOnly.flows.length, 0);
  assert.equal(filterClusterGraph([], []).nodes.length, 0);
});

test("PNG rasterizes self-contained graph SVG at viewport size without foreignObject or DOM capture", async () => {
  const result = reportResult();
  const svg = exportsModule().buildClusterGraphSvg([
    { id: "input", position: { x: 300, y: 40 }, width: 202, height: 90 },
    { id: "lead", position: { x: 70, y: 40 }, width: 202, height: 90 },
  ], result.nodes, result.flows, ["input", "lead"], {
    x: 10, y: 20, zoom: 0.5, width: 200, height: 150, focusAddresses: ["input"],
  });
  assert.match(svg, /viewBox="-20 -40 400 300"/);
  assert.match(svg, /FOCUS · WALLET/);
  assert.match(svg, /#29251e/);
  assert.match(svg, /marker-end/);
  assert.ok(!svg.includes("foreignObject"));
  const created = [];
  const revoked = [];
  let drawn = false;
  const canvas = {
    getContext: () => ({ drawImage: (_image, x, y, width, height) => {
      assert.equal(x + y, 0);
      assert.equal(width, 400);
      assert.equal(height, 300);
      drawn = true;
    } }),
    toBlob: (callback, type) => callback(new Blob(["png"], { type })),
  };
  const globals = {
    Blob,
    Image: class { set src(value) { assert.equal(value, "blob:0"); queueMicrotask(() => this.onload()); } },
    URL: {
      createObjectURL: (blob) => { created.push(blob); return `blob:${created.length - 1}`; },
      revokeObjectURL: (url) => revoked.push(url),
    },
    document: { createElement: (tag) => { assert.equal(tag, "canvas"); return canvas; } },
  };
  const api = load("cluster-finder-image", {
    "./cluster-finder-download": load("cluster-finder-download", {}, globals),
  }, globals);
  const file = await api.downloadClusterGraphPng(svg, 200, 150);
  assert.equal(drawn, true);
  assert.equal(await created[0].text(), svg);
  assert.equal(created[1].type, "image/png");
  assert.equal(file.url, "blob:1");
  assert.deepEqual(revoked, ["blob:0"]);
  assert.match(file.filename, /\.png$/);
  await assert.rejects(api.downloadClusterGraphPng(svg, 0, 150), /no visible size/);
});

test("graph connectors attach to facing card edges so sender and recipient arrows are not hidden", () => {
  const { clusterGraphHandleSides } = exportsModule();
  for (const [source, target, from, to] of [
    [{ x: 0, y: 0 }, { x: 245, y: 0 }, "right", "left"],
    [{ x: 245, y: 0 }, { x: 0, y: 0 }, "left", "right"],
    [{ x: 0, y: 0 }, { x: 0, y: 128 }, "bottom", "top"],
    [{ x: 0, y: 128 }, { x: 0, y: 0 }, "top", "bottom"],
  ]) {
    const sides = clusterGraphHandleSides(source, target);
    assert.equal(sides.sourcePosition, from);
    assert.equal(sides.targetPosition, to);
  }
});

test("report and SVG exports create real files with persistent links instead of hidden print iframes", async () => {
  const created = [];
  const appended = [];
  let clicked = false;
  let downloadedBlob;
  const globals = {
    Blob,
    setTimeout: () => 1, clearTimeout: () => {},
    URL: { createObjectURL: (blob) => { downloadedBlob = blob; return "blob:local"; }, revokeObjectURL: () => {} },
    document: {
      createElement: (tag) => {
        const element = {
          tag, style: {}, remove() { this.removed = true; },
          click() { clicked = true; },
        };
        created.push(element);
        return element;
      },
      body: { appendChild: (element) => appended.push(element) },
    },
  };
  const api = exportsModule(globals);
  const download = load("cluster-finder-download", {}, globals);
  const report = api.printClusterReport(reportResult());
  assert.equal(downloadedBlob.type, "text/html;charset=utf-8");
  assert.match(await downloadedBlob.text(), /Cluster Finder Report/);
  assert.match(report.filename, /\.html$/);
  assert.equal(created.length, 0);
  download.triggerClusterDownload(report);
  assert.equal(created[0].tag, "a");
  assert.equal(created[0].target, "_blank");
  const graph = api.downloadClusterGraph("<svg/>");
  download.triggerClusterDownload(graph);
  assert.equal(clicked, true);
  assert.match(created[1].download, /^cluster-finder-graph-.*\.svg$/);
  assert.equal(downloadedBlob.type, "image/svg+xml;charset=utf-8");
  assert.equal(appended.length, 2);
  assert.equal(created[0].removed && created[1].removed, true);
  assert.throws(() => download.createClusterDownload(new Blob([]), "empty.svg"), /empty/);
});

test("PNG capture failures and hangs fail explicitly; ready links stay available for user-click downloads", async () => {
  const imports = {
    "./cluster-finder-download": load("cluster-finder-download"),
  };
  const api = load("cluster-finder-image", imports, {
    Blob,
    URL: { createObjectURL: () => "blob:pending", revokeObjectURL: () => {} },
    Image: class {},
    setTimeout: (callback) => { queueMicrotask(callback); return 1; },
    clearTimeout: () => {},
  });
  await assert.rejects(api.downloadClusterGraphPng("<svg/>", 200, 150), /timed out/);
  const links = fs.readFileSync(path.join(__dirname, "../src/components/cluster-finder-download-links.tsx"), "utf8");
  assert.match(links, /download=\{file\.filename\}/);
  assert.match(links, /target="_blank"/);
  assert.match(links, /revokeObjectURL\(file\.url\)/);
  const page = fs.readFileSync(path.join(__dirname, "../src/pages/cluster-finder.tsx"), "utf8");
  assert.match(page, /setReportFile\(file\);[\s\S]*?triggerClusterDownload\(file\)/);
  assert.match(page, /setFocusText\(checkpoint\.focusText \?\? ""\)/);
});
