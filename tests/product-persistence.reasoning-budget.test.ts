import test from "node:test";
import assert from "node:assert/strict";
import { MemoryProductProjectionPersistence } from "../src/product/persistence.js";

const workflow = {
  workflowId: "wf-budget",
  stackName: "default",
  stackVersion: "v1",
  createdAt: 1,
  status: "CREATED",
  opportunity: { symbol: "BTCUSDT" },
  composition: [],
  reasoningProfile: "STANDARD",
  reasoningBudget: { profile: "STANDARD", roleTimeoutMs: 12000, councilTimeoutMs: 12000, workflowDeadlineMs: 30000, maxEvidenceAgeMs: 300000 },
};

test("product projections persist reasoning budget metadata", () => {
  const persistence = new MemoryProductProjectionPersistence();
  persistence.save({ version: 1, workflows: { "wf-budget": workflow as never } });
  assert.equal((persistence.load().workflows["wf-budget"] as any).reasoningBudget.profile, "STANDARD");
});
