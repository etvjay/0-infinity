import { createHash } from "node:crypto";
import type { ExecutionEconomicsResult } from "../economics/index.js";
import type { Direction, TradeThesis as DomainTradeThesis } from "../domain/index.js";

export type CouncilDirection = Exclude<Direction, "FLAT">;
export type AnalysisRecommendation = "AGREE" | "CONTRADICT";
export interface AdvocateAnalysis {
  readonly kind: "ADVOCATE"; readonly ref: string; readonly hash: string; readonly symbol: string; readonly direction: CouncilDirection;
  readonly expectedMoveBps: number; readonly confidence: number; readonly observedAt: number; readonly expiresAt: number;
}
export interface OpposingAnalysis {
  readonly kind: "OPPOSE"; readonly ref: string; readonly hash: string; readonly symbol: string; readonly direction: CouncilDirection;
  readonly recommendation: AnalysisRecommendation; readonly observedAt: number; readonly expiresAt: number;
}
export interface MarketAccountEvidence {
  readonly kind: "MARKET_ACCOUNT"; readonly ref: string; readonly hash: string; readonly symbol: string;
  readonly market: "TRUSTED" | "UNTRUSTED"; readonly account: "TRUSTED" | "UNTRUSTED";
  readonly observedAt: number; readonly expiresAt: number; readonly economics?: ExecutionEconomicsResult;
}
export interface CouncilPolicy {
  readonly method: string; readonly now: number; readonly maxAgeMs: number; readonly minConfidence: number; readonly minExpectedMoveBps: number;
  readonly thesisId?: string; readonly thesisHash?: string;
}
export interface CouncilInput { readonly advocate: AdvocateAnalysis; readonly oppose: OpposingAnalysis; readonly evidence: MarketAccountEvidence; readonly policy: CouncilPolicy; }
export type TradeThesis = DomainTradeThesis;
export type CouncilRefusalCode = "MISSING_INPUT" | "MALFORMED_INPUT" | "STALE_EVIDENCE" | "CONTRADICTORY_EVIDENCE" | "UNTRUSTED_EVIDENCE" | "THRESHOLD_NOT_MET" | "ECONOMICS_REFUSED";
export interface CouncilRefusal { readonly kind: "REFUSAL"; readonly code: CouncilRefusalCode; readonly message: string; }
export interface CouncilThesis { readonly kind: "THESIS"; readonly thesis: TradeThesis; }
export type CouncilResult = CouncilThesis | CouncilRefusal;

const own = (v: object, k: string) => Object.prototype.hasOwnProperty.call(v, k);
const objectPrototypeKeys = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
function canonicalObjectPrototype(): boolean {
  const keys = Reflect.ownKeys(Object.prototype);
  if (keys.length !== objectPrototypeKeys.size || keys.some((key) => typeof key !== "string" || !objectPrototypeKeys.has(key))) return false;
  for (const key of objectPrototypeKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, key);
    if (!descriptor || descriptor.enumerable || !descriptor.configurable) return false;
    if (key === "__proto__") {
      if (typeof descriptor.get !== "function" || typeof descriptor.set !== "function") return false;
    } else if (!("value" in descriptor) || !descriptor.writable || typeof descriptor.value !== "function") return false;
  }
  return true;
}
function canonicalPrototypeChain(object: object): boolean {
  let valid = true;
  for (let prototype: object | null = Object.getPrototypeOf(object); prototype; prototype = Object.getPrototypeOf(prototype)) {
    if (prototype === Object.prototype) valid = canonicalObjectPrototype() && valid;
    else if (Reflect.ownKeys(prototype).length > 0) valid = false;
  }
  return valid;
}
const freeze = <T>(v: T, seen = new Set<object>()): T => {
  if (v && typeof v === "object" && !seen.has(v as object)) { seen.add(v as object); Object.freeze(v); for (const x of Object.values(v as object as Record<string, unknown>)) freeze(x, seen); }
  return v;
};
const requiredString = (x: unknown) => typeof x === "string" && x.trim().length > 0;
const finite = (x: unknown) => typeof x === "number" && Number.isFinite(x);
const allowed = (value: unknown, keys: readonly string[], required: readonly string[]): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as object; const permitted = new Set(keys);
  if (!canonicalPrototypeChain(object)) return false;
  for (const key of Reflect.ownKeys(object)) {
    if (typeof key !== "string" || !permitted.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
  }
  for (let proto = Object.getPrototypeOf(object); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    if (Reflect.ownKeys(proto).length > 0) return false;
  }
  return required.every((key) => own(object, key));
};
const hash = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "!number";
  if (typeof value === "bigint") return `"${value}n"`;
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return "!unsupported";
}
const refusal = (code: CouncilRefusalCode, message: string): CouncilRefusal => Object.freeze({ kind: "REFUSAL", code, message });
const analysisKeys = ["kind", "ref", "hash", "symbol", "direction", "expectedMoveBps", "confidence", "observedAt", "expiresAt"] as const;
const opposeKeys = ["kind", "ref", "hash", "symbol", "direction", "recommendation", "observedAt", "expiresAt"] as const;
const evidenceKeys = ["kind", "ref", "hash", "symbol", "market", "account", "observedAt", "expiresAt", "economics"] as const;
const policyKeys = ["method", "now", "maxAgeMs", "minConfidence", "minExpectedMoveBps", "thesisId", "thesisHash"] as const;
const assessmentKeys = ["kind", "side", "requestedQuantity", "executableQuantity", "bestExecutableReference", "vwap", "worstExecutionPrice", "limitPrice", "totalCost", "spreadBps", "slippageBps", "feeBps", "fundingCostBps", "executableEdgeBps", "fills"] as const;
const fillKeys = ["price", "quantity", "notional"] as const;
function canonicalEconomics(value: unknown): boolean {
  if (!Object.isFrozen(value) || !allowed(value, assessmentKeys, assessmentKeys)) return false;
  const assessment = value as Record<string, unknown>;
  if (assessment.kind !== "ASSESSMENT" || (assessment.side !== "BUY" && assessment.side !== "SELL")) return false;
  for (const key of assessmentKeys) if (key !== "kind" && key !== "side" && key !== "fills" && !requiredString(assessment[key])) return false;
  const fills = assessment.fills;
  if (!Array.isArray(fills) || Object.getPrototypeOf(fills) !== Array.prototype || !Object.isFrozen(fills)) return false;
  for (const key of Reflect.ownKeys(fills)) if (key !== "length" && (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/.test(key))) return false;
  return fills.every((fill) => Object.isFrozen(fill) && allowed(fill, fillKeys, fillKeys) && fillKeys.every((key) => requiredString((fill as Record<string, unknown>)[key])));
}

export function conveneEvidenceCouncil(input: CouncilInput): CouncilResult {
  try {
    if (!allowed(input, ["advocate", "oppose", "evidence", "policy"], ["advocate", "oppose", "evidence", "policy"]) ||
      !allowed(input.advocate, analysisKeys, analysisKeys) || !allowed(input.oppose, opposeKeys, opposeKeys) ||
      !allowed(input.evidence, evidenceKeys, ["kind", "ref", "hash", "symbol", "market", "account", "observedAt", "expiresAt"]) ||
      !allowed(input.policy, policyKeys, ["method", "now", "maxAgeMs", "minConfidence", "minExpectedMoveBps"])) return refusal("MALFORMED_INPUT", "input shape is not canonical");
    const { advocate: a, oppose: o, evidence: e, policy: p } = input;
    if (a.kind !== "ADVOCATE" || o.kind !== "OPPOSE" || e.kind !== "MARKET_ACCOUNT") return refusal("MALFORMED_INPUT", "input kinds are invalid");
    if (![a.ref, a.hash, a.symbol, o.ref, o.hash, o.symbol, e.ref, e.hash, e.symbol, p.method].every(requiredString)) return refusal("MALFORMED_INPUT", "references and identifiers are required");
    if (a.symbol !== o.symbol || a.symbol !== e.symbol || a.direction !== o.direction || o.recommendation !== "AGREE") return refusal("CONTRADICTORY_EVIDENCE", "advocate and opposing analysis do not agree");
    if (![a.expectedMoveBps, a.confidence, a.observedAt, a.expiresAt, o.observedAt, o.expiresAt, e.observedAt, e.expiresAt, p.now, p.maxAgeMs, p.minConfidence, p.minExpectedMoveBps].every(finite) || p.maxAgeMs < 0 || p.now < 0) return refusal("MALFORMED_INPUT", "numeric bounds are malformed");
    if ((p.thesisId !== undefined && !requiredString(p.thesisId)) || (p.thesisHash !== undefined && !requiredString(p.thesisHash))) return refusal("MALFORMED_INPUT", "optional thesis identifiers must be non-empty strings");
    for (const [observed, expires] of [[a.observedAt, a.expiresAt], [o.observedAt, o.expiresAt], [e.observedAt, e.expiresAt]]) if (observed < 0 || expires < 0 || expires <= observed || observed > p.now || p.now - observed > p.maxAgeMs || p.now >= expires) return refusal("STALE_EVIDENCE", "all evidence must be non-negative, chronological, and fresh at policy.now");
    if (e.market !== "TRUSTED" || e.account !== "TRUSTED") return refusal("UNTRUSTED_EVIDENCE", "trusted market and account evidence are required");
    if (e.economics !== undefined && (!e.economics || typeof e.economics !== "object" || !("kind" in e.economics))) return refusal("MALFORMED_INPUT", "economics evidence is malformed");
    if (e.economics?.kind === "REFUSAL") return refusal("ECONOMICS_REFUSED", "supplied execution economics refused");
    if (e.economics !== undefined && !canonicalEconomics(e.economics)) return refusal("MALFORMED_INPUT", "economics assessment is not canonical and deeply immutable");
    if (a.confidence < p.minConfidence || a.expectedMoveBps < p.minExpectedMoveBps) return refusal("THRESHOLD_NOT_MET", "council thresholds are not met");
    const decisionHash = p.thesisHash ?? hash({ advocate: a.hash, oppose: o.hash, evidence: e.hash, policy: p });
    const thesisId = p.thesisId ?? `thesis-${hash({ symbol: a.symbol, direction: a.direction, decisionHash }).slice(0, 32)}`;
    const createdAt = Math.max(a.observedAt, o.observedAt, e.observedAt); const expiresAt = Math.min(a.expiresAt, o.expiresAt, e.expiresAt);
    const thesis: TradeThesis = { thesisId, thesisHash: decisionHash, venue: "BINANCE", instrument: "USD_M_FUTURES", symbol: a.symbol, direction: a.direction, side: a.direction === "LONG" ? "BUY" : "SELL", horizonMs: expiresAt - createdAt, confidence: a.confidence, expectedMove: { bps: a.expectedMoveBps, lowerBps: a.expectedMoveBps, upperBps: a.expectedMoveBps }, reasoning: { method: p.method, advocateRef: a.ref, opposeRef: o.ref, marketAnalysisRef: e.ref, evidenceBundleHash: e.hash, councilDecisionHash: decisionHash }, createdAt, expiresAt };
    return freeze({ kind: "THESIS", thesis });
  } catch { return refusal("MALFORMED_INPUT", "input is malformed"); }
}
