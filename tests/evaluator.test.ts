import test from "node:test";
import assert from "node:assert/strict";
import { compileMandate, type CompilerPolicy, type TradeThesis, type AnchorState } from "../src/domain/index.js";
import { createMandateRuntime } from "../src/runtime/mandateRuntime.js";
import { evaluateMandate, type EvaluationPolicy, type LiveAccountState, type LiveMarketState, type StateEnvelope } from "../src/evaluator/index.js";

const thesis: TradeThesis = { thesisId: "thesis-1", venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", direction: "LONG", horizonMs: 60_000, confidence: .8, expectedMove: { bps: 50, lowerBps: 20, upperBps: 80 }, reasoning: { method: "council", advocateRef: "a", opposeRef: "o", marketAnalysisRef: "m", evidenceBundleHash: "e", councilDecisionHash: "c" }, createdAt: 1_000, expiresAt: 61_000 };
const compilerPolicy: CompilerPolicy = { accountId: "acct-1", validityMs: 30_000, minExecutableEdgeBps: 10, maxSpreadBps: 5, maxSlippageBps: 5, maxFeeBps: 5, maxFundingCostBps: 5, maxNotional: 1_000, maxLossBps: 100, execution: "LIMIT", minEntryPrice: 99_000, maxEntryPrice: 101_000, entryTrigger: "BELOW" };
const mandate = compileMandate({ workflowId: "wf-1" }, thesis, compilerPolicy, { stateVersion: 7n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 }, 2_000);
const policy: EvaluationPolicy = { maxMarketAgeMs: 1_000, maxAccountAgeMs: 1_000, maxAnchorVersionLag: 0n };
const market: StateEnvelope<LiveMarketState> = { version: 7n, observedAt: 2_500, receivedAt: 2_501, value: { venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", bidPrice: 99_900, askPrice: 100_000, markPrice: 99_950, expectedMoveBps: 50, spreadBps: 5, slippageBps: 2, feeBps: 3, fundingCostBps: 0 } };
const account: StateEnvelope<LiveAccountState> = { version: 4n, observedAt: 2_500, receivedAt: 2_501, value: { accountId: "acct-1", availableNotional: 2_000, currentNotional: 0, currentLossBps: 0 } };

 test("returns a deterministic intent only when fresh state satisfies the mandate", () => {
  const runtime = createMandateRuntime({ expiresAt: mandate.expiresAt });
  const first = evaluateMandate({ workflowId: "wf-1" }, mandate, runtime, market, account, policy, 2_600);
  const second = evaluateMandate({ workflowId: "wf-1" }, mandate, runtime, market, account, policy, 2_600);
  assert.deepEqual(first, second);
  assert.equal(first.kind, "EXECUTION_INTENT");
  if (first.kind === "EXECUTION_INTENT") { assert.equal(first.mandateId, mandate.mandateId); assert.equal(first.marketStateVersion, 7n); assert.equal(first.accountStateVersion, 4n); assert.equal(first.notional, 1_000); }
});

test("refuses stale market state before producing an intent", () => {
  const result = evaluateMandate({ workflowId: "wf-1" }, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), { ...market, observedAt: 1_000, receivedAt: 1_001 }, account, policy, 2_600);
  assert.equal(result.kind, "EXECUTION_REFUSAL");
  if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, "MARKET_STATE_STALE");
});

test("refuses a mutable or structurally forged mandate", () => {
  const forged = { ...mandate, entry: { ...mandate.entry } };
  const result = evaluateMandate({ workflowId: "wf-1" }, forged, createMandateRuntime({ expiresAt: mandate.expiresAt }), market, account, policy, 2_600);
  assert.equal(result.kind, "EXECUTION_REFUSAL");
  if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, "INVALID_BINDING");
});
test("refuses terminal runtime, non-active authority, and forged bindings", () => {
  const terminal = evaluateMandate({ workflowId: "wf-1" }, mandate, { state: "FILLED", expiresAt: mandate.expiresAt, history: [] }, market, account, policy, 2_600);
  assert.equal(terminal.kind, "EXECUTION_REFUSAL");
  if (terminal.kind === "EXECUTION_REFUSAL") assert.equal(terminal.code, "RUNTIME_NOT_EXECUTABLE");
  const revoked = evaluateMandate({ workflowId: "wf-1", authorityStatus: "REVOKED" }, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), market, account, policy, 2_600);
  assert.equal(revoked.kind, "EXECUTION_REFUSAL");
  if (revoked.kind === "EXECUTION_REFUSAL") assert.equal(revoked.code, "AUTHORITY_STATUS");
  const drift = evaluateMandate({ workflowId: "other" }, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), market, account, policy, 2_600);
  assert.equal(drift.kind, "EXECUTION_REFUSAL");
  if (drift.kind === "EXECUTION_REFUSAL") assert.equal(drift.code, "INVALID_BINDING");
});

test("refuses cost, risk, and version violations fail closed", () => {
  const costs = evaluateMandate({ workflowId: "wf-1" }, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), { ...market, value: { ...market.value, feeBps: 6 } }, account, policy, 2_600);
  assert.equal(costs.kind, "EXECUTION_REFUSAL");
  if (costs.kind === "EXECUTION_REFUSAL") assert.equal(costs.code, "COST_CEILING");
  const risk = evaluateMandate({ workflowId: "wf-1" }, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), market, { ...account, value: { ...account.value, currentLossBps: 101 } }, policy, 2_600);
  assert.equal(risk.kind, "EXECUTION_REFUSAL");
  if (risk.kind === "EXECUTION_REFUSAL") assert.equal(risk.code, "RISK_LIMIT");
  const version = evaluateMandate({ workflowId: "wf-1" }, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), { ...market, version: 6n }, account, policy, 2_600);
  assert.equal(version.kind, "EXECUTION_REFUSAL");
  if (version.kind === "EXECUTION_REFUSAL") assert.equal(version.code, "STATE_VERSION_STALE");
});

test("refuses collapsed executable edge and excessive exposure", () => {
  const edge = evaluateMandate({ workflowId: "wf-1" }, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), { ...market, value: { ...market.value, expectedMoveBps: 15, spreadBps: 5, slippageBps: 5, feeBps: 5 } }, account, policy, 2_600);
  assert.equal(edge.kind, "EXECUTION_REFUSAL");
  if (edge.kind === "EXECUTION_REFUSAL") assert.equal(edge.code, "EXECUTABLE_EDGE_TOO_LOW");
  const exposure = evaluateMandate({ workflowId: "wf-1" }, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), market, { ...account, value: { ...account.value, availableNotional: 500 } }, policy, 2_600);
  assert.equal(exposure.kind, "EXECUTION_REFUSAL");
  if (exposure.kind === "EXECUTION_REFUSAL") assert.equal(exposure.code, "EXPOSURE_LIMIT");
});
