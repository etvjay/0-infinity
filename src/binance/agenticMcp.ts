import { normalizeUsdMFuturesAccountState, type UsdMFuturesAccountState } from "../account/index.js";
import type { EvidenceReference } from "../reasoning/receipt.js";

export const BINANCE_AGENTIC_MCP_ENDPOINT = "https://agent.binance.com/mcp/agentic" as const;
export const BINANCE_AGENTIC_MCP_AUTH_ERROR = "Incompatible auth server: does not support dynamic client registration" as const;
export const BINANCE_AGENTIC_MCP_NEXT_ACTION = "supported client with static client registration/browser consent" as const;

export type BinanceAgenticScope = "MARKET_DATA" | "ACCOUNT_READ";
export type BinanceAgenticReadiness = "AUTH_BLOCKED_EXTERNAL";

export interface BinanceAgenticCapabilities {
  readonly endpoint: typeof BINANCE_AGENTIC_MCP_ENDPOINT;
  readonly readiness: BinanceAgenticReadiness;
  readonly desiredScopes: readonly BinanceAgenticScope[];
  readonly availableScopes: readonly BinanceAgenticScope[];
  readonly trade: false;
  readonly transfer: false;
  readonly nextAction: typeof BINANCE_AGENTIC_MCP_NEXT_ACTION;
}

export interface BinanceAgenticMcpClient {
  /** The client owns OAuth/browser consent. This adapter never receives or stores tokens. */
  read(request: { readonly endpoint: typeof BINANCE_AGENTIC_MCP_ENDPOINT; readonly scopes: readonly BinanceAgenticScope[] }): Promise<unknown>;
}

export interface BinanceAgenticMarketObservation {
  readonly symbol: "BTCUSDT" | "ETHUSDT";
  readonly bidPrice: string;
  readonly askPrice: string;
  readonly observedAt: number;
  readonly receivedAt: number;
}

export interface BinanceAgenticReadResult {
  readonly endpoint: typeof BINANCE_AGENTIC_MCP_ENDPOINT;
  readonly readiness: BinanceAgenticReadiness;
  readonly evidence: readonly EvidenceReference[];
  readonly market?: BinanceAgenticMarketObservation;
  readonly account?: UsdMFuturesAccountState;
}

const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const integer = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new RangeError(`${field} must be a non-negative safe integer`);
  return value;
};
const decimal = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || value === "0") throw new RangeError(`${field} must be a positive decimal string`);
  return value;
};
const plain = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${field} must be a plain object`);
  return value as Record<string, unknown>;
};
function freezeDeep<T>(value: T, seen = new Set<object>()): T {
  if (value && typeof value === "object" && !seen.has(value as object)) {
    seen.add(value as object); Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child, seen);
  }
  return value;
}
function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = [], field = "value"): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) throw new TypeError(`${field}.${String(key)} is unsupported`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new TypeError(`${field}.${key} must be an own data property`);
  }
  for (const key of required) if (!own(value, key)) throw new TypeError(`${field}.${key} is required`);
}
function evidence(value: unknown): EvidenceReference {
  const ref = plain(value, "evidence");
  exactKeys(ref, ["ref", "hash", "workflowId", "venue", "product", "symbol"], [], "evidence");
  for (const key of ["ref", "hash", "workflowId", "venue", "product", "symbol"] as const) if (!text(ref[key])) throw new TypeError(`evidence.${key} must be non-empty`);
  return { ref: ref.ref as string, hash: ref.hash as string, workflowId: ref.workflowId as string, venue: ref.venue as string, product: ref.product as string, symbol: ref.symbol as string };
}
function market(value: unknown): BinanceAgenticMarketObservation {
  const m = plain(value, "market"); exactKeys(m, ["symbol", "bidPrice", "askPrice", "observedAt", "receivedAt"], [], "market");
  if (m.symbol !== "BTCUSDT" && m.symbol !== "ETHUSDT") throw new RangeError("market.symbol is unsupported");
  const observedAt = integer(m.observedAt, "market.observedAt"); const receivedAt = integer(m.receivedAt, "market.receivedAt");
  if (receivedAt < observedAt) throw new RangeError("market chronology is incoherent");
  return { symbol: m.symbol, bidPrice: decimal(m.bidPrice, "market.bidPrice"), askPrice: decimal(m.askPrice, "market.askPrice"), observedAt, receivedAt };
}

export class BinanceAgenticMcpAdapter {
  readonly endpoint = BINANCE_AGENTIC_MCP_ENDPOINT;
  readonly capabilities: BinanceAgenticCapabilities = freezeDeep({
    endpoint: BINANCE_AGENTIC_MCP_ENDPOINT,
    readiness: "AUTH_BLOCKED_EXTERNAL" as const,
    desiredScopes: ["MARKET_DATA", "ACCOUNT_READ"] as const,
    availableScopes: ["MARKET_DATA", "ACCOUNT_READ"] as const,
    trade: false as const,
    transfer: false as const,
    nextAction: BINANCE_AGENTIC_MCP_NEXT_ACTION,
  });

  constructor(private readonly client: BinanceAgenticMcpClient) {}

  async read(): Promise<BinanceAgenticReadResult> {
    const raw = await this.client.read({ endpoint: BINANCE_AGENTIC_MCP_ENDPOINT, scopes: ["MARKET_DATA", "ACCOUNT_READ"] });
    const input = plain(raw, "MCP read result");
    exactKeys(input, ["evidence"], ["market", "accountUpdate"], "MCP read result");
    if (!Array.isArray(input.evidence) || input.evidence.length === 0 || input.evidence.some((item) => !item || typeof item !== "object" || Array.isArray(item))) throw new TypeError("MCP evidence must be a non-empty array");
    const refs = input.evidence.map(evidence);
    const output: BinanceAgenticReadResult = { endpoint: BINANCE_AGENTIC_MCP_ENDPOINT, readiness: "AUTH_BLOCKED_EXTERNAL", evidence: refs };
    if (input.market !== undefined) (output as { market?: BinanceAgenticMarketObservation }).market = market(input.market);
    if (input.accountUpdate !== undefined) (output as { account?: UsdMFuturesAccountState }).account = normalizeUsdMFuturesAccountState(input.accountUpdate, Date.now());
    return freezeDeep(output);
  }
}

export function blockedBinanceAgenticEvidence(): Readonly<{ readonly rawProbe: "UNAUTHENTICATED_PROBE"; readonly supportedClient: "AUTH_BLOCKED_EXTERNAL"; readonly endpoint: typeof BINANCE_AGENTIC_MCP_ENDPOINT; readonly error: typeof BINANCE_AGENTIC_MCP_AUTH_ERROR; readonly nextAction: typeof BINANCE_AGENTIC_MCP_NEXT_ACTION }> {
  return freezeDeep({ rawProbe: "UNAUTHENTICATED_PROBE", supportedClient: "AUTH_BLOCKED_EXTERNAL", endpoint: BINANCE_AGENTIC_MCP_ENDPOINT, error: BINANCE_AGENTIC_MCP_AUTH_ERROR, nextAction: BINANCE_AGENTIC_MCP_NEXT_ACTION });
}
