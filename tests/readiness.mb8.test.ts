import test from "node:test";
import assert from "node:assert/strict";
import { validateReadinessPolicy, ConfirmationBoundary, KillSwitch, capabilityManifest, startupSafetyReport, validateDemoArtifact } from "../src/readiness/index.js";

test("readiness policy is explicit, futures-only, and immutable", () => {
  const policy = { product: "USD_M_FUTURES", symbols: ["BTCUSDT", "ETHUSDT"], maxNotional: 100, maxQuantity: 1, maxSpreadBps: 25, maxSlippageBps: 5, maxFeeBps: 5, maxFundingCostBps: 5, freshnessMs: 1000, requireSynchronizedBook: true, requireConfirmation: true } as const;
  const accepted = validateReadinessPolicy(policy);
  assert.equal(accepted.maxNotional, 100);
  assert.equal(Object.isFrozen(accepted), true);
  assert.throws(() => validateReadinessPolicy({ ...policy, product: "SPOT" } as never));
  assert.throws(() => validateReadinessPolicy({ ...policy, symbols: ["XRPUSDT"] } as never));
});

test("confirmation binds exact intent and revalidation fails drift", () => {
  const boundary = new ConfirmationBoundary(1000, 100);
  const intent = Object.freeze({ kind: "EXECUTION_INTENT", mandateId: "m", workflowId: "w", symbol: "BTCUSDT", side: "BUY", method: "LIMIT", price: 100, quantity: 1, notional: 100, executableEdgeBps: 10, marketStateVersion: 1n, accountStateVersion: 1n, accountId: "a" });
  assert.equal(boundary.state, "READY_FOR_CONFIRMATION");
  const request = boundary.request(intent, 1000);
  assert.equal(boundary.state, "CONFIRMATION_REQUESTED");
  assert.equal(boundary.confirm(intent, request.token, request.expiresAt), false);
  assert.equal(boundary.state, "EXPIRED");
  assert.equal(boundary.confirm(intent, request.token, request.expiresAt), false);
});

test("kill switch blocks new work but permits reconciliation", () => {
  const kill = new KillSwitch();
  assert.equal(kill.state, "ENABLED");
  assert.equal(kill.allowsNewWork(), false);
  assert.equal(kill.allowsReconciliation(), true);
  kill.halt("operator boundary");
  assert.equal(kill.state, "HALTED");
  assert.equal(kill.allowsNewWork(), false);
});

test("manifest and report preserve blocked MCP evidence and no writes", () => {
  assert.equal(capabilityManifest.mcpRead, false);
  assert.equal(capabilityManifest.liveWrite, false);
  assert.match(startupSafetyReport, /Agentic MCP BLOCKED_EXTERNAL 401/);
  assert.match(startupSafetyReport, /LIVE WRITE DISABLED/);
});

test("demo artifact validator rejects mutated artifact", () => {
  const artifact = { status: "READINESS_PREPARED", codeSha: "0123456789012345678901234567890123456789", mode: "submission-ready-shadow/readiness", capabilities: capabilityManifest, scenarioIds: ["economics-edge-collapse", "valid-shadow-execution", "unknown-recovery"], receiptRefs: ["shadow-receipt-01", "shadow-receipt-02", "shadow-receipt-03"], mb7Ref: "ZO-BIN-MB7-SHADOW-DETERMINISTIC-V1", mcpEvidenceRef: "ZO-BIN-MCP-401-AGENTIC-READ-ONLY", externalBlockers: ["M-B2-G HTTP 451", "MCP HTTP 401 bearer authentication required"], liveWriteStatus: "DISABLED" };
  assert.equal(validateDemoArtifact(artifact), true);
  assert.equal(validateDemoArtifact({ ...artifact, liveWriteStatus: "ENABLED" }), false);
});
