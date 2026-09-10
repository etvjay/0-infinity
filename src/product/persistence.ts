import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { verifyReasoningReceipt } from "../reasoning/receipt.js";
import { verifyMandate } from "../mandate/verify.js";
import type { WorkflowRecord } from "./types.js";

export interface ProductProjectionSnapshot {
  readonly version: 1;
  readonly workflows: Readonly<Record<string, WorkflowRecord>>;
}
export interface ProductProjectionPersistence {
  load(): ProductProjectionSnapshot;
  save(snapshot: ProductProjectionSnapshot): void;
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const clone = <T>(value: T): T => structuredClone(value);
function invalid(message: string): never { throw new TypeError(`invalid persisted product projections: ${message}`); }
function plainTree(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype)) return false;
  if (Array.isArray(value)) return Object.keys(value).length === value.length && value.every((child) => plainTree(child, seen));
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && Object.prototype.propertyIsEnumerable.call(value, key) && plainTree((value as Record<string, unknown>)[key], seen));
}
function validWorkflow(value: unknown, key: string): value is WorkflowRecord {
  if (!isObject(value) || !plainTree(value)) return false;
  const x = value as Record<string, unknown>;
  const allowed = new Set(["workflowId", "stackName", "stackVersion", "createdAt", "status", "opportunity", "composition", "reasoningProfile", "reasoningBudget", "reasoningTiming", "thesis", "receipt", "mandate", "execution", "error"]);
  if (Reflect.ownKeys(x).some((k) => typeof k !== "string" || !allowed.has(k)) || !text(x.workflowId) || x.workflowId !== key || !text(x.stackName) || !text(x.stackVersion) || !finite(x.createdAt) || x.createdAt < 0 || !["CREATED", "COMPLETE", "REASONING_INCOMPLETE", "REFUSE"].includes(String(x.status)) || !isObject(x.opportunity) || !Array.isArray(x.composition)) return false;
  if (x.reasoningProfile !== undefined && !["FAST", "STANDARD", "DEEP"].includes(String(x.reasoningProfile))) return false;
  if (x.reasoningBudget !== undefined) {
    if (!isObject(x.reasoningBudget) || !["FAST", "STANDARD", "DEEP"].includes(String(x.reasoningBudget.profile)) || !finite(x.reasoningBudget.roleTimeoutMs) || !finite(x.reasoningBudget.councilTimeoutMs) || !finite(x.reasoningBudget.workflowDeadlineMs) || x.reasoningBudget.roleTimeoutMs <= 0 || x.reasoningBudget.councilTimeoutMs <= 0 || x.reasoningBudget.workflowDeadlineMs <= 0 || (x.reasoningBudget.maxEvidenceAgeMs !== undefined && (!finite(x.reasoningBudget.maxEvidenceAgeMs) || x.reasoningBudget.maxEvidenceAgeMs < 0))) return false;
  }
  if (x.reasoningTiming !== undefined && !isObject(x.reasoningTiming)) return false;
  if (x.reasoningProfile !== undefined && x.reasoningBudget !== undefined && x.reasoningProfile !== x.reasoningBudget.profile) return false;
  if (x.status === "COMPLETE") {
    if (!isObject(x.thesis) || !isObject(x.receipt) || !verifyReasoningReceipt(x.receipt)) return false;
    const thesis = x.thesis as Record<string, unknown>;
    if (thesis.thesisId !== x.workflowId || thesis.reasoning && (!isObject(thesis.reasoning) || thesis.reasoning.reasoningReceiptHash !== (x.receipt as Record<string, unknown>).canonicalSha256)) return false;
    const receipt = x.receipt as Record<string, unknown>;
    if (receipt.workflowId !== x.workflowId) return false;
  } else if (x.thesis !== undefined || x.receipt !== undefined) return false;
  if (x.mandate !== undefined && !verifyMandate(x.mandate, { workflowId: x.workflowId }).valid) return false;
  if (x.execution !== undefined) {
    if (!isObject(x.execution)) return false;
    const execution = x.execution as Record<string, unknown>;
    if (!text(execution.workflowId) || execution.workflowId !== x.workflowId || !text(execution.mandateId) || !isObject(execution.runtime) || !["READY", "TRIGGERED", "VALIDATING", "SUBMITTING", "ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED", "REFUSED", "REJECTED", "FAILED", "UNKNOWN", "CANCELLED"].includes(String(execution.status))) return false;
  }
  if (x.error !== undefined && !text(x.error)) return false;
  return true;
}
function validateSnapshot(value: unknown): ProductProjectionSnapshot {
  if (!isObject(value) || value.version !== 1 || !isObject(value.workflows) || !plainTree(value)) invalid("snapshot schema");
  const workflows: Record<string, WorkflowRecord> = {};
  for (const [key, workflow] of Object.entries(value.workflows)) {
    if (!validWorkflow(workflow, key)) invalid(`workflow ${key}`);
    workflows[key] = clone(workflow);
  }
  return { version: 1, workflows };
}

export class MemoryProductProjectionPersistence implements ProductProjectionPersistence {
  private snapshot: ProductProjectionSnapshot;
  constructor(snapshot: ProductProjectionSnapshot = { version: 1, workflows: {} }) { this.snapshot = validateSnapshot(snapshot); }
  load(): ProductProjectionSnapshot { return clone(this.snapshot); }
  save(snapshot: ProductProjectionSnapshot): void { this.snapshot = validateSnapshot(snapshot); }
}

export class JsonFileProductProjectionPersistence implements ProductProjectionPersistence {
  constructor(private readonly path: string) {}
  load(): ProductProjectionSnapshot {
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8"), (_key, value: unknown) => typeof value === "string" && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value);
      return validateSnapshot(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, workflows: {} };
      if (error instanceof TypeError) throw error;
      invalid("file is unreadable or corrupt");
    }
  }
  save(snapshot: ProductProjectionSnapshot): void {
    const validated = validateSnapshot(snapshot);
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    const text = JSON.stringify(validated, (_key, value: unknown) => typeof value === "bigint" ? `${value}n` : value);
    writeFileSync(temporary, text, "utf8");
    const fd = openSync(temporary, "r");
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, this.path);
  }
}
