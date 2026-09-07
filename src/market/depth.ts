import { UsdMFuturesOrderBook, type UsdMFuturesOrderBookView, type UsdMFuturesSymbol } from "./index.js";

export interface UsdMFuturesRestClient {
  get(path: string, query: Readonly<Record<string, string | number>>): Promise<unknown>;
}

export interface UsdMFuturesDepthSnapshot {
  readonly symbol: UsdMFuturesSymbol;
  readonly lastUpdateId: bigint;
  readonly bids: readonly (readonly [string, string])[];
  readonly asks: readonly (readonly [string, string])[];
}

export interface DepthSnapshotSource {
  /** Returns a raw or already-normalized public REST snapshot. */
  fetchSnapshot(symbol: UsdMFuturesSymbol): Promise<unknown>;
}

const symbols = new Set<UsdMFuturesSymbol>(["BTCUSDT", "ETHUSDT"]);
const idPattern = /^(?:0|[1-9]\d*)$/;
const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
function fail(field: string, message: string): never { throw new RangeError(`${field} ${message}`); }
function id(value: unknown): bigint {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && idPattern.test(value)) return BigInt(value);
  return fail("lastUpdateId", "must be an exact non-negative decimal integer");
}
function decimal(value: unknown, field: string): string {
  if (typeof value !== "string" || !decimalPattern.test(value)) fail(field, "must be a decimal string");
  const [whole, fraction = ""] = value.split(".");
  const normalized = `${whole.replace(/^0+(?=\d)/, "")}.${fraction.replace(/0+$/, "")}`.replace(/\.0*$/, "");
  if (normalized === "0") fail(field, "must be positive");
  return normalized;
}
function levels(value: unknown, field: string): readonly (readonly [string, string])[] {
  if (!Array.isArray(value)) fail(field, "must be an array");
  return value.map((level, index) => {
    if (!Array.isArray(level) || level.length !== 2) fail(`${field}[${index}]`, "must be [price, quantity]");
    return Object.freeze([decimal(level[0], `${field}[${index}] price`), decimal(level[1], `${field}[${index}] quantity`)] as const);
  });
}
function topLevelField(raw: string, wanted: string): { count: number; token?: string } {
  let depth = 0; let count = 0; let token: string | undefined;
  for (let i = 0; i < raw.length;) {
    if (raw[i] === "\"") {
      const start = i++; let escaped = false;
      while (i < raw.length) { const c = raw[i++]; if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === "\"") break; }
      if (depth !== 1) continue;
      let j = i; while (/\s/.test(raw[j] ?? "")) j++;
      if (raw[j] !== ":") continue;
      j++; while (/\s/.test(raw[j] ?? "")) j++;
      const valueStart = j; let end = j;
      if (raw[j] === "\"") {
        end = ++j; escaped = false;
        while (end < raw.length) { const c = raw[end++]; if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === "\"") break; }
      } else if (raw[j] !== "{" && raw[j] !== "[") {
        while (end < raw.length && !/[,}\s]/.test(raw[end])) end++;
      }
      let key: unknown; try { key = JSON.parse(raw.slice(start, i)); } catch { continue; }
      if (key === wanted) { count++; token = raw.slice(valueStart, end); }
      i = end; continue;
    }
    if (raw[i] === "{" || raw[i] === "[") depth++; else if (raw[i] === "}" || raw[i] === "]") depth--; i++;
  }
  return { count, token };
}
export function normalizeUsdMFuturesDepthSnapshot(value: unknown, requested: UsdMFuturesSymbol): UsdMFuturesDepthSnapshot {
  let raw: unknown = value;
  if (typeof raw === "string") {
    const source = raw;
    try { raw = JSON.parse(raw); } catch { fail("snapshot", "must be valid JSON"); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("snapshot", "must be an object");
    const field = topLevelField(source, "lastUpdateId");
    if (field.count !== 1 || field.token === undefined) fail("lastUpdateId", "must appear exactly once");
    (raw as Record<string, unknown>).lastUpdateId = field.token.startsWith("\"") ? JSON.parse(field.token) : field.token;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("snapshot", "must be an object");
  const v = raw as Record<string, unknown>;
  if (v.symbol !== undefined && v.symbol !== requested) fail("symbol", "must match requested symbol");
  if (v.symbol !== undefined && !symbols.has(v.symbol as UsdMFuturesSymbol)) fail("symbol", "is not supported");
  return Object.freeze({ symbol: requested, lastUpdateId: id(v.lastUpdateId), bids: Object.freeze(levels(v.bids, "bids")), asks: Object.freeze(levels(v.asks, "asks")) });
}

export class UsdMFuturesDepthSnapshotSource implements DepthSnapshotSource {
  readonly endpoint = "https://fapi.binance.com" as const;
  constructor(private readonly client: UsdMFuturesRestClient, private readonly limit = 1000) {
    if (!Number.isSafeInteger(limit) || limit < 5 || limit > 1000) throw new RangeError("limit must be between 5 and 1000");
  }
  async fetchSnapshot(symbol: UsdMFuturesSymbol): Promise<UsdMFuturesDepthSnapshot> {
    if (!symbols.has(symbol)) fail("symbol", "is not supported");
    const response = await this.client.get("/fapi/v1/depth", { symbol, limit: this.limit });
    return normalizeUsdMFuturesDepthSnapshot(response, symbol);
  }
}

export type UsdMFuturesDepthStatus = "DISCONNECTED" | "RECONNECTING" | "DEGRADED" | "SYNCED" | "DESYNCED";

export class UsdMFuturesDepthLifecycle {
  private readonly states = new Map<UsdMFuturesSymbol, UsdMFuturesDepthStatus>();
  private generation = new Map<UsdMFuturesSymbol, number>();
  constructor(private readonly orderBook: UsdMFuturesOrderBook, private readonly source: DepthSnapshotSource, private readonly receivedAt: () => number = () => Date.now()) {}
  status(symbol: UsdMFuturesSymbol): UsdMFuturesDepthStatus {
    if (!symbols.has(symbol)) fail("symbol", "is not supported");
    return this.states.get(symbol) ?? "DISCONNECTED";
  }
  markDisconnected(symbol: UsdMFuturesSymbol): void {
    if (!symbols.has(symbol)) fail("symbol", "is not supported");
    this.generation.set(symbol, (this.generation.get(symbol) ?? 0) + 1);
    this.states.set(symbol, "DISCONNECTED");
  }
  async rebootstrap(symbol: UsdMFuturesSymbol): Promise<UsdMFuturesOrderBookView> {
    if (!symbols.has(symbol)) fail("symbol", "is not supported");
    const generation = (this.generation.get(symbol) ?? 0) + 1;
    this.generation.set(symbol, generation);
    this.states.set(symbol, "RECONNECTING");
    this.orderBook.rebootstrap(symbol);
    try {
      const snapshot = await this.source.fetchSnapshot(symbol);
      if (this.generation.get(symbol) !== generation) throw new Error("stale snapshot session");
      const view = this.orderBook.ingestSnapshot(snapshot, this.receivedAt());
      this.states.set(symbol, "SYNCED");
      return view;
    } catch (error) {
      if (this.generation.get(symbol) === generation) this.states.set(symbol, "DEGRADED");
      throw error;
    }
  }
  ingestDiff(raw: unknown, receivedAt = this.receivedAt()): UsdMFuturesOrderBookView | null {
    let symbol: UsdMFuturesSymbol | undefined;
    let payload: unknown = raw;
    if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { payload = undefined; } }
    if (payload && typeof payload === "object" && !Array.isArray(payload) && typeof (payload as Record<string, unknown>).s === "string") symbol = (payload as Record<string, unknown>).s as UsdMFuturesSymbol;
    try {
      const view = this.orderBook.ingestDiff(raw, receivedAt);
      if (symbol && view?.status === "DESYNCED") this.states.set(symbol, "DESYNCED");
      return view;
    } catch (error) {
      if (symbol && symbols.has(symbol) && this.orderBook.status(symbol) === "DESYNCED") this.states.set(symbol, "DESYNCED");
      throw error;
    }
  }
}
