import test from "node:test";
import assert from "node:assert/strict";
import { runCampaign } from "../src/shadow/mb7Campaign.js";
import { validateEvidence } from "../src/shadow/mb7Evidence.js";

test("M-B7 binds to the latest implementation commit and ignores env overrides", async () => {
  const old = process.env.MB7_CODE_SHA;
  process.env.MB7_CODE_SHA = "0".repeat(40);
  try {
    const { artifact } = await runCampaign();
    assert.equal(artifact.codeSha, "1b9f5cee4a93e0c8a9b1e994723356a74b7e2b36");
    assert.equal(artifact.implementationSha, artifact.codeSha);
    const council = artifact.receipts.find((r: any) => r.scenario === "council-refusal");
    assert.deepEqual({ status: council.status, code: council.refusalCode, source: council.provenance.stage }, { status: "REFUSED", code: "THRESHOLD_NOT_MET", source: "council" });
    const absent = artifact.receipts.find((r: any) => r.scenario === "unknown-recovery-order-absent");
    assert.equal(absent.recoveryStatus, "RECOVERY_BLOCKED");
    assert.equal(absent.recoveryError.code, "RECOVERY_BLOCKED");
    assert.match(absent.recoveryError.message, /workflow is not persisted/);
    assert.equal(validateEvidence(artifact), true);
  } finally { if (old === undefined) delete process.env.MB7_CODE_SHA; else process.env.MB7_CODE_SHA = old; }
});

test("M-B7 rejects hostile object shapes and polluted prototypes", async () => {
  const { artifact } = await runCampaign();
  const hostile = (value: any, mutate: (copy: any) => void) => {
    const copy = structuredClone(value);
    mutate(copy);
    delete copy.artifactPayloadSha256;
    return copy;
  };
  assert.equal(validateEvidence(hostile(artifact, x => Object.defineProperty(x, "extra", { value: 1 }))), false);
  assert.equal(validateEvidence(hostile(artifact, x => Object.setPrototypeOf(x, { polluted: true }))), false);
  assert.equal(validateEvidence(hostile(artifact, x => Object.defineProperty(x, "mode", { get: () => "SHADOW" }))), false);
  assert.equal(validateEvidence(hostile(artifact, x => { x.scenarios = [...x.scenarios]; x.scenarios.length++; })), false);
  assert.equal(validateEvidence(hostile(artifact, x => { x.workflows[0] = { ...x.workflows[0], [Symbol("extra")]: 1 }; })), false);
  Object.defineProperty(Object.prototype, "mb7Polluted", { value: true, configurable: true });
  try { assert.equal(validateEvidence(hostile(artifact, () => {})), false); }
  finally { delete (Object.prototype as any).mb7Polluted; }
});

test("M-B7 requires exact one-to-one scenario coverage after rehash", async () => {
  const { artifact } = await runCampaign();
  const copy = structuredClone(artifact) as any;
  copy.scenarios[1] = copy.scenarios[0];
  copy.workflows[1].scenario = copy.workflows[0].scenario;
  copy.receipts[1].scenario = copy.receipts[0].scenario;
  delete copy.artifactPayloadSha256;
  assert.equal(validateEvidence(copy), false);
});

test("M-B7 semantic validator rejects rehashed mutations", async () => {
  const { artifact } = await runCampaign();
  const rehash = (x: any) => ({ ...x, artifactPayloadSha256: undefined });
  const mutated = structuredClone(artifact) as any;
  mutated.receipts[0].status = "REFUSED";
  mutated.receipts[0].refusalCode = "AUTHORITY_STATUS";
  delete mutated.artifactPayloadSha256;
  assert.equal(validateEvidence(mutated), false);
  assert.equal(validateEvidence(rehash(artifact)), false);
});
