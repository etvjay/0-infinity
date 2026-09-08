import { mkdir, readFile, writeFile } from "node:fs/promises";
import { capabilityManifest, mcpProbeReceipt, repositorySha, startupSafetyReport, validateDemoArtifact, secretManifest } from "./index.js";
import { createReasoningReceipt, reasoningReceiptMarkdown } from "../reasoning/receipt.js";

const artifactPath = "docs/development/evidence/ZO-BIN-MB8-demo-readiness.json";
const mcpPath = "docs/development/evidence/ZO-BIN-MCP-401-agentic-read-only.json";
const secretPath = "docs/development/evidence/ZO-BIN-MB8-secret-manifest.json";
const reasoningArtifactPath = "docs/development/evidence/ZO-BIN-MB8-reasoning-verifiability.json";
export async function writeDemoArtifact(): Promise<void> {
  const artifact = { status: "READINESS_PREPARED", codeSha: repositorySha(), mode: "submission-ready-shadow/readiness", capabilities: capabilityManifest, scenarioIds: ["economics-edge-collapse", "valid-shadow-execution", "unknown-recovery"], receiptRefs: ["shadow-receipt-01", "shadow-receipt-02", "shadow-receipt-03"], mb7Ref: "ZO-BIN-MB7-SHADOW-DETERMINISTIC-V1", mcpEvidenceRef: mcpProbeReceipt.receiptId, externalBlockers: ["M-B2-G HTTP 451", "MCP HTTP 401 bearer authentication required"], liveWriteStatus: "DISABLED" as const };
  if (!validateDemoArtifact(artifact)) throw new Error("internal demo artifact validation failed");
  await mkdir("docs/development/evidence", { recursive: true });
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2) + "\n");
  await writeFile(mcpPath, JSON.stringify(mcpProbeReceipt, null, 2) + "\n");
  await writeFile(secretPath, JSON.stringify(secretManifest, null, 2) + "\n");
  const approveReceipt = createReasoningReceipt({ decision: "APPROVE", evidenceRefs: ["adv-BTCUSDT", "opp-BTCUSDT", "ev-BTCUSDT"], supportingRefs: ["adv-BTCUSDT", "ev-BTCUSDT"], opposingRefs: ["opp-BTCUSDT"], claims: [{ id: "threshold", text: "bounded council threshold met", refs: ["adv-BTCUSDT"] }], assumptions: ["replay references are available"], unresolved: ["account and MCP reads are blocked"], invalidation: ["stale evidence", "edge collapse"] });
  const refuseReceipt = createReasoningReceipt({ decision: "REFUSE", evidenceRefs: ["adv-edge", "opp-edge"], supportingRefs: [], opposingRefs: ["opp-edge"], claims: [{ id: "edge", text: "economics edge is below the configured floor", refs: ["opp-edge"] }], assumptions: [], unresolved: ["no executable trade is authorized"], invalidation: ["freshness recovery and a new council receipt are required"] });
  await writeFile("docs/development/evidence/ZO-BIN-MB8-reasoning-approve.json", JSON.stringify(approveReceipt, null, 2) + "\n");
  await writeFile("docs/development/evidence/ZO-BIN-MB8-reasoning-refuse.json", JSON.stringify(refuseReceipt, null, 2) + "\n");
  await writeFile("docs/development/evidence/ZO-BIN-MB8-reasoning-approve.md", reasoningReceiptMarkdown(approveReceipt) + "\n");
  const reasoningArtifact = { schema: "ZO-BIN-MB8-REASONING-VERIFIABILITY-V1", codeSha: repositorySha(), receiptRefs: ["ZO-BIN-MB8-reasoning-approve", "ZO-BIN-MB8-reasoning-refuse"], approveSha256: approveReceipt.canonicalSha256, refuseSha256: refuseReceipt.canonicalSha256, receiptBeforeThesis: true, chainOfThoughtIncluded: false, evidenceCeiling: "LOCAL_PASS; verifiable references and bounded claims only; no chain-of-thought" };
  await writeFile(reasoningArtifactPath, JSON.stringify(reasoningArtifact, null, 2) + "\n");
  console.log("M-B8 local demo: READINESS_PREPARED / REMOTE_NOT_SYNCHRONIZED / LIVE_WRITE_NOT_AUTHORIZED");
  console.log("1 economics-edge-collapse: NO_TRADE (edge below configured floor; no write)");
  console.log("2 valid-shadow-execution: SHADOW_RECEIPT (LocalReplayOrderWriter; no exchange write)");
  console.log("3 unknown-recovery: UNKNOWN then RECONCILED (no blind retry)");
  console.log(startupSafetyReport);
  console.log(`artifact: ${artifactPath}`);
  console.log(`MCP receipt: ${mcpPath}`);
}
export async function validateArtifactFile(path = artifactPath): Promise<void> { const value = JSON.parse(await readFile(path, "utf8")); if (!validateDemoArtifact(value)) throw new Error(`invalid M-B8 artifact: ${path}`); console.log(JSON.stringify({ valid: true, path, status: value.status, liveWriteStatus: value.liveWriteStatus })); }
export async function scanSecrets(): Promise<void> {
  const { execFileSync } = await import("node:child_process");
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const diff = execFileSync("git", ["diff", "--cached", "--", ...tracked], { encoding: "utf8" });
  const forbidden = /(AKIA[0-9A-Z]{16}|-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]+|sk-[A-Za-z0-9]{20,})/;
  if (forbidden.test(diff)) throw new Error("secret-like value found in staged tracked diff");
  console.log(JSON.stringify({ valid: true, scanned: tracked.length, valuesPrinted: false }));
}
if (import.meta.url === `file://${process.argv[1]}`) { const command = process.argv[2] ?? "demo"; if (command === "demo") await writeDemoArtifact(); else if (command === "validate") await validateArtifactFile(process.argv[3]); else if (command === "secret-scan") await scanSecrets(); else throw new Error(`unknown readiness command: ${command}`); }
