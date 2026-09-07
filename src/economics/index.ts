import type { UsdMFuturesOrderBookView } from "../market/index.js";

export type EconomicSide = "BUY" | "SELL";
export type PartialFillPolicy = "REJECT" | "ALLOW";
export type DecimalString = string;

export interface EconomicPolicy {
  readonly maxAuthorizedQuantity: DecimalString;
  readonly maxNotional: DecimalString;
  readonly minPrice: DecimalString;
  readonly maxPrice: DecimalString;
  readonly maxSpreadBps: DecimalString;
  readonly maxSlippageBps: DecimalString;
  readonly maxFeeBps: DecimalString;
  readonly maxFundingCostBps: DecimalString;
  readonly minExecutableEdgeBps: DecimalString;
}
export interface ExplicitFee { readonly bps: DecimalString; }
export type FundingAssessment =
  | { readonly status: "ASSESSED"; readonly costBps: DecimalString; readonly horizon: string }
  | { readonly status: "UNASSESSED"; readonly reason: string };
export interface ExecutionEconomicsInput {
  readonly book: UsdMFuturesOrderBookView;
  readonly side: EconomicSide;
  readonly requestedQuantity: DecimalString;
  readonly expectedMoveBps: DecimalString;
  readonly fee: ExplicitFee;
  readonly funding: FundingAssessment;
  readonly policy: EconomicPolicy;
  readonly partialFill: PartialFillPolicy;
}
export interface ExecutionFill { readonly price: DecimalString; readonly quantity: DecimalString; readonly notional: DecimalString; }
export interface ExecutionAssessment {
  readonly kind: "ASSESSMENT";
  readonly side: EconomicSide;
  readonly requestedQuantity: DecimalString;
  readonly executableQuantity: DecimalString;
  readonly bestExecutableReference: DecimalString;
  readonly vwap: DecimalString;
  readonly worstExecutionPrice: DecimalString;
  readonly limitPrice: DecimalString;
  readonly totalCost: DecimalString;
  readonly spreadBps: DecimalString;
  readonly slippageBps: DecimalString;
  readonly feeBps: DecimalString;
  readonly fundingCostBps: DecimalString;
  readonly executableEdgeBps: DecimalString;
  readonly fills: readonly ExecutionFill[];
}
export type RefusalCode = "MALFORMED_INPUT" | "BOOK_NOT_SYNCED" | "CROSSED_BOOK" | "EMPTY_SIDE" | "INSUFFICIENT_DEPTH" | "FUNDING_NOT_ASSESSED" | "UNAUTHORIZED_QUANTITY" | "PRICE_OUT_OF_BOUNDS" | "NOTIONAL_LIMIT" | "COST_LIMIT" | "EDGE_TOO_LOW";
export interface ExecutionRefusal { readonly kind: "REFUSAL"; readonly code: RefusalCode; readonly message: string; }
export type ExecutionEconomicsResult = ExecutionAssessment | ExecutionRefusal;

type R = { n: bigint; d: bigint };
const POW10 = (n: number): bigint => 10n ** BigInt(n);
function gcd(a: bigint, b: bigint): bigint { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }
function rat(n: bigint, d = 1n): R { if (d === 0n) throw new Error("zero denominator"); if (d < 0n) [n, d] = [-n, -d]; const g = gcd(n, d); return { n: n / g, d: d / g }; }
const add = (a: R, b: R): R => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: R, b: R): R => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: R, b: R): R => rat(a.n * b.n, a.d * b.d);
const div = (a: R, b: R): R => rat(a.n * b.d, a.d * b.n);
const cmp = (a: R, b: R): number => (a.n * b.d > b.n * a.d ? 1 : a.n * b.d < b.n * a.d ? -1 : 0);
const zero = (a: R): boolean => a.n === 0n;
const positive = (a: R): boolean => a.n > 0n;
const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
function parse(value: unknown): R {
  if (typeof value !== "string" || value.length === 0 || value.length > 1000 || !decimalPattern.test(value)) throw new Error("invalid decimal");
  const [whole, fraction = ""] = value.split(".");
  return rat(BigInt(whole + fraction), POW10(fraction.length));
}
const signedDecimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
function parseSigned(value: unknown): R {
  if (typeof value !== "string" || value.length === 0 || value.length > 1000 || !signedDecimalPattern.test(value)) throw new Error("invalid signed decimal");
  const negative = value.startsWith("-"); const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  return rat((negative ? -1n : 1n) * BigInt(whole + fraction), POW10(fraction.length));
}
function render(x: R): string {
  const negative = x.n < 0n; const n = negative ? -x.n : x.n;
  const integer = n / x.d; let remainder = n % x.d;
  if (remainder === 0n) return `${negative ? "-" : ""}${integer}`;
  let out = "";
  for (let i = 0; i < 18 && remainder !== 0n; i++) { remainder *= 10n; out += (remainder / x.d).toString(); remainder %= x.d; }
  return `${negative ? "-" : ""}${integer}.${out.replace(/0+$/, "")}`;
}
function freezeDeep<T>(value: T, seen = new Set<object>()): T {
  if (value && typeof value === "object" && !seen.has(value as object)) { seen.add(value as object); Object.freeze(value); for (const child of Object.values(value as object as Record<string, unknown>)) freezeDeep(child, seen); }
  return value;
}
function refusal(code: RefusalCode, message: string): ExecutionRefusal { return Object.freeze({ kind: "REFUSAL", code, message }); }
function fieldR(value: unknown): R { return parse(value); }
function frozenTree(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value as Record<string, unknown>).every((child) => frozenTree(child, seen));
}
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
function shape(value: unknown, allowed: readonly string[], required: readonly string[] = []): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as object;
  const allowedKeys = new Set(allowed);
  for (const key of Reflect.ownKeys(object)) {
    if (typeof key !== "string" || !allowedKeys.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !("value" in descriptor)) return false;
  }
  for (let prototype = Object.getPrototypeOf(object); prototype && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
    for (const key of Reflect.ownKeys(prototype)) {
      if (typeof key !== "string" || !allowedKeys.has(key) || !own(object, key)) return false;
    }
  }
  return required.every((key) => own(object, key));
}
function validLevel(level: unknown): level is { readonly price: string; readonly quantity: string } {
  if (!shape(level, ["price", "quantity"], ["price", "quantity"])) return false;
  try { const x = level as { price: unknown; quantity: unknown }; return positive(parse(x.price)) && positive(parse(x.quantity)); } catch { return false; }
}

const CANONICAL_ARRAY_PROTOTYPE_STRING_KEYS = new Set([
  "length", "constructor", "at", "concat", "copyWithin", "fill", "find", "findIndex", "findLast", "findLastIndex",
  "lastIndexOf", "pop", "push", "reverse", "shift", "unshift", "slice", "sort", "splice", "includes", "indexOf",
  "join", "keys", "entries", "values", "forEach", "filter", "flat", "flatMap", "map", "every", "some", "reduce",
  "reduceRight", "toReversed", "toSorted", "toSpliced", "with", "toLocaleString", "toString",
]);
const CANONICAL_ARRAY_PROTOTYPE_SYMBOL_KEYS = new Set([Symbol.iterator, Symbol.unscopables]);
function canonicalArrayPrototype(): boolean {
  for (const key of Reflect.ownKeys(Array.prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, key);
    if (!descriptor || descriptor.enumerable || !("value" in descriptor)) return false;
    if (typeof key === "string") {
      if (!CANONICAL_ARRAY_PROTOTYPE_STRING_KEYS.has(key)) return false;
      if (key === "length") {
        if (descriptor.value !== 0 || descriptor.configurable || !descriptor.writable) return false;
      } else if (!descriptor.configurable || !descriptor.writable || typeof descriptor.value !== "function") return false;
    } else {
      if (!CANONICAL_ARRAY_PROTOTYPE_SYMBOL_KEYS.has(key) || !descriptor.configurable || typeof descriptor.value !== (key === Symbol.iterator ? "function" : "object")) return false;
      if (key === Symbol.unscopables && descriptor.writable) return false;
    }
  }
  return true;
}
function arrayShape(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || !canonicalArrayPrototype()) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= 2 ** 32 - 1) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return false;
  }
  return true;
}
function validLevelContainer(value: unknown): value is readonly unknown[] {
  return arrayShape(value) && value.every(validLevel);
}

/** Pure local economics assessment. It does not validate/consume a mandate or submit an order. */
export function assessExecutionEconomics(input: ExecutionEconomicsInput): ExecutionEconomicsResult {
  try {
    if (!shape(input, ["book", "side", "requestedQuantity", "expectedMoveBps", "fee", "funding", "policy", "partialFill"], ["book", "side", "requestedQuantity", "expectedMoveBps", "fee", "funding", "policy", "partialFill"]) || (input.side !== "BUY" && input.side !== "SELL")) return refusal("MALFORMED_INPUT", "side/input is malformed");
    if (!shape(input.fee, ["bps"], ["bps"]) || !shape(input.policy, ["maxAuthorizedQuantity", "maxNotional", "minPrice", "maxPrice", "maxSpreadBps", "maxSlippageBps", "maxFeeBps", "maxFundingCostBps", "minExecutableEdgeBps"], ["maxAuthorizedQuantity", "maxNotional", "minPrice", "maxPrice", "maxSpreadBps", "maxSlippageBps", "maxFeeBps", "maxFundingCostBps", "minExecutableEdgeBps"])) return refusal("MALFORMED_INPUT", "economics structure is malformed");
    if (!shape(input.funding, ["status", "costBps", "horizon", "reason"], ["status"])) return refusal("MALFORMED_INPUT", "funding structure is malformed");
    const requested = parse(input.requestedQuantity), expected = parseSigned(input.expectedMoveBps), fee = parse(input.fee.bps);
    if (!positive(requested) || !positive(parse(input.requestedQuantity)) || !positive(parse(input.policy.maxAuthorizedQuantity))) return refusal("MALFORMED_INPUT", "quantity must be positive");
    if (!zero(fee) && !positive(fee)) return refusal("MALFORMED_INPUT", "fee is malformed");
    if (input.partialFill !== "REJECT" && input.partialFill !== "ALLOW") return refusal("MALFORMED_INPUT", "partialFill is malformed");
    if (input.funding?.status !== "ASSESSED") return refusal("FUNDING_NOT_ASSESSED", "explicit assessed funding is required");
    if (typeof input.funding.horizon !== "string" || input.funding.horizon.trim() === "") return refusal("MALFORMED_INPUT", "funding horizon is required");
    const funding = parse(input.funding.costBps);
    if (!positive(funding) && !zero(funding)) return refusal("MALFORMED_INPUT", "funding cost is malformed");
    const policy = input.policy;
    const maxQty = parse(policy.maxAuthorizedQuantity), maxNotional = parse(policy.maxNotional);
    const minPrice = parse(policy.minPrice), maxPrice = parse(policy.maxPrice);
    const maxSpread = parse(policy.maxSpreadBps), maxSlip = parse(policy.maxSlippageBps), maxFee = parse(policy.maxFeeBps), maxFunding = parse(policy.maxFundingCostBps), minEdge = parse(policy.minExecutableEdgeBps);
    if ([maxQty, maxNotional, minPrice, maxPrice].some((x) => !positive(x)) || [maxSpread, maxSlip, maxFee, maxFunding, minEdge].some((x) => !positive(x) && !zero(x)) || cmp(minPrice, maxPrice) > 0) return refusal("MALFORMED_INPUT", "policy bounds are malformed");
    if (cmp(requested, maxQty) > 0) return refusal("UNAUTHORIZED_QUANTITY", "requested quantity exceeds authorized maximum");
    const book = input.book;
    if (!shape(book, ["version", "symbol", "status", "lastUpdateId", "bids", "asks", "bestAsk", "bestBid"], ["version", "symbol", "status", "lastUpdateId", "bids", "asks"])) return refusal("MALFORMED_INPUT", "book structure is malformed");
    if (!frozenTree(book)) return refusal("MALFORMED_INPUT", "trusted book view must be deeply immutable");
    if (!book || book.status !== "SYNCED") return refusal("BOOK_NOT_SYNCED", "book must be SYNCED");
    if (book.version !== 1 || (book.symbol !== "BTCUSDT" && book.symbol !== "ETHUSDT") || typeof book.lastUpdateId !== "bigint" || book.lastUpdateId < 0n) return refusal("MALFORMED_INPUT", "book identity/version is malformed");
    if (!arrayShape(book.bids) || !arrayShape(book.asks) || !validLevelContainer(book.bids) || !validLevelContainer(book.asks) || (book.bestBid !== undefined && !validLevel(book.bestBid)) || (book.bestAsk !== undefined && !validLevel(book.bestAsk))) return refusal("MALFORMED_INPUT", "book sides or best quotes are malformed");
    const bidsByPrice = new Map<string, { price: R; quantity: R }>();
    for (const level of book.bids) { const price = parse(level.price), quantity = parse(level.quantity), key = `${price.n}/${price.d}`; const prior = bidsByPrice.get(key); bidsByPrice.set(key, { price, quantity: add(prior?.quantity ?? rat(0n), quantity) }); }
    const asksByPrice = new Map<string, { price: R; quantity: R }>();
    for (const level of book.asks) { const price = parse(level.price), quantity = parse(level.quantity), key = `${price.n}/${price.d}`; const prior = asksByPrice.get(key); asksByPrice.set(key, { price, quantity: add(prior?.quantity ?? rat(0n), quantity) }); }
    const bids = [...bidsByPrice.values()].sort((a, b) => cmp(b.price, a.price));
    const asks = [...asksByPrice.values()].sort((a, b) => cmp(a.price, b.price));
    if (!bids.length || !asks.length) return refusal("EMPTY_SIDE", "both executable sides must be non-empty");
    if (cmp(bids[0].price, asks[0].price) >= 0) return refusal("CROSSED_BOOK", "book is crossed");
    const levels = input.side === "BUY" ? asks : bids;
    const bestBid = bids[0].price, bestAsk = asks[0].price, best = levels[0].price;
    let remaining = requested, executable = rat(0n), cost = rat(0n); const fills: ExecutionFill[] = [];
    for (const level of levels) {
      if (zero(remaining)) break;
      const quantity = cmp(level.quantity, remaining) < 0 ? level.quantity : remaining;
      const notional = mul(level.price, quantity); executable = add(executable, quantity); cost = add(cost, notional); remaining = sub(remaining, quantity);
      fills.push({ price: render(level.price), quantity: render(quantity), notional: render(notional) });
    }
    if (!zero(remaining) && input.partialFill === "REJECT") return refusal("INSUFFICIENT_DEPTH", "requested quantity exceeds visible depth");
    if (zero(executable)) return refusal("EMPTY_SIDE", "no positive executable depth");
    const vwap = div(cost, executable), worst = fills[fills.length - 1].price ? parse(fills[fills.length - 1].price) : best;
    const midpoint = div(add(bestBid, bestAsk), rat(2n));
    const spread = mul(div(sub(bestAsk, bestBid), midpoint), rat(10000n));
    const adverse = input.side === "BUY" ? sub(vwap, best) : sub(best, vwap);
    const slippage = mul(div(adverse, best), rat(10000n));
    const edge = sub(sub(sub(sub(expected, spread), slippage), fee), funding);
    if (cmp(worst, minPrice) < 0 || cmp(worst, maxPrice) > 0) return refusal("PRICE_OUT_OF_BOUNDS", "worst execution price is outside policy bounds");
    if (cmp(cost, maxNotional) > 0) return refusal("NOTIONAL_LIMIT", "total cost exceeds policy notional bound");
    if (cmp(spread, maxSpread) > 0 || cmp(slippage, maxSlip) > 0 || cmp(fee, maxFee) > 0 || cmp(funding, maxFunding) > 0) return refusal("COST_LIMIT", "execution cost exceeds policy bound");
    if (cmp(edge, minEdge) < 0) return refusal("EDGE_TOO_LOW", "executable edge is below policy floor");
    return freezeDeep({ kind: "ASSESSMENT", side: input.side, requestedQuantity: render(requested), executableQuantity: render(executable), bestExecutableReference: render(best), vwap: render(vwap), worstExecutionPrice: render(worst), limitPrice: render(worst), totalCost: render(cost), spreadBps: render(spread), slippageBps: render(slippage), feeBps: render(fee), fundingCostBps: render(funding), executableEdgeBps: render(edge), fills: Object.freeze(fills) });
  } catch { return refusal("MALFORMED_INPUT", "economics input is malformed"); }
}
