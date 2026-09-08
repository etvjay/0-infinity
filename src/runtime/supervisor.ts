import type { ExecutionMandate } from "../domain/index.js";
import { evaluateMandate, type EvaluationPolicy, type EvaluationWorkflow, type ExecutionIntent, type LiveAccountState, type LiveMarketState, type StateEnvelope } from "../evaluator/index.js";
import { OrderWriter, type FillEvent, type OrderReceipt } from "../execution/index.js";
import { createMandateRuntime, transition, type MandateRuntime } from "./mandateRuntime.js";
import type { MandateTransitionEvent } from "./mandateEvents.js";

export type CapabilityMode = "SHADOW" | "LOCAL_REPLAY";
export type WorkflowStatus = "READY" | "TRIGGERED" | "VALIDATING" | "SUBMITTING" | "ACKNOWLEDGED" | "PARTIALLY_FILLED" | "FILLED" | "REFUSED" | "REJECTED" | "FAILED" | "UNKNOWN" | "RECOVERY_BLOCKED";
export type WorkflowMarketState = StateEnvelope<LiveMarketState>;
export type WorkflowAccountState = StateEnvelope<LiveAccountState>;

export interface WorkflowReceipt {
  readonly kind: "WORKFLOW_RECEIPT"; readonly workflowId: string; readonly mandateId: string; readonly version: number;
  readonly status: WorkflowStatus; readonly runtime: MandateRuntime; readonly authorityStatus: EvaluationWorkflow["authorityStatus"];
  readonly orderOutcome?: OrderReceipt["outcome"]; readonly clientOrderId?: string; readonly refusalCode?: string;
}
export interface WorkflowRecord extends WorkflowReceipt { readonly mandate: ExecutionMandate; readonly market: WorkflowMarketState; readonly account: WorkflowAccountState; readonly evaluationPolicy: EvaluationPolicy; }
export interface WorkflowPersistence { load(workflowId: string): WorkflowRecord | undefined; save(record: WorkflowRecord): Promise<void>; }
export class MemoryWorkflowPersistence implements WorkflowPersistence {
  private readonly records = new Map<string, WorkflowRecord>();
  load(id: string): WorkflowRecord | undefined { const r = this.records.get(id); return r ? frozen(structuredClone(r)) : undefined; }
  async save(record: WorkflowRecord): Promise<void> { this.records.set(record.workflowId, frozen(structuredClone(record))); }
}
export interface RuntimeSupervisorOptions { readonly mode: CapabilityMode; readonly writer: OrderWriter; readonly persistence: WorkflowPersistence; readonly clock: () => number; }
export interface StartWorkflowInput { readonly workflowId: string; readonly mandate: ExecutionMandate; readonly market: WorkflowMarketState; readonly account: WorkflowAccountState; readonly evaluationPolicy: EvaluationPolicy; readonly authorityStatus: EvaluationWorkflow["authorityStatus"]; }

function frozen<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as object as Record<string, unknown>)) frozen(child); } return value; }
function transitionOrThrow(runtime: MandateRuntime, event: MandateTransitionEvent, at: number, reason: string): MandateRuntime { const result = transition(runtime, event, { at, reason }); if (!result.ok) throw new Error(result.rejection.message); return result.machine; }
function statusFor(outcome: OrderReceipt["outcome"]): WorkflowStatus { return outcome === "ACKNOWLEDGED" ? "ACKNOWLEDGED" : outcome === "PARTIALLY_FILLED" ? "PARTIALLY_FILLED" : outcome === "FILLED" ? "FILLED" : outcome === "REJECTED" ? "REJECTED" : outcome === "FAILED" ? "FAILED" : outcome === "CANCELLED" ? "FAILED" : "UNKNOWN"; }
function eventFor(outcome: OrderReceipt["outcome"]): MandateTransitionEvent | undefined { return outcome === "ACKNOWLEDGED" ? { type: "ACKNOWLEDGE" } : outcome === "PARTIALLY_FILLED" ? { type: "PARTIAL_FILL" } : outcome === "FILLED" ? { type: "FILL" } : outcome === "REJECTED" ? { type: "FAIL" } : outcome === "FAILED" ? { type: "FAIL" } : outcome === "UNKNOWN" ? { type: "SUBMIT_UNKNOWN" } : undefined; }

/** Coordinator for deterministic local/replay execution. It never discovers live capabilities. */
export class RuntimeSupervisor {
  private readonly mode: CapabilityMode; private readonly writer: OrderWriter; private readonly persistence: WorkflowPersistence; private readonly clock: () => number;
  constructor(options: RuntimeSupervisorOptions) {
    if (options.mode !== "SHADOW" && options.mode !== "LOCAL_REPLAY") throw new TypeError("explicit SHADOW or LOCAL_REPLAY mode is required");
    if (!options.writer || !options.persistence || !options.clock) throw new TypeError("explicit writer, persistence, and clock are required");
    this.mode = options.mode; this.writer = options.writer; this.persistence = options.persistence; this.clock = options.clock;
  }
  async start(input: StartWorkflowInput): Promise<WorkflowReceipt> {
    if (this.mode !== "SHADOW" && this.mode !== "LOCAL_REPLAY") throw new Error("unsupported capability mode");
    const prior = this.persistence.load(input.workflowId);
    if (prior) { if (prior.mandate.mandateId !== input.mandate.mandateId) throw new Error("conflicting mandate for workflow"); return frozen({ ...prior }); }
    const initial: WorkflowRecord = frozen({ kind: "WORKFLOW_RECEIPT", workflowId: input.workflowId, mandateId: input.mandate.mandateId, version: 0, status: "READY", runtime: createMandateRuntime({ expiresAt: input.mandate.expiresAt }), authorityStatus: input.authorityStatus, mandate: structuredClone(input.mandate), market: structuredClone(input.market), account: structuredClone(input.account), evaluationPolicy: structuredClone(input.evaluationPolicy) });
    await this.persistence.save(initial);
    return this.trigger(input.workflowId);
  }
  async trigger(workflowId: string): Promise<WorkflowReceipt> {
    const record = this.require(workflowId);
    if (record.status !== "READY") return frozen({ ...record });
    const now = this.clock();
    let runtime = transitionOrThrow(record.runtime, { type: "TRIGGER" }, now, "trigger accepted");
    runtime = transitionOrThrow(runtime, { type: "VALIDATE" }, now, "validation started");
    const result = evaluateMandate({ workflowId, mandateId: record.mandateId, authorityStatus: record.authorityStatus }, record.mandate, runtime, record.market, record.account, record.evaluationPolicy, now);
    if (result.kind === "EXECUTION_REFUSAL") {
      runtime = transitionOrThrow(runtime, { type: "REFUSE" }, now, result.code);
      return this.saveReceipt(record, { status: "REFUSED", runtime, refusalCode: result.code });
    }
    runtime = transitionOrThrow(runtime, { type: "SUBMIT" }, now, "local/replay submission");
    const submitted = await this.writer.submit(result as ExecutionIntent, 0);
    const event = eventFor(submitted.outcome); if (event) runtime = transitionOrThrow(runtime, event, now, `writer outcome ${submitted.outcome}`);
    return this.saveReceipt(record, { status: statusFor(submitted.outcome), runtime, orderOutcome: submitted.outcome, clientOrderId: submitted.clientOrderId });
  }
  async restore(workflowId: string): Promise<WorkflowReceipt> { const record = this.persistence.load(workflowId); if (!record || record.workflowId !== workflowId || record.mandateId !== record.mandate.mandateId) throw new Error("RECOVERY_BLOCKED: incomplete or conflicting workflow persistence"); return frozen({ ...record }); }
  async reconcile(workflowId: string, event: FillEvent): Promise<WorkflowReceipt> {
    const record = this.require(workflowId); if (!record.clientOrderId) throw new Error("RECOVERY_BLOCKED: no persisted clientOrderId");
    const order = await this.writer.reconcile(record.clientOrderId, event); let runtime = record.runtime;
    const target = eventFor(order.outcome);
    // M-B1 deliberately keeps UNKNOWN terminal. Recovery updates the separately
    // persisted order outcome, but never re-enters the mandate lifecycle.
    if (target && record.runtime.state !== "UNKNOWN" && !["ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED"].includes(record.status)) runtime = transitionOrThrow(runtime, target, this.clock(), `reconciled ${event.eventId}`);
    return this.saveReceipt(record, { status: statusFor(order.outcome), runtime, orderOutcome: order.outcome, clientOrderId: order.clientOrderId });
  }
  private require(id: string): WorkflowRecord { const record = this.persistence.load(id); if (!record) throw new Error("RECOVERY_BLOCKED: workflow is not persisted"); return record; }
  private async saveReceipt(record: WorkflowRecord, changes: Partial<WorkflowReceipt>): Promise<WorkflowReceipt> {
    const next = frozen({ ...record, ...changes, version: record.version + 1 }); await this.persistence.save(next); return frozen({ ...next });
  }
}
