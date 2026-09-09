import test from "node:test";
import assert from "node:assert/strict";
import { BuiltinWorkerAdapter, OpenAICompatibleModelAdapter } from "../src/product/adapters.js";
import { ZeroInfinityService } from "../src/product/service.js";
import type { RoleAdapter, RoleArtifact, RoleInvocation, RoleName } from "../src/product/types.js";

const roles = ["ADVOCATE", "OPPOSER", "MARKET_ANALYST"] as const;
const artifactFor = (input: RoleInvocation, now: number) => {
  const common = { ref: `injected:${input.invocationId}`, hash: `fixture:${input.invocationId}`, symbol: "BTCUSDT", observedAt: now, expiresAt: now + 300_000 };
  const envelope = { workflowId: input.workflowId, invocationId: input.invocationId, role: input.role };
  if (input.role === "ADVOCATE") return { ...envelope, kind: "ADVOCATE", payload: { kind: "ADVOCATE", ...common, direction: "LONG", expectedMoveBps: 40, confidence: 0.8 } };
  if (input.role === "OPPOSER") return { ...envelope, kind: "OPPOSE", payload: { kind: "OPPOSE", ...common, direction: "LONG", recommendation: "AGREE" } };
  return { ...envelope, kind: "MARKET_ACCOUNT", payload: { kind: "MARKET_ACCOUNT", ...common, market: "TRUSTED", account: "TRUSTED" } };
};

const plain = (adapter: RoleAdapter): RoleAdapter => ({ name: adapter.name, independence: adapter.independence, invoke: adapter.invoke.bind(adapter) });

test("local rehearsal proves injected provider-shaped evidence stops at the pre-Council boundary", async () => {
  let now = 1_000;
  const calls: RoleName[] = [];
  const transport = async (input: RoleInvocation): Promise<unknown> => {
    calls.push(input.role);
    assert.notEqual(input.role, "COUNCIL");
    return artifactFor(input, now);
  };
  const external = new OpenAICompatibleModelAdapter("rehearsal-injected-provider", transport, () => now);
  const council = new BuiltinWorkerAdapter("builtin-council", () => now);
  const service = new ZeroInfinityService({ clock: () => now, idFactory: () => "wf-rehearsal" });
  service.registerStack({
    name: "injected-provider-rehearsal",
    version: "v1",
    bindings: { ADVOCATE: plain(external), OPPOSER: plain(external), MARKET_ANALYST: plain(external), COUNCIL: plain(council) },
    capabilities: ["reasoning", "shadow", "readiness", "events"],
  });

  const workflow = service.createWorkflow({ symbol: "BTCUSDT" }, "injected-provider-rehearsal", "v1");
  assert.deepEqual(workflow.composition.map(({ role, independence }) => ({ role, independence })), [
    { role: "ADVOCATE", independence: "external" },
    { role: "OPPOSER", independence: "external" },
    { role: "MARKET_ANALYST", independence: "external" },
    { role: "COUNCIL", independence: "builtin" },
  ]);

  const result = await service.submitOpportunity(workflow.workflowId);
  assert.equal(result.workflow.status, "COMPLETE", result.workflow.error);
  assert.deepEqual(calls, roles);
  assert.equal((result.thesis as { direction?: string } | undefined)?.direction, "LONG");
  assert.equal(service.getReasoningReceipt(workflow.workflowId)?.evidence.supporting[0].ref, "injected:wf-rehearsal:ADVOCATE");
});


test("rehearsal evidence is explicitly injected, not live provider evidence", () => {
  const service = new ZeroInfinityService({ clock: () => 1_000, idFactory: () => "wf-rehearsal" });
  const readiness = service.getReadiness();
  assert.equal(readiness.hostedEvidence, false);
  assert.equal(readiness.liveWrites, false);
});
