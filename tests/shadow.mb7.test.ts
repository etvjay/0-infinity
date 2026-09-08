import test from "node:test";
import assert from "node:assert/strict";
import { runCampaign } from "../src/shadow/mb7Campaign.js";
import { validateEvidence } from "../src/shadow/mb7Evidence.js";

test("M-B7 campaign is deterministic and independently validates", async () => {
  const a = await runCampaign();
  const b = await runCampaign();
  assert.deepEqual(a.artifactHash, b.artifactHash);
  assert.equal(validateEvidence(a.artifact), true);
  assert.equal(a.artifact.mode, "SHADOW");
  assert.ok(a.artifact.workflowCount >= 12);
});

test("M-B7 validator rejects mutated critical fields", async () => {
  const { artifact } = await runCampaign();
  for (const mutate of [
    (x: any) => ({ ...x, codeSha: "0".repeat(40) }),
    (x: any) => ({ ...x, workflowCount: x.workflowCount + 1 }),
    (x: any) => ({ ...x, receipts: x.receipts.slice(1) }),
    (x: any) => ({ ...x, metrics: { ...x.metrics, refusals: x.metrics.refusals + 1 } }),
    (x: any) => ({ ...x, evidenceCeiling: "live trading proven" }),
    (x: any) => ({ ...x, workflows: [{ ...x.workflows[0], scenario: "UNKNOWN_WORKFLOW" }, ...x.workflows.slice(1)] }),
    (x: any) => ({ ...x, metrics: { ...x.metrics, authorityViolations: 1 } }),
  ]) assert.equal(validateEvidence(mutate(artifact)), false);
});
