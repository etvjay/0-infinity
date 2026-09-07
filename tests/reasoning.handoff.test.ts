import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { conveneEvidenceCouncil, type CouncilInput } from "../src/reasoning/index.js";
import { createCouncilHandoff, compileCouncilHandoff, evaluateCouncilHandoff, type CompilerEconomicsEnvelope } from "../src/reasoning/handoff.js";
import type { CompilerPolicy, AnchorState } from "../src/domain/index.js";
import type { StateEnvelope, LiveMarketState, LiveAccountState, EvaluationPolicy } from "../src/evaluator/index.js";
import { createMandateRuntime } from "../src/runtime/mandateRuntime.js";

const councilInput = (): CouncilInput => ({ advocate: { kind: "ADVOCATE", ref: "a", hash: "a-hash", symbol: "BTCUSDT", direction: "LONG", expectedMoveBps: 50, confidence: .9, observedAt: 900, expiresAt: 10_000 }, oppose: { kind: "OPPOSE", ref: "o", hash: "o-hash", symbol: "BTCUSDT", direction: "LONG", recommendation: "AGREE", observedAt: 901, expiresAt: 10_000 }, evidence: { kind: "MARKET_ACCOUNT", ref: "m", hash: "evidence-hash", symbol: "BTCUSDT", market: "TRUSTED", account: "TRUSTED", observedAt: 902, expiresAt: 10_000 }, policy: { method: "replay-council", now: 1_000, maxAgeMs: 500, minConfidence: .7, minExpectedMoveBps: 10, thesisId: "t-1", thesisHash: "thesis-hash" } });
const compilerPolicy: CompilerPolicy = { accountId: "acct", validityMs: 5_000, minExecutableEdgeBps: 1, maxSpreadBps: 10, maxSlippageBps: 10, maxFeeBps: 10, maxFundingCostBps: 10, maxNotional: 1_000, maxLossBps: 100, execution: "LIMIT", minEntryPrice: 99_000, maxEntryPrice: 101_000, entryTrigger: "BELOW" };
const anchor: AnchorState = { stateVersion: 3n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 };
const economics = Object.freeze({ kind: "ASSESSMENT" as const, side: "BUY" as const, requestedQuantity: "1", executableQuantity: "1", bestExecutableReference: "100000", vwap: "100000", worstExecutionPrice: "100000", limitPrice: "100000", totalCost: "100000", spreadBps: "1", slippageBps: "0", feeBps: "0", fundingCostBps: "0", executableEdgeBps: "10", fills: Object.freeze([Object.freeze({ price: "100000", quantity: "1", notional: "100000" })]) });
const economicsEnvelope = (): CompilerEconomicsEnvelope => Object.freeze({ kind: "ECONOMICS", evidenceHash: "evidence-hash", observedAt: 1_000, receivedAt: 1_001, result: economics });
const handoffInput = () => ({ council: conveneEvidenceCouncil(councilInput()), workflowId: "wf-1", compilerPolicy, anchor, now: 1_500, economics: economicsEnvelope() });
const market: StateEnvelope<LiveMarketState> = { version: 3n, observedAt: 1_500, receivedAt: 1_501, value: { venue: "BINANCE", instrument: "USD_M_FUTURES", symbol: "BTCUSDT", bidPrice: 99_000, askPrice: 99_000, markPrice: 99_000, expectedMoveBps: 50, spreadBps: 0, slippageBps: 0, feeBps: 0, fundingCostBps: 0 } };
const account: StateEnvelope<LiveAccountState> = { version: 1n, observedAt: 1_500, receivedAt: 1_501, value: { accountId: "acct", availableNotional: 2_000, currentNotional: 0, currentLossBps: 0 } };
const evalPolicy: EvaluationPolicy = { maxMarketAgeMs: 1_000, maxAccountAgeMs: 1_000, maxAnchorVersionLag: 0n };

test("default handoff is immutable proposal and never compiles or consumes authority", () => {
  const result = createCouncilHandoff(handoffInput());
  assert.equal(result.kind, "PROPOSAL");
  assert.equal(Object.isFrozen(result), true);
  if (result.kind === "PROPOSAL") { assert.equal(result.thesis.thesisId, "t-1"); assert.equal("mandate" in result, false); assert.equal("authorityStatus" in result, false); }
});

test("explicit compile boundary returns immutable mandate-compiled state", () => {
  const proposal = createCouncilHandoff(handoffInput());
  const result = compileCouncilHandoff(proposal, { workflowId: "wf-1", policy: compilerPolicy, anchor, now: 1_500, approve: true });
  assert.equal(result.kind, "MANDATE_COMPILED");
  if (result.kind === "MANDATE_COMPILED") { assert.equal(result.mandate.workflowId, "wf-1"); assert.equal(result.mandate.accountId, "acct"); assert.equal(Object.isFrozen(result.mandate), true); }
});

test("compile boundary stops at approval-required without caller approval", () => {
  const result = compileCouncilHandoff(createCouncilHandoff(handoffInput()), { workflowId: "wf-1", policy: compilerPolicy, anchor, now: 1_500, approve: false });
  assert.equal(result.kind, "APPROVAL_REQUIRED");
});

test("explicit evaluator boundary yields replay intent or typed refusal without mutation", () => {
  const compiled = compileCouncilHandoff(createCouncilHandoff(handoffInput()), { workflowId: "wf-1", policy: compilerPolicy, anchor, now: 1_500, approve: true });
  assert.equal(compiled.kind, "MANDATE_COMPILED"); if (compiled.kind !== "MANDATE_COMPILED") return;
  const runtime = createMandateRuntime({ expiresAt: compiled.mandate.expiresAt });
  const result = evaluateCouncilHandoff(compiled, { workflowId: "wf-1", authorityStatus: "ACTIVE" }, runtime, market, account, evalPolicy, 1_600);
  assert.equal(result.kind, "EVALUATED_INTENT");
  const refused = evaluateCouncilHandoff(compiled, { workflowId: "wf-1" }, runtime, market, account, evalPolicy, 1_600);
  assert.equal(refused.kind, "REFUSAL");
});

test("binds identity/hash and refuses stale, untrusted, or mismatched economics", () => {
  const input = handoffInput();
  assert.equal(createCouncilHandoff({ ...input, economics: Object.freeze({ ...economicsEnvelope(), evidenceHash: "wrong" }) }).kind, "REFUSAL");
  assert.equal(createCouncilHandoff({ ...input, economics: Object.freeze({ ...economicsEnvelope(), observedAt: 0 }) }).kind, "REFUSAL");
  assert.equal(createCouncilHandoff({ ...input, council: { kind: "REFUSAL", code: "UNTRUSTED_EVIDENCE", message: "no" } }).kind, "REFUSAL");
});

test("rejects prototype pollution, remains deterministic, and does not mutate inputs", () => {
  const input = handoffInput(); const before = JSON.stringify(input, (_k, value) => typeof value === "bigint" ? `${value}n` : value);
  const first = createCouncilHandoff(input); const second = createCouncilHandoff(input);
  assert.deepEqual(first, second); assert.equal(JSON.stringify(input, (_k, value) => typeof value === "bigint" ? `${value}n` : value), before);
  Object.defineProperty(Object.prototype, "poison", { value: true, configurable: true });
  try { assert.equal(createCouncilHandoff(input).kind, "REFUSAL"); } finally { delete (Object.prototype as Record<string, unknown>).poison; }
});

test("forbidden side-effect scan finds no network, order, MCP, credential, or LLM path", () => {
  const source = readFileSync(new URL("../../src/reasoning/handoff.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch|axios|OrderWriter|MCP|credential|openai|llm|https?:/i);
});
