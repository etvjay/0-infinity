import assert from "node:assert/strict";
import test from "node:test";
import { ZeroInfinityService } from "../src/product/service.js";
import { handleRequest } from "../src/product/http.js";
import { handleMcp } from "../src/product/mcp.js";

test("REST and MCP register frozen reasoning stacks without accepting credentials", async () => {
  const config = { name: "api-stack", version: "v1", profile: "STANDARD", advocate: { adapter: "builtin" }, opposer: { adapter: "builtin" }, marketAnalyst: { adapter: "builtin" }, council: { adapter: "builtin" } } as const;
  const service = new ZeroInfinityService();
  const rest = await handleRequest(service, "POST", "/v1/reasoning-stacks", config);
  assert.equal(rest.status, 201);
  assert.equal((rest.body as { name: string }).name, "api-stack");
  const mcp = await handleMcp(service, { jsonrpc: "2.0", id: 1, method: "register_reasoning_stack", params: { config: { ...config, name: "mcp-stack" } } });
  assert.equal((mcp.result as { name: string }).name, "mcp-stack");
  const rejected = await handleRequest(service, "POST", "/v1/reasoning-stacks", { ...config, apiKey: "secret" });
  assert.equal(rejected.status, 400);
  const tools = await handleMcp(service, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.ok((tools.result as { tools: { name: string }[] }).tools.some(tool => tool.name === "register_reasoning_stack"));
});
