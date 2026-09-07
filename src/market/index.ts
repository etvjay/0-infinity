export type UsdMFuturesSymbol = "BTCUSDT" | "ETHUSDT";
export type UsdMFuturesUpdateId = number | string | bigint;
export type UsdMFuturesBookStatus = "SYNCING" | "SYNCED" | "DESYNCED";
export type UsdMFuturesLevel = readonly [string, string];

export interface UsdMFuturesBookTicker {
  readonly e: "bookTicker"; readonly u: UsdMFuturesUpdateId; readonly E: number; readonly T: number; readonly s: string;
  readonly b: string; readonly B: string; readonly a: string; readonly A: string; readonly ps?: string; readonly st?: string | number; readonly productFamily?: string;
}
export interface UsdMFuturesDepthUpdate {
  readonly e: "depthUpdate"; readonly E: number; readonly T: number; readonly s: string;
  readonly U: UsdMFuturesUpdateId; readonly u: UsdMFuturesUpdateId; readonly pu?: UsdMFuturesUpdateId;
  readonly b: UsdMFuturesLevel[]; readonly a: UsdMFuturesLevel[]; readonly productFamily?: string;
}
export interface UsdMFuturesMarketSnapshot {
  readonly version: 1; readonly venue: "BINANCE"; readonly instrument: "USD_M_FUTURES"; readonly symbol: UsdMFuturesSymbol;
  readonly bidPrice: number; readonly bidQuantity: number; readonly askPrice: number; readonly askQuantity: number;
  readonly eventTime: number; readonly transactionTime: number; readonly updateVersion: bigint; readonly receivedAt: number;
  readonly source: { readonly productFamily: "USD_M_FUTURES_UM"; readonly endpoint: "wss://fstream.binance.com"; readonly stream: "bookTicker" };
}
export interface UsdMFuturesOrderBookView {
  readonly version: 1; readonly symbol: UsdMFuturesSymbol; readonly status: UsdMFuturesBookStatus;
  readonly lastUpdateId: bigint; readonly bids: readonly { readonly price: string; readonly quantity: string }[];
  readonly asks: readonly { readonly price: string; readonly quantity: string }[];
  readonly bestBid?: { readonly price: string; readonly quantity: string };
  readonly bestAsk?: { readonly price: string; readonly quantity: string };
  readonly eventTime?: number; readonly transactionTime?: number; readonly receivedAt?: number;
}

const MVP_SYMBOLS = new Set<UsdMFuturesSymbol>(["BTCUSDT", "ETHUSDT"]);
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/; const UPDATE_ID = /^(?:0|[1-9]\d*)$/;
const own = (v: object, k: string): boolean => Object.prototype.hasOwnProperty.call(v, k);
function fail(field: string, message: string): never { throw new RangeError(`${field} ${message}`); }
function integer(value: unknown, field: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail(field, "must be a non-negative safe integer"); return value; }
function updateId(value: unknown, field: string): bigint {
  if (typeof value === "bigint") { if (value < 0n) fail(field, "must be non-negative"); return value; }
  if (typeof value === "number") { if (!Number.isSafeInteger(value) || value < 0) fail(field, "must be an exact non-negative integer"); return BigInt(value); }
  if (typeof value === "string" && UPDATE_ID.test(value)) return BigInt(value);
  fail(field, "must be an exact non-negative decimal integer");
}
function decimal(value: unknown, field: string, positive = true): string {
  if (typeof value !== "string" || value.length > 1000 || !DECIMAL.test(value)) fail(field, "must be a decimal string");
  const [whole, fraction = ""] = value.split("."); const out = `${whole.replace(/^0+(?=\d)/, "")}.${fraction.replace(/0+$/, "")}`.replace(/\.0*$/, "");
  if (positive && out === "0") fail(field, "must be positive"); return out;
}
function numberDecimal(v: unknown, field: string): number { const s = decimal(v, field); const n = Number(s); if (!Number.isFinite(n) || n <= 0) fail(field, "must be finite"); return n; }
function freezeDeep<T>(v: T): T { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const c of Object.values(v as Record<string, unknown>)) freezeDeep(c); } return v; }
function topField(raw: string, wanted: string): unknown {
  const re = new RegExp(`\\"${wanted}\\"\\s*:\\s*(\\"(?:\\\\.|[^\\"])*\\"|-?[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)`); const m = raw.match(re); if (!m) return undefined;
  if (!m[1].startsWith('"')) return m[1];
  try { return JSON.parse(m[1]); } catch { return undefined; }
}
function parsed(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") { try { const v = JSON.parse(raw) as Record<string, unknown>; for (const k of ["U", "u", "pu", "lastUpdateId"]) { const x = topField(raw, k); if (x !== undefined) v[k] = x; } return v; } catch { fail("payload", "must be valid JSON"); } }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("payload", "must be an object"); return raw as Record<string, unknown>;
}
function symbolOf(v: Record<string, unknown>): UsdMFuturesSymbol { if (v.productFamily !== undefined && v.productFamily !== "USD_M_FUTURES_UM") fail("product family", "must be USD_M_FUTURES_UM"); if (typeof v.s !== "string" || !MVP_SYMBOLS.has(v.s as UsdMFuturesSymbol)) fail("symbol", "is not supported"); return v.s as UsdMFuturesSymbol; }
function snapshotSymbol(v: Record<string, unknown>): UsdMFuturesSymbol { if (v.productFamily !== undefined && v.productFamily !== "USD_M_FUTURES_UM") fail("product family", "must be USD_M_FUTURES_UM"); if (typeof v.symbol !== "string" || !MVP_SYMBOLS.has(v.symbol as UsdMFuturesSymbol)) fail("symbol", "is not supported"); return v.symbol as UsdMFuturesSymbol; }
function times(v: Record<string, unknown>, receivedAt: number): { E?: number; T?: number } { const E = v.E === undefined ? undefined : integer(v.E, "E"); const T = v.T === undefined ? undefined : integer(v.T, "T"); if (E !== undefined && E > receivedAt) fail("E timestamp", "cannot be in future"); if (T !== undefined && T > receivedAt) fail("T timestamp", "cannot be in future"); if (E !== undefined && T !== undefined && T > E) fail("chronology", "is incoherent"); return { E, T }; }
function levels(value: unknown, field: string, keepZero = false): Map<string, string> { if (!Array.isArray(value)) fail(field, "must be an array"); const out = new Map<string, string>(); for (const x of value) { if (!Array.isArray(x) || x.length !== 2) fail(field, "levels must be [price, quantity]"); const p = decimal(x[0], `${field} price`); const q = decimal(x[1], `${field} quantity`, false); if (q !== "0" || keepZero) out.set(p, q); else out.delete(p); } return out; }
function compare(a: string, b: string): number { const [aw, af = ""] = a.split("."), [bw, bf = ""] = b.split("."); return aw.length !== bw.length ? aw.length - bw.length : (aw === bw ? af.padEnd(Math.max(af.length, bf.length), "0").localeCompare(bf.padEnd(Math.max(af.length, bf.length), "0")) : aw.localeCompare(bw)); }
function crossed(bids: Map<string, string>, asks: Map<string, string>): boolean { const b = [...bids.keys()].sort(compare).at(-1); const a = [...asks.keys()].sort(compare)[0]; return b !== undefined && a !== undefined && compare(b, a) >= 0; }

interface Internal { status: UsdMFuturesBookStatus; last: bigint; bids: Map<string,string>; asks: Map<string,string>; buffered: Record<string, unknown>[]; E?: number; T?: number; receivedAt?: number; }
export interface UsdMFuturesOrderBookConfig { readonly maxBufferedUpdates?: number; }

export class UsdMFuturesOrderBook {
  private readonly books = new Map<UsdMFuturesSymbol, Internal>(); private readonly maxBufferedUpdates: number;
  constructor(config: UsdMFuturesOrderBookConfig = {}) { this.maxBufferedUpdates = config.maxBufferedUpdates ?? 1000; if (!Number.isSafeInteger(this.maxBufferedUpdates) || this.maxBufferedUpdates < 1) throw new RangeError("maxBufferedUpdates must be positive"); }
  private book(s: UsdMFuturesSymbol): Internal { let b = this.books.get(s); if (!b) { b = { status: "SYNCING", last: -1n, bids: new Map(), asks: [], buffered: [] } as unknown as Internal; b.asks = new Map(); this.books.set(s, b); } return b; }
  ingestDiff(raw: unknown, receivedAt: number): UsdMFuturesOrderBookView | null {
    const v = parsed(raw); if (v.e !== "depthUpdate") fail("e", "must be depthUpdate"); const s = symbolOf(v); const b = this.book(s); const ts = times(v, receivedAt);
    const U = updateId(v.U, "U"), u = updateId(v.u, "u"); if (U > u) fail("U/u", "range is invalid"); const item = { ...v, U, u, pu: v.pu === undefined ? undefined : updateId(v.pu, "pu"), b: levels(v.b, "b", true), a: levels(v.a, "a", true) } as unknown as Record<string, unknown>;
    if (b.status === "DESYNCED") return null; if (b.status === "SYNCING") { b.buffered.push(item); if (b.buffered.length > this.maxBufferedUpdates) b.buffered.shift(); return null; }
    if (u <= b.last) return this.view(s);
    if (item.pu !== b.last || U > b.last + 1n) { b.status = "DESYNCED"; fail("depth continuity", "gap; book is DESYNCED"); }
    this.apply(b, item); b.E = ts.E; b.T = ts.T; b.receivedAt = receivedAt; return this.view(s);
  }
  ingestSnapshot(raw: unknown, receivedAt: number): UsdMFuturesOrderBookView {
    const v = parsed(raw), s = snapshotSymbol(v); const last = updateId(v.lastUpdateId, "lastUpdateId"); const b = this.book(s); const bids = levels(v.bids, "bids"), asks = levels(v.asks, "asks"); if (crossed(bids, asks)) { b.status = "DESYNCED"; fail("book", "is crossed; book is DESYNCED"); }
    const ts = times(v, receivedAt); b.bids = bids; b.asks = asks; b.last = last; b.status = "SYNCED"; b.E = ts.E; b.T = ts.T; b.receivedAt = receivedAt;
    const pending = b.buffered.splice(0).map(x => x).sort((x,y) => (x.U as bigint) < (y.U as bigint) ? -1 : 1); let bridged = false; for (const item of pending) { const U = item.U as bigint, u = item.u as bigint; if (u <= b.last) continue; if (!bridged ? (U > b.last + 1n || u < b.last) : item.pu !== b.last) continue; this.apply(b, item); bridged = true; b.E = item.E as number; b.T = item.T as number; b.receivedAt = receivedAt; }
    if (crossed(b.bids, b.asks)) { b.status = "DESYNCED"; fail("book", "is crossed"); } return this.view(s);
  }
  private apply(b: Internal, item: Record<string, unknown>): void { for (const [p,q] of (item.b as Map<string,string>)) q === "0" ? b.bids.delete(p) : b.bids.set(p,q); for (const [p,q] of (item.a as Map<string,string>)) q === "0" ? b.asks.delete(p) : b.asks.set(p,q); b.last = item.u as bigint; if (crossed(b.bids,b.asks)) { b.status = "DESYNCED"; } }
  status(symbol: string): UsdMFuturesBookStatus { if (!MVP_SYMBOLS.has(symbol as UsdMFuturesSymbol)) fail("symbol", "is not supported"); return this.book(symbol as UsdMFuturesSymbol).status; }
  rebootstrap(symbol?: string): void { const symbols = symbol ? [symbol] : [...this.books.keys()]; for (const x of symbols) { if (!MVP_SYMBOLS.has(x as UsdMFuturesSymbol)) fail("symbol", "is not supported"); this.books.set(x as UsdMFuturesSymbol, { status:"SYNCING", last:-1n, bids:new Map(), asks:new Map(), buffered:[] }); } }
  getSnapshot(symbol: string): UsdMFuturesOrderBookView | null { if (!MVP_SYMBOLS.has(symbol as UsdMFuturesSymbol)) fail("symbol", "is not supported"); return this.books.has(symbol as UsdMFuturesSymbol) ? this.view(symbol as UsdMFuturesSymbol) : null; }
  snapshot(symbol: string): UsdMFuturesOrderBookView | null { return this.getSnapshot(symbol); }
  private view(s: UsdMFuturesSymbol): UsdMFuturesOrderBookView { const b = this.book(s); const bids = [...b.bids].sort((x,y) => compare(y[0],x[0])).map(([price,quantity]) => ({price,quantity})); const asks = [...b.asks].sort((x,y) => compare(x[0],y[0])).map(([price,quantity]) => ({price,quantity})); return freezeDeep({ version:1 as const, symbol:s, status:b.status, lastUpdateId:b.last, bids, asks, bestBid:bids[0], bestAsk:asks[0], eventTime:b.E, transactionTime:b.T, receivedAt:b.receivedAt }); }
}

export function ingestUsdMFuturesBookTicker(state: UsdMFuturesMarketState, raw: unknown, receivedAt: number): UsdMFuturesMarketSnapshot { return state.ingest(raw, receivedAt); }

const UPDATE_ID_TICKER = /^(?:0|[1-9]\d*)$/;
export class UsdMFuturesMarketState {
  private readonly lastUpdateVersion = new Map<UsdMFuturesSymbol, bigint>();
  ingest(raw: unknown, receivedAt: number): UsdMFuturesMarketSnapshot {
    const value = parsed(raw); if (value.e !== "bookTicker") fail("e", "must be bookTicker"); const symbol = symbolOf(value); if (own(value,"st") && value.st !== 1 && value.st !== "1") fail("st status", "must be absent or 1"); if (own(value,"ps") && value.ps !== symbol) fail("ps pair", "must match symbol");
    const update = (() => { const x=value.u; if ((typeof x === "string" && UPDATE_ID_TICKER.test(x)) || typeof x === "bigint" || typeof x === "number") return updateId(x,"u"); return fail("u","invalid"); })(); const E=integer(value.E,"E"), T=integer(value.T,"T"), received=integer(receivedAt,"receivedAt"); if(E>received) fail("E timestamp","cannot be in future"); if(T>received) fail("T timestamp","cannot be in future"); if(T>E) fail("chronology","incoherent"); const prior=this.lastUpdateVersion.get(symbol); if(prior!==undefined&&update<=prior) fail("update sequence","must be strictly monotonic per symbol"); const snapshot={version:1 as const,venue:"BINANCE" as const,instrument:"USD_M_FUTURES" as const,symbol,bidPrice:numberDecimal(value.b,"b"),bidQuantity:numberDecimal(value.B,"B"),askPrice:numberDecimal(value.a,"a"),askQuantity:numberDecimal(value.A,"A"),eventTime:E,transactionTime:T,updateVersion:update,receivedAt:received,source:{productFamily:"USD_M_FUTURES_UM" as const,endpoint:"wss://fstream.binance.com" as const,stream:"bookTicker" as const}}; this.lastUpdateVersion.set(symbol,update); return freezeDeep(snapshot);
  }
}
