import { mkdir, writeFile } from "node:fs/promises";
import { UsdMFuturesMarketState } from "../dist/src/market/index.js";

const endpoint = "wss://fstream.binance.com/stream?streams=btcusdt@bookTicker/ethusdt@bookTicker";
const symbols = ["BTCUSDT", "ETHUSDT"];
const targetPerSymbol = 3;
const timeoutMs = 15_000;
const startedAt = Date.now();
const observations = [];
let openedAt;
let closeInfo = null;
let errorInfo = null;

await new Promise((resolve) => {
  const ws = new WebSocket(endpoint);
  const timer = setTimeout(() => { closeInfo = { code: null, reason: "capture timeout" }; ws.close(); resolve(); }, timeoutMs);
  ws.addEventListener("open", () => { openedAt = Date.now(); });
  ws.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      const raw = message?.data ?? message;
      if (raw?.e !== "bookTicker" || !symbols.includes(raw.s)) return;
      if (observations.filter((x) => x.raw.s === raw.s).length >= targetPerSymbol) return;
      observations.push({ raw, receivedAt: Date.now() });
      const complete = symbols.every((symbol) => observations.filter((x) => x.raw.s === symbol).length >= targetPerSymbol);
      if (complete) { clearTimeout(timer); ws.close(); resolve(); }
    } catch (error) {
      errorInfo = { type: "PARSE_ERROR", message: error instanceof Error ? error.message : String(error) };
    }
  });
  ws.addEventListener("error", () => { errorInfo = { type: "WEBSOCKET_ERROR" }; clearTimeout(timer); resolve(); });
  ws.addEventListener("close", (event) => {
    closeInfo = { code: event.code, reason: event.reason };
    clearTimeout(timer);
    resolve();
  });
});

const state = new UsdMFuturesMarketState();
const normalized = [];
const validity = [];
for (const item of observations) {
  try {
    normalized.push({ ...state.ingest(item.raw, item.receivedAt), raw: item.raw, receivedAt: item.receivedAt });
    validity.push({ symbol: item.raw.s, updateVersion: String(item.raw.u), valid: true });
  } catch (error) {
    validity.push({ symbol: item.raw?.s ?? null, updateVersion: String(item.raw?.u ?? ""), valid: false, error: error instanceof Error ? error.message : String(error) });
  }
}
const bySymbol = Object.fromEntries(symbols.map((symbol) => {
  const rows = normalized.filter((x) => x.symbol === symbol);
  const ids = rows.map((x) => x.updateVersion.toString());
  const times = rows.map((x) => x.eventTime);
  return [symbol, { sampleCount: rows.length, updateIds: ids, eventTimes: times, receivedAt: rows.map((x) => x.receivedAt), monotonicUpdateIds: ids.every((x, i) => i === 0 || BigInt(x) > BigInt(ids[i - 1])), validSamples: rows.length === targetPerSymbol }];
}));
const artifact = {
  schema: "ZO-BIN-MB8-PAPER-MARKET-INPUT-V2",
  status: observations.length === targetPerSymbol * symbols.length && validity.every((x) => x.valid) ? "LIVE_READ_PASS" : (errorInfo ? "BLOCKED_EXTERNAL" : "LIVE_READ_INCOMPLETE"),
  source: { endpoint, transport: "native Binance public WebSocket", stream: "bookTicker", product: "USD_M_FUTURES", symbols },
  capture: { startedAt, openedAt: openedAt ?? null, endedAt: Date.now(), timeoutMs, websocketOpen: openedAt !== undefined, close: closeInfo, error: errorInfo, responseStatus: openedAt !== undefined ? "OPEN" : "BLOCKED_EXTERNAL" },
  observationCount: normalized.length,
  observations: normalized.map((x) => ({ raw: x.raw, receivedAt: x.receivedAt, normalized: { venue: x.venue, instrument: x.instrument, symbol: x.symbol, bidPrice: x.bidPrice, bidQuantity: x.bidQuantity, askPrice: x.askPrice, askQuantity: x.askQuantity, eventTime: x.eventTime, transactionTime: x.transactionTime, updateVersion: x.updateVersion.toString() } })),
  checks: { perSymbol: bySymbol, allSamplesValid: validity.every((x) => x.valid), validity, noCredentialsUsed: true, noWriteEndpointUsed: true },
  evidenceCeiling: "Bounded native public Binance bookTicker observations normalized locally. Top-of-book only; no synchronized depth, account state, profitability, execution, exchange write, or production-readiness claim."
};
await mkdir(".local/evidence", { recursive: true });
await writeFile(".local/evidence/ZO-BIN-MB8-paper-market-input-v2.json", JSON.stringify(artifact, (_, value) => typeof value === "bigint" ? `${value}n` : value, 2) + "\n");
console.log(JSON.stringify({ status: artifact.status, endpoint, responseStatus: artifact.capture.responseStatus, observationCount: artifact.observationCount, perSymbol: bySymbol, validity: artifact.checks.allSamplesValid, file: ".local/evidence/ZO-BIN-MB8-paper-market-input-v2.json" }));
if (artifact.status !== "LIVE_READ_PASS") process.exitCode = 2;
