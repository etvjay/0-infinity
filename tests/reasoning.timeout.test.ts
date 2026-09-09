import test from "node:test";
import assert from "node:assert/strict";
import { OpenAICompatibleModelAdapter } from "../src/product/adapters.js";
import type { RoleInvocation } from "../src/product/types.js";

test("adapter timeout is enforced at the workflow-selected invocation budget", async () => {
  const adapter = new OpenAICompatibleModelAdapter("timeout-test", async () => new Promise((resolve) => setTimeout(resolve, 40)), () => 0);
  const input: RoleInvocation = { workflowId: "wf-timeout", invocationId: "wf-timeout:ADVOCATE", role: "ADVOCATE", opportunity: { symbol: "BTCUSDT" }, timeoutMs: 10 };
  await assert.rejects(() => adapter.invoke(input), /failed or timed out/);
});
