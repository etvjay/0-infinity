export type UsdMFuturesAccountAsset = "USDT";
export type UsdMFuturesAccountSymbol = "BTCUSDT" | "ETHUSDT";

export interface UsdMFuturesAccountBalance {
  readonly asset: UsdMFuturesAccountAsset;
  readonly walletBalance: string;
  readonly crossWalletBalance: string;
  readonly balanceChange: string;
}

export interface UsdMFuturesAccountPosition {
  readonly symbol: UsdMFuturesAccountSymbol;
  readonly positionAmount: string;
  readonly entryPrice: string;
  readonly realizedPnl: string;
  readonly unrealizedPnl: string;
  readonly marginType: "cross" | "isolated";
  readonly isolatedWallet: string;
  readonly positionSide: "BOTH" | "LONG" | "SHORT";
}

export interface UsdMFuturesAccountState {
  readonly version: bigint;
  readonly venue: "BINANCE";
  readonly instrument: "USD_M_FUTURES";
  readonly productFamily: "USD_M_FUTURES_UM";
  readonly observedAt: number;
  readonly receivedAt: number;
  readonly balances: readonly UsdMFuturesAccountBalance[];
  readonly positions: readonly UsdMFuturesAccountPosition[];
  readonly source: { readonly productFamily: "USD_M_FUTURES_UM"; readonly event: "ACCOUNT_UPDATE" };
}

const symbols = new Set<UsdMFuturesAccountSymbol>(["BTCUSDT", "ETHUSDT"]);
const integerText = /^(?:0|[1-9]\d*)$/;
const decimalText = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const own = (v: object, key: string): boolean => Object.prototype.hasOwnProperty.call(v, key);
const fail = (field: string, message: string): never => { throw new RangeError(`${field} ${message}`); };

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}
function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(field, "must be an object");
  return value as Record<string, unknown>;
}
function decimal(value: unknown, field: string, signed = false): string {
  if (typeof value !== "string" || value.length > 1000 || !decimalText.test(value) || (!signed && value.startsWith("-"))) fail(field, "must be a decimal string");
  const text = value as string;
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const normalized = `${whole.replace(/^0+(?=\d)/, "")}.${fraction.replace(/0+$/, "")}`.replace(/\.0*$/, "");
  return negative && normalized !== "0" ? `-${normalized}` : normalized;
}
function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail(field, "must be a non-negative safe integer");
  return value as number;
}
function version(value: unknown): bigint {
  if (typeof value === "bigint") { if (value < 0n) fail("u", "must be non-negative"); return value; }
  if (typeof value === "string" && integerText.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  fail("u", "must be an exact non-negative decimal integer");
  throw new RangeError("unreachable");
}
const topLevelFields = new Set(["e", "E", "T", "productFamily", "a", "u"]);
const accountFields = new Set(["m", "B", "P"]);
const balanceFields = new Set(["a", "wb", "cw", "bc"]);
const positionFields = new Set(["s", "pa", "ep", "cr", "up", "mt", "iw", "ps"]);

function allowlist(value: Record<string, unknown>, fields: Set<string>, field: string, required: readonly string[] = []): void {
  for (const key of Object.keys(value)) if (!fields.has(key)) fail(`${field}.${key}`, "is unsupported");
  for (let prototype = Object.getPrototypeOf(value); prototype && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
    for (const key of Object.keys(prototype)) {
      if (!fields.has(key)) fail(`${field}.${key}`, "is unsupported");
      fail(`${field}.${key}`, "must be an own property");
    }
  }
  for (const key of required) if (!own(value, key)) fail(`${field}.${key}`, "is required as an own property");
}
function quotedEnd(raw: string, start: number): number {
  for (let i = start + 1; i < raw.length; i += 1) {
    if (raw[i] === "\\") { i += 1; continue; }
    if (raw[i] === '"') return i + 1;
  }
  return -1;
}
function valueEnd(raw: string, start: number): number {
  let nesting = 0;
  for (let i = start; i < raw.length; i += 1) {
    if (raw[i] === '"') { const end = quotedEnd(raw, i); if (end < 0) return -1; i = end - 1; continue; }
    if (raw[i] === "{" || raw[i] === "[") nesting += 1;
    else if (raw[i] === "}" || raw[i] === "]") { if (nesting === 0) return i; nesting -= 1; }
    else if (raw[i] === "," && nesting === 0) return i;
  }
  return raw.length;
}
function topLevelValueTokens(raw: string, wanted: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (/\s/.test(raw[i] ?? "")) i += 1;
  if (raw[i++] !== "{") return tokens;
  while (i < raw.length) {
    while (/\s/.test(raw[i] ?? "")) i += 1;
    if (raw[i] === "}") break;
    if (raw[i] !== '"') return tokens;
    const keyEnd = quotedEnd(raw, i); if (keyEnd < 0) return tokens;
    let key: unknown;
    try { key = JSON.parse(raw.slice(i, keyEnd)); } catch { return tokens; }
    i = keyEnd;
    while (/\s/.test(raw[i] ?? "")) i += 1;
    if (raw[i++] !== ":") return tokens;
    while (/\s/.test(raw[i] ?? "")) i += 1;
    const end = valueEnd(raw, i); if (end < 0) return tokens;
    if (key === wanted) tokens.push(raw.slice(i, end).trim());
    i = end;
    while (/\s/.test(raw[i] ?? "")) i += 1;
    if (raw[i] === ",") i += 1;
  }
  return tokens;
}
function parsed(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const value = object(JSON.parse(raw), "payload");
      const versionTokens = topLevelValueTokens(raw, "u");
      if (versionTokens.length !== 1) fail("u", versionTokens.length === 0 ? "is required at top level" : "is duplicated or ambiguous");
      const token = versionTokens[0];
      value.u = token.startsWith('"') ? JSON.parse(token) : token;
      allowlist(value, topLevelFields, "payload", ["e", "E", "T", "productFamily", "a", "u"]);
      return value;
    } catch (error) { if (error instanceof RangeError) throw error; fail("payload", "must be valid JSON"); }
  }
  const value = object(raw, "payload");
  allowlist(value, topLevelFields, "payload", ["e", "E", "T", "productFamily", "a", "u"]);
  return value;
}
function asset(value: unknown): UsdMFuturesAccountAsset {
  if (value !== "USDT") fail("asset", "is not supported");
  return value as UsdMFuturesAccountAsset;
}
function positionSide(value: unknown): UsdMFuturesAccountPosition["positionSide"] {
  if (value !== "BOTH" && value !== "LONG" && value !== "SHORT") fail("position side", "is invalid");
  return value as UsdMFuturesAccountPosition["positionSide"];
}

export function normalizeUsdMFuturesAccountState(raw: unknown, receivedAt: number): UsdMFuturesAccountState {
  const value = parsed(raw);
  if (value.productFamily !== "USD_M_FUTURES_UM") fail("product family", "must be USD_M_FUTURES_UM");
  if (value.e !== "ACCOUNT_UPDATE") fail("event", "must be ACCOUNT_UPDATE");
  const received = nonNegativeInteger(receivedAt, "receivedAt");
  const E = nonNegativeInteger(value.E, "E");
  const T = nonNegativeInteger(value.T, "T");
  if (E > received || T > received) fail("timestamp", "cannot be in future");
  if (T > E) fail("chronology", "is incoherent");
  const account = object(value.a, "a");
  allowlist(account, accountFields, "account", ["B", "P"]);
  if (!Array.isArray(account.B) || !Array.isArray(account.P)) fail("account", "B and P arrays are required");
  const balances = (account.B as unknown[]).map((item: unknown) => { const b = object(item, "balance"); allowlist(b, balanceFields, "balance", ["a", "wb", "cw", "bc"]); return { asset: asset(b.a), walletBalance: decimal(b.wb, "walletBalance"), crossWalletBalance: decimal(b.cw, "crossWalletBalance"), balanceChange: decimal(b.bc, "balanceChange", true) }; });
  const positions = (account.P as unknown[]).map((item: unknown) => { const p = object(item, "position"); allowlist(p, positionFields, "position", ["s", "pa", "ep", "cr", "up", "mt", "iw", "ps"]); if (typeof p.s !== "string" || !symbols.has(p.s as UsdMFuturesAccountSymbol)) fail("symbol", "is not supported"); if (p.mt !== "cross" && p.mt !== "isolated") fail("margin type", "is invalid"); return { symbol: p.s as UsdMFuturesAccountSymbol, positionAmount: decimal(p.pa, "positionAmount", true), entryPrice: decimal(p.ep, "entryPrice"), realizedPnl: decimal(p.cr, "realizedPnl", true), unrealizedPnl: decimal(p.up, "unrealizedPnl", true), marginType: p.mt as "cross" | "isolated", isolatedWallet: decimal(p.iw, "isolatedWallet"), positionSide: positionSide(p.ps) }; });
  return freezeDeep({ version: version(value.u), venue: "BINANCE", instrument: "USD_M_FUTURES", productFamily: "USD_M_FUTURES_UM", observedAt: T, receivedAt: received, balances, positions, source: { productFamily: "USD_M_FUTURES_UM", event: "ACCOUNT_UPDATE" } });
}
