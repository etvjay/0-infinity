import { UsdMFuturesMarketState, UsdMFuturesOrderBook, type UsdMFuturesSymbol } from "./index.js";

export type UsdMFuturesConnectivityStatus = "IDLE" | "SUBSCRIBING" | "SUBSCRIBED" | "BACKOFF" | "FAILED" | "STOPPED";

export interface UsdMFuturesTransportConnection {
  send(message: string): void;
  onMessage(handler: (message: string) => void): void;
  onClose(handler: (reason?: string) => void): void;
  close(): void;
}

export interface UsdMFuturesMarketTransport {
  connect(): UsdMFuturesTransportConnection;
}

export interface UsdMFuturesConnectivityScheduler {
  schedule(task: () => void, delayMs: number): void;
}

export interface UsdMFuturesMarketConnectivityConfig {
  readonly symbols: readonly UsdMFuturesSymbol[];
  readonly streams: readonly string[];
  readonly maxReconnectAttempts?: number;
  readonly backoffMs?: readonly number[];
}

export interface UsdMFuturesMarketConnectivityOptions {
  readonly onMarketEvent?: (event: Record<string, unknown>) => void;
  readonly scheduler?: UsdMFuturesConnectivityScheduler;
  readonly receivedAt?: () => number;
  readonly marketState?: UsdMFuturesMarketState;
  readonly orderBook?: UsdMFuturesOrderBook;
}

const DEFAULT_BACKOFF = [250, 1_000, 5_000];
const SUPPORTED_EVENTS = new Set(["bookTicker", "depthUpdate"]);
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

function validateConfig(config: UsdMFuturesMarketConnectivityConfig): void {
  if (config.symbols.length === 0 || config.symbols.some(symbol => symbol !== "BTCUSDT" && symbol !== "ETHUSDT"))
    throw new RangeError("symbol must be supported by USD_M_FUTURES_UM");
  const symbols = new Set(config.symbols.map(symbol => symbol.toLowerCase()));
  if (config.streams.length === 0 || config.streams.some(stream => {
    const symbol = stream.split("@")[0];
    return !symbols.has(symbol) || !/^([a-z0-9]+)@(bookTicker|depth|depth@(100ms|500ms))$/.test(stream);
  })) throw new RangeError("stream must be a supported public USD-M market stream");
  if (config.maxReconnectAttempts !== undefined && (!Number.isSafeInteger(config.maxReconnectAttempts) || config.maxReconnectAttempts < 0))
    throw new RangeError("maxReconnectAttempts must be a non-negative safe integer");
  if (config.backoffMs !== undefined && config.backoffMs.some(delay => !Number.isSafeInteger(delay) || delay < 0))
    throw new RangeError("backoffMs must contain non-negative safe integers");
}

class ImmediateScheduler implements UsdMFuturesConnectivityScheduler {
  schedule(task: () => void): void { task(); }
}

export class UsdMFuturesMarketConnectivity {
  readonly endpoint = "wss://fstream.binance.com" as const;
  status: UsdMFuturesConnectivityStatus = "IDLE";
  private connection?: UsdMFuturesTransportConnection;
  private requestId = 0;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts: number;
  private readonly backoffMs: readonly number[];
  private readonly scheduler: UsdMFuturesConnectivityScheduler;
  private readonly onMarketEvent?: (event: Record<string, unknown>) => void;
  private readonly receivedAt?: () => number;
  private readonly marketState?: UsdMFuturesMarketState;
  private readonly orderBook?: UsdMFuturesOrderBook;
  private lifecycleToken = 0;

  constructor(private readonly transport: UsdMFuturesMarketTransport, private readonly config: UsdMFuturesMarketConnectivityConfig, options: UsdMFuturesMarketConnectivityOptions = {}) {
    validateConfig(config);
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? DEFAULT_BACKOFF.length;
    this.backoffMs = config.backoffMs ?? DEFAULT_BACKOFF;
    this.scheduler = options.scheduler ?? new ImmediateScheduler();
    this.onMarketEvent = options.onMarketEvent;
    this.receivedAt = options.receivedAt;
    this.marketState = options.marketState;
    this.orderBook = options.orderBook;
  }

  start(): void {
    if (this.status === "STOPPED") throw new Error("connectivity is stopped");
    if (this.status === "SUBSCRIBING" || this.status === "SUBSCRIBED") return;
    this.connect();
  }

  stop(): void {
    if (this.status === "STOPPED") return;
    const connection = this.connection; this.connection = undefined; this.status = "STOPPED"; connection?.close();
  }

  unsubscribe(): void {
    if (!this.connection || (this.status !== "SUBSCRIBED" && this.status !== "SUBSCRIBING")) return;
    this.send("UNSUBSCRIBE");
    const connection = this.connection;
    this.connection = undefined;
    this.lifecycleToken++;
    this.status = "IDLE";
    connection.close();
  }

  private connect(): void {
    this.status = "SUBSCRIBING";
    let connection: UsdMFuturesTransportConnection;
    try { connection = this.transport.connect(); } catch (error) { this.connection = undefined; this.scheduleReconnect(error instanceof Error ? error.message : "connect failed"); return; }
    this.connection = connection;
    connection.onMessage(message => this.handleMessage(connection, message));
    connection.onClose(reason => this.handleClose(connection, reason));
    this.send("SUBSCRIBE");
  }

  private send(method: "SUBSCRIBE" | "UNSUBSCRIBE"): void {
    this.connection?.send(JSON.stringify({ method, params: [...this.config.streams], id: ++this.requestId }));
  }

  private handleMessage(connection: UsdMFuturesTransportConnection, raw: string): void {
    if (connection !== this.connection || this.status === "STOPPED") return;
    let value: unknown; try { value = JSON.parse(raw); } catch { return; }
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const message = value as Record<string, unknown>;
    if (own(message, "id") && message.id === this.requestId) {
      if (own(message, "result") && message.result === null && !own(message, "error")) {
        this.reconnectAttempts = 0;
        this.status = "SUBSCRIBED";
      } else {
        this.connection = undefined;
        connection.close();
        this.scheduleReconnect("invalid subscription acknowledgement");
      }
      return;
    }
    if (message.e === "ACCOUNT_UPDATE" || message.e === "listenKeyExpired") throw new RangeError("private user-data events are not accepted by public market connectivity");
    if (typeof message.e !== "string" || !SUPPORTED_EVENTS.has(message.e) || typeof message.s !== "string") return;
    if (!this.config.symbols.includes(message.s as UsdMFuturesSymbol)) return;
    if (message.productFamily !== undefined && message.productFamily !== "USD_M_FUTURES_UM") return;
    if (message.st !== undefined && message.st !== 1 && message.st !== "1") return;
    if (message.ps !== undefined && message.ps !== message.s) return;
    const receivedAt = this.receivedAt?.();
    if (receivedAt !== undefined) {
      if (message.e === "bookTicker") this.marketState?.ingest(message, receivedAt);
      else this.orderBook?.ingestDiff(message, receivedAt);
    }
    this.onMarketEvent?.(message);
  }

  private handleClose(connection: UsdMFuturesTransportConnection, reason?: string): void {
    if (connection !== this.connection || this.status === "STOPPED") return;
    this.connection = undefined; this.scheduleReconnect(reason ?? "closed");
  }

  private scheduleReconnect(_reason: string): void {
    if (this.status === "STOPPED") return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) { this.status = "FAILED"; return; }
    const attempt = this.reconnectAttempts++;
    this.status = "BACKOFF";
    const delay = this.backoffMs[attempt] ?? this.backoffMs[this.backoffMs.length - 1] ?? 0;
    const token = this.lifecycleToken;
    this.scheduler.schedule(() => { if (this.status === "BACKOFF" && token === this.lifecycleToken) this.connect(); }, delay);
  }
}
