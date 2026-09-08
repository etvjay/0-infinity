import test from "node:test";
import assert from "node:assert/strict";
import {
  BINANCE_AGENTIC_MCP_AUTH_ERROR,
  BINANCE_AGENTIC_MCP_ENDPOINT,
  BinanceAgenticMcpAdapter,
  blockedBinanceAgenticEvidence,
  type BinanceAgenticMcpClient,
} from "../src/binance/agenticMcp.js";

const accountUpdate = () => ({
  e: "ACCOUNT_UPDATE", E: 1_700_000_001_000, T: 1_700_000_000_999,
  productFamily: "USD_M_FUTURES_UM",
  a: { B: [{ a: "USDT", wb: "1000.00", cw: "900.00", bc: "0.00" }], P: [] }, u: "7",
});
const evidence = { ref: "binance-agentic-read", hash: "sha256:receipt", workflowId: "wf-read", venue: "BINANCE", product: "USD_M_FUTURES", symbol: "BTCUSDT" };

function client(result: unknown, seen: unknown[] = []): BinanceAgenticMcpClient {
  return { async read(request) { seen.push(request); return result; } };
}

test("publishes exact endpoint, bounded read scopes, and explicit external auth block", () => {
  const adapter = new BinanceAgenticMcpAdapter(client({ evidence: [evidence] }));
  assert.equal(adapter.endpoint, BINANCE_AGENTIC_MCP_ENDPOINT);
  assert.deepEqual(adapter.capabilities.desiredScopes, ["MARKET_DATA", "ACCOUNT_READ"]);
  assert.deepEqual(adapter.capabilities.availableScopes, ["MARKET_DATA", "ACCOUNT_READ"]);
  assert.equal(adapter.capabilities.trade, false);
  assert.equal(adapter.capabilities.transfer, false);
  assert.equal(adapter.capabilities.readiness, "AUTH_BLOCKED_EXTERNAL");
  assert.equal(adapter.capabilities.nextAction, "supported client with static client registration/browser consent");
});

test("read delegates only through injected client and normalizes account before handoff", async () => {
  const seen: unknown[] = [];
  const result = await new BinanceAgenticMcpAdapter(client({ evidence: [evidence], accountUpdate: accountUpdate() }, seen)).read();
  assert.deepEqual(seen, [{ endpoint: BINANCE_AGENTIC_MCP_ENDPOINT, scopes: ["MARKET_DATA", "ACCOUNT_READ"] }]);
  assert.equal(result.account?.version, 7n);
  assert.equal(result.readiness, "AUTH_BLOCKED_EXTERNAL");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.account), true);
  assert.equal(Object.isFrozen(result.evidence), true);
});

test("MCP output cannot create thesis, mandate, intent, order, or authority fields", async () => {
  const adapter = new BinanceAgenticMcpAdapter(client({ evidence: [{ ...evidence, mandate: "forged" }], order: {}, intent: {}, thesis: {} }));
  await assert.rejects(adapter.read(), /unsupported|MCP read result|evidence/);
  assert.deepEqual(Object.keys(adapter).sort(), ["capabilities", "client", "endpoint"].sort());
  assert.equal("write" in adapter, false);
  assert.equal("trade" in adapter, false);
  assert.equal("transfer" in adapter, false);
});

test("hostile shapes and secret fields are rejected without credential handling", async () => {
  const inherited = Object.create({ evidence: [evidence] });
  await assert.rejects(new BinanceAgenticMcpAdapter(client(inherited)).read(), /plain object/);
  await assert.rejects(new BinanceAgenticMcpAdapter(client({ evidence: [evidence], token: "secret", cookie: "secret" })).read(), /unsupported/);
  await assert.rejects(new BinanceAgenticMcpAdapter(client({ evidence: [evidence], market: { symbol: "BTCUSDT", bidPrice: "1", askPrice: "2", observedAt: 4, receivedAt: 3 } })).read(), /chronology/);
});

test("blocked evidence preserves historical raw probe and supported-client error exactly", () => {
  const evidence = blockedBinanceAgenticEvidence();
  assert.equal(evidence.endpoint, BINANCE_AGENTIC_MCP_ENDPOINT);
  assert.equal(evidence.rawProbe, "UNAUTHENTICATED_PROBE");
  assert.equal(evidence.supportedClient, "AUTH_BLOCKED_EXTERNAL");
  assert.equal(evidence.error, BINANCE_AGENTIC_MCP_AUTH_ERROR);
  assert.equal(evidence.nextAction, "supported client with static client registration/browser consent");
  assert.equal(Object.isFrozen(evidence), true);
});
