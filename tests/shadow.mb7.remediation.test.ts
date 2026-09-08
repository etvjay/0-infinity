import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { runCampaign } from "../src/shadow/mb7Campaign.js";
import { validateEvidence } from "../src/shadow/mb7Evidence.js";

test("M-B7 provenance is scoped to the campaign implementation source", () => {
  const source = readFileSync("src/shadow/mb7Campaign.ts", "utf8");
  const provenanceLine = source.split("\n").find(line => line.includes("runnerImplementationSha=()")) ?? "";
  assert.doesNotMatch(provenanceLine, /mb7Evidence\.ts/);
  assert.match(source, /src\/shadow\/mb7Campaign\.ts/);
});

test("M-B7 binds explicit runner and validator implementation commits", async () => {
    const { artifact } = await runCampaign();
    const expectedRunnerSha = execFileSync("git", ["log", "-1", "--format=%H", "--", "src/shadow/mb7Campaign.ts"], { encoding: "utf8" }).trim();
    const expectedValidatorSha = execFileSync("git", ["log", "-1", "--format=%H", "--", "src/shadow/mb7Evidence.ts"], { encoding: "utf8" }).trim();
    assert.equal(artifact.runnerImplementationSha, expectedRunnerSha);
    assert.equal(artifact.validatorImplementationSha, expectedValidatorSha);
    assert.equal("codeSha" in artifact, false);
    assert.equal("implementationSha" in artifact, false);
    const council = artifact.receipts.find((r: any) => r.scenario === "council-refusal");
    assert.deepEqual({ status: council.status, code: council.refusalCode, source: council.provenance.stage }, { status: "REFUSED", code: "THRESHOLD_NOT_MET", source: "council" });
    const absent = artifact.receipts.find((r: any) => r.scenario === "unknown-recovery-order-absent");
    assert.equal(absent.recoveryStatus, "RECOVERY_BLOCKED");
    assert.equal(absent.recoveryError.code, "RECOVERY_BLOCKED");
    assert.match(absent.recoveryError.message, /workflow is not persisted/);
    assert.equal(validateEvidence(artifact), true);
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

test("M-B7 rejects rehashed accessor-backed canonical arrays", async () => {
  const { artifact } = await runCampaign();
  const copy = structuredClone(artifact) as any;
  Object.defineProperty(copy.scenarios, "0", { get: () => artifact.scenarios[0], enumerable: true, configurable: true });
  const payload = { ...copy };
  delete payload.artifactPayloadSha256;
  copy.artifactPayloadSha256 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  assert.equal(validateEvidence(copy), false);
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

test("M-B7 rejects every receipt semantic mutation after rehash", async () => {
  const { artifact } = await runCampaign();
  const cases: Array<[string, string, (r: any) => void]> = [
    ["approval ACK status", "approval-ack", r => { r.status = "REFUSED"; }],
    ["approval ACK order outcome", "approval-ack", r => { r.orderOutcome = "REJECTED"; }],
    ["partial order outcome", "approval-partial", r => { r.orderOutcome = "FILLED"; }],
    ["fill order outcome", "approval-fill", r => { r.orderOutcome = "PARTIALLY_FILLED"; }],
    ["submission reject order outcome", "submission-reject", r => { r.orderOutcome = "ACKNOWLEDGED"; }],
    ["unknown recovery status", "unknown-recovery", r => { r.recoveryStatus = "RECOVERY_BLOCKED"; }],
    ["council refusal code", "council-refusal", r => { r.refusalCode = "AUTHORITY_STATUS"; }],
    ["council refusal stage", "council-refusal", r => { r.provenance.stage = "supervisor"; }],
    ["expiry code", "expiry", r => { r.refusalCode = "AUTHORITY_STATUS"; }],
    ["duplicate trigger flag", "duplicate-trigger-event-suppression", r => { r.unchanged = false; }],
    ["duplicate order flag", "duplicate-order-events", r => { r.unchanged = false; }],
    ["out of order flag", "out-of-order-terminal-refusal", r => { r.prevented = false; }],
    ["restart restored version", "restart-restore", r => { r.restoredVersion = 2; }],
    ["recovery blocked status", "unknown-recovery-order-absent", r => { r.status = "UNKNOWN"; }],
    ["recovery blocked error code", "unknown-recovery-order-absent", r => { r.recoveryError.code = "OTHER"; }],
    ["recovery blocked error message", "unknown-recovery-order-absent", r => { r.recoveryError.message = "altered"; }],
    ["contradictory authority flag", "contradictory-authority", r => { r.prevented = false; }],
    ["symbol isolation flag", "symbol-isolation", r => { r.distinct = false; }],
    ["receipt provenance", "approval-ack", r => { r.provenance.lineage = ["tampered"]; }],
  ];
  for (const [label, scenario, mutate] of cases) {
    const copy = structuredClone(artifact) as any;
    mutate(copy.receipts.find((r: any) => r.scenario === scenario));
    delete copy.artifactPayloadSha256;
    assert.equal(validateEvidence(copy), false, label);
  }
});

test("M-B7 rejects either wrong implementation SHA after rehash", async () => {
  const { artifact } = await runCampaign();
  for (const field of ["runnerImplementationSha", "validatorImplementationSha"]) {
    const copy = structuredClone(artifact) as any;
    copy[field] = "0".repeat(40);
    delete copy.artifactPayloadSha256;
    assert.equal(validateEvidence(copy), false, field);
  }
});
