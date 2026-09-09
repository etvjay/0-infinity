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
