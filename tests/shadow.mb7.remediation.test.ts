import test from "node:test";
import assert from "node:assert/strict";
import { runCampaign } from "../src/shadow/mb7Campaign.js";
import { validateEvidence } from "../src/shadow/mb7Evidence.js";

test("M-B7 binds to git HEAD and records real council refusal and absence boundary", async () => {
  const old = process.env.MB7_CODE_SHA;
  process.env.MB7_CODE_SHA = "0".repeat(40);
  try {
    const { artifact } = await runCampaign();
    assert.notEqual(artifact.codeSha, "0".repeat(40));
    const council = artifact.receipts.find((r: any) => r.scenario === "council-refusal");
    assert.deepEqual({ status: council.status, code: council.refusalCode, source: council.provenance.stage }, { status: "REFUSED", code: "THRESHOLD_NOT_MET", source: "council" });
    const absent = artifact.receipts.find((r: any) => r.scenario === "unknown-recovery-order-absent");
    assert.equal(absent.recoveryStatus, "RECOVERY_BLOCKED");
    assert.equal(absent.recoveryError.code, "RECOVERY_BLOCKED");
    assert.match(absent.recoveryError.message, /workflow is not persisted/);
    assert.equal(validateEvidence(artifact), true);
  } finally { if (old === undefined) delete process.env.MB7_CODE_SHA; else process.env.MB7_CODE_SHA = old; }
});

test("M-B7 semantic validator rejects rehashed mutations", async () => {
  const { artifact } = await runCampaign();
  const rehash = (x: any) => ({ ...x, artifactHash: undefined });
  const mutated = structuredClone(artifact) as any;
  mutated.receipts[0].status = "REFUSED";
  mutated.receipts[0].refusalCode = "AUTHORITY_STATUS";
  delete mutated.artifactHash;
  assert.equal(validateEvidence(mutated), false);
  assert.equal(validateEvidence(rehash(artifact)), false);
});
