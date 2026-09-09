import assert from "node:assert/strict";
import test from "node:test";
import { ZeroInfinityService } from "../src/product/service.js";
import { createReasoningStack } from "../src/product/reasoningStack.js";

test("consumer can create a heterogeneous endpoint-backed reasoning stack", () => {
  const stack = createReasoningStack({
    name: "consumer-stack", version: "v1", profile: "STANDARD",
    advocate: { adapter: "builtin" },
    opposer: { adapter: "http-agent", endpoint: "http://127.0.0.1:4101/role" },
    marketAnalyst: { adapter: "mcp-worker", endpoint: "http://127.0.0.1:4102/mcp", tool: "role_artifact" },
    council: { adapter: "builtin" },
  });
  const service = new ZeroInfinityService({ reasoningStack: stack, idFactory: () => "wf-configured" });
  const workflow = service.createWorkflow({ symbol: "BTCUSDT", side: "LONG", reasoningProfile: "STANDARD" }, "consumer-stack", "v1");
  assert.equal(workflow.stackName, "consumer-stack");
  assert.equal(workflow.stackVersion, "v1");
  assert.equal(workflow.reasoningProfile, "STANDARD");
  assert.equal(workflow.composition.find(x => x.role === "OPPOSER")?.adapter, "http-agent:http://127.0.0.1:4101/role");
  assert.equal(workflow.composition.find(x => x.role === "MARKET_ANALYST")?.adapter, "mcp-worker:http://127.0.0.1:4102/mcp");
  assert.throws(() => createReasoningStack({
    name: "external-council", version: "v1", advocate: { adapter: "builtin" }, opposer: { adapter: "builtin" }, marketAnalyst: { adapter: "builtin" }, council: { adapter: "openai-compatible", baseUrl: "http://127.0.0.1:11434/v1", model: "llama3.2:1b" }
  } as never), /custom Council workers are not supported/);
});
