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

test("malformed first start is rejected without poisoning a later valid start", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  await assert.rejects(() => x.supervisor.start({ workflowId: "wf", mandate: { ...mandate, mandateId: "forged" }, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" }));
  const receipt = await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  assert.equal(receipt.workflowId, "wf");
});

test("reconciled cancellation and rejection keep receipt status coherent with runtime", async () => {
  const cancelled = setup({ submit: async () => ({ kind: "ACKNOWLEDGED" }) }); await cancelled.mandates.issue(mandate);
  await cancelled.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  const ack = await cancelled.supervisor.trigger("wf");
  const c = await cancelled.supervisor.reconcile("wf", Object.freeze({ eventId: "cancel", status: "CANCELLED" }));
  assert.equal(c.status, "CANCELLED"); assert.equal(c.runtime.state, "CANCELLED"); assert.equal(ack.orderOutcome, "ACKNOWLEDGED");
  const rejected = setup({ submit: async () => ({ kind: "REJECTED" }) }); await rejected.mandates.issue(mandate);
  const r = await rejected.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  assert.equal(r.status, "FAILED"); assert.equal(r.runtime.state, "FAILED"); assert.equal(r.orderOutcome, "REJECTED");
});

test("unknown recovery records order outcome without advancing M-B1 runtime", async () => {
  const x = setup({ submit: async () => ({ kind: "TIMEOUT" }) }); await x.mandates.issue(mandate);
  await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  await x.supervisor.trigger("wf");
  const recovered = await x.supervisor.reconcile("wf", Object.freeze({ eventId: "ack", status: "ACKNOWLEDGED" }));
  assert.equal(recovered.status, "UNKNOWN"); assert.equal(recovered.runtime.state, "UNKNOWN"); assert.equal(recovered.orderOutcome, "ACKNOWLEDGED"); assert.equal(recovered.recoveryStatus, "RECONCILED");
});

test("concurrent workflow operations serialize without lost versions", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  const input = { workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" as const };
  const [a, b] = await Promise.all([x.supervisor.start(input), x.supervisor.start(input)]);
  assert.equal(a.version, b.version); assert.equal((await x.supervisor.restore("wf")).version, b.version);
});

test("restore rejects a forged frozen record with incoherent runtime", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  const persistence = (x.supervisor as any).persistence as MemoryWorkflowPersistence;
  const original = persistence.load("wf")!;
  await persistence.save(Object.freeze({ ...original, runtime: Object.freeze({ ...original.runtime, state: "FILLED" }) }));
  await assert.rejects(() => x.supervisor.restore("wf"), /RECOVERY_BLOCKED/);
});
