import test from "node:test";
import assert from "node:assert/strict";
import { ZeroInfinityService } from "../src/product/service.js";
import { handleRequest } from "../src/product/http.js";
import { handleMcp } from "../src/product/mcp.js";
import { serviceFetch, ZeroInfinityClient } from "../src/product/sdk.js";
import { BuiltinWorkerAdapter } from "../src/product/adapters.js";
import type { RoleAdapter, RoleArtifact, ReasoningStack } from "../src/product/types.js";

const opportunity = { symbol: "BTCUSDT", venue: "BINANCE", product: "USD_M_FUTURES" };
const clock = () => 1_700_000_000_000;
const idFactory = (prefix: string) => { let n = 0; return () => `${prefix}-${++n}`; };

function service(prefix: string): ZeroInfinityService {
  return new ZeroInfinityService({ clock, idFactory: idFactory(prefix) });
}

function project(value: any): any {
  return {
    mode: value.mode,
    noWrite: value.noWrite,
    status: value.status,
    workflowStatus: value.result?.workflow?.status,
    hasThesis: Boolean(value.result?.thesis),
  };
}

function failingStack(kind: "refuse" | "failure"): ReasoningStack {
  const base = new BuiltinWorkerAdapter("integration-worker-v1", clock);
  const make = (role: "ADVOCATE" | "OPPOSER" | "MARKET_ANALYST"): RoleAdapter => ({
    name: `integration-${kind}-${role.toLowerCase()}`,
    independence: "injected",
    invoke: async (input) => {
      if (kind === "failure" && role === "OPPOSER") throw new Error("injected reasoning transport failure");
      const artifact = await base.invoke(input);
      if (kind === "refuse" && role === "ADVOCATE") {
        return { ...artifact, payload: { ...artifact.payload, expectedMoveBps: 1, confidence: 0.1 } } as RoleArtifact;
      }
      return artifact;
    },
  });
  const council = { name: "service-owned-council", independence: "builtin" as const, invoke: async () => { throw new Error("council is service-owned"); } };
  return { name: `integration-${kind}`, version: "v1", bindings: { ADVOCATE: make("ADVOCATE"), OPPOSER: make("OPPOSER"), MARKET_ANALYST: make("MARKET_ANALYST"), COUNCIL: council }, capabilities: ["reasoning"] };
}

test("flagship path: SHADOW and PAPER_LIVE agree across service, REST, MCP, and SDK", async () => {
  const direct = service("direct");
  const restService = service("rest");
  const mcpService = service("mcp");
  const sdkService = service("sdk");

  const directShadow = await direct.runShadowWorkflow(opportunity);
  const directPaper = await direct.runPaperLiveWorkflow(opportunity);
  const restShadow = await handleRequest(restService, "POST", "/v1/shadow", opportunity);
  const restPaper = await handleRequest(restService, "POST", "/v1/paper-live", opportunity);
  const mcpShadow = await handleMcp(mcpService, { jsonrpc: "2.0", id: 1, method: "run_shadow_workflow", params: { opportunity } });
  const mcpPaper = await handleMcp(mcpService, { jsonrpc: "2.0", id: 2, method: "run_paper_live", params: { opportunity } });
  const sdk = new ZeroInfinityClient(serviceFetch(sdkService));
  const sdkShadow = await sdk.runShadowWorkflow(opportunity) as any;
  const sdkPaper = await sdk.runPaperLiveWorkflow(opportunity) as any;

  assert.deepEqual(project(directShadow), project(restShadow.body));
  assert.deepEqual(project(directShadow), project((mcpShadow.result as any)));
  assert.deepEqual(project(directShadow), project(sdkShadow));
  assert.deepEqual(project(directPaper), project(restPaper.body));
  assert.deepEqual(project(directPaper), project((mcpPaper.result as any)));
  assert.deepEqual(project(directPaper), project(sdkPaper));
  assert.equal(directShadow.mode, "SHADOW");
  assert.equal(directPaper.mode, "PAPER_LIVE");
  assert.equal(directPaper.noWrite, true);
  assert.equal(directPaper.status, "REFUSED");
  assert.equal((directPaper as any).paperReceipt, undefined);
  assert.match((directPaper as any).reason, /canonical market\/account state/);
});

test("flagship reads preserve one completed workflow across REST, MCP, and SDK", async () => {
  const s = service("reads");
  const created = s.createWorkflow(opportunity);
  const submitted = await s.submitOpportunity(created.workflowId);
  const rest = await handleRequest(s, "GET", `/v1/workflows/${created.workflowId}`);
  const receipt = await handleRequest(s, "GET", `/v1/workflows/${created.workflowId}/receipt`);
  const thesis = await handleRequest(s, "GET", `/v1/workflows/${created.workflowId}/thesis`);
  const mcpWorkflow = await handleMcp(s, { jsonrpc: "2.0", id: 3, method: "get_workflow", params: { workflowId: created.workflowId } });
  const mcpReceipt = await handleMcp(s, { jsonrpc: "2.0", id: 4, method: "get_reasoning_receipt", params: { workflowId: created.workflowId } });
  const mcpThesis = await handleMcp(s, { jsonrpc: "2.0", id: 5, method: "get_trade_thesis", params: { workflowId: created.workflowId } });
  const sdk = new ZeroInfinityClient(serviceFetch(s));
  assert.deepEqual(await sdk.getWorkflow(created.workflowId), rest.body);
  assert.deepEqual(await sdk.getReasoningReceipt(created.workflowId), receipt.body);
  assert.deepEqual(await sdk.getTradeThesis(created.workflowId), thesis.body);
  assert.deepEqual(mcpWorkflow.result, rest.body);
  assert.deepEqual(mcpReceipt.result, receipt.body);
  assert.deepEqual(mcpThesis.result, thesis.body);
  assert.equal((submitted.workflow as any).status, "COMPLETE");
});

test("refusal remains explicit and read-equivalent on every thin surface", async () => {
  const s = service("refuse");
  s.registerStack(failingStack("refuse"));
  const workflow = s.createWorkflow(opportunity, "integration-refuse", "v1");
  const direct = await s.submitOpportunity(workflow.workflowId);
  assert.equal(direct.workflow.status, "REFUSE");
  assert.match(direct.workflow.error ?? "", /confidence|expected move|threshold/i);
  assert.equal(s.getReasoningReceipt(workflow.workflowId), undefined);
  const rest = await handleRequest(s, "GET", `/v1/workflows/${workflow.workflowId}`);
  const mcp = await handleMcp(s, { jsonrpc: "2.0", id: 6, method: "get_workflow", params: { workflowId: workflow.workflowId } });
  const sdk = new ZeroInfinityClient(serviceFetch(s));
  assert.deepEqual(rest.body, direct.workflow);
  assert.deepEqual(mcp.result, direct.workflow);
  assert.deepEqual(await sdk.getWorkflow(workflow.workflowId), direct.workflow);
});

test("reasoning failure is distinguished from council refusal and cannot mint thesis or paper receipt", async () => {
  const s = service("failure");
  s.registerStack(failingStack("failure"));
  const workflow = s.createWorkflow(opportunity, "integration-failure", "v1");
  const direct = await s.submitOpportunity(workflow.workflowId);
  assert.equal(direct.workflow.status, "REASONING_INCOMPLETE");
  assert.match(direct.workflow.error ?? "", /reasoning transport failure/);
  assert.equal(s.getTradeThesis(workflow.workflowId), undefined);
  const rest = await handleRequest(s, "GET", `/v1/workflows/${workflow.workflowId}`);
  assert.deepEqual(rest.body, direct.workflow);
  const mcp = await handleMcp(s, { jsonrpc: "2.0", id: 7, method: "get_workflow", params: { workflowId: workflow.workflowId } });
  assert.deepEqual(mcp.result, direct.workflow);
  const sdk = new ZeroInfinityClient(serviceFetch(s));
  assert.deepEqual(await sdk.getWorkflow(workflow.workflowId), direct.workflow);
});
