import test from "node:test";
import assert from "node:assert/strict";
import { conveneEvidenceCouncil, type CouncilInput, type TradeThesis } from "../src/reasoning/index.js";

const base = (): CouncilInput => ({
  advocate: { kind: "ADVOCATE", ref: "a-ref", hash: "a-hash", symbol: "BTCUSDT", direction: "LONG", expectedMoveBps: 40, confidence: .8, observedAt: 900, expiresAt: 2_000 },
  oppose: { kind: "OPPOSE", ref: "o-ref", hash: "o-hash", symbol: "BTCUSDT", direction: "LONG", recommendation: "AGREE", observedAt: 901, expiresAt: 2_000 },
  evidence: { kind: "MARKET_ACCOUNT", ref: "m-ref", hash: "m-hash", symbol: "BTCUSDT", market: "TRUSTED", account: "TRUSTED", observedAt: 902, expiresAt: 2_000 },
  policy: { method: "local-council-v1", now: 1_000, maxAgeMs: 200, minConfidence: .7, minExpectedMoveBps: 10, thesisId: "stable-id", thesisHash: "stable-hash" },
});

test("returns a canonical deeply immutable thesis and replays deterministically", () => {
  const a = conveneEvidenceCouncil(base()), b = conveneEvidenceCouncil(base());
  assert.equal(a.kind, "THESIS"); assert.deepEqual(a, b);
  if (a.kind !== "THESIS") return;
  assert.deepEqual(a.thesis.reasoning, { method: "local-council-v1", advocateRef: "a-ref", opposeRef: "o-ref", marketAnalysisRef: "m-ref", evidenceBundleHash: "m-hash", councilDecisionHash: "stable-hash" });
  assert.equal(a.thesis.thesisId, "stable-id"); assert.equal(Object.isFrozen(a.thesis), true); assert.equal(Object.isFrozen(a.thesis.reasoning), true);
  assert.equal((a.thesis as unknown as Record<string, unknown>).authority, undefined);
});

test("refuses disagreement, untrusted evidence, economics refusal, and stale evidence", () => {
  assert.equal(conveneEvidenceCouncil({ ...base(), oppose: { ...base().oppose, direction: "SHORT", recommendation: "CONTRADICT" } }).kind, "REFUSAL");
  assert.equal(conveneEvidenceCouncil({ ...base(), evidence: { ...base().evidence, market: "UNTRUSTED" } }).kind, "REFUSAL");
  assert.equal(conveneEvidenceCouncil({ ...base(), evidence: { ...base().evidence, economics: { kind: "REFUSAL", code: "BOOK_NOT_SYNCED", message: "no" } } }).kind, "REFUSAL");
  const stale = { ...base(), policy: { ...base().policy, now: 1_500 } };
  assert.equal(conveneEvidenceCouncil(stale).kind, "REFUSAL");
});

test("enforces confidence and move thresholds", () => {
  assert.equal(conveneEvidenceCouncil({ ...base(), advocate: { ...base().advocate, confidence: .6 } }).kind, "REFUSAL");
  assert.equal(conveneEvidenceCouncil({ ...base(), advocate: { ...base().advocate, expectedMoveBps: 9 } }).kind, "REFUSAL");
});

test("rejects missing, unsupported, inherited, hidden, and symbol-keyed fields", () => {
  const missing = { ...base(), oppose: { ...base().oppose } }; delete (missing.oppose as Record<string, unknown>).recommendation;
  assert.equal(conveneEvidenceCouncil(missing as CouncilInput).kind, "REFUSAL");
  assert.equal(conveneEvidenceCouncil({ ...base(), policy: { ...base().policy, compileMandate: true } } as never).kind, "REFUSAL");
  const inherited = Object.assign(Object.create({ poison: true }), base().advocate);
  assert.equal(conveneEvidenceCouncil({ ...base(), advocate: inherited } as never).kind, "REFUSAL");
  const hidden = { ...base().evidence }; Object.defineProperty(hidden, "poison", { value: true });
  assert.equal(conveneEvidenceCouncil({ ...base(), evidence: hidden } as never).kind, "REFUSAL");
  const keyed = { ...base().policy, [Symbol("poison")]: true };
  assert.equal(conveneEvidenceCouncil({ ...base(), policy: keyed } as never).kind, "REFUSAL");
});

test("does not mutate supplied inputs and never creates authority", () => {
  const input = base(); const before = JSON.stringify(input, (_k, v) => typeof v === "bigint" ? `${v}n` : v);
  const result = conveneEvidenceCouncil(input); assert.equal(JSON.stringify(input, (_k, v) => typeof v === "bigint" ? `${v}n` : v), before);
  assert.equal(result.kind, "THESIS"); if (result.kind === "THESIS") assert.equal("compileMandate" in result, false);
});
