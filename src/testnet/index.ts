import { createHmac } from "node:crypto";
import { isCanonicalBoundedIntent, type AdapterResult, type BoundedIntent } from "../execution/index.js";

export const BINANCE_TESTNET_BASE_URL = "https://testnet.binancefuture.com" as const;
export const RuntimeMode = { SHADOW: "SHADOW", PAPER_LIVE: "PAPER_LIVE", BINANCE_TESTNET: "BINANCE_TESTNET", LIVE_CONFIRMED: "LIVE_CONFIRMED" } as const;
export type RuntimeMode = (typeof RuntimeMode)[keyof typeof RuntimeMode];
export type TestnetStatus = "BLOCKED_EXTERNAL" | "READY";
export type AccountEvidence = Readonly<{ capability: "BINANCE_TESTNET"; status: TestnetStatus; blocker?: string }>;
export type SignedRequest = Readonly<{ method: "GET" | "POST"; path: string; params: Readonly<Record<string, string | number>>; headers: Readonly<Record<string, string>> }>;
export type TransportResponse = Readonly<{ status: number; body: unknown }>;
export interface SignedRequestTransport { request(request: SignedRequest): Promise<TransportResponse>; }
export type ExchangeInfoMetadata = Readonly<{ symbols: ReadonlyArray<Readonly<{ symbol: "BTCUSDT" | "ETHUSDT"; status: string; filters: ReadonlyArray<Readonly<Record<string, string>>> }>> }>;

type Config = Readonly<{ mode: RuntimeMode; endpoint?: string; apiKey?: string; apiSecret?: string; credentialRef?: string; transport?: SignedRequestTransport; maxQuantity?: number; maxNotional?: number }>;
type Signature = (query: string, secret: string) => string;
const productionEndpoint = /(^|\/\/)fapi\.binance\.com|(^|\/)api\.binance\.com/i;
const productionCredential = /(production|prod|mainnet|live)/i;
const allowedSymbols = new Set(["BTCUSDT", "ETHUSDT"]);
const noNetworkTransport: SignedRequestTransport = { request: async () => { throw new Error("transport gate: authenticated network access is disabled without an injected transport"); } };
const freeze = <T>(v: T): T => { if (v && typeof v === "object" && !Object.isFrozen(v)) Object.freeze(v); return v; };

function queryString(params: Readonly<Record<string, string | number>>): string { return Object.keys(params).sort().map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`).join("&"); }
export function buildSignedRequest(method: "GET" | "POST", path: string, params: Readonly<Record<string, string | number>>, apiKey: string, apiSecret: string, signature: Signature = (query, secret) => createHmac("sha256", secret).update(query).digest("hex")): SignedRequest {
  if (path.startsWith("http") || path.includes("binance.com")) throw new Error("signed path must be relative to the Binance Futures Testnet endpoint");
  const signedParams = { ...params, signature: signature(queryString(params), apiSecret) };
  return freeze({ method, path, params: freeze(signedParams), headers: freeze({ "X-MBX-APIKEY": apiKey, "Content-Type": "application/x-www-form-urlencoded" }) });
}

export function blockedExternalEvidence(): AccountEvidence {
  return freeze({ capability: "BINANCE_TESTNET", status: "BLOCKED_EXTERNAL", blocker: "BINANCE_TESTNET account read is BLOCKED_EXTERNAL: server-side BINANCE_API_KEY and BINANCE_API_SECRET credentials are unavailable" });
}

export function normalizeExchangeInfo(input: unknown): ExchangeInfoMetadata {
  if (!input || typeof input !== "object" || !Array.isArray((input as any).symbols)) throw new TypeError("exchangeInfo must contain symbols");
  const symbols = (input as any).symbols.filter((x: any) => x && allowedSymbols.has(x.symbol) && typeof x.status === "string" && Array.isArray(x.filters)).map((x: any) => freeze({ symbol: x.symbol, status: x.status, filters: freeze(x.filters.filter((f: any) => f && typeof f === "object" && typeof f.filterType === "string").map((f: any) => freeze(Object.fromEntries(Object.entries(f).filter(([k, v]) => typeof k === "string" && typeof v === "string"))))) }));
  return freeze({ symbols: freeze(symbols) });
}

export class BinanceTestnetAdapter {
  readonly mode = RuntimeMode.BINANCE_TESTNET;
  private readonly transport: SignedRequestTransport;
  private readonly config: Config;
  constructor(config: Config) {
    if (config.mode !== RuntimeMode.BINANCE_TESTNET) throw new Error("Binance adapter requires BINANCE_TESTNET mode; LIVE_CONFIRMED is not supported");
    if (config.endpoint !== undefined && config.endpoint !== BINANCE_TESTNET_BASE_URL) throw new Error("only the Binance Futures Testnet endpoint is allowed; production endpoint rejected (testnet endpoint required)");
    if (config.credentialRef !== undefined && productionCredential.test(config.credentialRef)) throw new Error("production credential references are rejected");
    this.config = config; this.transport = config.transport ?? noNetworkTransport;
  }
  async accountRead(): Promise<AccountEvidence> {
    if (!this.config.apiKey || !this.config.apiSecret) return blockedExternalEvidence();
    const response = await this.transport.request(buildSignedRequest("GET", "/fapi/v2/account", { timestamp: Date.now() }, this.config.apiKey, this.config.apiSecret));
    if (response.status < 200 || response.status >= 300) return freeze({ capability: "BINANCE_TESTNET", status: "BLOCKED_EXTERNAL", blocker: `Binance Futures Testnet account read returned HTTP ${response.status}` });
    return freeze({ capability: "BINANCE_TESTNET", status: "READY" });
  }
  async submit(intent: BoundedIntent, clientOrderId: string): Promise<AdapterResult & { readonly clientOrderId: string }> {
    if (!isCanonicalBoundedIntent(intent)) throw new TypeError("intent is invalid, untrusted, or mutable");
    if (!allowedSymbols.has(intent.symbol)) throw new RangeError("symbol is outside the Binance Testnet BTCUSDT/ETHUSDT allowlist");
    const quantity = intent.quantity ?? intent.notional / intent.price;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity * intent.price > intent.notional + 1e-9 || (this.config.maxQuantity !== undefined && quantity > this.config.maxQuantity) || (this.config.maxNotional !== undefined && intent.notional > this.config.maxNotional)) throw new RangeError("quantity/price authority cannot expand the bounded intent");
    const account = await this.accountRead();
    if (account.status !== "READY") throw new Error("BLOCKED_EXTERNAL: Binance Testnet account read is unavailable");
    if (!this.config.apiKey || !this.config.apiSecret) throw new Error("BLOCKED_EXTERNAL: credentials unavailable");
    const response = await this.transport.request(buildSignedRequest("POST", "/fapi/v1/order", { symbol: intent.symbol, side: intent.side, type: intent.method, quantity, price: intent.price, newClientOrderId: clientOrderId, timestamp: Date.now() }, this.config.apiKey, this.config.apiSecret));
    const body = response.body as any;
    if (response.status < 200 || response.status >= 300) return { kind: "REJECTED", message: typeof body?.msg === "string" ? body.msg : `HTTP ${response.status}`, clientOrderId };
    return { kind: body?.status === "FILLED" ? "ACKNOWLEDGED" : "ACKNOWLEDGED", clientOrderId };
  }
}

export { allowedSymbols };
