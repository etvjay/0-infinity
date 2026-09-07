import type { ExecutionAssessment, ExecutionEconomicsResult } from "../economics/index.js";
import { compileMandate, type AnchorState, type CompilerPolicy, type ExecutionMandate, type TradeThesis } from "../domain/index.js";
import { evaluateMandate, type EvaluationPolicy, type EvaluationWorkflow, type ExecutionIntent, type ExecutionRefusal, type LiveAccountState, type LiveMarketState, type StateEnvelope } from "../evaluator/index.js";
import type { MandateRuntime } from "../runtime/mandateRuntime.js";
import type { CouncilRefusal, CouncilResult } from "./index.js";

export interface CompilerEconomicsEnvelope {
  readonly kind: "ECONOMICS";
  readonly evidenceHash: string;
  readonly observedAt: number;
  readonly receivedAt: number;
  readonly source: "LOCAL" | "REPLAY";
  readonly orderBook: { readonly status: "SYNCED"; readonly trusted: true };
  readonly result: ExecutionEconomicsResult;
}
export interface CouncilHandoffInput {
  readonly council: CouncilResult;
  readonly workflowId: string;
  readonly compilerPolicy: CompilerPolicy;
  readonly anchor: AnchorState;
  readonly now: number;
  readonly economics: CompilerEconomicsEnvelope;
}
export interface CouncilProposal {
  readonly kind: "PROPOSAL";
  readonly workflowId: string;
  readonly thesis: TradeThesis;
  readonly compilerPolicy: CompilerPolicy;
  readonly anchor: AnchorState;
  readonly economics: CompilerEconomicsEnvelope;
}
export interface HandoffRefusal {
  readonly kind: "REFUSAL";
  readonly code: HandoffRefusalCode;
  readonly message: string;
}
export type HandoffRefusalCode = "MALFORMED_INPUT" | "COUNCIL_REFUSED" | "UNTRUSTED_ECONOMICS" | "STALE_ECONOMICS" | "IDENTITY_MISMATCH" | "COMPILER_REFUSED" | "EVALUATOR_REFUSED";
export type CouncilHandoff = CouncilProposal | HandoffRefusal;
export interface CompileRequest { readonly workflowId: string; readonly policy: CompilerPolicy; readonly anchor: AnchorState; readonly now: number; readonly approve: boolean; }
export interface ApprovalRequired { readonly kind: "APPROVAL_REQUIRED"; readonly workflowId: string; readonly thesisId: string; readonly message: string; }
export interface MandateCompiled { readonly kind: "MANDATE_COMPILED"; readonly workflowId: string; readonly thesis: TradeThesis; readonly mandate: ExecutionMandate; }
export type CompileResult = MandateCompiled | ApprovalRequired | HandoffRefusal;
export interface EvaluatedIntent { readonly kind: "EVALUATED_INTENT"; readonly intent: ExecutionIntent; }
export type EvaluationResult = EvaluatedIntent | HandoffRefusal;

const ownKeys = (value: object, keys: readonly string[], required = keys): boolean => {
  if (!canonicalObjectPrototype() || !value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const allowed = new Set(keys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
  }
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
};
const text = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const canonicalObjectPrototype = (): boolean => {
  const allowed = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
  return Reflect.ownKeys(Object.prototype).length === allowed.size && Reflect.ownKeys(Object.prototype).every((key) => typeof key === "string" && allowed.has(key));
};
const frozenTree = (value: unknown, seen = new Set<object>()): boolean => {
  if (!value || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && "value" in descriptor && frozenTree(descriptor.value, seen));
  });
};
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
const snapshotPolicy = (value: CompilerPolicy): CompilerPolicy => freeze({ ...value, ...(value.allowedSymbols === undefined ? {} : { allowedSymbols: [...value.allowedSymbols] }) });
const snapshotAnchor = (value: AnchorState): AnchorState => freeze({ ...value });
const sameData = (left: unknown, right: unknown, seen = new Set<object>()): boolean => {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (seen.has(left) || seen.has(right)) return false;
  seen.add(left); seen.add(right);
  const leftKeys = Reflect.ownKeys(left); const rightKeys = Reflect.ownKeys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => {
    if (!rightKeys.includes(key)) return false;
    const leftDescriptor = Object.getOwnPropertyDescriptor(left, key);
    const rightDescriptor = Object.getOwnPropertyDescriptor(right, key);
    return Boolean(leftDescriptor && rightDescriptor && "value" in leftDescriptor && "value" in rightDescriptor && sameData(leftDescriptor.value, rightDescriptor.value, seen));
  });
};
const refusal = (code: HandoffRefusalCode, message: string): HandoffRefusal => Object.freeze({ kind: "REFUSAL", code, message });

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const CANONICAL_ARRAY_DESCRIPTORS = Object.freeze([
  ["length", true, false], ["constructor", true, true], ["at", true, true], ["concat", true, true], ["copyWithin", true, true], ["fill", true, true], ["find", true, true], ["findIndex", true, true], ["findLast", true, true], ["findLastIndex", true, true], ["lastIndexOf", true, true], ["pop", true, true], ["push", true, true], ["reverse", true, true], ["shift", true, true], ["unshift", true, true], ["slice", true, true], ["sort", true, true], ["splice", true, true], ["includes", true, true], ["indexOf", true, true], ["join", true, true], ["keys", true, true], ["entries", true, true], ["values", true, true], ["forEach", true, true], ["filter", true, true], ["flat", true, true], ["flatMap", true, true], ["map", true, true], ["every", true, true], ["some", true, true], ["reduce", true, true], ["reduceRight", true, true], ["toReversed", true, true], ["toSorted", true, true], ["toSpliced", true, true], ["with", true, true], ["toLocaleString", true, true], ["toString", true, true], [Symbol.iterator, true, true], [Symbol.unscopables, false, true]
] as const);
const canonicalArrayPrototype = (): boolean => {
  const actual = Reflect.ownKeys(Array.prototype);
  if (actual.length !== CANONICAL_ARRAY_DESCRIPTORS.length) return false;
  for (const [key, writable, configurable] of CANONICAL_ARRAY_DESCRIPTORS) {
    let present = false;
    for (const actualKey of actual) if (actualKey === key) { present = true; break; }
    if (!present) return false;
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, key);
    if (!descriptor || descriptor.enumerable || descriptor.writable !== writable || descriptor.configurable !== configurable || !("value" in descriptor)) return false;
  }
  return true;
};
const assessmentKeys = ["kind", "side", "requestedQuantity", "executableQuantity", "bestExecutableReference", "vwap", "worstExecutionPrice", "limitPrice", "totalCost", "spreadBps", "slippageBps", "feeBps", "fundingCostBps", "executableEdgeBps", "fills"] as const;
const fillKeys = ["price", "quantity", "notional"] as const;
const canonicalData = (value: unknown, keys: readonly string[], required = keys): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || !canonicalObjectPrototype()) return false;
  const allowed = new Set(keys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || descriptor.get || descriptor.set) return false;
  }
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
};
const canonicalArray = (value: unknown): value is readonly unknown[] => {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || !Object.isFrozen(value) || !canonicalArrayPrototype()) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !descriptor.enumerable || descriptor.writable || descriptor.configurable || !("value" in descriptor)) return false;
  }
  return Object.getOwnPropertyDescriptor(value, "length")?.writable === false;
};
const decimal = (value: unknown): value is string => typeof value === "string" && DECIMAL.test(value);
function validAssessment(value: unknown): value is ExecutionAssessment {
  if (!canonicalData(value, assessmentKeys) || !Object.isFrozen(value)) return false;
  const assessment = value as ExecutionAssessment;
  if (assessment.kind !== "ASSESSMENT" || (assessment.side !== "BUY" && assessment.side !== "SELL") || assessmentKeys.slice(2, -1).some((key) => !decimal(assessment[key]))) return false;
  if (!canonicalArray(assessment.fills) || !assessment.fills.length || !assessment.fills.every((fill) => canonicalData(fill, fillKeys) && Object.isFrozen(fill) && fillKeys.every((key) => decimal((fill as unknown as Record<string, unknown>)[key])))) return false;
  return frozenTree(assessment);
}
const validAnchor = (value: unknown): value is AnchorState => canonicalData(value, ["stateVersion", "observedAt", "receivedAt", "markPrice"]) && typeof (value as AnchorState).stateVersion === "bigint" && (value as AnchorState).stateVersion >= 0n && finite((value as AnchorState).observedAt) && finite((value as AnchorState).receivedAt) && finite((value as AnchorState).markPrice) && (value as AnchorState).observedAt >= 0 && (value as AnchorState).receivedAt >= (value as AnchorState).observedAt && (value as AnchorState).markPrice > 0;
const validPolicy = (value: unknown): value is CompilerPolicy => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || !canonicalObjectPrototype()) return false;
  const keys = ["accountId", "validityMs", "minExecutableEdgeBps", "maxSpreadBps", "maxSlippageBps", "maxFeeBps", "maxFundingCostBps", "maxNotional", "maxLossBps", "execution", "minEntryPrice", "maxEntryPrice", "entryTrigger", "allowedSymbols"];
  if (!canonicalData(value, keys, keys.slice(0, -1)) || !text((value as CompilerPolicy).accountId)) return false;
  const symbols = (value as CompilerPolicy).allowedSymbols;
  if (symbols !== undefined && (!canonicalArray(symbols) || !symbols.every(text))) return false;
  return Object.entries(value as Record<string, unknown>).every(([key, item]) => key === "accountId" || key === "execution" || key === "entryTrigger" || key === "allowedSymbols" || finite(item));
};
const validCompileRequest = (value: unknown): value is CompileRequest => canonicalData(value, ["workflowId", "policy", "anchor", "now", "approve"]) && text((value as CompileRequest).workflowId) && validPolicy((value as CompileRequest).policy) && validAnchor((value as CompileRequest).anchor) && finite((value as CompileRequest).now) && (value as CompileRequest).now >= 0 && typeof (value as CompileRequest).approve === "boolean";
const marketStateKeys = ["venue", "instrument", "symbol", "bidPrice", "askPrice", "markPrice", "expectedMoveBps", "spreadBps", "slippageBps", "feeBps", "fundingCostBps"];
const accountStateKeys = ["accountId", "availableNotional", "currentNotional", "currentLossBps"];
const validStateEnvelope = (value: unknown, stateKeys: readonly string[]): boolean => {
  if (!canonicalData(value, ["version", "observedAt", "receivedAt", "value"]) || !Object.isFrozen(value)) return false;
  const envelope = value as StateEnvelope<Record<string, unknown>>;
  if (typeof envelope.version !== "bigint" || envelope.version < 0n || !finite(envelope.observedAt) || !finite(envelope.receivedAt) || envelope.observedAt < 0 || envelope.receivedAt < envelope.observedAt || !canonicalData(envelope.value, stateKeys) || !Object.isFrozen(envelope.value)) return false;
  return stateKeys.every((key) => { const item = (envelope.value as Record<string, unknown>)[key]; return key === "venue" || key === "instrument" || key === "symbol" || key === "accountId" ? text(item) : finite(item); }) && frozenTree(envelope);
};

function validEconomicsEnvelope(value: unknown): value is CompilerEconomicsEnvelope {
  if (!ownKeys(value as object, ["kind", "evidenceHash", "observedAt", "receivedAt", "source", "orderBook", "result"]) || !Object.isFrozen(value) || !text((value as CompilerEconomicsEnvelope).evidenceHash)) return false;
  const envelope = value as CompilerEconomicsEnvelope;
  return envelope.kind === "ECONOMICS" && (envelope.source === "LOCAL" || envelope.source === "REPLAY") && canonicalData(envelope.orderBook, ["status", "trusted"]) && envelope.orderBook.status === "SYNCED" && envelope.orderBook.trusted === true && finite(envelope.observedAt) && finite(envelope.receivedAt) && envelope.observedAt >= 0 && envelope.receivedAt >= envelope.observedAt && validAssessment(envelope.result) && frozenTree(envelope);
}

/** Default boundary: council reasoning becomes only a proposal or refusal. */
export function createCouncilHandoff(input: CouncilHandoffInput): CouncilHandoff {
  try {
    if (!ownKeys(input as object, ["council", "workflowId", "compilerPolicy", "anchor", "now", "economics"]) || !text(input.workflowId) || !finite(input.now) || input.now < 0 || !validPolicy(input.compilerPolicy) || !validAnchor(input.anchor) || !validEconomicsEnvelope(input.economics)) return refusal("MALFORMED_INPUT", "handoff input is not canonical");
    if (input.council.kind === "REFUSAL") return refusal("COUNCIL_REFUSED", input.council.message);
    if (input.council.kind !== "THESIS" || !frozenTree(input.council) || input.economics.evidenceHash !== input.council.thesis.reasoning.evidenceBundleHash) return refusal("IDENTITY_MISMATCH", "economics evidence hash is not bound to the council thesis");
    const thesis = input.council.thesis;
    if (input.economics.observedAt < thesis.createdAt || input.economics.receivedAt > input.now || input.economics.receivedAt < input.economics.observedAt || input.now >= thesis.expiresAt) return refusal("STALE_ECONOMICS", "economics evidence is stale or outside thesis validity");
    if (input.economics.result.kind !== "ASSESSMENT" || input.economics.result.side !== thesis.side) return refusal("UNTRUSTED_ECONOMICS", "economics assessment is not bound to thesis direction");
    return freeze({ kind: "PROPOSAL" as const, workflowId: input.workflowId, thesis, compilerPolicy: snapshotPolicy(input.compilerPolicy), anchor: snapshotAnchor(input.anchor), economics: input.economics });
  } catch { return refusal("MALFORMED_INPUT", "handoff input is malformed"); }
}

/** Explicit authority boundary. No caller approval means no compiler call. */
export function compileCouncilHandoff(proposal: CouncilHandoff, request: CompileRequest): CompileResult {
  try {
    if (proposal.kind === "REFUSAL") return proposal;
    if (proposal.kind !== "PROPOSAL" || !validCompileRequest(request)) return refusal("COMPILER_REFUSED", "compile request is not canonical");
    if (request.approve !== true) return Object.freeze({ kind: "APPROVAL_REQUIRED", workflowId: proposal.workflowId, thesisId: proposal.thesis.thesisId, message: "explicit caller approval is required before mandate compilation" });
    if (request.workflowId !== proposal.workflowId) return refusal("IDENTITY_MISMATCH", "workflow identity does not match proposal");
    if (!sameData(request.policy, proposal.compilerPolicy) || !sameData(request.anchor, proposal.anchor)) return refusal("IDENTITY_MISMATCH", "compiler policy or anchor does not match proposal binding");
    const mandate = compileMandate({ workflowId: request.workflowId }, proposal.thesis, request.policy, request.anchor, request.now);
    return freeze({ kind: "MANDATE_COMPILED" as const, workflowId: request.workflowId, thesis: proposal.thesis, mandate });
  } catch { return refusal("COMPILER_REFUSED", "explicit mandate compilation refused"); }
}

/** Explicit evaluator boundary. It consumes only caller-supplied replay envelopes. */
export function evaluateCouncilHandoff(compiled: CompileResult, workflow: EvaluationWorkflow, runtime: MandateRuntime, market: StateEnvelope<LiveMarketState>, account: StateEnvelope<LiveAccountState>, policy: EvaluationPolicy, now: number): EvaluationResult {
  if (compiled.kind !== "MANDATE_COMPILED") return compiled.kind === "REFUSAL" ? compiled : refusal("EVALUATOR_REFUSED", "a compiled mandate is required");
  if (!validStateEnvelope(market, marketStateKeys) || !validStateEnvelope(account, accountStateKeys)) return refusal("EVALUATOR_REFUSED", "replay state envelopes must be canonical and deeply immutable");
  const result = evaluateMandate(workflow, compiled.mandate, runtime, market, account, policy, now);
  return result.kind === "EXECUTION_INTENT" ? freeze({ kind: "EVALUATED_INTENT" as const, intent: result }) : refusal("EVALUATOR_REFUSED", result.message);
}

export type { CouncilRefusal };
