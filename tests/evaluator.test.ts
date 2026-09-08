import test from "node:test";
import assert from "node:assert/strict";
import { compileMandate, type CompilerPolicy, type TradeThesis, type AnchorState } from "../src/domain/index.js";
import { createMandateRuntime } from "../src/runtime/mandateRuntime.js";
import { evaluateMandate, type EvaluationPolicy, type LiveAccountState, type LiveMarketState, type StateEnvelope } from "../src/evaluator/index.js";

const thesis: TradeThesis = { thesisId: "thesis-1", venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", direction: "LONG", horizonMs: 60_000, confidence: .8, expectedMove: { bps: 50, lowerBps: 20, upperBps: 80 }, reasoning: { method: "council", advocateRef: "a", opposeRef: "o", marketAnalysisRef: "m", evidenceBundleHash: "e", councilDecisionHash: "c", reasoningReceiptHash: "r" }, createdAt: 1_000, expiresAt: 61_000 };
const compilerPolicy: CompilerPolicy = { accountId: "acct-1", validityMs: 30_000, minExecutableEdgeBps: 10, maxSpreadBps: 6, maxSlippageBps: 5, maxFeeBps: 5, maxFundingCostBps: 5, maxNotional: 1_000, maxLossBps: 100, execution: "LIMIT", minEntryPrice: 99_975, maxEntryPrice: 101_000, entryTrigger: "BELOW" };
const mandate = compileMandate({ workflowId: "wf-1" }, thesis, compilerPolicy, { stateVersion: 7n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 }, 2_000);
const policy: EvaluationPolicy = { maxMarketAgeMs: 1_000, maxAccountAgeMs: 1_000, maxAnchorVersionLag: 3n };
const market: StateEnvelope<LiveMarketState> = { version: 7n, observedAt: 2_500, receivedAt: 2_501, value: { venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", bidPrice: 99_950, askPrice: 100_000, markPrice: 99_975, expectedMoveBps: 50, spreadBps: (100_000 - 99_950) / ((100_000 + 99_950) / 2) * 10_000, slippageBps: 2, feeBps: 3, fundingCostBps: 0 } };
const account: StateEnvelope<LiveAccountState> = { version: 4n, observedAt: 2_500, receivedAt: 2_501, value: { accountId: "acct-1", availableNotional: 2_000, currentNotional: 0, currentLossBps: 0 } };
const active = { workflowId: "wf-1", authorityStatus: "ACTIVE" as const };
const evaluate = (overrides: Partial<{ workflow: unknown; mandate: unknown; runtime: unknown; market: unknown; account: unknown; policy: unknown; now: unknown }> = {}) => (evaluateMandate as any)(
  overrides.workflow ?? active, overrides.mandate ?? mandate, overrides.runtime ?? createMandateRuntime({ expiresAt: mandate.expiresAt }),
  overrides.market ?? market, overrides.account ?? account, overrides.policy ?? policy, overrides.now ?? 2_600,
);

 test("returns a deterministic intent only when fresh state satisfies the mandate", () => {
  const runtime = createMandateRuntime({ expiresAt: mandate.expiresAt });
  const first = evaluateMandate(active, mandate, runtime, market, account, policy, 2_600);
  const second = evaluateMandate(active, mandate, runtime, market, account, policy, 2_600);
  assert.deepEqual(first, second);
  assert.equal(first.kind, "EXECUTION_INTENT");
  if (first.kind === "EXECUTION_INTENT") { assert.equal(first.mandateId, mandate.mandateId); assert.equal(first.marketStateVersion, 7n); assert.equal(first.accountStateVersion, 4n); assert.equal(first.notional, 1_000); }
});

test("refuses stale market state before producing an intent", () => {
  const result = evaluateMandate(active, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), { ...market, observedAt: 1_000, receivedAt: 1_001 }, account, policy, 2_600);
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
  const terminal = evaluateMandate(active, mandate, { state: "FILLED", expiresAt: mandate.expiresAt, history: [] }, market, account, policy, 2_600);
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
  const costs = evaluateMandate(active, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), { ...market, value: { ...market.value, feeBps: 6 } }, account, policy, 2_600);
  assert.equal(costs.kind, "EXECUTION_REFUSAL");
  if (costs.kind === "EXECUTION_REFUSAL") assert.equal(costs.code, "COST_CEILING");
  const risk = evaluateMandate(active, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), market, { ...account, value: { ...account.value, currentLossBps: 101 } }, policy, 2_600);
  assert.equal(risk.kind, "EXECUTION_REFUSAL");
  if (risk.kind === "EXECUTION_REFUSAL") assert.equal(risk.code, "RISK_LIMIT");
  const version = evaluateMandate(active, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), { ...market, version: 6n }, account, policy, 2_600);
  assert.equal(version.kind, "EXECUTION_REFUSAL");
  if (version.kind === "EXECUTION_REFUSAL") assert.equal(version.code, "STATE_VERSION_STALE");
});

test("refuses collapsed executable edge and excessive exposure", () => {
  const edge = evaluateMandate(active, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), { ...market, value: { ...market.value, expectedMoveBps: 15, spreadBps: market.value.spreadBps, slippageBps: 5, feeBps: 5 } }, account, policy, 2_600);
  assert.equal(edge.kind, "EXECUTION_REFUSAL");
  if (edge.kind === "EXECUTION_REFUSAL") assert.equal(edge.code, "EXECUTABLE_EDGE_TOO_LOW");
  const exposure = evaluateMandate(active, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), market, { ...account, value: { ...account.value, availableNotional: 500 } }, policy, 2_600);
  assert.equal(exposure.kind, "EXECUTION_REFUSAL");
  if (exposure.kind === "EXECUTION_REFUSAL") assert.equal(exposure.code, "EXPOSURE_LIMIT");
});

test("requires explicit ACTIVE authority status", () => {
  const result = evaluateMandate({ workflowId: "wf-1" }, mandate, createMandateRuntime({ expiresAt: mandate.expiresAt }), market, account, policy, 2_600);
  assert.equal(result.kind, "EXECUTION_REFUSAL");
  if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, "AUTHORITY_STATUS");
});

test("hostile inputs return frozen structured refusals instead of throwing", () => {
  const cases: unknown[] = [
    { mandate: { ...mandate, entry: undefined } },
    { mandate: { ...mandate, economics: { ...mandate.economics, maxNotional: -1 } } },
    { market: { ...market, observedAt: Number.NaN } },
    { account: { ...account, value: { ...account.value, availableNotional: -1 } } },
    { market: { ...market, value: { ...market.value, bidPrice: 101_000, askPrice: 100_000 } } },
  ];
  for (const overrides of cases) {
    const result = evaluate(overrides as never);
    assert.equal(result.kind, "EXECUTION_REFUSAL");
    assert.equal(Object.isFrozen(result), true);
  }
});

test("rejects future and cross-envelope chronology", () => {
  for (const overrides of [
    { now: 2_000, market: { ...market, observedAt: 2_001, receivedAt: 2_002 } },
    { market: { ...market, receivedAt: 2_400 } },
    { account: { ...account, observedAt: 2_601, receivedAt: 2_602 } },
  ]) {
    const result = evaluate(overrides);
    assert.equal(result.kind, "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.match(result.code, /STATE_STALE|INVALID_BINDING/);
  }
});

test("checks only non-negative account replay versions", () => {
  for (const version of [-1n]) {
    const result = evaluate({ account: { ...account, version } });
    assert.equal(result.kind, "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, "STATE_VERSION_STALE");
  }
});

test("rejects impossible market values and negative costs", () => {
  const fields = ["bidPrice", "askPrice", "markPrice", "expectedMoveBps", "spreadBps", "slippageBps", "feeBps", "fundingCostBps"] as const;
  for (const field of fields) {
    const result = evaluate({ market: { ...market, value: { ...market.value, [field]: field === "bidPrice" ? -1 : Number.NaN } } });
    assert.equal(result.kind, "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, "STATE_BINDING");
  }
  for (const field of ["availableNotional", "currentNotional", "currentLossBps"] as const) {
    const result = evaluate({ account: { ...account, value: { ...account.value, [field]: -1 } } });
    assert.equal(result.kind, "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, "STATE_BINDING");
  }
});

test("uses canonical inclusive ABOVE and BELOW trigger boundaries", () => {
  const aboveThesis = { ...thesis, direction: "SHORT" as const, side: "SELL" as const };
  const above = compileMandate({ workflowId: "wf-a" }, aboveThesis, { ...compilerPolicy, entryTrigger: "ABOVE" as const }, { stateVersion: 7n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 }, 2_000);
  const aboveMarket = { ...market, value: { ...market.value, symbol: above.symbol, markPrice: above.entry.maxPrice, bidPrice: above.entry.maxPrice, askPrice: above.entry.maxPrice, spreadBps: 0 } };
  assert.equal(evaluateMandate({ workflowId: "wf-a", authorityStatus: "ACTIVE" }, above, createMandateRuntime({ expiresAt: above.expiresAt }), aboveMarket, account, policy, 2_600).kind, "EXECUTION_INTENT");
  const belowMarket = { ...market, value: { ...market.value, markPrice: mandate.entry.minPrice, askPrice: mandate.entry.minPrice, bidPrice: mandate.entry.minPrice, spreadBps: 0 } };
  assert.equal(evaluate({ market: belowMarket }).kind, "EXECUTION_INTENT");
});

test("rejects non-finite and negative evaluation policies", () => {
  for (const field of ["maxMarketAgeMs", "maxAccountAgeMs"] as const) {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const result = evaluate({ policy: { ...policy, [field]: value } });
      assert.equal(result.kind, "EXECUTION_REFUSAL");
    }
  }
  for (const value of [-1n]) {
    const result = evaluate({ policy: { ...policy, maxAnchorVersionLag: value } });
    assert.equal(result.kind, "EXECUTION_REFUSAL");
  }
});

test("rejects malformed optional thesis hashes and future anchors", () => {
  const malformed = { ...mandate, thesisHash: 42, provenance: { ...mandate.provenance, thesisHash: 42 } };
  assert.equal(evaluate({ mandate: malformed }).kind, "EXECUTION_REFUSAL");
  const future = { ...mandate, anchor: { ...mandate.anchor, observedAt: 2_601, receivedAt: 2_602 } };
  assert.equal(evaluate({ mandate: future }).kind, "EXECUTION_REFUSAL");
});

test("validates runtime history instead of trusting frozen forged state", () => {
  const forged = Object.freeze({
    state: "VALIDATING", expiresAt: mandate.expiresAt,
    history: Object.freeze([{ fromState: "TRIGGERED", toState: "VALIDATING", at: 2_000, reason: "ok" }]),
  });
  assert.equal(evaluate({ runtime: forged }).kind, "EXECUTION_REFUSAL");
});

test("reconciles reported spread with midpoint-relative quote spread", () => {
  assert.equal(evaluate({ market: { ...market, value: { ...market.value, spreadBps: 4 } } }).kind, "EXECUTION_REFUSAL");
  assert.equal(evaluate({ market: { ...market, value: { ...market.value, spreadBps: -1 } } }).kind, "EXECUTION_REFUSAL");
});

test("trigger semantics are boundary-sensitive and non-vacuous", () => {
  const belowMiss = evaluate({ market: { ...market, value: { ...market.value, markPrice: mandate.entry.minPrice + 1 } } });
  assert.equal(belowMiss.kind, "EXECUTION_REFUSAL");
  if (belowMiss.kind === "EXECUTION_REFUSAL") assert.equal(belowMiss.code, "ENTRY_TRIGGER_NOT_MET");
  const aboveMandate = compileMandate({ workflowId: "wf-above" }, { ...thesis, direction: "SHORT", side: "SELL" }, { ...compilerPolicy, entryTrigger: "ABOVE" }, { stateVersion: 7n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 }, 2_000);
  const aboveMiss = evaluateMandate({ workflowId: "wf-above", authorityStatus: "ACTIVE" }, aboveMandate, createMandateRuntime({ expiresAt: aboveMandate.expiresAt }), { ...market, value: { ...market.value, bidPrice: aboveMandate.entry.maxPrice - 1, askPrice: aboveMandate.entry.maxPrice - 1, markPrice: aboveMandate.entry.maxPrice - 1, spreadBps: 0, symbol: aboveMandate.symbol } }, account, policy, 2_600);
  assert.equal(aboveMiss.kind, "EXECUTION_REFUSAL");
  if (aboveMiss.kind === "EXECUTION_REFUSAL") assert.equal(aboveMiss.code, "ENTRY_TRIGGER_NOT_MET");
});

test("covers just-below, exact, and just-above mandate trigger thresholds", () => {
  for (const [markPrice, expected] of [[mandate.entry.minPrice - 1, "EXECUTION_INTENT"], [mandate.entry.minPrice, "EXECUTION_INTENT"], [mandate.entry.minPrice + 1, "ENTRY_TRIGGER_NOT_MET"]] as const) {
    const result = evaluate({ market: { ...market, value: { ...market.value, markPrice } } });
    assert.equal(result.kind, expected === "EXECUTION_INTENT" ? "EXECUTION_INTENT" : "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, expected);
  }
  const aboveMandate = compileMandate({ workflowId: "wf-trigger-boundary" }, { ...thesis, direction: "SHORT", side: "SELL" }, { ...compilerPolicy, entryTrigger: "ABOVE" }, { stateVersion: 7n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 }, 2_000);
  for (const [markPrice, expected] of [[aboveMandate.entry.maxPrice - 1, "ENTRY_TRIGGER_NOT_MET"], [aboveMandate.entry.maxPrice, "EXECUTION_INTENT"], [aboveMandate.entry.maxPrice + 1, "EXECUTION_INTENT"]] as const) {
    const bidPrice = markPrice - 1;
    const askPrice = markPrice + 1;
    const boundaryMarket = { ...market, value: { ...market.value, symbol: aboveMandate.symbol, bidPrice, askPrice, markPrice, spreadBps: (askPrice - bidPrice) / ((askPrice + bidPrice) / 2) * 10_000 } };
    const result = evaluateMandate({ workflowId: aboveMandate.workflowId, authorityStatus: "ACTIVE" }, aboveMandate, createMandateRuntime({ expiresAt: aboveMandate.expiresAt }), boundaryMarket, account, policy, 2_600);
    assert.equal(result.kind, expected === "EXECUTION_INTENT" ? "EXECUTION_INTENT" : "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, expected);
  }
});

test("does not compare account replay versions to market versions", () => {
  const result = evaluate({ account: { ...account, version: 10n ** 30n } });
  assert.equal(result.kind, "EXECUTION_INTENT");
});

test("accepts any non-negative explicit same-stream anchor lag policy", () => {
  const result = evaluate({ policy: { ...policy, maxAnchorVersionLag: 10n ** 30n }, market: { ...market, version: 10n ** 30n + 7n } });
  assert.equal(result.kind, "EXECUTION_INTENT");
});

test("reconciles spread using the symmetric midpoint-relative basis", () => {
  const bid = 99_950;
  const ask = 100_000;
  const midpointRelativeSpread = (ask - bid) / ((ask + bid) / 2) * 10_000;
  const result = evaluate({ market: { ...market, value: { ...market.value, bidPrice: bid, askPrice: ask, spreadBps: midpointRelativeSpread } } });
  assert.equal(result.kind, "EXECUTION_INTENT");
});

test("market observedAt independently accepts below, exact, and above age boundary", () => {
  const ageBoundary = 2_600 - policy.maxMarketAgeMs;
  for (const [observedAt, expected] of [[ageBoundary - 1, "MARKET_STATE_STALE"], [ageBoundary, "EXECUTION_INTENT"], [ageBoundary + 1, "EXECUTION_INTENT"]] as const) {
    const result = evaluate({ market: { ...market, observedAt, receivedAt: 2_501 } });
    assert.equal(result.kind, expected === "EXECUTION_INTENT" ? expected : "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, expected);
  }
});

test("market receivedAt independently accepts below, exact, and above age boundary", () => {
  const ageBoundary = 2_600 - policy.maxMarketAgeMs;
  for (const [receivedAt, expected] of [[ageBoundary - 1, "MARKET_STATE_STALE"], [ageBoundary, "EXECUTION_INTENT"], [ageBoundary + 1, "EXECUTION_INTENT"]] as const) {
    const result = evaluate({ market: { ...market, observedAt: receivedAt, receivedAt } });
    assert.equal(result.kind, expected === "EXECUTION_INTENT" ? expected : "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, expected);
  }
});

test("account timestamps must be non-negative even with an unbounded freshness policy", () => {
  const result = evaluate({
    account: { ...account, observedAt: -1, receivedAt: 0 },
    policy: { ...policy, maxAccountAgeMs: Number.MAX_SAFE_INTEGER },
  });
  assert.equal(result.kind, "EXECUTION_REFUSAL");
  if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, "ACCOUNT_STATE_STALE");
});

test("account observedAt independently accepts below, exact, and above age boundary", () => {
  const ageBoundary = 2_600 - policy.maxAccountAgeMs;
  for (const [observedAt, expected] of [[ageBoundary - 1, "ACCOUNT_STATE_STALE"], [ageBoundary, "EXECUTION_INTENT"], [ageBoundary + 1, "EXECUTION_INTENT"]] as const) {
    const result = evaluate({ account: { ...account, observedAt, receivedAt: 2_501 } });
    assert.equal(result.kind, expected === "EXECUTION_INTENT" ? expected : "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, expected);
  }
});

test("account receivedAt independently accepts below, exact, and above age boundary", () => {
  const ageBoundary = 2_600 - policy.maxAccountAgeMs;
  for (const [receivedAt, expected] of [[ageBoundary - 1, "ACCOUNT_STATE_STALE"], [ageBoundary, "EXECUTION_INTENT"], [ageBoundary + 1, "EXECUTION_INTENT"]] as const) {
    const result = evaluate({ account: { ...account, observedAt: receivedAt, receivedAt } });
    assert.equal(result.kind, expected === "EXECUTION_INTENT" ? expected : "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, expected);
  }
});

test("spread independently accepts below, exact, and rejects above maxSpreadBps", () => {
  const bid = 100_000;
  const ask = 100_050;
  const spread = (ask - bid) / ((ask + bid) / 2) * 10_000;
  for (const [maxSpreadBps, expected] of [[spread + 1, "EXECUTION_INTENT"], [spread, "EXECUTION_INTENT"], [spread - 1, "COST_CEILING"]] as const) {
    const boundedMandate = compileMandate({ workflowId: `wf-spread-bound-${maxSpreadBps}` }, thesis, { ...compilerPolicy, minEntryPrice: 100_000, maxSpreadBps }, { stateVersion: 7n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 }, 2_000);
    const boundedMarket = { ...market, value: { ...market.value, bidPrice: bid, askPrice: ask, markPrice: 100_000, spreadBps: spread } };
    const result = evaluateMandate({ workflowId: boundedMandate.workflowId, authorityStatus: "ACTIVE" }, boundedMandate, createMandateRuntime({ expiresAt: boundedMandate.expiresAt }), boundedMarket, account, policy, 2_600);
    assert.equal(result.kind, expected === "EXECUTION_INTENT" ? expected : "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, expected);
  }
});

test("the same midpoint-relative spread ceiling applies symmetrically to BUY and SELL", () => {
  const bid = 100_000;
  const ask = 100_050;
  const spread = (ask - bid) / ((ask + bid) / 2) * 10_000;
  const sellThesis = { ...thesis, thesisId: "thesis-sell", direction: "SHORT" as const, side: "SELL" as const };
  const sellMandate = compileMandate({ workflowId: "wf-sell-spread" }, sellThesis, { ...compilerPolicy, entryTrigger: "ABOVE" as const, maxEntryPrice: 100_050, maxSpreadBps: spread }, { stateVersion: 7n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 }, 2_000);
  const boundedMarket = { ...market, value: { ...market.value, bidPrice: bid, askPrice: ask, markPrice: 100_050, spreadBps: spread } };
  const buyMandate = compileMandate({ workflowId: "wf-buy-spread" }, thesis, { ...compilerPolicy, minEntryPrice: 100_000, maxSpreadBps: spread }, { stateVersion: 7n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 }, 2_000);
  const buyMarket = { ...boundedMarket, value: { ...boundedMarket.value, markPrice: 100_000 } };
  const buyResult = evaluateMandate({ workflowId: buyMandate.workflowId, authorityStatus: "ACTIVE" }, buyMandate, createMandateRuntime({ expiresAt: buyMandate.expiresAt }), buyMarket, account, policy, 2_600);
  const sellResult = evaluateMandate({ workflowId: sellMandate.workflowId, authorityStatus: "ACTIVE" }, sellMandate, createMandateRuntime({ expiresAt: sellMandate.expiresAt }), boundedMarket, account, policy, 2_600);
  assert.equal(buyResult.kind, "EXECUTION_INTENT");
  assert.equal(sellResult.kind, "EXECUTION_INTENT");
});

test("covers just-below, just-above freshness and spread boundaries", () => {
  const freshAt = 2_600 - policy.maxMarketAgeMs;
  for (const [observedAt, expected] of [[freshAt - 1, "MARKET_STATE_STALE"], [freshAt, "EXECUTION_INTENT"], [freshAt + 1, "EXECUTION_INTENT"]] as const) {
    const result = evaluate({ market: { ...market, observedAt, receivedAt: observedAt }, account: { ...account, observedAt, receivedAt: observedAt } });
    assert.equal(result.kind, expected === "EXECUTION_INTENT" ? "EXECUTION_INTENT" : "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, expected);
  }
  const midpointRelativeSpread = market.value.spreadBps;
  for (const [maxSpreadBps, expected] of [[midpointRelativeSpread - 1e-9, "COST_CEILING"], [midpointRelativeSpread, "EXECUTION_INTENT"], [midpointRelativeSpread + 1e-9, "EXECUTION_INTENT"]] as const) {
    const boundaryMandate = compileMandate({ workflowId: `wf-spread-${maxSpreadBps}` }, thesis, { ...compilerPolicy, maxSpreadBps }, { stateVersion: 7n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 }, 2_000);
    const result = evaluateMandate({ workflowId: boundaryMandate.workflowId, authorityStatus: "ACTIVE" }, boundaryMandate, createMandateRuntime({ expiresAt: boundaryMandate.expiresAt }), market, account, policy, 2_600);
    assert.equal(result.kind, expected === "EXECUTION_INTENT" ? "EXECUTION_INTENT" : "EXECUTION_REFUSAL");
    if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, expected);
  }
});
