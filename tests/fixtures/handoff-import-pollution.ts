import { conveneEvidenceCouncil, type CouncilInput } from "../../src/reasoning/index.js";

const mode = process.argv[2];
if (mode !== "allowedSymbols" && mode !== "economicsFills") throw new Error("unknown mode");

const councilInput = (): CouncilInput => ({ advocate: { kind: "ADVOCATE", ref: "a", hash: "a-hash", symbol: "BTCUSDT", direction: "LONG", expectedMoveBps: 50, confidence: .9, observedAt: 900, expiresAt: 10_000 }, oppose: { kind: "OPPOSE", ref: "o", hash: "o-hash", symbol: "BTCUSDT", direction: "LONG", recommendation: "AGREE", observedAt: 901, expiresAt: 10_000 }, evidence: { kind: "MARKET_ACCOUNT", ref: "m", hash: "evidence-hash", symbol: "BTCUSDT", market: "TRUSTED", account: "TRUSTED", observedAt: 902, expiresAt: 10_000 }, policy: { method: "replay-council", now: 1_000, maxAgeMs: 500, minConfidence: .7, minExpectedMoveBps: 10, thesisId: "t-1", thesisHash: "thesis-hash" } });
const economics = Object.freeze({ kind: "ASSESSMENT" as const, side: "BUY" as const, requestedQuantity: "1", executableQuantity: "1", bestExecutableReference: "100000", vwap: "100000", worstExecutionPrice: "100000", limitPrice: "100000", totalCost: "100000", spreadBps: "1", slippageBps: "0", feeBps: "0", fundingCostBps: "0", executableEdgeBps: "10", fills: Object.freeze([Object.freeze({ price: "100000", quantity: "1", notional: "100000" })]) });
const input = {
  council: conveneEvidenceCouncil(councilInput()), workflowId: "wf-1",
  compilerPolicy: { accountId: "acct", validityMs: 5_000, minExecutableEdgeBps: 1, maxSpreadBps: 10, maxSlippageBps: 10, maxFeeBps: 10, maxFundingCostBps: 10, maxNotional: 1_000, maxLossBps: 100, execution: "LIMIT" as const, minEntryPrice: 99_000, maxEntryPrice: 101_000, entryTrigger: "BELOW" as const, ...(mode === "allowedSymbols" ? { allowedSymbols: Object.freeze(["BTCUSDT"]) } : {}) },
  anchor: { stateVersion: 3n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 }, now: 1_500,
  economics: Object.freeze({ kind: "ECONOMICS" as const, evidenceHash: "evidence-hash", observedAt: 1_000, receivedAt: 1_001, source: "LOCAL" as const, orderBook: Object.freeze({ status: "SYNCED" as const, trusted: true }), result: economics })
};
Object.defineProperty(Array.prototype, Symbol.for("preImportPoison"), { value: true, configurable: true });
const { createCouncilHandoff } = await import("../../src/reasoning/handoff.js");
const result = createCouncilHandoff(input as never);
process.stdout.write(result.kind);
