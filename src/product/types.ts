export const ROLE_NAMES = ["ADVOCATE", "OPPOSER", "MARKET_ANALYST", "COUNCIL"] as const;
export type RoleName = typeof ROLE_NAMES[number];
export const ARTIFACT_KINDS = ["ADVOCATE", "OPPOSE", "MARKET_ACCOUNT"] as const;
export type ArtifactKind = typeof ARTIFACT_KINDS[number];
export type WorkflowStatus = "CREATED" | "COMPLETE" | "REASONING_INCOMPLETE" | "REFUSE";
export type Capability = "reasoning" | "shadow" | "readiness" | "events";
export type IndependenceClass = "builtin" | "injected" | "external";
export interface RoleInvocation { readonly workflowId: string; readonly invocationId: string; readonly role: RoleName; readonly opportunity: Readonly<Record<string, unknown>>; readonly timeoutMs: number; }
export interface RoleArtifact { readonly workflowId: string; readonly invocationId: string; readonly role: RoleName; readonly kind: ArtifactKind; readonly payload: Readonly<Record<string, unknown>>; readonly artifactHash: string; readonly producedAt: number; readonly independence: IndependenceClass; }
export interface RoleAdapter { readonly name: string; readonly independence: IndependenceClass; invoke(input: RoleInvocation): Promise<RoleArtifact>; }
export interface ReasoningStack { readonly name: string; readonly version: string; readonly bindings: Readonly<Record<RoleName, RoleAdapter>>; readonly capabilities: readonly Capability[]; }
export interface WorkflowRecord { readonly workflowId: string; readonly stackName: string; readonly stackVersion: string; readonly createdAt: number; readonly status: WorkflowStatus; readonly opportunity: Readonly<Record<string, unknown>>; readonly composition: readonly { readonly role: RoleName; readonly adapter: string; readonly independence: IndependenceClass }[]; readonly thesis?: unknown; readonly receipt?: unknown; readonly error?: string; }
export interface WorkflowResult { readonly workflow: WorkflowRecord; readonly thesis?: unknown; }
export class ProductAccessError extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = "ProductAccessError"; } }
export class ValidationError extends ProductAccessError { constructor(message: string) { super("VALIDATION_ERROR", message); } }
export class ReplayConflictError extends ProductAccessError { constructor(message: string) { super("REPLAY_CONFLICT", message); } }
export class RefusalError extends ProductAccessError { constructor(message: string) { super("REFUSE", message); } }
export function freezeDeep<T>(value: T, seen = new Set<object>()): T { if (value && typeof value === "object" && !seen.has(value as object)) { seen.add(value as object); Object.freeze(value); for (const key of Reflect.ownKeys(value as object)) { const d = Object.getOwnPropertyDescriptor(value as object, key); if (d && "value" in d) freezeDeep(d.value, seen); } } return value; }
export function cloneFrozen<T>(value: T): T { return freezeDeep(structuredClone(value)); }
export function ownPlain(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).every(k => typeof k === "string" && !!Object.getOwnPropertyDescriptor(value, k) && "value" in Object.getOwnPropertyDescriptor(value, k)! && Object.getOwnPropertyDescriptor(value, k)!.enumerable === true); }
export function exactOwnPlain(value: unknown, allowed: readonly string[], required: readonly string[] = allowed): value is Record<string, unknown> { return ownPlain(value) && Reflect.ownKeys(value).length <= allowed.length && Object.keys(value).every(k => allowed.includes(k)) && required.every(k => Object.prototype.hasOwnProperty.call(value, k)); }
