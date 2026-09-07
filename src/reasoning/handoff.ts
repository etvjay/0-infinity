import type { ExecutionEconomicsResult } from "../economics/index.js";
import { compileMandate, type AnchorState, type CompilerPolicy, type ExecutionMandate, type TradeThesis } from "../domain/index.js";
import { evaluateMandate, type EvaluationPolicy, type EvaluationWorkflow, type ExecutionIntent, type ExecutionRefusal, type LiveAccountState, type LiveMarketState, type StateEnvelope } from "../evaluator/index.js";
import type { MandateRuntime } from "../runtime/mandateRuntime.js";
import type { CouncilRefusal, CouncilResult } from "./index.js";

export interface CompilerEconomicsEnvelope {
  readonly kind: "ECONOMICS";
  readonly evidenceHash: string;
  readonly observedAt: number;
  readonly receivedAt: number;
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
  return Object.isFrozen(value) && Object.values(value as Record<string, unknown>).every((child) => frozenTree(child, seen));
};
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
const refusal = (code: HandoffRefusalCode, message: string): HandoffRefusal => Object.freeze({ kind: "REFUSAL", code, message });

function validEconomicsEnvelope(value: unknown): value is CompilerEconomicsEnvelope {
  if (!ownKeys(value as object, ["kind", "evidenceHash", "observedAt", "receivedAt", "result"]) || !Object.isFrozen(value) || !text((value as CompilerEconomicsEnvelope).evidenceHash)) return false;
  const envelope = value as CompilerEconomicsEnvelope;
  return envelope.kind === "ECONOMICS" && finite(envelope.observedAt) && finite(envelope.receivedAt) && envelope.observedAt >= 0 && envelope.receivedAt >= envelope.observedAt && frozenTree(envelope.result) && envelope.result.kind === "ASSESSMENT";
}

/** Default boundary: council reasoning becomes only a proposal or refusal. */
export function createCouncilHandoff(input: CouncilHandoffInput): CouncilHandoff {
  try {
    if (!ownKeys(input as object, ["council", "workflowId", "compilerPolicy", "anchor", "now", "economics"]) || !text(input.workflowId) || !finite(input.now) || input.now < 0 || !validEconomicsEnvelope(input.economics)) return refusal("MALFORMED_INPUT", "handoff input is not canonical");
    if (input.council.kind === "REFUSAL") return refusal("COUNCIL_REFUSED", input.council.message);
    if (input.council.kind !== "THESIS" || !frozenTree(input.council) || input.economics.evidenceHash !== input.council.thesis.reasoning.evidenceBundleHash) return refusal("IDENTITY_MISMATCH", "economics evidence hash is not bound to the council thesis");
    const thesis = input.council.thesis;
    if (input.economics.observedAt < thesis.createdAt || input.economics.receivedAt > input.now || input.economics.receivedAt < input.economics.observedAt || input.now >= thesis.expiresAt) return refusal("STALE_ECONOMICS", "economics evidence is stale or outside thesis validity");
    if (input.economics.result.kind !== "ASSESSMENT" || input.economics.result.side !== thesis.side) return refusal("UNTRUSTED_ECONOMICS", "economics assessment is not bound to thesis direction");
    return freeze({ kind: "PROPOSAL" as const, workflowId: input.workflowId, thesis, economics: input.economics });
  } catch { return refusal("MALFORMED_INPUT", "handoff input is malformed"); }
}

/** Explicit authority boundary. No caller approval means no compiler call. */
export function compileCouncilHandoff(proposal: CouncilHandoff, request: CompileRequest): CompileResult {
  try {
    if (proposal.kind === "REFUSAL") return proposal;
    if (proposal.kind !== "PROPOSAL" || !request.approve) return Object.freeze({ kind: "APPROVAL_REQUIRED", workflowId: proposal.workflowId, thesisId: proposal.thesis.thesisId, message: "explicit caller approval is required before mandate compilation" });
    if (request.workflowId !== proposal.workflowId) return refusal("IDENTITY_MISMATCH", "workflow identity does not match proposal");
    const mandate = compileMandate({ workflowId: request.workflowId }, proposal.thesis, request.policy, request.anchor, request.now);
    return freeze({ kind: "MANDATE_COMPILED" as const, workflowId: request.workflowId, thesis: proposal.thesis, mandate });
  } catch { return refusal("COMPILER_REFUSED", "explicit mandate compilation refused"); }
}

/** Explicit evaluator boundary. It consumes only caller-supplied replay envelopes. */
export function evaluateCouncilHandoff(compiled: CompileResult, workflow: EvaluationWorkflow, runtime: MandateRuntime, market: StateEnvelope<LiveMarketState>, account: StateEnvelope<LiveAccountState>, policy: EvaluationPolicy, now: number): EvaluationResult {
  if (compiled.kind !== "MANDATE_COMPILED") return compiled.kind === "REFUSAL" ? compiled : refusal("EVALUATOR_REFUSED", "a compiled mandate is required");
  const result = evaluateMandate(workflow, compiled.mandate, runtime, market, account, policy, now);
  return result.kind === "EXECUTION_INTENT" ? freeze({ kind: "EVALUATED_INTENT" as const, intent: result }) : refusal("EVALUATOR_REFUSED", result.message);
}

export type { CouncilRefusal };
