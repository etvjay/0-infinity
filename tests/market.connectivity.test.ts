import test from "node:test";
import assert from "node:assert/strict";
import {
  UsdMFuturesMarketConnectivity,
  type UsdMFuturesMarketTransport,
  type UsdMFuturesTransportConnection,
} from "../src/market/connectivity.js";
import { UsdMFuturesMarketState } from "../src/market/index.js";

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
  const adapter = new UsdMFuturesMarketConnectivity(transport, config, { onMarketEvent: event => events.push(event) });
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
  assert.deepEqual(scheduler.delays, [100, 250]); scheduler.runNext(); assert.equal(transport.connections.length, 3);
  transport.connections[2].close("network"); assert.equal(adapter.status, "FAILED"); assert.deepEqual(scheduler.delays, [100, 250]);
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
