import assert from "node:assert/strict";
import test from "node:test";
import { ZeroInfinityService } from "../src/product/service.js";
import { handleRequest } from "../src/product/http.js";
import { handleMcp } from "../src/product/mcp.js";
import { ZeroInfinityClient, serviceFetch } from "../src/product/sdk.js";
import { verifyMandate, serializeMandate, parseMandate } from "../src/mandate/verify.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const now = 1_700_000_000_000;
const compilerPolicy = { accountId: "advisory-account", validityMs: 30_000, minExecutableEdgeBps: 1, maxSpreadBps: 20, maxSlippageBps: 1, maxFeeBps: 1, maxFundingCostBps: 1, maxNotional: 100, maxLossBps: 100, execution: "LIMIT", minEntryPrice: 100_000, maxEntryPrice: 100_000, entryTrigger: "BELOW" } as const;
const anchor = { stateVersion: 1n, observedAt: now, receivedAt: now, markPrice: 99_950 } as const;
const opportunity = { symbol: "BTCUSDT", venue: "BINANCE", product: "USD_M_FUTURES" } as const;

async function advisory(service: ZeroInfinityService) {
  return service.runAdvisoryWorkflow(opportunity, compilerPolicy, anchor);
}

test("advisory returns a portable mandate without executing", async () => {
  const service = new ZeroInfinityService({ clock: () => now, idFactory: () => "wf-advisory" });
  const result = await advisory(service);
  assert.equal(result.status, "MANDATE_ISSUED");
  assert.equal(result.noWrite, true);
  assert.equal("execution" in result, false);
  assert.ok(result.mandate);
  assert.equal(verifyMandate(result.mandate, { workflowId: "wf-advisory", now }).valid, true);
  assert.equal(result.mandate.accountId, "advisory-account");
  assert.equal(result.mandate.workflowId, "wf-advisory");
  assert.equal(service.getMandate("wf-advisory")?.mandateId, result.mandate.mandateId);});

test("SPOT advisory preserves product across thesis, receipt, and mandate", async () => {
  const service = new ZeroInfinityService({ clock: () => now, idFactory: () => "wf-spot-advisory" });
  const result = await service.runAdvisoryWorkflow({ symbol: "BTCUSDT", venue: "BINANCE", product: "SPOT", side: "LONG" }, { ...compilerPolicy, accountId: "1275006787" }, anchor);
  assert.equal(result.status, "MANDATE_ISSUED");
  assert.equal(result.thesis?.instrument, "SPOT");
  assert.equal(result.receipt?.opportunity.product, "SPOT");
  assert.equal(result.mandate?.instrument, "SPOT");
});
test("portable mandate verification rejects expiry and binding drift", async () => {
  const result = await advisory(new ZeroInfinityService({ clock: () => now, idFactory: () => "wf-portable" }));
  assert.equal(result.status, "MANDATE_ISSUED");
  assert.ok(result.mandate);
  assert.equal(verifyMandate(result.mandate, { workflowId: "other", now }).valid, false);
  assert.equal(verifyMandate(result.mandate, { workflowId: "wf-portable", now: result.mandate.expiresAt }).valid, false);
});

test("REST and MCP expose the same advisory mandate contract", async () => {
  const restService = new ZeroInfinityService({ clock: () => now, idFactory: () => "wf-rest-advisory" });
  const rest = await handleRequest(restService, "POST", "/v1/advisory", { opportunity, compilerPolicy, anchor });
  assert.equal(rest.status, 200);
  assert.equal((rest.body as { status: string; noWrite: boolean }).status, "MANDATE_ISSUED");
  assert.equal((rest.body as { noWrite: boolean }).noWrite, true);
  const restMandate = await handleRequest(restService, "GET", "/v1/workflows/wf-rest-advisory/mandate");
  assert.equal(restMandate.status, 200);
  const mcpService = new ZeroInfinityService({ clock: () => now, idFactory: () => "wf-mcp-advisory" });
  const mcp = await handleMcp(mcpService, { jsonrpc: "2.0", id: 1, method: "run_advisory", params: { opportunity, compilerPolicy, anchor } });
  assert.equal((mcp.result as { status: string }).status, "MANDATE_ISSUED");
  assert.equal((mcp.result as { noWrite: boolean }).noWrite, true);
  const mcpMandate = await handleMcp(mcpService, { jsonrpc: "2.0", id: 2, method: "get_mandate", params: { workflowId: "wf-mcp-advisory" } });
  assert.equal((mcpMandate.result as { workflowId: string }).workflowId, "wf-mcp-advisory");
});

test("SDK returns and round-trips a portable advisory mandate", async () => {
  const service = new ZeroInfinityService({ clock: () => now, idFactory: () => "wf-sdk-advisory" });
  const client = new ZeroInfinityClient(serviceFetch(service));
  const result = await client.runAdvisoryWorkflow(opportunity, compilerPolicy, anchor);
  assert.equal(result.status, "MANDATE_ISSUED");
  assert.ok(result.mandate);
  const serialized = serializeMandate(result.mandate);
  assert.match(serialized, /"stateVersion":"1n"/);
  const parsed = parseMandate(serialized);
  assert.equal(verifyMandate(parsed, { workflowId: "wf-sdk-advisory", now }).valid, true);
  assert.equal((await client.getMandate("wf-sdk-advisory") as { workflowId: string }).workflowId, "wf-sdk-advisory");
});

test("advisory mandate survives product projection restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "zero-infinity-advisory-"));
  const persistencePath = join(directory, "workflows.json");
  try {
    const first = new ZeroInfinityService({ clock: () => now, idFactory: () => "wf-restart-advisory", persistencePath });
    const result = await advisory(first);
    assert.equal(result.status, "MANDATE_ISSUED");
    const restarted = new ZeroInfinityService({ clock: () => now, persistencePath });
    const mandate = restarted.getMandate("wf-restart-advisory");
    assert.ok(mandate);
    assert.equal(verifyMandate(mandate, { workflowId: "wf-restart-advisory", now }).valid, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
