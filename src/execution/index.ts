import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import type { ExecutionIntent } from "../evaluator/index.js";
import type { MandateStore } from "../store/index.js";

export const ORDER_OUTCOMES = ["ACKNOWLEDGED", "REJECTED", "FAILED", "UNKNOWN", "PARTIALLY_FILLED", "FILLED", "CANCELLED"] as const;
export type OrderOutcome = (typeof ORDER_OUTCOMES)[number];
export type CancelState = "NONE" | "REQUESTED" | "UNKNOWN" | "CANCELLED";
export type BoundedIntent = ExecutionIntent & { readonly quantity?: number; readonly accountId?: string; readonly price: number };
export type AdapterResult = { readonly kind: "ACKNOWLEDGED" | "REJECTED" | "FAILED" | "TIMEOUT"; readonly message?: string; readonly clientOrderId?: string };
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
  load(id: string): StoredOrder | undefined { const value = this.orders.get(id); return value ? freeze(clone(value)) : undefined; }
  async save(order: StoredOrder): Promise<void> { if (this.fail) { this.fail = false; throw new Error("persistence failure"); } this.orders.set(order.clientOrderId, clone(order)); }
  failNextSave(): void { this.fail = true; }
  replay(): readonly StoredOrder[] { return [...this.orders.values()].map((value) => freeze(clone(value))); }
}
export interface OrderWriterHooks { readonly beforeAdapterCall?: () => void | Promise<void>; readonly afterAdapterCall?: () => void | Promise<void>; }

function clone<T>(value: T): T { return structuredClone(value); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; }
function fail(message: string): never { throw new TypeError(message); }
const INTENT_KEYS = ["kind", "mandateId", "workflowId", "symbol", "side", "method", "price", "notional", "executableEdgeBps", "marketStateVersion", "accountStateVersion", "quantity", "accountId"] as const;
const EVENT_KEYS = ["eventId", "status", "fillQuantity", "fillPrice"] as const;
const ADAPTER_RESULT_KEYS = ["kind", "message", "clientOrderId"] as const;
const CANONICAL_ARRAY_PROTO_KEYS = new Set<PropertyKey>([
  "length", "constructor", "at", "concat", "copyWithin", "fill", "find", "findIndex", "findLast", "findLastIndex", "lastIndexOf", "pop", "push", "reverse", "shift", "unshift", "slice", "sort", "splice", "includes", "indexOf", "join", "keys", "entries", "values", "forEach", "filter", "flat", "flatMap", "map", "every", "some", "reduce", "reduceRight", "toReversed", "toSorted", "toSpliced", "with", "toLocaleString", "toString", Symbol.iterator, Symbol.unscopables,
]);
type ArrayProtoDescriptorSpec = { enumerable: boolean; configurable: boolean; writable?: boolean; valueType: string; primitiveValue?: unknown; source?: string };
const CANONICAL_ARRAY_PROTO_SPECS = runInNewContext(`(() => {
  const proto = Array.prototype;
  const toSource = Function.prototype.toString;
  return Object.fromEntries(Reflect.ownKeys(proto).filter((key) => typeof key === "string").map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    return [key, {
      enumerable: descriptor.enumerable,
      configurable: descriptor.configurable,
      writable: "writable" in descriptor ? descriptor.writable : undefined,
      valueType: typeof descriptor.value,
      primitiveValue: descriptor.value !== null && (typeof descriptor.value !== "object" && typeof descriptor.value !== "function") ? descriptor.value : undefined,
      source: typeof descriptor.value === "function" ? toSource.call(descriptor.value) : undefined,
    }];
  }));
})()`) as Record<string, ArrayProtoDescriptorSpec>;
const CANONICAL_ARRAY_PROTO_SYMBOL_SPECS = runInNewContext(`(() => {
  const proto = Array.prototype;
  const toSource = Function.prototype.toString;
  return Object.fromEntries(Reflect.ownKeys(proto).filter((key) => typeof key === "symbol").map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    return [key.description, {
      enumerable: descriptor.enumerable,
      configurable: descriptor.configurable,
      writable: "writable" in descriptor ? descriptor.writable : undefined,
      valueType: typeof descriptor.value,
      source: typeof descriptor.value === "function" ? toSource.call(descriptor.value) : undefined,
    }];
  }));
})()`) as Record<string, ArrayProtoDescriptorSpec>;
const CANONICAL_OBJECT_PROTO = runInNewContext(`(() => {
  const p = Object.prototype; const s = Function.prototype.toString;
  return Reflect.ownKeys(p).map((k) => { const d = Object.getOwnPropertyDescriptor(p, k); return [typeof k === "symbol" ? "symbol:" + (k.description ?? "") : k, d.enumerable, d.configurable, "writable" in d ? d.writable : undefined, "value" in d ? typeof d.value : "accessor", typeof d.value === "function" ? s.call(d.value) : undefined]; });
})()`) as readonly [string, boolean, boolean, boolean | undefined, string, string | undefined][];
function canonicalObjectPrototype(): boolean {
  const actual = Reflect.ownKeys(Object.prototype);
  if (actual.length !== CANONICAL_OBJECT_PROTO.length) return false;
  return CANONICAL_OBJECT_PROTO.every(([name, enumerable, configurable, writable, type, source]) => {
    const key = name.startsWith("symbol:") ? actual.find((k) => typeof k === "symbol" && "symbol:" + (k.description ?? "") === name) : name;
    if (key === undefined) return false;
    const d = Object.getOwnPropertyDescriptor(Object.prototype, key);
    return !!d && d.enumerable === enumerable && d.configurable === configurable && ("writable" in d ? d.writable : undefined) === writable && ("value" in d ? typeof d.value : "accessor") === type && (source === undefined || ("value" in d && typeof d.value === "function" && Function.prototype.toString.call(d.value) === source));
  });
}
function canonicalArrayPrototype(): boolean {
  const actualKeys = Reflect.ownKeys(Array.prototype);
  if (actualKeys.length !== CANONICAL_ARRAY_PROTO_KEYS.size || actualKeys.some((key) => !CANONICAL_ARRAY_PROTO_KEYS.has(key))) return false;
  for (const key of actualKeys) {
    if (typeof key !== "string") {
      const expected = CANONICAL_ARRAY_PROTO_SYMBOL_SPECS[key.description ?? ""];
      const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, key);
      if (!expected || !descriptor || !("value" in descriptor) || descriptor.enumerable !== expected.enumerable || descriptor.configurable !== expected.configurable || descriptor.writable !== expected.writable || typeof descriptor.value !== expected.valueType || (expected.source !== undefined && Function.prototype.toString.call(descriptor.value) !== expected.source)) return false;
      continue;
    }
    const expected = CANONICAL_ARRAY_PROTO_SPECS[key];
    const actual = Object.getOwnPropertyDescriptor(Array.prototype, key);
    if (!expected || !actual || !("value" in actual) || actual.enumerable !== expected.enumerable || actual.configurable !== expected.configurable || actual.writable !== expected.writable || typeof actual.value !== expected.valueType) return false;
    if (expected.primitiveValue !== undefined && actual.value !== expected.primitiveValue) return false;
    if (expected.source !== undefined && Function.prototype.toString.call(actual.value) !== expected.source) return false;
  }
  return true;
}
function canonicalOwnData(value: object, allowed: readonly string[], required: readonly string[]): boolean {
  if (!canonicalObjectPrototype() || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.includes(key))) return false;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) return false;
  }
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function canonicalFrozenStringArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value) || !Object.isFrozen(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  if (!canonicalArrayPrototype()) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => key !== "length" && (typeof key !== "string" || !/^\d+$/.test(key)))) return false;
  if (keys.filter((key) => key !== "length").length !== value.length) return false;
  const length = Object.getOwnPropertyDescriptor(value, "length");
  if (!length || length.value !== value.length || length.enumerable || length.configurable || length.writable) return false;
  return [...value].every((entry, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    return typeof entry === "string" && entry.length > 0 && !!descriptor && descriptor.enumerable === true && descriptor.configurable === false && descriptor.writable === false && "value" in descriptor;
  });
}
function validAdapterResult(value: unknown, expectedClientOrderId?: string): value is AdapterResult {
  if (!value || typeof value !== "object" || !canonicalOwnData(value, ADAPTER_RESULT_KEYS, ["kind"])) return false;
  const result = value as Record<string, unknown>;
  return ["ACKNOWLEDGED", "REJECTED", "FAILED", "TIMEOUT"].includes(result.kind as string) && (result.message === undefined || typeof result.message === "string") && (result.clientOrderId === undefined || (typeof result.clientOrderId === "string" && (expectedClientOrderId === undefined || result.clientOrderId === expectedClientOrderId)));
}
function decimalParts(value: number): [bigint, number] {
  const text = value.toString().toLowerCase(); const [coefficient, exponentText] = text.split("e"); const exponent = exponentText ? Number(exponentText) : 0;
  const [whole, fraction = ""] = coefficient.split("."); return [BigInt(`${whole}${fraction}`), fraction.length - exponent];
}
function exactProductEquals(left: number, right: number, product: number): boolean {
  const [a, as] = decimalParts(left); const [b, bs] = decimalParts(right); const [c, cs] = decimalParts(product);
  const scale = Math.max(as + bs, cs); return a * b * 10n ** BigInt(scale - as - bs) === c * 10n ** BigInt(scale - cs);
}
export function isCanonicalBoundedIntent(value: unknown): value is BoundedIntent {
  if (!value || typeof value !== "object" || !Object.isFrozen(value) || !canonicalOwnData(value, INTENT_KEYS, INTENT_KEYS.slice(0, 11))) return false;
  const x = value as Record<string, unknown>;
  if (x.kind !== "EXECUTION_INTENT" || typeof x.mandateId !== "string" || x.mandateId.length === 0 || typeof x.workflowId !== "string" || x.workflowId.length === 0 || typeof x.symbol !== "string" || (x.side !== "BUY" && x.side !== "SELL") || (x.method !== "LIMIT" && x.method !== "MARKET")) return false;
  if (![x.price, x.notional, x.executableEdgeBps].every((n) => typeof n === "number" && Number.isFinite(n) && n > 0) || typeof x.marketStateVersion !== "bigint" || x.marketStateVersion < 0n || typeof x.accountStateVersion !== "bigint" || x.accountStateVersion < 0n) return false;
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
  if (x.status === "ACKNOWLEDGED" && (Object.prototype.hasOwnProperty.call(x, "fillQuantity") || Object.prototype.hasOwnProperty.call(x, "fillPrice"))) return false;
  if (x.status === "PARTIALLY_FILLED" && (x.fillQuantity === undefined || x.fillQuantity <= 0 || x.fillPrice === undefined)) return false;
  if (x.status === "FILLED" && (x.fillQuantity === undefined || x.fillQuantity <= 0 || x.fillPrice === undefined)) return false;
  if (["CANCELLED", "REJECTED", "FAILED"].includes(x.status as string) && (x.fillQuantity !== undefined && x.fillQuantity !== 0 || x.fillPrice !== undefined)) return false;
  return x.fillQuantity === undefined || x.fillQuantity === 0 || x.fillPrice !== undefined;
}
function deepFrozen(value: unknown, seen = new Set<object>()): boolean { if (!value || typeof value !== "object") return true; if (seen.has(value)) return true; seen.add(value); return Object.isFrozen(value) && Reflect.ownKeys(value).every((key) => { const descriptor = Object.getOwnPropertyDescriptor(value, key); return !!descriptor && "value" in descriptor && deepFrozen(descriptor.value, seen); }); }
function validStoredOrder(value: unknown): value is StoredOrder {
  if (!value || typeof value !== "object" || !Object.isFrozen(value) || !deepFrozen(value)) return false;
  const allowed = ["clientOrderId", "mandateId", "workflowId", "symbol", "side", "accountId", "method", "attempt", "notional", "executableEdgeBps", "marketStateVersion", "accountStateVersion", "quantity", "price", "outcome", "filledQuantity", "averagePrice", "acceptanceProvenance", "cancelState", "fillEventIds", "intent", "events", "filledNotional", "intentFingerprint"] as const;
  const required = allowed.filter((key) => key !== "accountId" && key !== "averagePrice");
  if (!canonicalOwnData(value, allowed, required)) return false;
  const x = value as Record<string, any>;
  if (![x.clientOrderId, x.mandateId, x.workflowId, x.symbol].every((v) => typeof v === "string" && v.length > 0)) return false;
  if (x.accountId !== undefined && typeof x.accountId !== "string") return false;
  if (x.side !== "BUY" && x.side !== "SELL") return false;
  if (x.method !== "LIMIT" && x.method !== "MARKET") return false;
  if (!Number.isSafeInteger(x.attempt) || x.attempt < 0) return false;
  if (![x.notional, x.executableEdgeBps, x.quantity, x.price].every((v) => typeof v === "number" && Number.isFinite(v) && v > 0)) return false;
  if (typeof x.marketStateVersion !== "bigint" || typeof x.accountStateVersion !== "bigint") return false;
  if (typeof x.filledQuantity !== "number" || !Number.isFinite(x.filledQuantity) || x.filledQuantity < 0 || x.filledQuantity > x.quantity) return false;
  if (x.averagePrice !== undefined && (typeof x.averagePrice !== "number" || !Number.isFinite(x.averagePrice) || x.averagePrice <= 0)) return false;
  if (x.filledQuantity > 0 && x.averagePrice === undefined) return false;
  if (!ORDER_OUTCOMES.includes(x.outcome) || !["ACKNOWLEDGED", "REJECTED", "FAILED", "TIMEOUT"].includes(x.acceptanceProvenance) || !["NONE", "REQUESTED", "UNKNOWN", "CANCELLED"].includes(x.cancelState)) return false;
  if (typeof x.filledNotional !== "number" || !Number.isFinite(x.filledNotional) || x.filledNotional < 0 || (x.filledQuantity === 0 && x.filledNotional !== 0)) return false;
  if (x.filledQuantity === 0 && x.averagePrice !== undefined) return false;
  if (x.filledQuantity > 0 && x.averagePrice === undefined) return false;
  if (x.filledQuantity > 0 && !exactProductEquals(x.averagePrice, x.filledQuantity, x.filledNotional)) return false;
  if (typeof x.intentFingerprint !== "string" || !isCanonicalBoundedIntent(x.intent)) return false;
  if (x.quantity !== quantityOf(x.intent)) return false;
  if (x.clientOrderId !== OrderWriter.clientOrderId(x.intent, x.attempt) || x.intentFingerprint !== intentFingerprint(x.intent)) return false;
  if (x.mandateId !== x.intent.mandateId || x.workflowId !== x.intent.workflowId || x.symbol !== x.intent.symbol || x.side !== x.intent.side || x.method !== x.intent.method || x.price !== x.intent.price || x.notional !== x.intent.notional || x.executableEdgeBps !== x.intent.executableEdgeBps || x.marketStateVersion !== x.intent.marketStateVersion || x.accountStateVersion !== x.intent.accountStateVersion || x.accountId !== x.intent.accountId) return false;
  if (!canonicalFrozenStringArray(x.fillEventIds) || !canonicalFrozenStringArray(x.events) || x.fillEventIds.length !== x.events.length || !x.fillEventIds.every((id: string, i: number) => id === x.events[i])) return false;
  if (x.outcome === "ACKNOWLEDGED" && (x.acceptanceProvenance !== "ACKNOWLEDGED" || x.filledQuantity !== 0)) return false;
  if (x.outcome === "UNKNOWN" && (x.acceptanceProvenance !== "TIMEOUT" || x.filledQuantity !== 0 || x.cancelState === "CANCELLED")) return false;
  if (x.outcome === "FILLED" && (x.acceptanceProvenance !== "ACKNOWLEDGED" || x.filledQuantity < x.quantity)) return false;
  if (x.outcome === "PARTIALLY_FILLED" && (x.acceptanceProvenance !== "ACKNOWLEDGED" || x.filledQuantity <= 0 || x.filledQuantity >= x.quantity)) return false;
  if ((x.outcome === "REJECTED" || x.outcome === "FAILED") && (x.acceptanceProvenance !== x.outcome || x.filledQuantity !== 0 || x.cancelState !== "NONE")) return false;
  if (x.outcome === "CANCELLED" && (x.cancelState !== "CANCELLED" || x.filledQuantity !== 0)) return false;
  if ((x.outcome === "CANCELLED") !== (x.cancelState === "CANCELLED") || (x.cancelState === "REQUESTED" && (x.outcome === "FILLED" || x.outcome === "CANCELLED")) || (x.cancelState === "UNKNOWN" && x.outcome !== "UNKNOWN")) return false;
  return true;
}
function quantityOf(intent: BoundedIntent): number { return intent.quantity ?? intent.notional / intent.price; }
function intentFingerprint(intent: BoundedIntent): string { return JSON.stringify(INTENT_KEYS.map((key) => [key, key in intent ? (typeof intent[key] === "bigint" ? `${intent[key]}n` : intent[key]) : "__ABSENT__"])); }
function outcomeAfter(current: OrderOutcome, next: OrderOutcome): OrderOutcome { const rank: Record<OrderOutcome, number> = { FAILED: 0, REJECTED: 0, UNKNOWN: 1, ACKNOWLEDGED: 2, PARTIALLY_FILLED: 3, FILLED: 4, CANCELLED: 4 }; if (current === "FILLED" || current === "CANCELLED") return current; return rank[next] >= rank[current] ? next : current; }

export class OrderWriter {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly mandates: Pick<MandateStore, "consumeForSubmission">, private readonly persistence: OrderPersistence, private readonly adapter: ExchangeAdapter, private readonly hooks: OrderWriterHooks = {}) {}
  static clientOrderId(intent: Pick<BoundedIntent, "mandateId" | "workflowId">, attempt: number): string { if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError("attempt must be a non-negative integer"); return `mb5-${createHash("sha256").update(JSON.stringify([intent.mandateId, intent.workflowId, attempt])).digest("hex").slice(0, 48)}`; }
  submit(intent: BoundedIntent, attempt: number): Promise<OrderReceipt> { return this.serial(() => this.submitOnce(intent, attempt)); }
  private async submitOnce(intent: BoundedIntent, attempt: number): Promise<OrderReceipt> {
    if (!isCanonicalBoundedIntent(intent)) fail("intent is invalid, untrusted, or mutable");
    const clientOrderId = OrderWriter.clientOrderId(intent, attempt); const prior = this.persistence.load(clientOrderId); const fingerprint = intentFingerprint(intent);
    if (prior) { if (!validStoredOrder(prior)) fail("persisted receipt is invalid"); if (prior.intentFingerprint !== fingerprint) fail("conflicting clientOrderId binding"); if (prior.outcome === "UNKNOWN") fail("unknown submission cannot be blindly retried"); return freeze(clone(prior)); }
    const quantity = quantityOf(intent); if (quantity * intent.price > intent.notional + 1e-9 || quantity <= 0) fail("quantity/price expands intent");
    const records = "history" in this.mandates && typeof (this.mandates as MandateStore).history === "function" ? (this.mandates as MandateStore).history() : [];
    const bound = records.find((record) => record.mandate.mandateId === intent.mandateId);
    if (bound && (bound.mandate.workflowId !== intent.workflowId || bound.mandate.symbol !== intent.symbol || bound.mandate.side !== intent.side || bound.mandate.execution.method !== intent.method || (intent.accountId !== undefined && bound.mandate.accountId !== intent.accountId) || intent.price < bound.mandate.entry.minPrice || intent.price > bound.mandate.entry.maxPrice)) fail("intent binding or mandate price bound violated");
    await this.mandates.consumeForSubmission(intent.mandateId, clientOrderId);
    let order: StoredOrder = freeze({ clientOrderId, mandateId: intent.mandateId, workflowId: intent.workflowId, symbol: intent.symbol, side: intent.side, accountId: intent.accountId, method: intent.method, attempt, notional: intent.notional, executableEdgeBps: intent.executableEdgeBps, marketStateVersion: intent.marketStateVersion, accountStateVersion: intent.accountStateVersion, quantity, price: intent.price, outcome: "UNKNOWN", filledQuantity: 0, acceptanceProvenance: "TIMEOUT", cancelState: "NONE", fillEventIds: [], intent: clone(intent), intentFingerprint: fingerprint, events: [], filledNotional: 0 });
    await this.persistence.save(order); await this.hooks.beforeAdapterCall?.();
    let result: AdapterResult; try { result = await this.adapter.submit(intent, clientOrderId); } catch { result = { kind: "TIMEOUT" }; }
    await this.hooks.afterAdapterCall?.();
    if (!validAdapterResult(result, clientOrderId)) fail("adapter result is invalid");
    order = { ...order, outcome: result.kind === "TIMEOUT" ? "UNKNOWN" : result.kind, acceptanceProvenance: result.kind, events: [] }; await this.persistence.save(freeze(order)); return freeze(clone(order));
  }
  reconcile(clientOrderId: string, event: FillEvent): Promise<OrderReceipt> { return this.serial(() => this.reconcileOnce(clientOrderId, event)); }
  readReceipt(clientOrderId: string): OrderReceipt | undefined {
    const order = this.persistence.load(clientOrderId);
    if (!order || !validStoredOrder(order) || !this.writerOwns(order, clientOrderId)) return undefined;
    return freeze(clone(order)) as OrderReceipt;
  }
  private async reconcileOnce(clientOrderId: string, event: FillEvent): Promise<OrderReceipt> {
    const prior = this.persistence.load(clientOrderId); if (!prior) fail("unknown writer-owned clientOrderId"); if (!validStoredOrder(prior)) fail("persisted receipt is invalid");
    if (!validEvent(event)) fail("invalid reconciliation event");
    if (prior.events.includes(event.eventId)) return freeze(clone(prior));
    if (prior.cancelState === "CANCELLED") fail("terminal cancellation cannot accept fills");
    if (prior.cancelState === "UNKNOWN") fail("uncertain cancellation cannot accept fills");
    if (prior.outcome === "REJECTED" || prior.outcome === "FAILED") fail("terminal submission outcome cannot accept fills");
    if (["CANCELLED", "REJECTED", "FAILED"].includes(event.status) && (prior.outcome !== "ACKNOWLEDGED" || prior.filledQuantity !== 0 || prior.cancelState !== "NONE")) fail("terminal reconciliation event is incoherent");
    const q = event.fillQuantity ?? 0; const p = event.fillPrice; if (q > prior.quantity || (event.status === "FILLED" && q < prior.quantity)) fail("invalid fill");
    let filled = prior.filledQuantity; let filledNotional = prior.filledNotional || (prior.averagePrice ?? 0) * prior.filledQuantity;
    if (q > filled) { filled = q; if (!p) fail("invalid fill"); filledNotional += (q - prior.filledQuantity) * p; }
    const average = filled ? filledNotional / filled : prior.averagePrice;
    const requested: OrderOutcome = filled >= prior.quantity ? "FILLED" : event.status === "PARTIALLY_FILLED" || filled > 0 ? "PARTIALLY_FILLED" : event.status;
    const next: StoredOrder = freeze({ ...prior, outcome: outcomeAfter(prior.outcome, requested), acceptanceProvenance: event.status === "REJECTED" || event.status === "FAILED" ? event.status : prior.acceptanceProvenance, cancelState: event.status === "CANCELLED" ? "CANCELLED" : prior.cancelState, filledQuantity: filled, ...(average === undefined ? {} : { averagePrice: average }), fillEventIds: [...prior.fillEventIds, event.eventId], events: [...prior.events, event.eventId], filledNotional });
    await this.persistence.save(next); return freeze(clone(next));
  }
  cancel(clientOrderId: string): Promise<OrderReceipt> { return this.serial(() => this.cancelOnce(clientOrderId)); }
  private async cancelOnce(clientOrderId: string): Promise<OrderReceipt> {
    const prior = this.persistence.load(clientOrderId);
    if (!prior || !validStoredOrder(prior) || !this.writerOwns(prior, clientOrderId)) fail("can only cancel writer-owned clientOrderId");
    if (prior.cancelState === "UNKNOWN") fail("unknown cancellation cannot be retried");
    if (prior.cancelState === "REQUESTED") fail("pending cancellation cannot be retried");
    if (prior.outcome === "FILLED" || prior.outcome === "CANCELLED") return freeze(clone(prior));
    if (prior.filledQuantity > 0) fail("filled order cannot be cancelled");
    if (prior.outcome === "REJECTED" || prior.outcome === "FAILED") fail("terminal submission outcome cannot be cancelled");
    if (!this.adapter.cancel) fail("adapter does not support cancellation");
    const requested = freeze({ ...prior, cancelState: "REQUESTED" as const });
    await this.persistence.save(requested);
    try {
      await this.adapter.cancel(clientOrderId);
    } catch {
      const unknown = freeze({ ...requested, outcome: "UNKNOWN" as const, acceptanceProvenance: "TIMEOUT" as const, cancelState: "UNKNOWN" as const });
      await this.persistence.save(unknown);
      return freeze(clone(unknown));
    }
    const next = freeze({ ...requested, outcome: "CANCELLED" as const, cancelState: "CANCELLED" as const });
    await this.persistence.save(next); return freeze(clone(next));
  }
  private writerOwns(order: StoredOrder, clientOrderId: string): boolean {
    if (order.clientOrderId !== clientOrderId || order.clientOrderId !== OrderWriter.clientOrderId(order.intent, order.attempt)) return false;
    const persistedIntent = freeze(clone(order.intent));
    if (!isCanonicalBoundedIntent(persistedIntent) || order.intentFingerprint !== intentFingerprint(persistedIntent)) return false;
    return order.mandateId === persistedIntent.mandateId && order.workflowId === persistedIntent.workflowId && order.cancelState !== undefined;
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> { const result = this.tail.then(operation); this.tail = result.then(() => undefined, () => undefined); return result; }
}
export type { ExecutionIntent };
