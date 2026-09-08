import { createHash } from "node:crypto";

export const BINANCE_SKILLS_SOURCE = "binance/binance-skills-hub" as const;
export const BINANCE_SKILLS_VERSION = "2.0.0" as const;
export const BINANCE_CLI_VERSION = "2.1.1" as const;
export const BINANCE_SKILLS_PUBLIC_READ_BLOCKED_EXTERNAL = "BINANCE_SKILLS_PUBLIC_READ_BLOCKED_EXTERNAL" as const;
export type BinanceSkillsBlockedStatus = typeof BINANCE_SKILLS_PUBLIC_READ_BLOCKED_EXTERNAL;
export type BinanceSkillOperation = "symbolPriceTicker" | "markPrice" | "klines" | "exchangeInfo";
export type BinanceSkillRole = "MARKET_ANALYST" | "ADVOCATE" | "OPPOSER";
export type BinanceSkillParams = Readonly<{ symbol: string; workflowId: string; role?: BinanceSkillRole; interval?: string; limit?: number }>;

export interface EvidenceReference { readonly ref: string; readonly hash: string; readonly workflowId: string; readonly venue: "BINANCE"; readonly product: "USD_M_FUTURES"; readonly symbol: string; }
export interface MarketResearchArtifact {
  readonly ref: string; readonly provider: "BINANCE"; readonly surface: "SKILLS_HUB"; readonly source: typeof BINANCE_SKILLS_SOURCE;
  readonly sourceVersion: typeof BINANCE_SKILLS_VERSION; readonly cliVersion: typeof BINANCE_CLI_VERSION;
  readonly operation: BinanceSkillOperation; readonly symbol: string; readonly params: Readonly<Record<string, unknown>>;
  readonly observedAt: number; readonly receivedAt: number; readonly workflowId: string; readonly observation: Readonly<Record<string, unknown>> | readonly unknown[]; readonly digest: string;
}
export interface MarketAnalysisInput { readonly kind: "MARKET_ANALYSIS_INPUT"; readonly provider: "BINANCE"; readonly surface: "SKILLS_HUB"; readonly symbol: string; readonly evidenceRef: string; readonly evidenceHash: string; readonly workflowId: string; readonly operation: BinanceSkillOperation; readonly observation: MarketResearchArtifact["observation"]; readonly observedAt: number; readonly receivedAt: number; }
export type ReadResult = { readonly status: "READ_PASS"; readonly evidence: true; readonly artifact: MarketResearchArtifact } | { readonly status: BinanceSkillsBlockedStatus; readonly evidence: false; readonly error: string; readonly operation: BinanceSkillOperation; readonly symbol: string; readonly workflowId: string };
export interface BinanceSkillsAdapterOptions { readonly command?: (operation: BinanceSkillOperation, params: BinanceSkillParams) => Promise<unknown>; readonly transport?: (operation: BinanceSkillOperation, params: BinanceSkillParams) => Promise<unknown>; readonly maxOutputBytes?: number; readonly receivedAt?: () => number; }

const BLOCKED_ERROR = "Service unavailable from a restricted location according to 'b. Eligibility' in https://www.binance.com/en/terms. Please contact customer service if you believe you received this message in error.";
const FORBIDDEN = new Set(["order", "orders", "mandate", "intent", "authority", "execution", "execute", "withdrawal", "transfer", "thesis", "tradeThesis", "signer", "signature"]);
const operationKeys: Record<BinanceSkillOperation, readonly string[]> = {
  symbolPriceTicker: ["symbol", "price", "bidPrice", "askPrice", "eventTime"],
  markPrice: ["symbol", "markPrice", "indexPrice", "estimatedSettlePrice", "lastFundingRate", "nextFundingTime", "time", "eventTime"],
  klines: ["symbol", "interval", "openTime", "open", "high", "low", "close", "volume", "closeTime", "quoteVolume", "trades", "takerBaseVolume", "takerQuoteVolume"],
  exchangeInfo: ["timezone", "serverTime", "futuresType", "symbols", "rateLimits", "exchangeFilters", "assets", "symbol"],
};
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
function validateTree(value: unknown, maxBytes: number, seen = new Set<object>()): void {
  if (value && typeof value === "object") {
    if (seen.has(value as object)) throw new TypeError("invalid cyclic output"); seen.add(value as object);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("invalid array prototype");
      const keys = Reflect.ownKeys(value); if (keys.length !== value.length + 1 || !keys.includes("length")) throw new TypeError("invalid array shape");
      for (let i = 0; i < value.length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d || !d.enumerable || !("value" in d)) throw new TypeError("invalid array descriptor"); validateTree(d.value, maxBytes, seen); }
    } else {
      if (!plain(value)) throw new TypeError("invalid object prototype");
      for (const key of Reflect.ownKeys(value)) { if (typeof key !== "string") throw new TypeError("symbol keys are forbidden"); const d = Object.getOwnPropertyDescriptor(value, key); if (!d || !d.enumerable || !("value" in d)) throw new TypeError("accessors are forbidden"); if (FORBIDDEN.has(key)) throw new TypeError(`forbidden field: ${key}`); validateTree(d.value, maxBytes, seen); }
    }
  } else if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("nonfinite number");
  const encoded = (() => { try { return JSON.stringify(value); } catch { return undefined; } })();
  if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > maxBytes) throw new RangeError("output is oversized or unserializable");
}
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
}
function freeze<T>(value: T, seen = new Set<object>()): T { if (value && typeof value === "object" && !seen.has(value as object)) { seen.add(value as object); Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child, seen); } return value; }
function timestamp(value: unknown, field: string, fallback: number): number { const n = value === undefined ? fallback : value; if (!finite(n) || n < 0) throw new TypeError(`${field} must be finite and non-negative`); return n; }
function validateObservation(operation: BinanceSkillOperation, value: unknown, symbol: string): Record<string, unknown> | readonly unknown[] {
  const allowed = operationKeys[operation];
  if (operation === "klines") {
    if (!Array.isArray(value) || value.length === 0) throw new TypeError("klines observation must be a non-empty array");
    for (const row of value) { if (!Array.isArray(row) || row.length < 6 || row.length > 12 || row.some(v => !(text(v) || finite(v)))) throw new TypeError("invalid kline row"); }
    return value;
  }
  if (!plain(value)) throw new TypeError("observation must be a plain object");
  const keys = Object.keys(value); if (keys.some(k => !allowed.includes(k))) throw new TypeError("unsupported observation field");
  if (value.symbol !== symbol) throw new TypeError("observation symbol mismatch");
  if (operation === "symbolPriceTicker" && !text(value.price)) throw new TypeError("ticker price is required");
  if (operation === "markPrice" && !text(value.markPrice)) throw new TypeError("mark price is required");
  if (operation === "exchangeInfo" && value.symbol === undefined && value.symbols === undefined) throw new TypeError("exchange info symbol scope is required");
  return value;
}

export class BinanceSkillsAdapter {
  private readonly invoke: (operation: BinanceSkillOperation, params: BinanceSkillParams) => Promise<unknown>;
  private readonly maxOutputBytes: number;
  private readonly clock: () => number;
  constructor(options: BinanceSkillsAdapterOptions) {
    if (!options.command && !options.transport) throw new TypeError("an injected command or transport is required");
    if (options.command && options.transport) throw new TypeError("provide one injected command or transport");
    this.invoke = options.command ?? options.transport!; this.maxOutputBytes = options.maxOutputBytes ?? 256_000; this.clock = options.receivedAt ?? (() => Date.now());
    if (!Number.isSafeInteger(this.maxOutputBytes) || this.maxOutputBytes < 1) throw new RangeError("maxOutputBytes must be positive");
  }
  async read(operation: BinanceSkillOperation, params: BinanceSkillParams): Promise<ReadResult> {
    if (!Object.prototype.hasOwnProperty.call(operationKeys, operation)) throw new TypeError("unsupported Binance Skills operation");
    if (!plain(params) || !text(params.symbol) || !text(params.workflowId) || (params.role !== undefined && !["MARKET_ANALYST", "ADVOCATE", "OPPOSER"].includes(params.role))) throw new TypeError("invalid role or parameters");
    const receivedAt = timestamp(undefined, "receivedAt", this.clock());
    let raw: unknown;
    try { raw = await this.invoke(operation, params); } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === BLOCKED_ERROR || message.includes("restricted location") || message.includes("b. Eligibility")) return Object.freeze({ status: BINANCE_SKILLS_PUBLIC_READ_BLOCKED_EXTERNAL, evidence: false, error: message, operation, symbol: params.symbol, workflowId: params.workflowId });
      throw error;
    }
    if (typeof raw === "string") { if (Buffer.byteLength(raw, "utf8") > this.maxOutputBytes) throw new RangeError("output is oversized"); try { raw = JSON.parse(raw); } catch { throw new TypeError("command output must be JSON"); } }
    validateTree(raw, this.maxOutputBytes);
    const observation = validateObservation(operation, raw, params.symbol);
    let observedAt = receivedAt;
    if (!Array.isArray(observation)) { const objectObservation = observation as Record<string, unknown>; const candidate = objectObservation.eventTime ?? objectObservation.time ?? objectObservation.closeTime; observedAt = timestamp(candidate, "observedAt", receivedAt); }
    if (observedAt > receivedAt) throw new TypeError("observedAt cannot be after receivedAt");
    const cleanParams = { symbol: params.symbol, ...(params.interval === undefined ? {} : { interval: params.interval }), ...(params.limit === undefined ? {} : { limit: params.limit }) };
    const digest = createHash("sha256").update(canonical({ source: BINANCE_SKILLS_SOURCE, sourceVersion: BINANCE_SKILLS_VERSION, operation, symbol: params.symbol, params: cleanParams, observedAt, receivedAt, observation })).digest("hex");
    const ref = `binance-skills:${operation}:${params.symbol}:${digest.slice(0, 16)}`;
    const artifact = freeze({ ref, provider: "BINANCE" as const, surface: "SKILLS_HUB" as const, source: BINANCE_SKILLS_SOURCE, sourceVersion: BINANCE_SKILLS_VERSION, cliVersion: BINANCE_CLI_VERSION, operation, symbol: params.symbol, params: cleanParams, observedAt, receivedAt, workflowId: params.workflowId, observation, digest });
    return { status: "READ_PASS", evidence: true, artifact };
  }
  toEvidenceReference(artifact: MarketResearchArtifact): EvidenceReference { if (!Object.isFrozen(artifact)) throw new TypeError("artifact must be immutable"); return Object.freeze({ ref: artifact.ref, hash: artifact.digest, workflowId: artifact.workflowId, venue: "BINANCE", product: "USD_M_FUTURES", symbol: artifact.symbol }); }
  toMarketAnalysisInput(artifact: MarketResearchArtifact): MarketAnalysisInput { const ref = this.toEvidenceReference(artifact); return freeze({ kind: "MARKET_ANALYSIS_INPUT" as const, provider: "BINANCE" as const, surface: "SKILLS_HUB" as const, symbol: ref.symbol, evidenceRef: ref.ref, evidenceHash: ref.hash, workflowId: ref.workflowId, operation: artifact.operation, observation: artifact.observation, observedAt: artifact.observedAt, receivedAt: artifact.receivedAt }); }
}

export const BINANCE_SKILLS_BLOCKED_ERROR = BLOCKED_ERROR;
