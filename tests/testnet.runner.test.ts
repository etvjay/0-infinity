import test from "node:test";
import assert from "node:assert/strict";
import { compileMandate, type TradeThesis } from "../src/domain/index.js";
import { MandateStore, MemoryPersistence } from "../src/store/index.js";
import { BinanceTestnetAdapter, RuntimeMode, runBinanceTestnet } from "../src/testnet/index.js";
import type { WorkflowAccountState, WorkflowMarketState } from "../src/runtime/index.js";

const thesis: TradeThesis = { thesisId: "t-runner", venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", direction: "LONG", horizonMs: 60_000, confidence: .9, expectedMove: { bps: 50, lowerBps: 20, upperBps: 80 }, reasoning: { method: "council", advocateRef: "a", opposeRef: "o", marketAnalysisRef: "m", evidenceBundleHash: "e", councilDecisionHash: "c", reasoningReceiptHash: "r" }, createdAt: 1_000, expiresAt: 61_000 };
const policy = { accountId: "acct", validityMs: 30_000, minExecutableEdgeBps: 10, maxSpreadBps: 6, maxSlippageBps: 5, maxFeeBps: 5, maxFundingCostBps: 5, maxNotional: 1_000, maxLossBps: 100, execution: "LIMIT" as const, minEntryPrice: 99_975, maxEntryPrice: 101_000, entryTrigger: "BELOW" as const };
const mandate = compileMandate({ workflowId: "wf-runner" }, thesis, policy, { stateVersion: 1n, observedAt: 1_000, receivedAt: 1_001, markPrice: 99_975 }, 2_000);
const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as object as Record<string, unknown>)) freeze(child); } return value; };
const market: WorkflowMarketState = freeze({ version: 1n, observedAt: 2_500, receivedAt: 2_501, value: { venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", bidPrice: 99_950, askPrice: 100_000, markPrice: 99_975, expectedMoveBps: 50, spreadBps: (50 / 99975) * 10000, slippageBps: 2, feeBps: 3, fundingCostBps: 0 } });
const account: WorkflowAccountState = freeze({ version: 1n, observedAt: 2_500, receivedAt: 2_501, value: { accountId: "acct", availableNotional: 2_000, currentNotional: 0, currentLossBps: 0 } });
const evaluationPolicy = freeze({ maxMarketAgeMs: 1_000, maxAccountAgeMs: 1_000, maxAnchorVersionLag: 3n });
const state = { market: async () => market, account: async () => account, exchangeInfo: async () => ({ symbols: [{ symbol: "BTCUSDT", status: "TRADING", filters: [] }] }) };

function input(adapter: BinanceTestnetAdapter, overrides: Record<string, unknown> = {}) { return { workflowId: "wf-runner", mandate, evaluationPolicy, authorityStatus: "ACTIVE" as const, adapter, state, mandates: new MandateStore(new MemoryPersistence(), () => 2_600), clock: () => 2_600, ...overrides }; }

test("runner stops at credential gate before market/account discovery", async () => {
  let stateCalls = 0;
  const result = await runBinanceTestnet(input(new BinanceTestnetAdapter({ mode: RuntimeMode.BINANCE_TESTNET }), { state: { market: async () => { stateCalls++; return market; }, account: async () => { stateCalls++; return account; }, exchangeInfo: async () => { stateCalls++; return {}; } } }));
  assert.equal(result.status, "BLOCKED_EXTERNAL"); assert.equal(result.noWrite, true); assert.equal(stateCalls, 0); assert.match(result.blocker, /credentials/i);
});

test("runner composes account read, metadata, supervisor, and order writer", async () => {
  const calls: string[] = [];
  const adapter = new BinanceTestnetAdapter({ mode: RuntimeMode.BINANCE_TESTNET, apiKey: "test-key", apiSecret: "test-secret", transport: { request: async (request) => { calls.push(`${request.method} ${request.path}`); return { status: 200, body: { status: "NEW" } }; } } });
  const mandates = new MandateStore(new MemoryPersistence(), () => 2_600);
  await mandates.issue(mandate);
  const result = await runBinanceTestnet({ ...input(adapter), mandates });
  assert.equal(result.status, "COMPLETE"); assert.equal(result.noWrite, false); assert.equal(result.receipt.status, "ACKNOWLEDGED");
  assert.deepEqual(calls, ["GET /fapi/v2/account", "GET /fapi/v2/account", "POST /fapi/v1/order"]);
  const cancelled = await result.cancel();
  assert.equal(cancelled.status, "CANCELLED"); assert.equal(cancelled.runtime.state, "CANCELLED");
  assert.deepEqual(calls, ["GET /fapi/v2/account", "GET /fapi/v2/account", "POST /fapi/v1/order", "GET /fapi/v2/account", "DELETE /fapi/v1/order"]);
});
