import test from "node:test";
import assert from "node:assert/strict";
import { UsdMFuturesMarketState, type UsdMFuturesBookTicker } from "../src/market/index.js";

const ticker = (overrides: Record<string, unknown> = {}): UsdMFuturesBookTicker => ({
  e: "bookTicker", u: 42, E: 1_700_000_001_000, T: 1_700_000_000_999, s: "BTCUSDT",
  b: "100.10", B: "2.5", a: "100.20", A: "3.0", ...overrides,
});

test("normalizes an official USD-M bookTicker into a frozen versioned snapshot", () => {
  const snapshot = new UsdMFuturesMarketState().ingest(ticker(), 1_700_000_001_001);
  assert.deepEqual(snapshot, {
    version: 1, venue: "BINANCE", instrument: "USD_M_FUTURES", symbol: "BTCUSDT",
    bidPrice: 100.1, bidQuantity: 2.5, askPrice: 100.2, askQuantity: 3,
    eventTime: 1_700_000_001_000, transactionTime: 1_700_000_000_999,
    updateVersion: 42n, receivedAt: 1_700_000_001_001,
    source: { productFamily: "USD_M_FUTURES_UM", endpoint: "wss://fstream.binance.com", stream: "bookTicker" },
  });
  assert.equal(Object.isFrozen(snapshot), true); assert.equal(Object.isFrozen(snapshot.source), true);
});

test("rejects a payload from another product family", () => {
  assert.throws(() => new UsdMFuturesMarketState().ingest(ticker({ productFamily: "COIN_M_FUTURES_CM" }), 1_700_000_001_001), /product family/i);
});

test("rejects symbols outside the M-B2 MVP", () => {
  assert.throws(() => new UsdMFuturesMarketState().ingest(ticker({ s: "SOLUSDT" }), 1_700_000_001_001), /symbol/i);
});

test("rejects malformed decimal and quantity fields", () => {
  for (const [field, value] of [["b", "NaN"], ["B", "0"], ["a", "1e309"], ["A", "-2"]] as const) {
    assert.throws(() => new UsdMFuturesMarketState().ingest(ticker({ [field]: value }), 1_700_000_001_001), new RegExp(field));
  }
});

test("rejects malformed timestamps and future timestamps", () => {
  for (const [field, value] of [["E", -1], ["T", 1.5], ["E", 1_700_000_001_002], ["T", 1_700_000_001_002]] as const) {
    assert.throws(() => new UsdMFuturesMarketState().ingest(ticker({ [field]: value }), 1_700_000_001_001), new RegExp(field));
  }
  assert.throws(() => new UsdMFuturesMarketState().ingest(ticker({ T: 1_700_000_001_001, E: 1_700_000_001_000 }), 1_700_000_001_001), /chronology/i);
});

test("rejects non-monotonic update sequences", () => {
  const state = new UsdMFuturesMarketState(); state.ingest(ticker({ u: 9 }), 1_700_000_001_001);
  assert.throws(() => state.ingest(ticker({ u: 9, E: 1_700_000_001_001, T: 1_700_000_001_000 }), 1_700_000_001_002), /monotonic|sequence|update/i);
  assert.throws(() => state.ingest(ticker({ u: 8, E: 1_700_000_001_001, T: 1_700_000_001_000 }), 1_700_000_001_002), /monotonic|sequence|update/i);
});

test("accepts JSON text and preserves optional post-migration fields only as input metadata", () => {
  const snapshot = new UsdMFuturesMarketState().ingest(JSON.stringify(ticker({ ps: "BTCUSDT", st: "1" })), 1_700_000_001_001);
  assert.equal(snapshot.symbol, "BTCUSDT"); assert.equal("ps" in snapshot, false); assert.equal("st" in snapshot, false);
});

test("rejects post-CM status and mismatched pair metadata", () => {
  for (const st of [2, "2"]) {
    assert.throws(() => new UsdMFuturesMarketState().ingest(ticker({ st }), 1_700_000_001_001), /st|status/i);
  }
  assert.throws(() => new UsdMFuturesMarketState().ingest(ticker({ ps: "ETHUSDT" }), 1_700_000_001_001), /ps|pair|symbol/i);
});

test("tracks update sequence independently for each symbol", () => {
  const state = new UsdMFuturesMarketState();
  state.ingest(ticker({ s: "BTCUSDT", u: 100 }), 1_700_000_001_001);
  const snapshot = state.ingest(ticker({ s: "ETHUSDT", u: 1 }), 1_700_000_001_002);
  assert.equal(snapshot.symbol, "ETHUSDT");
  assert.equal(snapshot.updateVersion, 1n);
});

test("preserves huge update IDs exactly from objects and JSON text", () => {
  const huge = "9223372036854775807";
  const objectSnapshot = new UsdMFuturesMarketState().ingest(ticker({ u: huge }), 1_700_000_001_001);
  const jsonSnapshot = new UsdMFuturesMarketState().ingest(JSON.stringify(ticker({ u: huge })), 1_700_000_001_001);
  const bigintSnapshot = new UsdMFuturesMarketState().ingest(ticker({ u: BigInt(huge) }), 1_700_000_001_001);
  assert.equal(objectSnapshot.updateVersion, BigInt(huge));
  assert.equal(jsonSnapshot.updateVersion, BigInt(huge));
  assert.equal(bigintSnapshot.updateVersion, BigInt(huge));
});

test("rejects invalid update IDs without coercion", () => {
  for (const u of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "01", "-1", "1.2", "1e3", "", true, null]) {
    assert.throws(() => new UsdMFuturesMarketState().ingest(ticker({ u }), 1_700_000_001_001), /u|update/i);
  }
  const exponentJson = JSON.stringify(ticker()).replace('"u":42', '"u":1e3');
  assert.throws(() => new UsdMFuturesMarketState().ingest(exponentJson, 1_700_000_001_001), /u|update/i);
});
