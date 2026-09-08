import test from "node:test";
import assert from "node:assert/strict";
import {
  BINANCE_TESTNET_BASE_URL, RuntimeMode, BinanceTestnetAdapter, buildSignedRequest,
  blockedExternalEvidence, normalizeExchangeInfo, type SignedRequestTransport,
} from "../src/testnet/index.js";
import type { BoundedIntent } from "../src/execution/index.js";

const intent = Object.freeze({ kind: "EXECUTION_INTENT", mandateId: "m-bin", workflowId: "w-bin", symbol: "BTCUSDT", side: "BUY", method: "LIMIT", price: 100, quantity: 1, notional: 100, executableEdgeBps: 10, marketStateVersion: 1n, accountStateVersion: 1n });
const transport = (calls: unknown[] = []): SignedRequestTransport => ({
  request: async (request) => { calls.push(request); if (request.path === "/fapi/v2/account") return { status: 200, body: { canTrade: true } }; return { status: 200, body: { orderId: 42, status: "NEW" } }; },
});

test("testnet endpoint is isolated and production endpoints/credential references are rejected", () => {
  assert.equal(BINANCE_TESTNET_BASE_URL, "https://testnet.binancefuture.com");
  assert.throws(() => new BinanceTestnetAdapter({ mode: RuntimeMode.BINANCE_TESTNET, endpoint: "https://fapi.binance.com", apiKey: "k", apiSecret: "s", transport: transport() }), /testnet endpoint/);
  assert.throws(() => new BinanceTestnetAdapter({ mode: RuntimeMode.BINANCE_TESTNET, credentialRef: "BINANCE_PRODUCTION_API_SECRET", apiKey: "k", apiSecret: "s", transport: transport() }), /production credential/);
});

test("validated testnet intent is narrowed to the BTCUSDT/ETHUSDT allowlist", async () => {
  const adapter = new BinanceTestnetAdapter({ mode: RuntimeMode.BINANCE_TESTNET, apiKey: "k", apiSecret: "s", transport: transport() });
  assert.equal(adapter.mode, RuntimeMode.BINANCE_TESTNET);
  await assert.rejects(() => adapter.submit(Object.freeze({ ...intent, symbol: "XRPUSDT" }) as never, "client"), /symbol/);
  await assert.rejects(() => adapter.submit(Object.freeze({ ...intent, notional: 1 }) as never, "client"), /authority/);
  await assert.rejects(() => adapter.submit(Object.freeze({ ...intent, quantity: 2 }) as never, "client"), /authority/);
  await assert.rejects(() => adapter.submit(Object.freeze({ ...intent, price: 0 }) as never, "client"), /intent/);
});

test("missing credentials account-read gate is BLOCKED_EXTERNAL and makes no request", async () => {
  const calls: unknown[] = [];
  const adapter = new BinanceTestnetAdapter({ mode: RuntimeMode.BINANCE_TESTNET, transport: transport(calls) });
  const evidence = await adapter.accountRead();
  assert.equal(evidence.status, "BLOCKED_EXTERNAL");
  assert.match(evidence.blocker!, /BINANCE_API_KEY and BINANCE_API_SECRET/);
  assert.equal(calls.length, 0);
  await assert.rejects(() => adapter.submit(intent as BoundedIntent, "client-id"), /BLOCKED_EXTERNAL/);
});

test("signed request construction is injectable, redacted, and preserves clientOrderId lineage", async () => {
  const calls: any[] = [];
  const adapter = new BinanceTestnetAdapter({ mode: RuntimeMode.BINANCE_TESTNET, apiKey: "key-secret", apiSecret: "secret-value", transport: transport(calls) });
  const receipt = await adapter.submit(intent as BoundedIntent, "client-id-1");
  assert.equal(receipt.kind, "ACKNOWLEDGED"); assert.equal(receipt.clientOrderId, "client-id-1");
  assert.equal(calls.length, 2); assert.equal(calls[0].path, "/fapi/v2/account"); assert.equal(calls[1].path, "/fapi/v1/order");
  assert.equal(calls[1].params.newClientOrderId, "client-id-1");
  assert.equal(JSON.stringify(receipt).includes("secret-value"), false);
  const signed = buildSignedRequest("GET", "/fapi/v2/account", { timestamp: 1 }, "key-secret", "secret-value", () => "sig");
  assert.equal(signed.headers["X-MBX-APIKEY"], "key-secret"); assert.equal(signed.params.signature, "sig"); assert.equal(JSON.stringify(signed).includes("secret-value"), false);
});

test("mode cannot become LIVE_CONFIRMED and normalization cannot expand authority", () => {
  assert.throws(() => new BinanceTestnetAdapter({ mode: RuntimeMode.LIVE_CONFIRMED, transport: transport() }), /BINANCE_TESTNET/);
  const metadata = normalizeExchangeInfo({ symbols: [{ symbol: "BTCUSDT", status: "TRADING", filters: [{ filterType: "PRICE_FILTER", minPrice: "1" }, { filterType: "LOT_SIZE", stepSize: "0.001" }] }, { symbol: "XRPUSDT", status: "TRADING", filters: [] }] });
  assert.deepEqual(metadata.symbols.map((s) => s.symbol), ["BTCUSDT"]);
  assert.equal(metadata.symbols[0].filters.length, 2);
});

test("blocked evidence receipt is explicit and credential-free", () => {
  const evidence = blockedExternalEvidence();
  assert.equal(evidence.capability, "BINANCE_TESTNET"); assert.equal(evidence.status, "BLOCKED_EXTERNAL");
  assert.match(evidence.blocker!, /credentials/); assert.equal(JSON.stringify(evidence).includes("secret-value"), false);
});
