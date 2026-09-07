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
function parsed(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const value = object(JSON.parse(raw), "payload");
      const versionToken = /"u"\s*:\s*(-?(?:0|[1-9]\d*)(?:\.\d+|[eE][+-]?\d+)?)/.exec(raw)?.[1];
      if (versionToken !== undefined) value.u = versionToken;
      return value;
    } catch (error) { if (error instanceof RangeError) throw error; fail("payload", "must be valid JSON"); }
  }
  return object(raw, "payload");
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
  if (!Array.isArray(account.B) || !Array.isArray(account.P)) fail("account", "B and P arrays are required");
  const balances = (account.B as unknown[]).map((item: unknown) => { const b = object(item, "balance"); return { asset: asset(b.a), walletBalance: decimal(b.wb, "walletBalance"), crossWalletBalance: decimal(b.cw, "crossWalletBalance"), balanceChange: decimal(b.bc, "balanceChange", true) }; });
  const positions = (account.P as unknown[]).map((item: unknown) => { const p = object(item, "position"); if (typeof p.s !== "string" || !symbols.has(p.s as UsdMFuturesAccountSymbol)) fail("symbol", "is not supported"); if (p.mt !== "cross" && p.mt !== "isolated") fail("margin type", "is invalid"); return { symbol: p.s as UsdMFuturesAccountSymbol, positionAmount: decimal(p.pa, "positionAmount", true), entryPrice: decimal(p.ep, "entryPrice"), realizedPnl: decimal(p.cr, "realizedPnl", true), unrealizedPnl: decimal(p.up, "unrealizedPnl", true), marginType: p.mt as "cross" | "isolated", isolatedWallet: decimal(p.iw, "isolatedWallet"), positionSide: positionSide(p.ps) }; });
  return freezeDeep({ version: version(value.u), venue: "BINANCE", instrument: "USD_M_FUTURES", productFamily: "USD_M_FUTURES_UM", observedAt: T, receivedAt: received, balances, positions, source: { productFamily: "USD_M_FUTURES_UM", event: "ACCOUNT_UPDATE" } });
}
