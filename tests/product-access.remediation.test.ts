import test from "node:test";
import assert from "node:assert/strict";
import { HttpAgentAdapter } from "../src/product/adapters.js";
import { ZeroInfinityService } from "../src/product/service.js";
import { handleMcp } from "../src/product/mcp.js";
import { handleRequest, createHttpServer } from "../src/product/http.js";
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

test("paper writer validates the configured fill model and snapshots it", async () => {
  for (const model of [
    { status: "BOGUS", version: "v1" },
    { status: "FILLED", version: "v1", price: Infinity },
    { status: "FILLED", version: "v1", price: 0 },
  ]) assert.throws(() => new PaperOrderWriter("a", 1000, model as never), /invalid/);
  const model = { status: "FILLED" as const, version: "v1", price: 101 };
  const writer = new PaperOrderWriter("a", 1000, model);
  model.price = 999;
  const receipt = await writer.submit(intent());
  assert.equal(receipt.accountTransition.fills[0]?.price, 101);
});

test("paper writer rejects nonfinite cash transitions before mutating the account", async () => {
  const writer = new PaperOrderWriter("a", 1000);
  const extreme = { ...intent(), quantity: undefined, notional: 1e308, price: 1e308 };
  await assert.rejects(() => writer.submit(extreme), /finite|overflow|invalid/);
  assert.equal(writer.getAccount().cash, 1000);
  assert.equal(writer.getAccount().fills.length, 0);
});

test("registerStack requires own canonical role bindings and nested adapters", () => {
  const service = new ZeroInfinityService();
  const b = new BuiltinWorkerAdapter();
  const bindings = Object.create({ ADVOCATE: b });
  Object.assign(bindings, { OPPOSER: b, MARKET_ANALYST: b, COUNCIL: b });
  assert.throws(() => service.registerStack({ name: "bad", version: "1", bindings, capabilities: ["reasoning"] } as never), /canonical|binding/);
  const inherited = Object.create({ invoke: b.invoke.bind(b) });
  Object.assign(inherited, { name: "x", independence: "injected" });
  assert.throws(() => service.registerStack({ name: "bad2", version: "1", bindings: { ADVOCATE: inherited, OPPOSER: inherited, MARKET_ANALYST: inherited, COUNCIL: inherited }, capabilities: ["reasoning"] } as never), /canonical|binding/);
});

test("external adapter rejects nonfinite and chronologically invalid numbers", async () => {
  for (const payload of [
    { expectedMoveBps: Infinity, confidence: .8, observedAt: 1, expiresAt: 2 },
    { expectedMoveBps: 1, confidence: NaN, observedAt: 1, expiresAt: 2 },
    { expectedMoveBps: 1, confidence: .8, observedAt: 2, expiresAt: 1 },
  ]) {
    const adapter = new HttpAgentAdapter("agent", async () => ({ workflowId: "w", invocationId: "i", role: "ADVOCATE", kind: "ADVOCATE", payload: { kind: "ADVOCATE", ref: "i", hash: "h", symbol: "BTCUSDT", direction: "LONG", ...payload } }));
    await assert.rejects(() => adapter.invoke({ workflowId: "w", invocationId: "i", role: "ADVOCATE", opportunity: {}, timeoutMs: 100 }), /schema invalid/);
  }
});

test("PAPER_LIVE is wired through REST and MCP", async () => {
  const service = new ZeroInfinityService();
  assert.ok((service.getCapabilities() as any).modes.includes("PAPER_LIVE"));
  const rest = await handleRequest(service, "POST", "/v1/paper-live", { symbol: "BTCUSDT" });
  assert.equal(rest.status, 200); assert.equal((rest.body as any).mode, "PAPER_LIVE");
  const mcp = await handleMcp(service, { jsonrpc: "2.0", id: 1, method: "run_paper_live", params: { opportunity: { symbol: "BTCUSDT" } } });
  assert.equal((mcp.result as any).mode, "PAPER_LIVE");
});

test("HTTP server serializes bigint workflow state for external clients", async () => {
  const server = createHttpServer(new ZeroInfinityService());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const create = await fetch(`http://127.0.0.1:${port}/v1/workflows`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: "BTCUSDT", venue: "BINANCE", product: "USD_M_FUTURES" }) });
    const workflow = await create.json() as { workflowId: string };
    const submit = await fetch(`http://127.0.0.1:${port}/v1/workflows/${workflow.workflowId}/submit`, { method: "POST" });
    assert.equal(submit.status, 200);
    const read = await fetch(`http://127.0.0.1:${port}/v1/workflows/${workflow.workflowId}`);
    assert.equal(read.status, 200);
    const paper = await fetch(`http://127.0.0.1:${port}/v1/paper-live`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: "BTCUSDT" }) });
    assert.equal(paper.status, 200);
    const paperBody = await paper.json() as any;
    assert.equal(typeof paperBody.paperReceipt.marketStateVersion, "string");
    assert.match(paperBody.paperReceipt.marketStateVersion, /^\d+n$/);
    const local = await handleRequest(new ZeroInfinityService(), "POST", "/v1/paper-live", { symbol: "BTCUSDT" });
    assert.equal(typeof (local.body as any).paperReceipt.marketStateVersion, "bigint");
    const mcp = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "get_capabilities" }) });
    assert.equal(mcp.status, 200);
    assert.equal((await mcp.json()).result.authority, false);

  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
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
