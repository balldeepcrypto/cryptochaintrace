// node --test artifacts/wallet-tracer/tests/report-accuracy.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");
const directory = path.join(__dirname, "../src/lib");
function load(name, imports = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(directory, `${name}.ts`), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = { exports: {}, require: (id) => {
    assert.ok(imports[id], `Unexpected import ${id}`); return imports[id];
  }, setTimeout, clearTimeout, URL, Date, Map, Set };
  vm.runInNewContext(output, context);
  return context.exports;
}
const evidence = load("report-evidence");
const historyApi = load("report-history", { "./report-evidence": evidence });
const fifoApi = load("report-fifo", { "./report-evidence": evidence });
const plain = (value) => JSON.parse(JSON.stringify(value));
function tx(hash, from = "source", to = "recipient", value = "1", second = 1, extra = {}) {
  return { hash, from, to, value, timestamp: `2026-01-01T00:${String(Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}Z`,
    tokenSymbol: "XRP", status: "success", ...extra };
}

test("complete report cursor pagination exceeds 25k, deduplicates transfer identities and reuses exhausted histories", async () => {
  const calls = [];
  const result = await historyApi.loadReportHistory(async (cursor) => {
    calls.push(cursor);
    const start = cursor === "page2" ? 10_000 : cursor === "page3" ? 20_000 : 0;
    const count = start === 20_000 ? 6001 : 10_000;
    return { transactions: Array.from({ length: count }, (_, i) => tx(`${start + i}`)),
      hasMore: start < 20_000, nextCursor: start === 0 ? "page2" : start === 10_000 ? "page3" : null,
      total: 1 }; // A bogus/rolling provider total must not truncate paging.
  });
  assert.deepEqual(calls, [undefined, "page2", "page3"]);
  assert.equal(result.transactions.length, 26001);
  assert.equal(result.available, 26001);
  assert.equal(result.complete, true);
  assert.equal(await historyApi.loadReportHistory(() => assert.fail("complete cache must be reused"), result), result);
});

test("distinct operations under one hash, zero destination tag and empty memos survive pagination", async () => {
  const first = tx("shared-hash", "a", "b", "1", 1, { operationId: "1", destinationTag: 0, memo: "" });
  const second = { ...first, operationId: "2", memo: "0" };
  const history = await historyApi.loadReportHistory(async (cursor) => cursor
    ? { transactions: [first, second], hasMore: false }
    : { transactions: [first], hasMore: true, nextCursor: "next" });
  assert.equal(history.transactions.length, 2);
  assert.equal(history.transactions[0].destinationTag, 0);
  assert.equal(history.transactions[0].memo, "");
  const lines = evidence.evidenceTransferLines(first, "xrp").join("\n");
  assert.match(lines, /Destination tag: 0/);
  assert.match(lines, /Memo: ""/);
  assert.match(lines, /Operation: 1/);
});

test("failed pages retain observations and next cursor; resumption fetches only missing pages", async () => {
  let failing = true;
  const calls = [];
  const fetch = async (cursor) => {
    calls.push(cursor);
    if (!cursor) return { transactions: [tx("first")], hasMore: true, nextCursor: "second" };
    if (failing) throw new Error("429 exhausted");
    return { transactions: [tx("last")], hasMore: false };
  };
  const partial = await historyApi.loadReportHistory(fetch);
  assert.equal(partial.complete, false);
  assert.equal(partial.available, null);
  assert.equal(partial.nextCursor, "second");
  failing = false;
  const recovered = await historyApi.loadReportHistory(fetch, partial);
  assert.deepEqual(calls, [undefined, "second", "second"]);
  assert.equal(recovered.complete, true);
  assert.equal(recovered.transactions.length, 2);
  assert.equal(partial.transactions.length, 1);
});

test("archive gaps, missing or repeated cursors stay explicitly incomplete; empty pages can advance", async () => {
  for (const scenario of ["archive", "missing", "repeat"]) {
    const result = await historyApi.loadReportHistory(async (cursor) => ({
      transactions: [tx("one")], hasMore: scenario !== "archive",
      archiveWarning: scenario === "archive" ? "Older history not indexed" : undefined,
      nextCursor: scenario === "repeat" ? "same" : null,
    }));
    assert.equal(result.complete, false);
    assert.equal(result.available, null);
    assert.ok(result.warnings.length);
    assert.equal(result.transactions.length, 1);
  }
  const result = await historyApi.loadReportHistory(async (cursor) => ({
    transactions: cursor ? [tx("later")] : [], hasMore: !cursor, nextCursor: cursor ? null : "empty-page-next",
  }));
  assert.equal(result.complete, true);
  assert.equal(result.transactions.length, 1);
});

test("FIFO follows selected value after earlier clean funds, preserving consumed lot order at each recipient", () => {
  const source = tx("origin", "victim", "r", "100", 2);
  const result = fifoApi.attributeFifo([
    tx("clean", "other", "r", "300", 1), source,
    tx("out-clean", "r", "s", "250", 3),
    tx("out-mixed", "r", "s", "100", 4),
    tx("s-clean", "s", "t", "275", 5),
    tx("s-mixed", "s", "t", "50", 6),
  ], source, () => false);
  const byHash = new Map(result.flows.map((flow) => [flow.transaction.hash, flow.attributed]));
  assert.equal(byHash.get("origin"), "100");
  assert.equal(byHash.has("out-clean"), false);
  assert.equal(byHash.get("out-mixed"), "50");
  assert.equal(byHash.has("s-clean"), false);
  assert.equal(byHash.get("s-mixed"), "25");
  const balances = result.arrivals.reduce((sum, entry) => sum + Number(entry.remaining), 0);
  assert.equal(balances, 100);
  assert.match(result.note, /not additive/);
});

test("FIFO stops allocated value at exchanges, ignores other assets and failed transfers, and preserves tiny exact amounts", () => {
  const source = tx("theft", "a", "b", "0.000000000000000001", 1, { assetId: "TOKEN:issuer1" });
  const result = fifoApi.attributeFifo([
    source, { ...source }, tx("other-issuer", "b", "c", "1000000", 2, { assetId: "TOKEN:issuer2" }),
    tx("failed", "b", "c", "1", 3, { assetId: "TOKEN:issuer1", status: "failed" }),
    tx("exchange-in", "b", "exchange", source.value, 4, { assetId: "TOKEN:issuer1" }),
    tx("exchange-out", "exchange", "unrelated", "999999999", 5, { assetId: "TOKEN:issuer1" }),
  ], source, (wallet) => wallet === "exchange");
  assert.deepEqual(plain(result.flows.map((flow) => flow.transaction.hash)), ["theft", "exchange-in"]);
  assert.equal(result.arrivals.find((entry) => entry.wallet === "exchange").cumulativeArrivals, source.value);
  assert.equal(result.arrivals.some((entry) => entry.wallet === "unrelated"), false);
  assert.equal(result.arrivals.find((entry) => entry.wallet === "exchange").exchangeStop, true);
});

test("fees consume only the native asset once per sender/TX and never increase recipient arrivals", () => {
  const source = tx("origin", "a", "b", "100", 1);
  const result = fifoApi.attributeFifo([source, tx("spend", "b", "c", "50", 2, { fee: "1" })],
    source, () => false, (address) => address, "XRP");
  assert.equal(result.arrivals.find((entry) => entry.wallet === "b").remaining, "49");
  assert.equal(result.arrivals.find((entry) => entry.wallet === "c").remaining, "50");
  assert.ok(result.warnings.some((warning) => /opening/.test(warning)));
});

test("FIFO rejects invalid source evidence or timestamps rather than inventing attribution", () => {
  const source = tx("source");
  assert.throws(() => fifoApi.attributeFifo([], { ...source, status: "failed" }, () => false), /successful/);
  assert.throws(() => fifoApi.attributeFifo([], { ...source, timestamp: "invalid" }, () => false), /timestamps/);
});

test("FIFO preserves exact scientific notation and numeric same-ledger operation ordering", () => {
  const origin = tx("seed", "a", "b", "1e-18", 1, { operationId: "2", blockNumber: 10 });
  const result = fifoApi.attributeFifo([
    tx("later", "b", "c", "1e-18", 1, { operationId: "10", blockNumber: 10 }), origin,
  ], origin, () => false);
  assert.equal(result.flows[1].attributed, "0.000000000000000001");
  assert.equal(result.arrivals.find((entry) => entry.wallet === "b").remaining, "0");
});

test("FIFO cycles retain conservation while cumulative arrivals are explicitly not additive", () => {
  const origin = tx("seed", "a", "b", "100", 1);
  const result = fifoApi.attributeFifo([origin, tx("out", "b", "c", "100", 2), tx("back", "c", "b", "100", 3)],
    origin, () => false);
  assert.equal(result.arrivals.find((entry) => entry.wallet === "b").cumulativeArrivals, "200");
  assert.equal(result.arrivals.reduce((sum, entry) => sum + Number(entry.remaining), 0), 100);
});

test("HTML report links remain clickable and escape untrusted memo/tag text", () => {
  const { renderReportHtml } = load("report-export");
  const html = renderReportHtml('TX ID: hash-123\nExplorer: https://xrpscan.com/tx/hash-123\nMemo: <img src=x onerror="alert(1)">\nDestination tag: 0');
  assert.match(html, /href="https:\/\/xrpscan.com\/tx\/hash-123"/);
  assert.match(html, /noopener noreferrer/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test("Stellar report-only parsing preserves dust, non-whitelisted assets, operation IDs and memo zero", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../api-server/src/routes/wallets.ts"), "utf8");
  const tree = ts.createSourceFile("wallets.ts", source, ts.ScriptTarget.Latest, true);
  const functions = [];
  const wanted = new Set(["parseStellarOp", "parseStellarRecords", "stellarAssetSymbol"]);
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && wanted.has(node.name?.text)) functions.push(node.getText(tree));
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(functions.length, 3);
  const run = (reportHistory) => {
    const context = {
      STELLAR_VALUE_OPS: new Set(["payment"]), address: "b", priceUsd: 0.1, reportHistory,
      XLM_SERVER_MIN: { XLM: 1 }, exports: {}, Buffer,
    };
    const js = ts.transpileModule(`${functions.join("\n")}\nexports.parse = parseStellarRecords;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(js, context);
    const base = { id: "1", type: "payment", transaction_hash: "same-hash", from: "a", to: "b",
      asset_type: "native", amount: "0.0000001", created_at: "2026-01-01T00:00:00Z",
      transaction: { memo_type: "id", memo: "0", fee_charged: "100" } };
    return context.exports.parse([base, { ...base, id: "2", asset_type: "credit_alphanum4", asset_code: "TEST", asset_issuer: "issuer" }]);
  };
  assert.equal(run(false).length, 0);
  const raw = run(true);
  assert.equal(raw.length, 2);
  assert.equal(raw[0].operationId, "1");
  assert.equal(raw[0].memo, "0");
  assert.equal(raw[1].assetId, "TEST:issuer");
  assert.match(source, /reportHistory \? ":report-evidence-v1"/);
});

test("evidence references include exact TX ID, UTC/local time, memo/tag and truthful inferred provenance", () => {
  const lines = evidence.evidenceTransferLines(tx('hash/"', "a", "b", "1", 1, { memo: "<unsafe>", destinationTag: 0 }), "xlm").join("\n");
  assert.match(lines, /2026-01-01T00:00:01.000Z \(UTC\)/);
  assert.match(lines, /\(local\)/);
  assert.match(lines, /https:\/\/stellar.expert\/explorer\/public\/tx\/hash%2F%22/);
  assert.match(evidence.CATALOG_PROVENANCE, /Inferred/);
  assert.doesNotMatch(evidence.CATALOG_PROVENANCE, /Confirmed|XRPScan|Bithomp|Stellar Expert/);
});

test("neutral reports omit directives, conspiracy claims and data-request templates without losing transfer facts", () => {
  const result = evidence.neutralReportText([
    "VICTIM → THIEF", "TX ID: hash-123", "Amount: 123.45 XRP",
    "File subpoena now", "Supports common control / conspiracy theory.",
    "MASTER DATA REQUEST — USE IN ALL SUBPOENAS & KYC LETTERS",
    "The full legal names of account holders", "45. All private account records",
    "1. COMMINGLING CHECK SUMMARY", "Observed transfer: a → b",
    "This document is cryptographically signed and tamper-evident.",
  ].join("\n"));
  assert.doesNotMatch(result, /subpoena|conspiracy|full legal names|private account records|VICTIM|THIEF/i);
  assert.match(result, /Amount: 123.45 XRP/);
  assert.match(result, /TX ID: hash-123/);
  assert.match(result, /Observed transfer: a → b/);
  assert.match(result, /not an authenticated digital signature/);
});
