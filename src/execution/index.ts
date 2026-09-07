import { createHash } from "node:crypto";
import type { ExecutionIntent } from "../evaluator/index.js";
import type { MandateStore } from "../store/index.js";

export const ORDER_OUTCOMES = ["ACKNOWLEDGED", "REJECTED", "FAILED", "UNKNOWN", "PARTIALLY_FILLED", "FILLED", "CANCELLED"] as const;
export type OrderOutcome = (typeof ORDER_OUTCOMES)[number];
export type CancelState = "NONE" | "REQUESTED" | "UNKNOWN" | "CANCELLED";
export type BoundedIntent = ExecutionIntent & { readonly quantity?: number; readonly accountId?: string; readonly price: number };
export type AdapterResult = { readonly kind: "ACKNOWLEDGED" | "REJECTED" | "FAILED" | "TIMEOUT"; readonly message?: string };
export interface ExchangeAdapter { submit(intent: BoundedIntent, clientOrderId: string): Promise<AdapterResult>; cancel?: (clientOrderId: string) => Promise<void>; }
export interface FillEvent { readonly eventId: string; readonly status: "ACKNOWLEDGED" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED" | "FAILED"; readonly fillQuantity?: number; readonly fillPrice?: number; }
export interface OrderReceipt {
  readonly clientOrderId: string; readonly mandateId: string; readonly workflowId: string; readonly symbol: string; readonly side: BoundedIntent["side"];
  readonly accountId?: string; readonly method: BoundedIntent["method"]; readonly attempt: number; readonly notional: number; readonly executableEdgeBps: number;
  readonly marketStateVersion: bigint; readonly accountStateVersion: bigint; readonly quantity: number; readonly price: number;
  readonly outcome: OrderOutcome; readonly filledQuantity: number; readonly averagePrice?: number; readonly acceptanceProvenance: AdapterResult["kind"];
  readonly cancelState: CancelState;
  readonly fillEventIds: readonly string[]; readonly intent: BoundedIntent;
}
interface StoredOrder extends OrderReceipt { readonly events: readonly string[]; readonly filledNotional: number; readonly intentFingerprint: string; }
export interface OrderPersistence { load(clientOrderId: string): StoredOrder | undefined; save(order: StoredOrder): Promise<void>; }
export class MemoryOrderPersistence implements OrderPersistence {
  private readonly orders = new Map<string, StoredOrder>(); private fail = false;
  load(id: string): StoredOrder | undefined { const value = this.orders.get(id); return value ? clone(value) : undefined; }
  async save(order: StoredOrder): Promise<void> { if (this.fail) { this.fail = false; throw new Error("persistence failure"); } this.orders.set(order.clientOrderId, clone(order)); }
  failNextSave(): void { this.fail = true; }
  replay(): readonly StoredOrder[] { return [...this.orders.values()].map(clone); }
}
export interface OrderWriterHooks { readonly beforeAdapterCall?: () => void | Promise<void>; readonly afterAdapterCall?: () => void | Promise<void>; }

function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; }
function fail(message: string): never { throw new TypeError(message); }
const INTENT_KEYS = ["kind", "mandateId", "workflowId", "symbol", "side", "method", "price", "notional", "executableEdgeBps", "marketStateVersion", "accountStateVersion", "quantity", "accountId"] as const;
const EVENT_KEYS = ["eventId", "status", "fillQuantity", "fillPrice"] as const;
function canonicalOwnData(value: object, allowed: readonly string[], required: readonly string[]): boolean {
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.includes(key))) return false;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) return false;
  }
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function validIntent(value: unknown): value is BoundedIntent {
  if (!value || typeof value !== "object" || !Object.isFrozen(value) || !canonicalOwnData(value, INTENT_KEYS, INTENT_KEYS.slice(0, 11))) return false;
  const x = value as Record<string, unknown>;
  if (x.kind !== "EXECUTION_INTENT" || typeof x.mandateId !== "string" || typeof x.workflowId !== "string" || typeof x.symbol !== "string" || (x.side !== "BUY" && x.side !== "SELL") || (x.method !== "LIMIT" && x.method !== "MARKET")) return false;
  if (![x.price, x.notional, x.executableEdgeBps].every((n) => typeof n === "number" && Number.isFinite(n) && n > 0) || typeof x.marketStateVersion !== "bigint" || typeof x.accountStateVersion !== "bigint") return false;
  if (x.quantity !== undefined && (typeof x.quantity !== "number" || !Number.isFinite(x.quantity) || x.quantity <= 0)) return false;
  if (x.accountId !== undefined && typeof x.accountId !== "string") return false;
  return deepFrozen(value);
}
function validEvent(value: unknown): value is FillEvent {
  if (!value || typeof value !== "object" || !Object.isFrozen(value) || !canonicalOwnData(value, EVENT_KEYS, ["eventId", "status"]) || !deepFrozen(value)) return false;
  const x = value as Record<string, unknown>;
  if (typeof x.eventId !== "string" || x.eventId.length === 0 || !["ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED", "FAILED"].includes(x.status as string)) return false;
  if (x.fillQuantity !== undefined && (typeof x.fillQuantity !== "number" || !Number.isFinite(x.fillQuantity) || x.fillQuantity < 0)) return false;
  if (x.fillPrice !== undefined && (typeof x.fillPrice !== "number" || !Number.isFinite(x.fillPrice) || x.fillPrice <= 0)) return false;
  if (x.status === "FILLED" && (x.fillQuantity === undefined || x.fillQuantity <= 0)) return false;
  return x.fillQuantity === undefined || x.fillQuantity === 0 || x.fillPrice !== undefined;
}
function deepFrozen(value: unknown, seen = new Set<object>()): boolean { if (!value || typeof value !== "object") return true; if (seen.has(value)) return true; seen.add(value); return Object.isFrozen(value) && Reflect.ownKeys(value).every((key) => { const descriptor = Object.getOwnPropertyDescriptor(value, key); return !!descriptor && "value" in descriptor && deepFrozen(descriptor.value, seen); }); }
function quantityOf(intent: BoundedIntent): number { return intent.quantity ?? intent.notional / intent.price; }
function intentFingerprint(intent: BoundedIntent): string { return JSON.stringify(INTENT_KEYS.map((key) => [key, key in intent ? (typeof intent[key] === "bigint" ? `${intent[key]}n` : intent[key]) : "__ABSENT__"])); }
function outcomeAfter(current: OrderOutcome, next: OrderOutcome): OrderOutcome { const rank: Record<OrderOutcome, number> = { FAILED: 0, REJECTED: 0, UNKNOWN: 1, ACKNOWLEDGED: 2, PARTIALLY_FILLED: 3, FILLED: 4, CANCELLED: 4 }; if (current === "FILLED" || current === "CANCELLED") return current; return rank[next] >= rank[current] ? next : current; }

export class OrderWriter {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly mandates: Pick<MandateStore, "consumeForSubmission">, private readonly persistence: OrderPersistence, private readonly adapter: ExchangeAdapter, private readonly hooks: OrderWriterHooks = {}) {}
  static clientOrderId(intent: Pick<BoundedIntent, "mandateId" | "workflowId">, attempt: number): string { if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError("attempt must be a non-negative integer"); return `mb5-${createHash("sha256").update(JSON.stringify([intent.mandateId, intent.workflowId, attempt])).digest("hex").slice(0, 48)}`; }
  submit(intent: BoundedIntent, attempt: number): Promise<OrderReceipt> { return this.serial(() => this.submitOnce(intent, attempt)); }
  private async submitOnce(intent: BoundedIntent, attempt: number): Promise<OrderReceipt> {
    if (!validIntent(intent)) fail("intent is invalid, untrusted, or mutable");
    const clientOrderId = OrderWriter.clientOrderId(intent, attempt); const prior = this.persistence.load(clientOrderId); const fingerprint = intentFingerprint(intent);
    if (prior) { if ((prior as StoredOrder & { intentFingerprint?: string }).intentFingerprint !== fingerprint && intentFingerprint(prior.intent) !== fingerprint) fail("conflicting clientOrderId binding"); if (prior.outcome === "UNKNOWN") fail("unknown submission cannot be blindly retried"); return freeze(clone(prior)); }
    const quantity = quantityOf(intent); if (quantity * intent.price > intent.notional + 1e-9 || quantity <= 0) fail("quantity/price expands intent");
    const records = "history" in this.mandates && typeof (this.mandates as MandateStore).history === "function" ? (this.mandates as MandateStore).history() : [];
    const bound = records.find((record) => record.mandate.mandateId === intent.mandateId);
    if (bound && (bound.mandate.workflowId !== intent.workflowId || bound.mandate.symbol !== intent.symbol || bound.mandate.side !== intent.side || bound.mandate.execution.method !== intent.method || (intent.accountId !== undefined && bound.mandate.accountId !== intent.accountId) || intent.price < bound.mandate.entry.minPrice || intent.price > bound.mandate.entry.maxPrice)) fail("intent binding or mandate price bound violated");
    await this.mandates.consumeForSubmission(intent.mandateId, clientOrderId);
    let order: StoredOrder = freeze({ clientOrderId, mandateId: intent.mandateId, workflowId: intent.workflowId, symbol: intent.symbol, side: intent.side, accountId: intent.accountId, method: intent.method, attempt, notional: intent.notional, executableEdgeBps: intent.executableEdgeBps, marketStateVersion: intent.marketStateVersion, accountStateVersion: intent.accountStateVersion, quantity, price: intent.price, outcome: "UNKNOWN", filledQuantity: 0, acceptanceProvenance: "TIMEOUT", cancelState: "NONE", fillEventIds: [], intent: clone(intent), intentFingerprint: fingerprint, events: [], filledNotional: 0 });
    await this.persistence.save(order); await this.hooks.beforeAdapterCall?.();
    let result: AdapterResult; try { result = await this.adapter.submit(intent, clientOrderId); } catch { result = { kind: "TIMEOUT" }; }
    await this.hooks.afterAdapterCall?.(); order = { ...order, outcome: result.kind === "TIMEOUT" ? "UNKNOWN" : result.kind, acceptanceProvenance: result.kind, events: [] }; await this.persistence.save(freeze(order)); return freeze(clone(order));
  }
  reconcile(clientOrderId: string, event: FillEvent): Promise<OrderReceipt> { return this.serial(() => this.reconcileOnce(clientOrderId, event)); }
  private async reconcileOnce(clientOrderId: string, event: FillEvent): Promise<OrderReceipt> {
    const prior = this.persistence.load(clientOrderId); if (!prior) fail("unknown writer-owned clientOrderId");
    if (!validEvent(event)) fail("invalid reconciliation event");
    if (prior.events.includes(event.eventId)) return freeze(clone(prior));
    const q = event.fillQuantity ?? 0; const p = event.fillPrice; if (q > prior.quantity || (event.status === "FILLED" && q < prior.quantity)) fail("invalid fill");
    let filled = prior.filledQuantity; let filledNotional = prior.filledNotional || (prior.averagePrice ?? 0) * prior.filledQuantity;
    if (q > filled) { filled = q; if (!p) fail("invalid fill"); filledNotional += (q - prior.filledQuantity) * p; }
    const average = filled ? filledNotional / filled : prior.averagePrice;
    const requested: OrderOutcome = filled >= prior.quantity ? "FILLED" : event.status === "PARTIALLY_FILLED" || filled > 0 ? "PARTIALLY_FILLED" : event.status;
    const next: StoredOrder = freeze({ ...prior, outcome: outcomeAfter(prior.outcome, requested), filledQuantity: filled, ...(average === undefined ? {} : { averagePrice: average }), fillEventIds: [...prior.fillEventIds, event.eventId], events: [...prior.events, event.eventId], filledNotional });
    await this.persistence.save(next); return freeze(clone(next));
  }
  cancel(clientOrderId: string): Promise<OrderReceipt> { return this.serial(() => this.cancelOnce(clientOrderId)); }
  private async cancelOnce(clientOrderId: string): Promise<OrderReceipt> {
    const prior = this.persistence.load(clientOrderId);
    if (!prior || !this.writerOwns(prior, clientOrderId)) fail("can only cancel writer-owned clientOrderId");
    if (prior.cancelState === "UNKNOWN") fail("unknown cancellation cannot be retried");
    if (prior.cancelState === "REQUESTED") fail("pending cancellation cannot be retried");
    if (prior.outcome === "FILLED" || prior.outcome === "CANCELLED") return freeze(clone(prior));
    if (!this.adapter.cancel) fail("adapter does not support cancellation");
    const requested = freeze({ ...prior, cancelState: "REQUESTED" as const });
    await this.persistence.save(requested);
    try {
      await this.adapter.cancel(clientOrderId);
    } catch {
      const unknown = freeze({ ...requested, outcome: "UNKNOWN" as const, cancelState: "UNKNOWN" as const });
      await this.persistence.save(unknown);
      return freeze(clone(unknown));
    }
    const next = freeze({ ...requested, outcome: "CANCELLED" as const, cancelState: "CANCELLED" as const });
    await this.persistence.save(next); return freeze(clone(next));
  }
  private writerOwns(order: StoredOrder, clientOrderId: string): boolean {
    if (order.clientOrderId !== clientOrderId || order.clientOrderId !== OrderWriter.clientOrderId(order.intent, order.attempt)) return false;
    const persistedIntent = freeze(clone(order.intent));
    if (!validIntent(persistedIntent) || order.intentFingerprint !== intentFingerprint(persistedIntent)) return false;
    return order.mandateId === persistedIntent.mandateId && order.workflowId === persistedIntent.workflowId && order.cancelState !== undefined;
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> { const result = this.tail.then(operation); this.tail = result.then(() => undefined, () => undefined); return result; }
}
export type { ExecutionIntent };
