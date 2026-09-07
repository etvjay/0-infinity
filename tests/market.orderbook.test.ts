import test from "node:test";
import assert from "node:assert/strict";
import { UsdMFuturesOrderBook, type UsdMFuturesDepthUpdate } from "../src/market/index.js";

const update = (o: Record<string, unknown> = {}): UsdMFuturesDepthUpdate => ({
  e: "depthUpdate", E: 1000, T: 999, s: "BTCUSDT", U: 99, u: 101, pu: 98,
  b: [["100.00", "2"], ["99.00", "1"]], a: [["101.00", "3"]], ...o,
});
const snap = (o: Record<string, unknown> = {}) => ({ lastUpdateId: 100, symbol: "BTCUSDT", bids: [["100.00", "1"]], asks: [["101.00", "2"]], ...o });
const t = 2000;

test("bridges buffered diffs across snapshot S and applies absolute levels", () => {
  const book = new UsdMFuturesOrderBook();
  book.ingestDiff(update({ U: 99, u: 101, pu: 98 }), t);
  const view = book.ingestSnapshot(snap(), t);
  assert.equal(view.status, "SYNCED");
  assert.deepEqual(view.bids, [{ price: "100", quantity: "2" }, { price: "99", quantity: "1" }]);
  assert.deepEqual(view.asks, [{ price: "101", quantity: "3" }]);
  assert.equal(view.lastUpdateId, 101n);
});

test("requires pu continuity after sync and fails closed on a gap", () => {
  const book = new UsdMFuturesOrderBook();
  book.ingestSnapshot(snap(), t);
  assert.throws(() => book.ingestDiff(update({ U: 103, u: 103, pu: 100 }), t + 1), /DESYNCED|continuity/i);
  assert.equal(book.status("BTCUSDT"), "DESYNCED");
  assert.equal(book.getSnapshot("BTCUSDT")?.status, "DESYNCED");
});

test("zero deletes and missing deletion is idempotent", () => {
  const book = new UsdMFuturesOrderBook(); book.ingestSnapshot(snap(), t);
  book.ingestDiff(update({ U: 101, u: 101, pu: 100, b: [["100", "0"], ["98", "0"]], a: [["101", "0"]] }), t + 1);
  assert.deepEqual(book.getSnapshot("BTCUSDT")?.bids, []); assert.deepEqual(book.getSnapshot("BTCUSDT")?.asks, []);
});

test("canonical decimal keys sort deterministically and snapshots are immutable", () => {
  const book = new UsdMFuturesOrderBook();
  const view = book.ingestSnapshot(snap({ bids: [["1.2300", "1"], ["1.2", "2"], ["1.10", "1"]], asks: [["2.00", "1"], ["1.50", "1"]] }), t);
  assert.deepEqual(view.bids.map(x => x.price), ["1.23", "1.2", "1.1"]);
  assert.deepEqual(view.asks.map(x => x.price), ["1.5", "2"]);
  assert.equal(view.bestBid?.price, "1.23"); assert.equal(view.bestAsk?.price, "1.5");
  assert.equal(Object.isFrozen(view), true); assert.equal(Object.isFrozen(view.bids), true);
  const old = view.bids[0]; (update().b[0] as unknown as string[])[1] = "999";
  assert.equal(old.quantity, "1");
});

test("rejects crossed books, malformed IDs, overflow, wrong products, and symbols", () => {
  assert.throws(() => new UsdMFuturesOrderBook().ingestSnapshot(snap({ asks: [["99", "1"]] }), t), /cross/i);
  for (const ids of [{ U: 2, u: 1 }, { U: "01", u: "2" }, { U: "999999999999999999999999", u: "1" }])
    assert.throws(() => new UsdMFuturesOrderBook().ingestDiff(update(ids), t), /ID|U|update|order/i);
  assert.throws(() => new UsdMFuturesOrderBook().ingestSnapshot(snap({ productFamily: "COIN_M_FUTURES_CM" }), t), /product/i);
  assert.throws(() => new UsdMFuturesOrderBook().ingestSnapshot(snap({ symbol: "SOLUSDT" }), t), /symbol/i);
});

test("isolates symbols, honors bounded buffering, and supports explicit rebootstrap", () => {
  const book = new UsdMFuturesOrderBook({ maxBufferedUpdates: 1 });
  book.ingestDiff(update({ s: "BTCUSDT", U: 90, u: 91 }), t);
  assert.throws(() => book.ingestDiff(update({ s: "BTCUSDT", U: 92, u: 93 }), t), /buffer|rebootstrap|DESYNCED/i);
  book.ingestSnapshot(snap({ symbol: "ETHUSDT" }), t);
  assert.equal(book.status("BTCUSDT"), "DESYNCED"); assert.equal(book.status("ETHUSDT"), "SYNCED");
  book.rebootstrap("BTCUSDT");
  book.ingestSnapshot(snap({ U: undefined }), t);
  assert.equal(book.status("BTCUSDT"), "SYNCED");
  book.ingestDiff(update({ s: "ETHUSDT", U: 101, u: 101, pu: 100 }), t + 1);
  assert.equal(book.getSnapshot("BTCUSDT")?.bestBid?.price, "100");
});

test("accepts JSON depth IDs exactly and rejects chronology or caller mutation", () => {
  const book = new UsdMFuturesOrderBook();
  const raw = JSON.stringify(update({ U: "9223372036854775806", u: "9223372036854775807", pu: "9223372036854775805" }));
  book.ingestDiff(raw, t); const s = JSON.stringify(snap({ lastUpdateId: "9223372036854775807" }));
  const v = book.ingestSnapshot(s, t); assert.equal(v.lastUpdateId, 9223372036854775807n);
  assert.throws(() => new UsdMFuturesOrderBook().ingestSnapshot(snap({ E: 3000 }), t), /timestamp|chronology/i);
});

test("buffer overflow fails closed instead of dropping the oldest update", () => {
  const book = new UsdMFuturesOrderBook({ maxBufferedUpdates: 1 });
  book.ingestDiff(update({ U: 90, u: 90 }), t);
  assert.throws(() => book.ingestDiff(update({ U: 91, u: 91 }), t), /buffer|rebootstrap|DESYNCED/i);
  assert.equal(book.status("BTCUSDT"), "DESYNCED");
  assert.throws(() => book.ingestSnapshot(snap(), t), /rebootstrap/i);
  book.rebootstrap("BTCUSDT");
  assert.equal(book.status("BTCUSDT"), "SYNCING");
});

test("requires the inclusive bootstrap bridge and desyncs non-bridging ranges", () => {
  const book = new UsdMFuturesOrderBook();
  book.ingestDiff(update({ U: 101, u: 102 }), t);
  assert.throws(() => book.ingestSnapshot(snap(), t), /bridge|rebootstrap|DESYNCED/i);
  assert.equal(book.status("BTCUSDT"), "DESYNCED");

  const bridged = new UsdMFuturesOrderBook();
  bridged.ingestDiff(update({ U: 100, u: 101, pu: 99 }), t);
  assert.equal(bridged.ingestSnapshot(snap(), t).lastUpdateId, 101n);
});

test("DESYNCED cannot be cleared by a snapshot without explicit rebootstrap", () => {
  const book = new UsdMFuturesOrderBook();
  book.ingestSnapshot(snap(), t);
  assert.throws(() => book.ingestDiff(update({ U: 103, u: 103, pu: 100 }), t + 1), /continuity/i);
  assert.throws(() => book.ingestSnapshot(snap({ lastUpdateId: 200 }), t), /rebootstrap/i);
  assert.equal(book.status("BTCUSDT"), "DESYNCED");
  book.rebootstrap("BTCUSDT");
  assert.equal(book.ingestSnapshot(snap({ lastUpdateId: 200 }), t).status, "SYNCED");
});

test("depth timestamps and receivedAt are required, safe, non-negative, and chronological", () => {
  for (const field of ["E", "T"]) {
    const value = update(); delete (value as unknown as Record<string, unknown>)[field];
    assert.throws(() => new UsdMFuturesOrderBook().ingestDiff(value, t), new RegExp(field));
  }
  assert.throws(() => new UsdMFuturesOrderBook().ingestDiff(update(), -1), /receivedAt/i);
  assert.throws(() => new UsdMFuturesOrderBook().ingestDiff(update({ E: -1 }), t), /E/i);
  assert.throws(() => new UsdMFuturesOrderBook().ingestDiff(update({ T: 1001, E: 1000 }), t), /chronology/i);
  assert.throws(() => new UsdMFuturesOrderBook().ingestDiff(update(), Number.MAX_SAFE_INTEGER + 1), /receivedAt/i);
});

test("JSON nested IDs cannot override top-level IDs", () => {
  const raw = JSON.stringify({ ...update({ U: 100, u: 101, pu: 99 }), meta: { u: 999999999999999999999 } });
  const book = new UsdMFuturesOrderBook();
  assert.equal(book.ingestDiff(raw, t), null);
  assert.equal(book.ingestSnapshot(snap(), t).lastUpdateId, 101n);
});
