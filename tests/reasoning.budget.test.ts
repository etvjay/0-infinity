import test from "node:test";
import assert from "node:assert/strict";
import { profileBudget, resolveReasoningProfile, type ReasoningProfile } from "../src/product/reasoningBudget.js";
import { OpenAICompatibleModelAdapter } from "../src/product/adapters.js";
import type { RoleInvocation } from "../src/product/types.js";

const input: RoleInvocation = {
  workflowId: "wf-budget",
  invocationId: "wf-budget:ADVOCATE",
  role: "ADVOCATE",
  opportunity: { symbol: "BTCUSDT" },
  timeoutMs: 35,
};

test("reasoning profiles resolve one bounded budget per workflow", () => {
  const expected: Record<ReasoningProfile, [number, number, number]> = {
    FAST: [5_000, 5_000, 15_000],
    STANDARD: [12_000, 12_000, 30_000],
    DEEP: [30_000, 30_000, 60_000],
  };
  for (const profile of Object.keys(expected) as ReasoningProfile[]) {
    const budget = profileBudget(profile);
    assert.deepEqual([budget.roleTimeoutMs, budget.councilTimeoutMs, budget.workflowDeadlineMs], expected[profile]);
    assert.equal(resolveReasoningProfile(profile), profile);
  }
});

test("unknown reasoning profiles fail closed", () => {
  assert.throws(() => resolveReasoningProfile("UNSAFE"), /reasoning profile/i);
});

test("external adapters honor the effective invocation budget instead of a universal five-second cap", async () => {
  const adapter = new OpenAICompatibleModelAdapter("budget-test", async () => new Promise((resolve) => setTimeout(() => resolve({
    workflowId: input.workflowId,
    invocationId: input.invocationId,
    role: input.role,
    kind: "ADVOCATE",
    payload: { kind: "ADVOCATE", ref: "r", hash: "h", symbol: "BTCUSDT", direction: "LONG", expectedMoveBps: 40, confidence: 0.8, observedAt: 0, expiresAt: 300000 },
  }), 12)), () => 0);
  const artifact = await adapter.invoke(input);
  assert.equal(artifact.role, "ADVOCATE");
});
