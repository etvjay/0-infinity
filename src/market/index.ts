export type UsdMFuturesSymbol = "BTCUSDT" | "ETHUSDT";
export type UsdMFuturesUpdateId = number | string | bigint;

export interface UsdMFuturesBookTicker {
  readonly e: "bookTicker";
  readonly u: UsdMFuturesUpdateId;
  readonly E: number;
  readonly T: number;
  readonly s: string;
  readonly b: string;
  readonly B: string;
  readonly a: string;
  readonly A: string;
  readonly ps?: string;
  readonly st?: string | number;
  readonly productFamily?: string;
}

export interface UsdMFuturesMarketSnapshot {
  readonly version: 1;
  readonly venue: "BINANCE";
  readonly instrument: "USD_M_FUTURES";
  readonly symbol: UsdMFuturesSymbol;
  readonly bidPrice: number;
  readonly bidQuantity: number;
  readonly askPrice: number;
  readonly askQuantity: number;
  readonly eventTime: number;
  readonly transactionTime: number;
  readonly updateVersion: bigint;
  readonly receivedAt: number;
  readonly source: {
    readonly productFamily: "USD_M_FUTURES_UM";
    readonly endpoint: "wss://fstream.binance.com";
    readonly stream: "bookTicker";
  };
}

const MVP_SYMBOLS = new Set<UsdMFuturesSymbol>(["BTCUSDT", "ETHUSDT"]);
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const UPDATE_ID = /^(?:0|[1-9]\d*)$/;
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

function fail(field: string, message: string): never { throw new RangeError(`${field} ${message}`); }
function integer(value: unknown, field: string, allowZero = true): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) fail(field, "must be a non-negative safe integer");
  return value;
}
function updateId(value: unknown, field: string): bigint {
  if (typeof value === "bigint") { if (value < 0n) fail(field, "must be a non-negative integer"); return value; }
  if (typeof value === "number") { if (!Number.isSafeInteger(value) || value < 0) fail(field, "must be a non-negative exact integer"); return BigInt(value); }
  if (typeof value === "string" && UPDATE_ID.test(value)) return BigInt(value);
  fail(field, "must be a non-negative exact decimal integer");
}
function decimal(value: unknown, field: string): number {
  if (typeof value !== "string" || !DECIMAL.test(value)) fail(field, "must be a positive decimal string");
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) fail(field, "must be a finite positive decimal");
  return normalized;
}
function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}
function topLevelJsonField(raw: string, wanted: string): unknown {
  let depth = 0;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== '"') { if (raw[i] === "{") depth += 1; else if (raw[i] === "}") depth -= 1; continue; }
    const start = i++;
    let escaped = false;
    for (; i < raw.length; i += 1) {
      if (escaped) { escaped = false; continue; }
      if (raw[i] === "\\") { escaped = true; continue; }
      if (raw[i] === '"') break;
    }
    if (depth !== 1) continue;
    let key: unknown;
    try { key = JSON.parse(raw.slice(start, i + 1)); } catch { continue; }
    if (key !== wanted) continue;
    let j = i + 1;
    while (/\s/.test(raw[j] ?? "")) j += 1;
    if (raw[j] !== ":") continue;
    j += 1; while (/\s/.test(raw[j] ?? "")) j += 1;
    const tokenStart = j;
    if (raw[j] === '"') {
      j += 1; let quoteEscaped = false;
      for (; j < raw.length; j += 1) { if (quoteEscaped) { quoteEscaped = false; continue; } if (raw[j] === "\\") { quoteEscaped = true; continue; } if (raw[j] === '"') { j += 1; break; } }
    } else { while (j < raw.length && raw[j] !== "," && raw[j] !== "}") j += 1; return raw.slice(tokenStart, j).trim(); }
    try { return JSON.parse(raw.slice(tokenStart, j)); } catch { return undefined; }
  }
  return undefined;
}
function parseInput(raw: unknown): { value: Record<string, unknown>; rawUpdate?: unknown } {
  let value: unknown = raw;
  let rawUpdate: unknown;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw) as unknown; rawUpdate = topLevelJsonField(raw, "u"); } catch { fail("payload", "must be valid JSON"); }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("payload", "must be an object");
  return { value: value as Record<string, unknown>, rawUpdate };
}

export class UsdMFuturesMarketState {
  private readonly lastUpdateVersion = new Map<UsdMFuturesSymbol, bigint>();

  ingest(raw: unknown, receivedAt: number): UsdMFuturesMarketSnapshot {
    const parsed = parseInput(raw); const value = parsed.value;
    if (value.e !== "bookTicker") fail("e", "must be bookTicker");
    if (own(value, "productFamily") && value.productFamily !== "USD_M_FUTURES_UM") fail("product family", "must be USD_M_FUTURES_UM");
    if (typeof value.s !== "string" || !MVP_SYMBOLS.has(value.s as UsdMFuturesSymbol)) fail("s symbol", "is not supported");
    if (own(value, "st") && value.st !== 1 && value.st !== "1") fail("st status", "must be absent or 1");
    if (own(value, "ps") && (value.ps !== value.s || typeof value.ps !== "string" || !MVP_SYMBOLS.has(value.ps as UsdMFuturesSymbol))) fail("ps pair", "must match a supported UM symbol");
    const update = updateId(parsed.rawUpdate ?? value.u, "u");
    const eventTime = integer(value.E, "E");
    const transactionTime = integer(value.T, "T");
    const received = integer(receivedAt, "receivedAt");
    if (eventTime > received) fail("E timestamp", "cannot be in the future of receivedAt");
    if (transactionTime > received) fail("T timestamp", "cannot be in the future of receivedAt");
    if (transactionTime > eventTime) fail("timestamp chronology", "is incoherent");
    const symbol = value.s as UsdMFuturesSymbol;
    const prior = this.lastUpdateVersion.get(symbol);
    if (prior !== undefined && update <= prior) fail("update sequence", "must be strictly monotonic per symbol");
    const snapshot = {
      version: 1 as const, venue: "BINANCE" as const, instrument: "USD_M_FUTURES" as const, symbol,
      bidPrice: decimal(value.b, "b"), bidQuantity: decimal(value.B, "B"), askPrice: decimal(value.a, "a"), askQuantity: decimal(value.A, "A"),
      eventTime, transactionTime, updateVersion: update, receivedAt,
      source: { productFamily: "USD_M_FUTURES_UM" as const, endpoint: "wss://fstream.binance.com" as const, stream: "bookTicker" as const },
    } satisfies UsdMFuturesMarketSnapshot;
    this.lastUpdateVersion.set(symbol, update);
    return freezeDeep(snapshot);
  }
}
