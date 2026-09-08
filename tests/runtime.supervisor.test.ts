import test from "node:test";
import assert from "node:assert/strict";
import { compileMandate, type TradeThesis, type CompilerPolicy } from "../src/domain/index.js";
import { MandateStore, MemoryPersistence } from "../src/store/index.js";
import { MemoryOrderPersistence, OrderWriter, type ExchangeAdapter } from "../src/execution/index.js";
import { RuntimeSupervisor, MemoryWorkflowPersistence, type WorkflowMarketState, type WorkflowAccountState } from "../src/runtime/index.js";

const thesis: TradeThesis = { thesisId: "t", venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", direction: "LONG", horizonMs: 60_000, confidence: .9, expectedMove: { bps: 50, lowerBps: 20, upperBps: 80 }, reasoning: { method: "council", advocateRef: "a", opposeRef: "o", marketAnalysisRef: "m", evidenceBundleHash: "e", councilDecisionHash: "c" }, createdAt: 1_000, expiresAt: 61_000 };
const policy: CompilerPolicy = { accountId: "acct", validityMs: 30_000, minExecutableEdgeBps: 10, maxSpreadBps: 6, maxSlippageBps: 5, maxFeeBps: 5, maxFundingCostBps: 5, maxNotional: 1_000, maxLossBps: 100, execution: "LIMIT", minEntryPrice: 99_975, maxEntryPrice: 101_000, entryTrigger: "BELOW" };
const mandate = compileMandate({ workflowId: "wf" }, thesis, policy, { stateVersion: 1n, observedAt: 1_000, receivedAt: 1_001, markPrice: 99_975 }, 2_000);
const market: WorkflowMarketState = { version: 1n, observedAt: 2_500, receivedAt: 2_501, value: { venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", bidPrice: 99_950, askPrice: 100_000, markPrice: 99_975, expectedMoveBps: 50, spreadBps: (50 / 99975) * 10000, slippageBps: 2, feeBps: 3, fundingCostBps: 0 } };
const account: WorkflowAccountState = { version: 1n, observedAt: 2_500, receivedAt: 2_501, value: { accountId: "acct", availableNotional: 2_000, currentNotional: 0, currentLossBps: 0 } };
const evalPolicy = { maxMarketAgeMs: 1_000, maxAccountAgeMs: 1_000, maxAnchorVersionLag: 3n };
function setup(adapter: ExchangeAdapter = { submit: async () => ({ kind: "ACKNOWLEDGED" }) }) {
  const mandates = new MandateStore(new MemoryPersistence(), () => 2_600);
  const persistence = new MemoryOrderPersistence();
  const writer = new OrderWriter(mandates, persistence, adapter);
  return { mandates, persistence, writer, supervisor: new RuntimeSupervisor({ mode: "LOCAL_REPLAY", writer, persistence: new MemoryWorkflowPersistence(), clock: () => 2_600 }) };
}

test("valid local replay trigger reaches an immutable receipt once", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  const first = await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  const second = await x.supervisor.trigger("wf");
  assert.equal(first.workflowId, "wf"); assert.equal(second.orderOutcome, "ACKNOWLEDGED"); assert.equal(second.runtime.state, "ACKNOWLEDGED");
  assert.equal(Object.isFrozen(second), true); assert.equal((await x.supervisor.trigger("wf")).version, second.version);
});

test("unknown recovery reconciles and never retries", async () => {
  let calls = 0; const x = setup({ submit: async () => { calls++; return { kind: "TIMEOUT" }; } }); await x.mandates.issue(mandate);
  await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  const unknown = await x.supervisor.trigger("wf"); assert.equal(unknown.orderOutcome, "UNKNOWN"); assert.equal(calls, 1);
  const recovered = await x.supervisor.reconcile("wf", Object.freeze({ eventId: "ack", status: "ACKNOWLEDGED" }));
  assert.equal(recovered.orderOutcome, "ACKNOWLEDGED"); assert.equal(calls, 1);
});

test("credentials cannot elevate explicit mode and stale state refuses", async () => {
  process.env.BINANCE_API_KEY = "must-not-be-read";
  const x = setup(); await x.mandates.issue(mandate);
  const receipt = await x.supervisor.start({ workflowId: "wf", mandate, market: { ...market, observedAt: 1_000, receivedAt: 1_001 }, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  assert.equal(receipt.status, "REFUSED"); assert.equal(receipt.orderOutcome, undefined);
});
