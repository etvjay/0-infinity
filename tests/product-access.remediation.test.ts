import test from "node:test";
import assert from "node:assert/strict";
import { HttpAgentAdapter } from "../src/product/adapters.js";
import { ZeroInfinityService } from "../src/product/service.js";
import { handleMcp } from "../src/product/mcp.js";
import { handleRequest } from "../src/product/http.js";
import { PaperOrderWriter } from "../src/product/paper.js";
import { BuiltinWorkerAdapter } from "../src/product/adapters.js";
import type { BoundedIntent } from "../src/execution/index.js";

const intent = (): BoundedIntent => Object.freeze({
  kind: "EXECUTION_INTENT", mandateId: "m-1", workflowId: "w-1", symbol: "BTCUSDT",
  side: "BUY", method: "LIMIT", price: 100, notional: 1000, executableEdgeBps: 10,
  marketStateVersion: 1n, accountStateVersion: 2n,
});

test("external adapters enforce role to artifact kind binding", async () => {
  const adapter = new HttpAgentAdapter("agent", async () => ({
    workflowId: "w", invocationId: "i", role: "ADVOCATE", kind: "OPPOSE",
    payload: { kind: "OPPOSE", ref: "i", hash: "h", symbol: "BTCUSDT", direction: "LONG", recommendation: "AGREE", observedAt: 1, expiresAt: 2 },
  }));
  await assert.rejects(() => adapter.invoke({ workflowId: "w", invocationId: "i", role: "ADVOCATE", opportunity: {}, timeoutMs: 100 }), /schema invalid/);
});

test("paper writer rejects forged, mutable, accessor, and incomplete intents", async () => {
  const writer = new PaperOrderWriter();
  await assert.rejects(() => writer.submit({ ...intent() } as BoundedIntent), /invalid/);
  const forged = Object.create({ mandateId: "m-1" });
  Object.assign(forged, { kind: "EXECUTION_INTENT", workflowId: "w-1", symbol: "BTCUSDT", side: "BUY", method: "LIMIT", price: 100, notional: 1000, executableEdgeBps: 10, marketStateVersion: 1n, accountStateVersion: 2n });
  Object.freeze(forged);
  await assert.rejects(() => writer.submit(forged as BoundedIntent), /invalid/);
  const accessor = { ...intent() } as Record<string, unknown>;
  Object.defineProperty(accessor, "price", { get: () => 100, enumerable: true });
  Object.freeze(accessor);
  await assert.rejects(() => writer.submit(accessor as unknown as BoundedIntent), /invalid/);
});

test("registerStack requires own canonical role bindings and nested adapters", () => {
  const service = new ZeroInfinityService();
  const b = new BuiltinWorkerAdapter();
  const bindings = Object.create({ ADVOCATE: b });
  Object.assign(bindings, { OPPOSER: b, MARKET_ANALYST: b, COUNCIL: b });
  assert.throws(() => service.registerStack({ name: "bad", version: "1", bindings, capabilities: ["reasoning"] } as never), /canonical|binding/);
});

test("MCP rejects malformed opportunities and exposes canonical resources", async () => {
  const service = new ZeroInfinityService();
  const malformed = await handleMcp(service, { jsonrpc: "2.0", id: 1, method: "create_workflow", params: { opportunity: [] } });
  assert.equal(malformed.error?.code, -32000);
  const listed = await handleMcp(service, { jsonrpc: "2.0", id: 2, method: "resources/list" });
  assert.ok((listed.result as { resources: unknown[] }).resources.length > 0);
  const read = await handleMcp(service, { jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "zero-infinity://capabilities" } });
  assert.equal((read.result as { contents: unknown[] }).contents.length, 1);
});

test("REST unknown workflows are 404", async () => {
  const service = new ZeroInfinityService();
  assert.equal((await handleRequest(service, "GET", "/v1/workflows/nope")).status, 404);
  assert.equal((await handleRequest(service, "POST", "/v1/workflows/nope/submit")).status, 404);
  assert.equal((await handleRequest(service, "GET", "/v1/workflows/nope/receipt")).status, 404);
});
