import test from "node:test";
import assert from "node:assert/strict";
import { ZeroInfinityService } from "../src/product/service.js";

test("paper workflow refuses without canonical market/account inputs instead of fabricating intent", async () => {
  const service = new ZeroInfinityService({ clock: () => 1_700_000_000_000, idFactory: () => "wf-execution" });
  const result = await service.runPaperLiveWorkflow({ symbol: "BTCUSDT", venue: "BINANCE", product: "USD_M_FUTURES" });
  assert.equal(result.status, "REFUSED");
  assert.equal((result as any).code, "CAPABILITY_DENIED");
  assert.equal("paperReceipt" in result, false);
  assert.equal("orderReceipt" in result, false);
  assert.match((result as any).reason ?? "", /market|account|execution/i);
});

test("paper workflow composes explicit canonical execution input end to end", async () => {
  const now = 1_700_000_000_000;
  const service = new ZeroInfinityService({ clock: () => now, idFactory: () => "wf-canonical-paper" });
  const spreadBps = (100 / ((99_900 + 100_000) / 2)) * 10_000;
  const result = await service.runPaperLiveWorkflow({
    symbol: "BTCUSDT", venue: "BINANCE", product: "USD_M_FUTURES",
    paperExecution: {
      compilerPolicy: { accountId: "paper-acct", validityMs: 30_000, minExecutableEdgeBps: 1, maxSpreadBps: 20, maxSlippageBps: 1, maxFeeBps: 1, maxFundingCostBps: 1, maxNotional: 100, maxLossBps: 100, execution: "LIMIT", minEntryPrice: 100_000, maxEntryPrice: 100_000, entryTrigger: "BELOW" },
      anchor: { stateVersion: 1n, observedAt: now, receivedAt: now, markPrice: 99_950 },
      market: { version: 1n, observedAt: now, receivedAt: now, value: { venue: "BINANCE", instrument: "USD_M_FUTURES", symbol: "BTCUSDT", bidPrice: 99_900, askPrice: 100_000, markPrice: 99_950, expectedMoveBps: 40, spreadBps, slippageBps: 0, feeBps: 0, fundingCostBps: 0 } },
      account: { version: 1n, observedAt: now, receivedAt: now, value: { accountId: "paper-acct", availableNotional: 100, currentNotional: 0, currentLossBps: 0 } },
      evaluationPolicy: { maxMarketAgeMs: 0, maxAccountAgeMs: 0, maxAnchorVersionLag: 0n },
      fill: { eventId: "paper-fill-1", status: "FILLED", fillQuantity: 0.001, fillPrice: 100_000 },
    },
  } as any);
  assert.equal(result.status, "FILLED");
  assert.equal((result as any).noWrite, true);
  assert.equal((result as any).result.workflow.status, "FILLED");
  assert.equal((result as any).result.workflow.orderOutcome, "FILLED");
});
