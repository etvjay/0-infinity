import test from "node:test";
import assert from "node:assert/strict";
import {
  UsdMFuturesMarketConnectivity,
  type UsdMFuturesMarketTransport,
  type UsdMFuturesTransportConnection,
} from "../src/market/connectivity.js";
import { UsdMFuturesMarketState, UsdMFuturesOrderBook } from "../src/market/index.js";
import { UsdMFuturesDepthLifecycle } from "../src/market/depth.js";

class FakeConnection implements UsdMFuturesTransportConnection {
  readonly sent: string[] = [];
  private messageHandler?: (message: string) => void;
  private closeHandler?: (reason?: string) => void;
  send(message: string): void { this.sent.push(message); }
  onMessage(handler: (message: string) => void): void { this.messageHandler = handler; }
  onClose(handler: (reason?: string) => void): void { this.closeHandler = handler; }
  emit(message: unknown): void { this.messageHandler?.(typeof message === "string" ? message : JSON.stringify(message)); }
  close(reason = "closed"): void { this.closeHandler?.(reason); }
}

class FakeTransport implements UsdMFuturesMarketTransport {
  readonly connections: FakeConnection[] = [];
  connect(): UsdMFuturesTransportConnection {
    const connection = new FakeConnection(); this.connections.push(connection); return connection;
  }
}

class FakeScheduler {
  readonly delays: number[] = [];
  private tasks: (() => void)[] = [];
  schedule(task: () => void, delayMs: number): void { this.delays.push(delayMs); this.tasks.push(task); }
  runNext(): void { this.tasks.shift()?.(); }
}

class RecordingOrderBook extends UsdMFuturesOrderBook {
  readonly received: number[] = [];
  override ingestDiff(raw: unknown, receivedAt: number): null { void raw; this.received.push(receivedAt); return null; }
}

const config = { symbols: ["BTCUSDT"] as const, streams: ["btcusdt@bookTicker"] as const, maxReconnectAttempts: 2, backoffMs: [100, 250] };

test("starts connected lifecycle and sends deterministic public SUBSCRIBE", () => {
  const transport = new FakeTransport();
  const adapter = new UsdMFuturesMarketConnectivity(transport, config);
  adapter.start();
  assert.equal(adapter.status, "SUBSCRIBING");
  assert.deepEqual(JSON.parse(transport.connections[0].sent[0]), { method: "SUBSCRIBE", params: ["btcusdt@bookTicker"], id: 1 });
  transport.connections[0].emit({ result: null, id: 1 });
  assert.equal(adapter.status, "SUBSCRIBED");
});

test("rejects non-UM symbols and malformed stream names before transport use", () => {
  const transport = new FakeTransport();
  assert.throws(() => new UsdMFuturesMarketConnectivity(transport, { symbols: ["SOLUSDT"] as never, streams: ["solusdt@bookTicker"] as never }), /symbol|USD_M_FUTURES_UM/i);
  assert.equal(transport.connections.length, 0);
});

test("routes valid public market events and rejects private-looking payloads", () => {
  const transport = new FakeTransport(); const events: unknown[] = [];
  const adapter = new UsdMFuturesMarketConnectivity(transport, config, { onMarketEvent: (event: Record<string, unknown>) => events.push(event) });
  adapter.start(); transport.connections[0].emit({ result: null, id: 1 });
  transport.connections[0].emit({ e: "bookTicker", u: 42, E: 1000, T: 999, s: "BTCUSDT", b: "100", B: "1", a: "101", A: "2" });
  assert.equal(events.length, 1); assert.equal((events[0] as { e: string }).e, "bookTicker");
  assert.throws(() => transport.connections[0].emit({ e: "ACCOUNT_UPDATE" }), /private|public|unsupported/i);
  assert.equal(adapter.status, "SUBSCRIBED");
});

test("reconnects with bounded deterministic backoff and resubscribes", () => {
  const transport = new FakeTransport(); const scheduler = new FakeScheduler();
  const adapter = new UsdMFuturesMarketConnectivity(transport, config, { scheduler });
  adapter.start(); transport.connections[0].close("network");
  assert.equal(adapter.status, "BACKOFF"); assert.deepEqual(scheduler.delays, [100]); scheduler.runNext();
  assert.equal(transport.connections.length, 2); assert.equal(adapter.status, "SUBSCRIBING");
  transport.connections[1].emit({ result: null, id: 2 }); transport.connections[1].close("network");
  assert.deepEqual(scheduler.delays, [100, 100]); scheduler.runNext(); assert.equal(transport.connections.length, 3);
  transport.connections[2].close("network"); assert.equal(adapter.status, "BACKOFF"); assert.deepEqual(scheduler.delays, [100, 100, 250]);
});

test("feeds validated bookTicker events into the existing market state interface", () => {
  const transport = new FakeTransport(); const state = new UsdMFuturesMarketState();
  const adapter = new UsdMFuturesMarketConnectivity(transport, config, { marketState: state, receivedAt: () => 1_001 });
  adapter.start(); transport.connections[0].emit({ result: null, id: 1 });
  transport.connections[0].emit({ e: "bookTicker", u: 42, E: 1000, T: 999, s: "BTCUSDT", b: "100", B: "1", a: "101", A: "2" });
  assert.equal(state.ingest({ e: "bookTicker", u: 43, E: 1000, T: 999, s: "BTCUSDT", b: "100", B: "1", a: "101", A: "2" }, 1_001).updateVersion, 43n);
});

test("unsubscribe and stop are explicit read-only lifecycle actions", () => {
  const transport = new FakeTransport(); const adapter = new UsdMFuturesMarketConnectivity(transport, config);
  adapter.start(); transport.connections[0].emit({ result: null, id: 1 }); adapter.unsubscribe();
  assert.deepEqual(JSON.parse(transport.connections[0].sent[1]), { method: "UNSUBSCRIBE", params: ["btcusdt@bookTicker"], id: 2 });
  adapter.stop(); assert.equal(adapter.status, "STOPPED"); assert.throws(() => adapter.start(), /stopped/i);
});

test("unsubscribe invalidates and closes the connection without reconnecting or routing later events", () => {
  const transport = new FakeTransport(); const scheduler = new FakeScheduler(); const events: unknown[] = [];
  const adapter = new UsdMFuturesMarketConnectivity(transport, config, { scheduler, onMarketEvent: (event: Record<string, unknown>) => events.push(event) });
  adapter.start(); const connection = transport.connections[0]; connection.emit({ result: null, id: 1 });
  adapter.unsubscribe();
  assert.equal(adapter.status, "IDLE"); assert.equal(connection.sent.length, 2);
  connection.emit({ e: "bookTicker", u: 42, E: 1000, T: 999, s: "BTCUSDT", b: "100", B: "1", a: "101", A: "2" });
  connection.close("late close");
  assert.equal(events.length, 0); assert.deepEqual(scheduler.delays, []);
});

test("unsubscribe during backoff invalidates the pending reconnect and returns to idle", () => {
  const transport = new FakeTransport(); const scheduler = new FakeScheduler();
  const adapter = new UsdMFuturesMarketConnectivity(transport, config, { scheduler });
  adapter.start(); transport.connections[0].close("network");
  assert.equal(adapter.status, "BACKOFF");
  adapter.unsubscribe(); scheduler.runNext();
  assert.equal(adapter.status, "IDLE"); assert.equal(transport.connections.length, 1);
});

test("snapshots caller-owned stream and backoff arrays at construction", () => {
  const transport = new FakeTransport(); const scheduler = new FakeScheduler();
  const mutableConfig = { symbols: ["BTCUSDT"] as const, streams: ["btcusdt@bookTicker"], maxReconnectAttempts: 1, backoffMs: [100] };
  const adapter = new UsdMFuturesMarketConnectivity(transport, mutableConfig, { scheduler });
  mutableConfig.streams[0] = "btcusdt@depth";
  mutableConfig.backoffMs[0] = 999;
  adapter.start();
  assert.deepEqual(JSON.parse(transport.connections[0].sent[0]).params, ["btcusdt@bookTicker"]);
  transport.connections[0].close("network"); assert.deepEqual(scheduler.delays, [100]);
});

test("stop invalidates a pending reconnect task", () => {
  const transport = new FakeTransport(); const scheduler = new FakeScheduler();
  const adapter = new UsdMFuturesMarketConnectivity(transport, config, { scheduler });
  adapter.start(); transport.connections[0].close("network"); adapter.stop(); scheduler.runNext();
  assert.equal(adapter.status, "STOPPED"); assert.equal(transport.connections.length, 1);
});

test("successful resubscription resets reconnect attempts before a later close", () => {
  const transport = new FakeTransport(); const scheduler = new FakeScheduler();
  const adapter = new UsdMFuturesMarketConnectivity(transport, config, { scheduler });
  adapter.start(); transport.connections[0].close("network"); scheduler.runNext();
  transport.connections[1].emit({ result: null, id: 2 }); transport.connections[1].close("network"); scheduler.runNext();
  transport.connections[2].emit({ result: null, id: 3 }); transport.connections[2].close("network");
  assert.equal(adapter.status, "BACKOFF"); assert.deepEqual(scheduler.delays, [100, 100, 100]);
});

test("accepts only the supported depth stream grammar", () => {
  const transport = new FakeTransport();
  for (const stream of ["btcusdt@depth", "btcusdt@depth@100ms", "btcusdt@depth@500ms"]) {
    assert.doesNotThrow(() => new UsdMFuturesMarketConnectivity(transport, { symbols: ["BTCUSDT"], streams: [stream] }));
  }
  for (const stream of ["btcusdt@depth@250ms", "btcusdt@depth@", "btcusdt@depth@100ms@x", "btcusdt@depthfoo"]) {
    assert.throws(() => new UsdMFuturesMarketConnectivity(transport, { symbols: ["BTCUSDT"], streams: [stream] }), /stream/i);
  }
});

test("invalid matching subscription ACK fails closed into bounded reconnect", () => {
  const transport = new FakeTransport(); const scheduler = new FakeScheduler();
  const adapter = new UsdMFuturesMarketConnectivity(transport, config, { scheduler });
  adapter.start(); transport.connections[0].emit({ id: 1, result: { unexpected: true } });
  assert.equal(adapter.status, "BACKOFF"); assert.deepEqual(scheduler.delays, [100]);
  scheduler.runNext(); assert.equal(transport.connections.length, 2);
});

test("rejects post-CM status and mismatched pair metadata before forwarding public events", () => {
  const transport = new FakeTransport(); const events: unknown[] = [];
  const adapter = new UsdMFuturesMarketConnectivity(transport, config, { onMarketEvent: (event: Record<string, unknown>) => events.push(event) });
  adapter.start(); transport.connections[0].emit({ result: null, id: 1 });
  const base = { e: "bookTicker", u: 42, E: 1000, T: 999, s: "BTCUSDT", b: "100", B: "1", a: "101", A: "2" };
  transport.connections[0].emit({ ...base, st: 2 }); transport.connections[0].emit({ ...base, ps: "ETHUSDT" });
  transport.connections[0].emit({ ...base, st: 1, ps: "BTCUSDT" });
  assert.equal(events.length, 1);
});

test("forwards depth directly with the exact injected receipt clock", () => {
  const transport = new FakeTransport(); const scheduler = new FakeScheduler(); const orderBook = new RecordingOrderBook();
  const adapter = new UsdMFuturesMarketConnectivity(transport, { symbols: ["BTCUSDT"], streams: ["btcusdt@depth@100ms"] }, {
    scheduler, receivedAt: () => 12_345, orderBook,
  });
  adapter.start(); transport.connections[0].emit({ result: null, id: 1 });
  transport.connections[0].emit({ e: "depthUpdate", E: 1000, T: 999, s: "BTCUSDT", U: 1, u: 2, b: [], a: [] });
  assert.deepEqual(orderBook.received, [12_345]);
});

test("routes depth through an injected lifecycle and ignores stale session callbacks", () => {
  const transport = new FakeTransport(); const book = new UsdMFuturesOrderBook(); const scheduler = new FakeScheduler();
  const lifecycle = new UsdMFuturesDepthLifecycle(book, { fetchSnapshot: async () => ({ symbol: "BTCUSDT", lastUpdateId: 1, bids: [["100", "1"]], asks: [["101", "1"]] }) });
  const adapter = new UsdMFuturesMarketConnectivity(transport, { symbols: ["BTCUSDT"], streams: ["btcusdt@depth"] }, { scheduler, receivedAt: () => 2000, depthLifecycle: lifecycle });
  adapter.start(); const first = transport.connections[0]; first.close("network");
  assert.equal(adapter.status, "BACKOFF"); scheduler.runNext();
  first.emit({ e: "depthUpdate", E: 1000, T: 999, s: "BTCUSDT", U: 1, u: 1, pu: 0, b: [], a: [] });
  assert.equal(adapter.status, "SUBSCRIBING");
});
