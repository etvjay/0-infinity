import test from "node:test";
import assert from "node:assert/strict";
import { compileMandate, type AnchorState, type CompilerPolicy, type TradeThesis } from "../src/domain/index.js";

const thesis: TradeThesis = {
  thesisId: "thesis-1", thesisHash: "thesis-hash", venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", direction: "LONG", horizonMs: 60_000, confidence: 0.8,
  expectedMove: { bps: 50, lowerBps: 20, upperBps: 80 },
  reasoning: { method: "council", advocateRef: "a", opposeRef: "o", marketAnalysisRef: "m", evidenceBundleHash: "e", councilDecisionHash: "c", reasoningReceiptHash: "r" }, createdAt: 1_000, expiresAt: 61_000,
};
const policy: CompilerPolicy = { accountId: "acct-1", validityMs: 30_000, minExecutableEdgeBps: 10, maxSpreadBps: 5, maxSlippageBps: 5, maxFeeBps: 5, maxFundingCostBps: 5, maxNotional: 1_000, maxLossBps: 100, execution: "LIMIT", minEntryPrice: 99_000, maxEntryPrice: 101_000, entryTrigger: "BELOW" };
const anchor: AnchorState = { stateVersion: 7n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 };
const input = () => ({ workflowId: "wf-1" });

test("compiles a bounded immutable mandate deterministically", () => {
  const a = compileMandate(input(), thesis, policy, anchor, 2_000);
  const b = compileMandate(input(), thesis, policy, anchor, 2_000);
  assert.deepEqual(a, b); assert.equal(a.maxUses, 1); assert.equal(a.side, "BUY"); assert.equal(a.accountId, "acct-1");
  assert.equal(Object.isFrozen(a), true); assert.equal(Object.isFrozen(a.entry), true); assert.equal(Object.isFrozen(a.anchor), true);
  assert.deepEqual(a.provenance, { thesisId: "thesis-1", thesisHash: "thesis-hash", method: "council", advocateRef: "a", opposeRef: "o", marketAnalysisRef: "m", evidenceBundleHash: "e", councilDecisionHash: "c", reasoningReceiptHash: "r" });
  assert.equal(a.expiresAt, 32_000); assert.equal((a.validity as Record<string, unknown>).expiresAt, undefined);
  assert.equal(a.entry.minPrice, 99_000); assert.equal(a.entry.maxPrice, 101_000); assert.equal(a.entry.trigger, "BELOW");
});

test("rejects unsupported reasoning keys before authority projection", () => {
  const widenedReasoning = { ...thesis.reasoning, hiddenPolicy: "UNAUTHORIZED" };
  assert.throws(() => compileMandate(input(), { ...thesis, reasoning: widenedReasoning } as TradeThesis, policy, anchor, 2_000), /reasoning.*authority|unsupported.*reasoning/i);
});

test("rejects inherited enumerable reasoning keys before authority projection", () => {
  const inherited = { hiddenPolicy: "UNAUTHORIZED" };
  const widenedReasoning = Object.assign(Object.create(inherited), thesis.reasoning);
  assert.throws(() => compileMandate(input(), { ...thesis, reasoning: widenedReasoning } as TradeThesis, policy, anchor, 2_000), /reasoning.*authority|unsupported.*reasoning/i);
});

test("rejects canonical reasoning fields supplied only through the prototype", () => {
  const inheritedReasoning = Object.create({ method: thesis.reasoning.method });
  Object.assign(inheritedReasoning, { advocateRef: thesis.reasoning.advocateRef, opposeRef: thesis.reasoning.opposeRef, marketAnalysisRef: thesis.reasoning.marketAnalysisRef, evidenceBundleHash: thesis.reasoning.evidenceBundleHash, councilDecisionHash: thesis.reasoning.councilDecisionHash });
  assert.throws(() => compileMandate(input(), { ...thesis, reasoning: inheritedReasoning } as TradeThesis, policy, anchor, 2_000), /reasoning.*method|reasoning.*required|own.*enumerable/i);
});

test("rejects reasoning objects missing a canonical field", () => {
  const { method: _method, ...missingMethod } = thesis.reasoning;
  assert.throws(() => compileMandate(input(), { ...thesis, reasoning: missingMethod } as TradeThesis, policy, anchor, 2_000), /reasoning.*method|required|non-empty string/i);
});

test("rejects a missing reasoning receipt hash before mandate emission", () => {
  const { reasoningReceiptHash: _hash, ...missingHash } = thesis.reasoning;
  assert.throws(() => compileMandate(input(), { ...thesis, reasoning: missingHash } as TradeThesis, policy, anchor, 2_000), /reasoning\.reasoningReceiptHash|required/i);
});

test("rejects authority widening, invalid thesis, and non-finite input", () => {
  assert.throws(() => compileMandate(input(), { ...thesis, venue: "OTHER" as never }, policy, anchor, 2_000), /BINANCE/);
  assert.throws(() => compileMandate(input(), { ...thesis, direction: "FLAT" }, policy, anchor, 2_000), /FLAT/);
  assert.throws(() => compileMandate(input(), { ...thesis, confidence: Number.NaN }, policy, anchor, 2_000), /finite/);
  assert.throws(() => compileMandate(input(), { ...thesis, expiresAt: 900 }, policy, anchor, 2_000), /validity|expired/);
  assert.throws(() => compileMandate(input(), thesis, { ...policy, allowedSymbols: ["DOGEUSDT"] }, anchor, 2_000), /authorized/);
  assert.throws(() => compileMandate(input(), thesis, { ...policy, maxUses: 2 } as never, anchor, 2_000), /maxUses|authority|policy/);
});

test("rejects contradictory expected-move interval and stale anchor chronology", () => {
  assert.throws(() => compileMandate(input(), { ...thesis, expectedMove: { bps: 10, lowerBps: 20, upperBps: 30 } }, policy, anchor, 2_000), /incoherent/);
  assert.throws(() => compileMandate(input(), thesis, policy, { ...anchor, receivedAt: 999 }, 2_000), /chronology/);
});

test("rejects omitted or incoherent bounded entry policy", () => {
  const { minEntryPrice: _min, maxEntryPrice: _max, entryTrigger: _trigger, ...omitted } = policy;
  assert.throws(() => compileMandate(input(), thesis, omitted as CompilerPolicy, anchor, 2_000), /Entry|entry|bounded/);
  assert.throws(() => compileMandate(input(), thesis, { ...policy, minEntryPrice: 101_000, maxEntryPrice: 99_000 }, anchor, 2_000), /entry|coherent/);
  assert.throws(() => compileMandate(input(), thesis, { ...policy, entryTrigger: "ABOVE" }, anchor, 2_000), /trigger|side/);
  assert.throws(() => compileMandate(input(), { ...thesis, direction: "SHORT" }, policy, anchor, 2_000), /trigger|side/);
});

test("rejects every negative cost ceiling", () => {
  for (const field of ["minExecutableEdgeBps", "maxSpreadBps", "maxSlippageBps", "maxFeeBps", "maxFundingCostBps", "maxLossBps", "maxNotional"] as const) {
    assert.throws(() => compileMandate(input(), thesis, { ...policy, [field]: -1 }, anchor, 2_000), new RegExp(field));
  }
});

test("clones mutable anchor input before freezing the mandate", () => {
  const mutableAnchor = { ...anchor };
  const mandate = compileMandate(input(), thesis, policy, mutableAnchor, 2_000);
  assert.equal(Object.isFrozen(mutableAnchor), false);
  mutableAnchor.markPrice = 123_456;
  mutableAnchor.receivedAt = 9_999;
  assert.equal(mandate.anchor.markPrice, 100_000);
  assert.equal(mandate.anchor.receivedAt, 1_001);
});

test("rejects negative anchor state versions", () => {
  assert.throws(() => compileMandate(input(), thesis, policy, { ...anchor, stateVersion: -1n }, 2_000), /stateVersion|non-negative/);
});

test("rejects numeric thesis hashes", () => {
  assert.throws(() => compileMandate(input(), { ...thesis, thesisHash: 42 } as unknown as TradeThesis, policy, anchor, 2_000), /thesisHash|non-empty string/);
});

test("rejects negative timestamp fields", () => {
  for (const [field, value] of [["createdAt", -1], ["expiresAt", -1]] as const) {
    assert.throws(() => compileMandate(input(), { ...thesis, [field]: value }, policy, anchor, 2_000), new RegExp(field));
  }
  for (const field of ["observedAt", "receivedAt"] as const) {
    assert.throws(() => compileMandate(input(), thesis, policy, { ...anchor, [field]: -1 }, 2_000), new RegExp(`anchor\\.${field}`));
  }
  assert.throws(() => compileMandate(input(), thesis, policy, anchor, -1), /now/);
});
