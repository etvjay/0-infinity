#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { parseMandate, verifyMandate } from "../dist/src/mandate/verify.js";
import { MandateStore, MemoryPersistence } from "../dist/src/store/index.js";
import { BinanceTestnetAdapter, RuntimeMode, runBinanceTestnet } from "../dist/src/testnet/index.js";

const BASE = "https://testnet.binancefuture.com";
const required = ["BINANCE_TESTNET_API_KEY", "BINANCE_TESTNET_API_SECRET", "BINANCE_TESTNET_MANDATE_FILE", "BINANCE_TESTNET_EXPECTED_MOVE_BPS", "BINANCE_TESTNET_SLIPPAGE_BPS", "BINANCE_TESTNET_FEE_BPS"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) { console.error(JSON.stringify({ status: "BLOCKED_EXTERNAL", code: "CONFIG_REQUIRED", missing })); process.exit(2); }

const numberEnv = (name) => { const value = Number(process.env[name]); if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite non-negative number`); return value; };
const expectedMoveBps = numberEnv("BINANCE_TESTNET_EXPECTED_MOVE_BPS");
const slippageBps = numberEnv("BINANCE_TESTNET_SLIPPAGE_BPS");
const feeBps = numberEnv("BINANCE_TESTNET_FEE_BPS");
const apiKey = process.env.BINANCE_TESTNET_API_KEY;
const apiSecret = process.env.BINANCE_TESTNET_API_SECRET;
const mandate = parseMandate(await readFile(process.env.BINANCE_TESTNET_MANDATE_FILE, "utf8"));
const verification = verifyMandate(mandate, { workflowId: mandate.workflowId, thesisId: mandate.thesisId });
if (!verification.valid) throw new Error(`mandate verification failed: ${verification.reason ?? "invalid mandate"}`);

async function requestPublic(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "0-infinity-testnet-runner/1" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Testnet ${path} returned HTTP ${response.status}`);
  return body;
}

async function requestSigned(request) {
  const params = new URLSearchParams(Object.entries(request.params).map(([key, value]) => [key, String(value)]));
  const url = new URL(`${BASE}${request.path}`);
  const init = { method: request.method, headers: { ...request.headers, accept: "application/json", "user-agent": "0-infinity-testnet-runner/1" } };
  if (request.method === "GET") url.search = params.toString(); else init.body = params;
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

const transport = { request: requestSigned };
const adapter = new BinanceTestnetAdapter({ mode: RuntimeMode.BINANCE_TESTNET, endpoint: BASE, apiKey, apiSecret, transport });
const observedAt = Date.now();
const state = {
  exchangeInfo: () => requestPublic("/fapi/v1/exchangeInfo"),
  market: async (symbol) => {
    const [book, premium] = await Promise.all([requestPublic("/fapi/v1/ticker/bookTicker", { symbol }), requestPublic("/fapi/v1/premiumIndex", { symbol })]);
    const bidPrice = Number(book.bidPrice); const askPrice = Number(book.askPrice); const markPrice = Number(premium.markPrice);
    if (![bidPrice, askPrice, markPrice].every(Number.isFinite) || bidPrice <= 0 || askPrice < bidPrice || markPrice < bidPrice || markPrice > askPrice) throw new Error("invalid live Testnet market state");
    return Object.freeze({ version: BigInt(observedAt), observedAt, receivedAt: Date.now(), value: Object.freeze({ venue: mandate.venue, instrument: mandate.instrument, symbol, bidPrice, askPrice, markPrice, expectedMoveBps, spreadBps: (askPrice - bidPrice) / ((askPrice + bidPrice) / 2) * 10_000, slippageBps, feeBps, fundingCostBps: Math.max(0, Number(premium.lastFundingRate ?? 0) * 10_000) }) });
  },
  account: async () => {
    const response = await requestSigned({ method: "GET", path: "/fapi/v2/account", params: { timestamp: Date.now() }, headers: { "X-MBX-APIKEY": apiKey, "Content-Type": "application/x-www-form-urlencoded" } });
    if (response.status < 200 || response.status >= 300) throw new Error(`Testnet account state returned HTTP ${response.status}`);
    const body = response.body; const availableNotional = Number(body.availableBalance ?? body.totalWalletBalance); const positions = Array.isArray(body.positions) ? body.positions : [];
    const currentNotional = positions.reduce((sum, position) => sum + Math.abs(Number(position.positionAmt ?? 0) * Number(position.markPrice ?? 0)), 0);
    const unrealized = Number(body.totalUnrealizedProfit ?? 0); const currentLossBps = Math.max(0, -unrealized) / Math.max(availableNotional, 1) * 10_000;
    if (![availableNotional, currentNotional, currentLossBps].every(Number.isFinite) || availableNotional < 0 || currentNotional < 0 || currentLossBps < 0) throw new Error("invalid live Testnet account state");
    return Object.freeze({ version: BigInt(observedAt), observedAt, receivedAt: Date.now(), value: Object.freeze({ accountId: mandate.accountId, availableNotional, currentNotional, currentLossBps }) });
  },
};

const mandates = new MandateStore(new MemoryPersistence(), () => Date.now());
await mandates.issue(mandate);
const result = await runBinanceTestnet({ workflowId: mandate.workflowId, mandate, evaluationPolicy: { maxMarketAgeMs: 5_000, maxAccountAgeMs: 5_000, maxAnchorVersionLag: 3n }, authorityStatus: "ACTIVE", adapter, state, mandates, clock: () => Date.now() });
console.log(JSON.stringify({ status: result.status, noWrite: result.noWrite, account: result.account, ...(result.status === "BLOCKED_EXTERNAL" ? { blocker: result.blocker } : { workflowId: result.receipt.workflowId, orderOutcome: result.receipt.orderOutcome, clientOrderId: result.receipt.clientOrderId }) }, (_key, value) => typeof value === "bigint" ? `${value}n` : value, 2));
if (result.status === "BLOCKED_EXTERNAL") process.exit(2);
if (result.receipt.clientOrderId && result.receipt.status === "ACKNOWLEDGED") {
  const cancelled = await result.cancel();
  console.log(JSON.stringify({ status: cancelled.status, orderOutcome: cancelled.orderOutcome, workflowId: cancelled.workflowId }, (_key, value) => typeof value === "bigint" ? `${value}n` : value, 2));
}
