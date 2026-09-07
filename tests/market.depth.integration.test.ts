import test from "node:test";
import assert from "node:assert/strict";
import {
  UsdMFuturesDepthSnapshotSource,
  UsdMFuturesDepthLifecycle,
  normalizeUsdMFuturesDepthSnapshot,
  type UsdMFuturesRestClient,
} from "../src/market/depth.js";
import { UsdMFuturesOrderBook } from "../src/market/index.js";

test("normalizes USD-M REST depth snapshots without losing exact lastUpdateId", async () => {
  const requests: unknown[] = [];
  const client: UsdMFuturesRestClient = { get: async (path, query) => { requests.push({ path, query }); return {
    lastUpdateId: "9223372036854775807", bids: [["100.00", "2.000"]], asks: [["101.00", "3.000"]],
  }; } };
  const source = new UsdMFuturesDepthSnapshotSource(client);
  const snapshot = await source.fetchSnapshot("BTCUSDT");
  assert.deepEqual(requests, [{ path: "/fapi/v1/depth", query: { symbol: "BTCUSDT", limit: 1000 } }]);
  assert.equal(snapshot.lastUpdateId, 9223372036854775807n);
  assert.deepEqual(snapshot.bids, [["100", "2"]]);
  assert.deepEqual(snapshot.asks, [["101", "3"]]);
  assert.equal(Object.isFrozen(snapshot), true);
});

test("normalizes a JSON snapshot with an unquoted large lastUpdateId lexeme exactly", () => {
  const snapshot = normalizeUsdMFuturesDepthSnapshot(
    '{"lastUpdateId":9223372036854775807,"bids":[["100","1"]],"asks":[["101","1"]]}',
    "BTCUSDT",
  );
  assert.equal(snapshot.lastUpdateId, 9223372036854775807n);
});

test("preserves top-level lastUpdateId when a nested object appears before it", () => {
  const snapshot = normalizeUsdMFuturesDepthSnapshot(
    '{"meta":{"lastUpdateId":7},"lastUpdateId":9223372036854775807,"bids":[["100","1"]],"asks":[["101","1"]]}',
    "BTCUSDT",
  );
  assert.equal(snapshot.lastUpdateId, 9223372036854775807n);
});

test("preserves top-level lastUpdateId when a nested object appears after it", () => {
  const snapshot = normalizeUsdMFuturesDepthSnapshot(
    '{"lastUpdateId":9223372036854775807,"meta":{"lastUpdateId":7},"bids":[["100","1"]],"asks":[["101","1"]]}',
    "BTCUSDT",
  );
  assert.equal(snapshot.lastUpdateId, 9223372036854775807n);
});

test("rejects duplicate, missing, exponent, and unsafe snapshot update IDs", () => {
  const levels = '"bids":[["100","1"]],"asks":[["101","1"]]';
  for (const raw of [
    `{"lastUpdateId":1,"lastUpdateId":2,${levels}}`,
    `{${levels}}`,
    `{"lastUpdateId":1e3,${levels}}`,
    `{"lastUpdateId":-1,${levels}}`,
    `{"lastUpdateId":1.0,${levels}}`,
  ]) assert.throws(() => normalizeUsdMFuturesDepthSnapshot(raw, "BTCUSDT"), /lastUpdateId|snapshot/);
});

test("depth lifecycle is disconnected until a successful snapshot bridge", async () => {
  const book = new UsdMFuturesOrderBook();
  const source: { fetchSnapshot: (symbol: "BTCUSDT" | "ETHUSDT") => Promise<unknown> } = {
    fetchSnapshot: async () => ({ symbol: "BTCUSDT", lastUpdateId: 100, bids: [["100", "1"]], asks: [["101", "1"]] }),
  };
  const lifecycle = new UsdMFuturesDepthLifecycle(book, source);
  assert.equal(lifecycle.status("BTCUSDT"), "DISCONNECTED");
  await lifecycle.rebootstrap("BTCUSDT");
  assert.equal(lifecycle.status("BTCUSDT"), "SYNCED");
  assert.equal(book.snapshot("BTCUSDT")?.lastUpdateId, 100n);
});

test("pu gap desyncs and explicit rebootstrap requires a new snapshot", async () => {
  let calls = 0;
  const book = new UsdMFuturesOrderBook();
  const lifecycle = new UsdMFuturesDepthLifecycle(book, { fetchSnapshot: async () => { calls++; return { symbol: "BTCUSDT", lastUpdateId: calls === 1 ? 100 : 200, bids: [["100", "1"]], asks: [["101", "1"]] }; } });
  await lifecycle.rebootstrap("BTCUSDT");
  assert.throws(() => lifecycle.ingestDiff({ e: "depthUpdate", E: 1000, T: 999, s: "BTCUSDT", U: 103, u: 103, pu: 100, b: [], a: [] }, 2000), /DESYNCED|continuity/);
  assert.equal(lifecycle.status("BTCUSDT"), "DESYNCED");
  await lifecycle.rebootstrap("BTCUSDT");
  assert.equal(lifecycle.status("BTCUSDT"), "SYNCED");
  assert.equal(book.snapshot("BTCUSDT")?.lastUpdateId, 200n);
});

test("JSON-string depth gaps desync the lifecycle for the payload symbol", async () => {
  const book = new UsdMFuturesOrderBook();
  const lifecycle = new UsdMFuturesDepthLifecycle(book, { fetchSnapshot: async () => ({ symbol: "BTCUSDT", lastUpdateId: 100, bids: [["100", "1"]], asks: [["101", "1"]] }) });
  await lifecycle.rebootstrap("BTCUSDT");
  const gap = JSON.stringify({ e: "depthUpdate", E: 1000, T: 999, s: "BTCUSDT", U: 103, u: 103, pu: 100, b: [], a: [] });
  assert.throws(() => lifecycle.ingestDiff(gap, 2000), /DESYNCED|continuity/);
  assert.equal(lifecycle.status("BTCUSDT"), "DESYNCED");
});

test("BTCUSDT and ETHUSDT depth sessions remain isolated", async () => {
  const book = new UsdMFuturesOrderBook();
  const lifecycle = new UsdMFuturesDepthLifecycle(book, { fetchSnapshot: async symbol => ({ symbol, lastUpdateId: 10, bids: [["100", "1"]], asks: [["101", "1"]] }) });
  await lifecycle.rebootstrap("BTCUSDT");
  assert.equal(lifecycle.status("ETHUSDT"), "DISCONNECTED");
  assert.equal(book.snapshot("ETHUSDT"), null);
});
