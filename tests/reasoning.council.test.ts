import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

test("rejects pollution added directly to Object.prototype", () => {
  Object.defineProperty(Object.prototype, "poison", { value: true, enumerable: false, configurable: true });
  const symbol = Symbol("poison"); Object.defineProperty(Object.prototype, symbol, { value: true, configurable: true });
  try { assert.equal(conveneEvidenceCouncil(base()).kind, "REFUSAL"); }
  finally { delete (Object.prototype as Record<string, unknown>).poison; delete (Object.prototype as Record<PropertyKey, unknown>)[symbol]; }
});

test("rejects every custom prototype key regardless of enumerability or key type", () => {
  const symbol = Symbol("poison"); const prototype = {};
  Object.defineProperty(prototype, "hiddenPoison", { value: true }); Object.defineProperty(prototype, symbol, { value: true });
  const inherited = Object.assign(Object.create(prototype), base().advocate);
  assert.equal(conveneEvidenceCouncil({ ...base(), advocate: inherited } as never).kind, "REFUSAL");
});

test("rejects optional thesis identifiers unless they are non-empty strings", () => {
  assert.equal(conveneEvidenceCouncil({ ...base(), policy: { ...base().policy, thesisId: 7 } } as never).kind, "REFUSAL");
  assert.equal(conveneEvidenceCouncil({ ...base(), policy: { ...base().policy, thesisHash: 7 } } as never).kind, "REFUSAL");
  assert.equal(conveneEvidenceCouncil({ ...base(), policy: { ...base().policy, thesisId: "   " } }).kind, "REFUSAL");
});

test("rejects negative or non-chronological evidence timestamps", () => {
  for (const field of ["advocate", "oppose", "evidence"] as const) {
    const value = { ...base()[field], observedAt: -1 };
    assert.equal(conveneEvidenceCouncil({ ...base(), [field]: value } as never).kind, "REFUSAL");
  }
  assert.equal(conveneEvidenceCouncil({ ...base(), advocate: { ...base().advocate, expiresAt: -1 } }).kind, "REFUSAL");
  assert.equal(conveneEvidenceCouncil({ ...base(), oppose: { ...base().oppose, expiresAt: 900 } }).kind, "REFUSAL");
});

test("fresh process rejects Array.prototype pollution before reasoning import", () => {
  const moduleUrl = new URL("../src/reasoning/index.js", import.meta.url).href;
  const script = `
    Object.defineProperty(Array.prototype, "preImportPollution", { value: true, enumerable: false, configurable: true });
    const { conveneEvidenceCouncil } = await import(${JSON.stringify(moduleUrl)});
    const frozen = (value) => Object.freeze(value);
    const fill = frozen({ price: "100", quantity: "1", notional: "100" });
    const economics = frozen({ kind: "ASSESSMENT", side: "BUY", requestedQuantity: "1", executableQuantity: "1", bestExecutableReference: "100", vwap: "100", worstExecutionPrice: "100", limitPrice: "100", totalCost: "100", spreadBps: "1", slippageBps: "0", feeBps: "0", fundingCostBps: "0", executableEdgeBps: "1", fills: frozen([fill]) });
    const input = { advocate: { kind: "ADVOCATE", ref: "a-ref", hash: "a-hash", symbol: "BTCUSDT", direction: "LONG", expectedMoveBps: 40, confidence: .8, observedAt: 900, expiresAt: 2000 },
      oppose: { kind: "OPPOSE", ref: "o-ref", hash: "o-hash", symbol: "BTCUSDT", direction: "LONG", recommendation: "AGREE", observedAt: 901, expiresAt: 2000 },
      evidence: { kind: "MARKET_ACCOUNT", ref: "m-ref", hash: "m-hash", symbol: "BTCUSDT", market: "TRUSTED", account: "TRUSTED", observedAt: 902, expiresAt: 2000, economics },
      policy: { method: "local-council-v1", now: 1000, maxAgeMs: 200, minConfidence: .7, minExpectedMoveBps: 10, thesisId: "stable-id", thesisHash: "stable-hash" } };
    const result = conveneEvidenceCouncil(input);
    if (result.kind !== "REFUSAL" || result.code !== "MALFORMED_INPUT") process.exit(1);
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: process.cwd() });
});

test("accepts only a deeply frozen canonical economics assessment", () => {
  const unsupported = { kind: "ASSESSMENT", junk: true };
  assert.equal(conveneEvidenceCouncil({ ...base(), evidence: { ...base().evidence, economics: unsupported } } as never).kind, "REFUSAL");
  const mutable = { kind: "ASSESSMENT", side: "BUY" };
  assert.equal(conveneEvidenceCouncil({ ...base(), evidence: { ...base().evidence, economics: mutable } } as never).kind, "REFUSAL");
  const fill = Object.freeze({ price: "100", quantity: "1", notional: "100" });
  const assessment = Object.freeze({ kind: "ASSESSMENT", side: "BUY", requestedQuantity: "1", executableQuantity: "1", bestExecutableReference: "100", vwap: "100", worstExecutionPrice: "100", limitPrice: "100", totalCost: "100", spreadBps: "1", slippageBps: "0", feeBps: "0", fundingCostBps: "0", executableEdgeBps: "1", fills: Object.freeze([fill]) });
  assert.equal(conveneEvidenceCouncil({ ...base(), evidence: { ...base().evidence, economics: assessment } }).kind, "THESIS");
});

test("rejects non-canonical frozen fills at the council boundary", () => {
  const fill = Object.freeze({ price: "100", quantity: "1", notional: "100" });
  const assessment = (fills: unknown) => Object.freeze({ kind: "ASSESSMENT", side: "BUY", requestedQuantity: "1", executableQuantity: "1", bestExecutableReference: "100", vwap: "100", worstExecutionPrice: "100", limitPrice: "100", totalCost: "100", spreadBps: "1", slippageBps: "0", feeBps: "0", fundingCostBps: "0", executableEdgeBps: "1", fills });
  const submit = (fills: unknown) => conveneEvidenceCouncil({ ...base(), evidence: { ...base().evidence, economics: assessment(fills) } } as never).kind;

  assert.equal(submit(Object.freeze([fill])), "THESIS");
  assert.equal(submit(Object.freeze(new Array(1))), "REFUSAL"); // sparse

  const hidden = [] as unknown[];
  Object.defineProperty(hidden, "0", { value: fill, enumerable: false, writable: false, configurable: false });
  Object.defineProperty(hidden, "length", { value: 1, writable: false });
  assert.equal(submit(Object.freeze(hidden)), "REFUSAL"); // non-enumerable numeric entry

  const accessor = [] as unknown[];
  Object.defineProperty(accessor, "0", { get: () => fill, enumerable: true, configurable: false });
  Object.defineProperty(accessor, "length", { value: 1, writable: false });
  assert.equal(submit(Object.freeze(accessor)), "REFUSAL"); // accessor numeric entry

  const unsupported = [fill] as unknown[];
  Object.defineProperty(unsupported, "junk", { value: true, enumerable: false, configurable: false });
  assert.equal(submit(Object.freeze(unsupported)), "REFUSAL");

  const symbol = [fill] as unknown[];
  Object.defineProperty(symbol, Symbol("poison"), { value: true, configurable: false });
  assert.equal(submit(Object.freeze(symbol)), "REFUSAL");

  const polluted = Object.freeze([fill]);
  Object.defineProperty(Array.prototype, "1", { value: fill, enumerable: false, configurable: true });
  try {
    assert.equal(submit(polluted), "REFUSAL");
    assert.equal(submit(Object.freeze(new Array(2))), "REFUSAL"); // prototype pollution cannot fill coverage
  } finally {
    delete (Array.prototype as unknown as Record<string, unknown>)["1"];
  }
});
