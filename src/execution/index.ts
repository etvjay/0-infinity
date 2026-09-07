import { createHash } from "node:crypto";
import type { ExecutionIntent } from "../evaluator/index.js";
import type { MandateStore } from "../store/index.js";

export const ORDER_OUTCOMES = ["ACKNOWLEDGED", "REJECTED", "FAILED", "UNKNOWN", "PARTIALLY_FILLED", "FILLED", "CANCELLED"] as const;
export type OrderOutcome = (typeof ORDER_OUTCOMES)[number];
export type BoundedIntent = ExecutionIntent & { readonly quantity?: number; readonly accountId?: string; readonly price: number };
export type AdapterResult = { readonly kind: "ACKNOWLEDGED" | "REJECTED" | "FAILED" | "TIMEOUT"; readonly message?: string };
export interface ExchangeAdapter { submit(intent: BoundedIntent, clientOrderId: string): Promise<AdapterResult>; cancel?: (clientOrderId: string) => Promise<void>; }
export interface FillEvent { readonly eventId: string; readonly status: "ACKNOWLEDGED" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED" | "FAILED"; readonly fillQuantity?: number; readonly fillPrice?: number; }
export interface OrderReceipt {
  readonly clientOrderId: string; readonly mandateId: string; readonly workflowId: string; readonly symbol: string; readonly side: BoundedIntent["side"];
  readonly quantity: number; readonly price: number; readonly outcome: OrderOutcome; readonly filledQuantity: number; readonly averagePrice?: number; readonly intent: BoundedIntent;
}
interface StoredOrder extends OrderReceipt { readonly events: readonly string[]; }
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
function validIntent(value: unknown): value is BoundedIntent {
  if (!value || typeof value !== "object" || !Object.isFrozen(value)) return false;
  const x = value as Record<string, unknown>;
  const required = ["kind", "mandateId", "workflowId", "symbol", "side", "method", "price", "notional", "executableEdgeBps", "marketStateVersion", "accountStateVersion"];
  if (Reflect.ownKeys(value).some((k) => typeof k !== "string" || !required.includes(k) && k !== "quantity" && k !== "accountId") || required.some((k) => !Object.prototype.hasOwnProperty.call(x, k))) return false;
  if (x.kind !== "EXECUTION_INTENT" || typeof x.mandateId !== "string" || typeof x.workflowId !== "string" || typeof x.symbol !== "string" || (x.side !== "BUY" && x.side !== "SELL") || (x.method !== "LIMIT" && x.method !== "MARKET")) return false;
  if (![x.price, x.notional, x.executableEdgeBps].every((n) => typeof n === "number" && Number.isFinite(n) && n > 0) || typeof x.marketStateVersion !== "bigint" || typeof x.accountStateVersion !== "bigint") return false;
  if (x.quantity !== undefined && (typeof x.quantity !== "number" || !Number.isFinite(x.quantity) || x.quantity <= 0)) return false;
  return deepFrozen(value);
}
function deepFrozen(value: unknown, seen = new Set<object>()): boolean { if (!value || typeof value !== "object") return true; if (seen.has(value)) return true; seen.add(value); return Object.isFrozen(value) && Reflect.ownKeys(value).every((k) => { const d = Object.getOwnPropertyDescriptor(value, k); return !!d && "value" in d && deepFrozen(d.value, seen); }); }
function quantityOf(intent: BoundedIntent): number { return intent.quantity ?? intent.notional / intent.price; }
function outcomeAfter(current: OrderOutcome, next: OrderOutcome): OrderOutcome {
  const rank: Record<OrderOutcome, number> = { FAILED: 0, REJECTED: 0, UNKNOWN: 1, ACKNOWLEDGED: 2, PARTIALLY_FILLED: 3, FILLED: 4, CANCELLED: 4 };
  if (current === "FILLED" || current === "CANCELLED") return current;
  return rank[next] >= rank[current] ? next : current;
}

export class OrderWriter {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly mandates: Pick<MandateStore, "consumeForSubmission">, private readonly persistence: OrderPersistence, private readonly adapter: ExchangeAdapter, private readonly hooks: OrderWriterHooks = {}) {}
  static clientOrderId(intent: Pick<BoundedIntent, "mandateId" | "workflowId">, attempt: number): string {
    if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError("attempt must be a non-negative integer");
    return `mb5-${createHash("sha256").update(JSON.stringify([intent.mandateId, intent.workflowId, attempt])).digest("hex").slice(0, 48)}`;
  }
  submit(intent: BoundedIntent, attempt: number): Promise<OrderReceipt> { return this.serial(() => this.submitOnce(intent, attempt)); }
  private async submitOnce(intent: BoundedIntent, attempt: number): Promise<OrderReceipt> {
    if (!validIntent(intent)) fail("intent is invalid, untrusted, or mutable");
    const clientOrderId = OrderWriter.clientOrderId(intent, attempt); const prior = this.persistence.load(clientOrderId);
    if (prior) { if (prior.mandateId !== intent.mandateId || prior.workflowId !== intent.workflowId || prior.symbol !== intent.symbol || prior.side !== intent.side || prior.quantity !== quantityOf(intent) || prior.price !== intent.price) fail("conflicting clientOrderId binding"); if (prior.outcome === "UNKNOWN") fail("unknown submission cannot be blindly retried"); return freeze(clone(prior)); }
    const quantity = quantityOf(intent); if (quantity * intent.price > intent.notional + 1e-9 || quantity <= 0) fail("quantity/price expands intent");
    const records = "history" in this.mandates && typeof (this.mandates as MandateStore).history === "function" ? (this.mandates as MandateStore).history() : [];
    const bound = records.find((record) => record.mandate.mandateId === intent.mandateId);
    if (bound && (bound.mandate.workflowId !== intent.workflowId || bound.mandate.symbol !== intent.symbol || bound.mandate.side !== intent.side || bound.mandate.execution.method !== intent.method || (intent.accountId !== undefined && bound.mandate.accountId !== intent.accountId) || intent.price < bound.mandate.entry.minPrice || intent.price > bound.mandate.entry.maxPrice)) fail("intent binding or mandate price bound violated");
    await this.mandates.consumeForSubmission(intent.mandateId, clientOrderId);
    let order: StoredOrder = freeze({ clientOrderId, mandateId: intent.mandateId, workflowId: intent.workflowId, symbol: intent.symbol, side: intent.side, quantity, price: intent.price, outcome: "UNKNOWN", filledQuantity: 0, intent: clone(intent), events: [] });
    await this.persistence.save(order);
    await this.hooks.beforeAdapterCall?.();
    let result: AdapterResult;
    try { result = await this.adapter.submit(intent, clientOrderId); } catch { result = { kind: "TIMEOUT" }; }
    await this.hooks.afterAdapterCall?.();
    order = { ...order, outcome: result.kind === "TIMEOUT" ? "UNKNOWN" : result.kind, events: [] };
    await this.persistence.save(freeze(order));
    return freeze(clone(order));
  }
  reconcile(clientOrderId: string, event: FillEvent): Promise<OrderReceipt> { return this.serial(() => this.reconcileOnce(clientOrderId, event)); }
  private async reconcileOnce(clientOrderId: string, event: FillEvent): Promise<OrderReceipt> {
    const prior = this.persistence.load(clientOrderId); if (!prior) fail("unknown writer-owned clientOrderId");
    if (prior.events.includes(event.eventId)) return freeze(clone(prior));
    if (!["ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED", "FAILED"].includes(event.status)) fail("invalid reconciliation event");
    const q = event.fillQuantity ?? 0; const p = event.fillPrice;
    if (!Number.isFinite(q) || q < 0 || q + prior.filledQuantity > prior.quantity || (q > 0 && (!Number.isFinite(p) || (p as number) <= 0))) fail("invalid fill");
    const filled = prior.filledQuantity + q; const average = q ? ((prior.averagePrice ?? 0) * prior.filledQuantity + (p as number) * q) / filled : prior.averagePrice;
    const requested: OrderOutcome = filled >= prior.quantity ? "FILLED" : event.status === "PARTIALLY_FILLED" || filled > 0 ? "PARTIALLY_FILLED" : event.status;
    const next: StoredOrder = freeze({ ...prior, outcome: outcomeAfter(prior.outcome, requested), filledQuantity: filled, ...(average === undefined ? {} : { averagePrice: average }), events: [...prior.events, event.eventId] });
    await this.persistence.save(next); return freeze(clone(next));
  }
  cancel(clientOrderId: string): Promise<OrderReceipt> { return this.serial(() => this.cancelOnce(clientOrderId)); }
  private async cancelOnce(clientOrderId: string): Promise<OrderReceipt> { const prior = this.persistence.load(clientOrderId); if (!prior) fail("can only cancel writer-owned clientOrderId"); if (prior.outcome === "FILLED" || prior.outcome === "CANCELLED") return freeze(clone(prior)); if (!this.adapter.cancel) fail("adapter does not support cancellation"); await this.adapter.cancel(clientOrderId); const next = freeze({ ...prior, outcome: "CANCELLED" as const }); await this.persistence.save(next); return freeze(clone(next)); }
  private serial<T>(operation: () => Promise<T>): Promise<T> { const result = this.tail.then(operation); this.tail = result.then(() => undefined, () => undefined); return result; }
}
export type { ExecutionIntent };
