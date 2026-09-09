import test from "node:test";
import assert from "node:assert/strict";
import { ZeroInfinityService } from "../src/product/service.js";

test("workflow timing records the resolved profile without changing governance composition", async () => {
  const service = new ZeroInfinityService({ idFactory: () => "wf-profile-timing", clock: (() => { let now = 1_000; return () => now++; })() });
  const workflow = service.createWorkflow({ symbol: "BTCUSDT", reasoningProfile: "DEEP" });
  const result = await service.submitOpportunity(workflow.workflowId);
  assert.equal(result.workflow.status, "COMPLETE");
  assert.equal(result.workflow.reasoningProfile, "DEEP");
  assert.equal(result.workflow.reasoningTiming?.profile, "DEEP");
  assert.ok(result.workflow.reasoningTiming?.totalReasoningDurationMs !== undefined);
  assert.deepEqual(result.workflow.composition.map((item) => item.role), ["ADVOCATE", "OPPOSER", "MARKET_ANALYST", "COUNCIL"]);
});
