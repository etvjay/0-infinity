#!/usr/bin/env node
/**
 * Credential-free, LOCAL/INJECTED adapter demonstration.
 *
 * This never calls a provider, testnet, LIVE, or a chain. The HTTP server and
 * MCP line transport below are loopback fixtures used to exercise the same
 * external adapter validation boundary as a real integration.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { HttpAgentAdapter, McpWorkerAdapter } from "../../dist/src/product/adapters.js";

const NOW = 1_700_000_000_000;
const opportunity = { symbol: "BTCUSDT", hypothesis: "local fixture only" };
const roles = ["ADVOCATE", "OPPOSER", "MARKET_ANALYST"];

function payloadFor(input) {
  const common = {
    ref: `local:${input.role.toLowerCase()}:${input.invocationId}`,
    hash: `injected-hash-${input.role.toLowerCase()}`,
    symbol: input.opportunity.symbol,
    observedAt: NOW,
    expiresAt: NOW + 300_000,
  };
  if (input.role === "ADVOCATE") return { kind: "ADVOCATE", ...common, direction: "LONG", expectedMoveBps: 40, confidence: 0.8 };
  if (input.role === "OPPOSER") return { kind: "OPPOSE", ...common, direction: "LONG", recommendation: "AGREE" };
  return { kind: "MARKET_ACCOUNT", ...common, market: "TRUSTED", account: "TRUSTED" };
}

function envelope(input, payload = payloadFor(input)) {
  return { workflowId: input.workflowId, invocationId: input.invocationId, role: input.role, kind: payload.kind, payload };
}

function requestJson(server, body) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = fetch(`http://127.0.0.1:${address.port}/agent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    req.then(async (response) => resolve({ status: response.status, body: await response.json() }), reject);
  });
}

async function withHttpFixture(run) {
  const server = createServer(async (request, response) => {
    try {
      const body = await new Promise((resolve, reject) => {
        let text = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => { text += chunk; });
        request.on("end", () => { try { resolve(JSON.parse(text)); } catch (error) { reject(error); } });
        request.on("error", reject);
      });
      const mode = request.headers["x-local-case"];
      if (mode === "malformed") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ...envelope(body), unexpected: "reject me" }));
        return;
      }
      if (mode === "refused") {
        response.writeHead(403, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "LOCAL_FIXTURE_REFUSED" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(envelope(body)));
    } catch {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "LOCAL_FIXTURE_BAD_JSON" }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { return await run(server); } finally { await new Promise((resolve) => server.close(resolve)); }
}

function httpInput(role) {
  return { workflowId: "wf-local-http", invocationId: `wf-local-http:${role}`, role, opportunity, timeoutMs: 5_000 };
}
function mcpInput(role) {
  return { workflowId: "wf-local-mcp", invocationId: `wf-local-mcp:${role}`, role, opportunity, timeoutMs: 5_000 };
}

async function main() {
  const transcript = [];
  await withHttpFixture(async (server) => {
    const transport = async (input, signal) => {
      const address = server.address();
      const response = await fetch(`http://127.0.0.1:${address.port}/agent`, {
        method: "POST", signal, headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    };
    const adapter = new HttpAgentAdapter("local-http-agent-fixture", transport, () => NOW);
    for (const role of roles) {
      const artifact = await adapter.invoke(httpInput(role));
      transcript.push({ transport: "HTTP loopback", role, status: "accepted", kind: artifact.kind, symbol: artifact.payload.symbol, independence: artifact.independence });
    }
    const malformed = new HttpAgentAdapter("local-http-malformed-fixture", async (input) => {
      const address = server.address();
      const response = await fetch(`http://127.0.0.1:${address.port}/agent`, { method: "POST", headers: { "content-type": "application/json", "x-local-case": "malformed" }, body: JSON.stringify(input) });
      return response.json();
    }, () => NOW);
    await assert.rejects(() => malformed.invoke(httpInput("ADVOCATE")), /external adapter failed|invalid external artifact envelope/);
    transcript.push({ transport: "HTTP loopback", case: "malformed envelope", status: "refused", failClosed: true });

    const refused = new HttpAgentAdapter("local-http-refused-fixture", async (input) => {
      const address = server.address();
      const response = await fetch(`http://127.0.0.1:${address.port}/agent`, { method: "POST", headers: { "content-type": "application/json", "x-local-case": "refused" }, body: JSON.stringify(input) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }, () => NOW);
    await assert.rejects(() => refused.invoke(httpInput("OPPOSER")), /external adapter failed or timed out/);
    transcript.push({ transport: "HTTP loopback", case: "provider refused (403 fixture)", status: "refused", failClosed: true });
  });

  const mcpTransport = async (input, signal) => {
    if (signal.aborted) throw new Error("aborted");
    const line = JSON.stringify({ jsonrpc: "2.0", id: input.invocationId, method: "local/role-artifact", params: input });
    const request = JSON.parse(line);
    return envelope(request.params);
  };
  const mcp = new McpWorkerAdapter("local-mcp-worker-fixture", mcpTransport, () => NOW);
  for (const role of roles) {
    const artifact = await mcp.invoke(mcpInput(role));
    transcript.push({ transport: "MCP loopback line", role, status: "accepted", kind: artifact.kind, symbol: artifact.payload.symbol, independence: artifact.independence });
  }
  const badMcp = new McpWorkerAdapter("local-mcp-refused-fixture", async (input) => envelope(input, { ...payloadFor(input), recommendation: "CONTRADICT" }), () => NOW);
  await assert.rejects(() => badMcp.invoke(mcpInput("OPPOSER")), /external adapter failed or timed out|binding or schema invalid/);
  transcript.push({ transport: "MCP loopback line", case: "refused contradictory artifact", status: "refused", failClosed: true });

  const council = new HttpAgentAdapter("local-http-council-boundary", mcpTransport, () => NOW);
  await assert.rejects(() => council.invoke({ ...httpInput("COUNCIL"), role: "COUNCIL" }), /pre-Council roles/);
  transcript.push({ transport: "adapter boundary", case: "COUNCIL invocation", status: "refused", failClosed: true });

  console.log(JSON.stringify({
    label: "LOCAL/INJECTED ADAPTER EXAMPLE — NOT LIVE PROVIDER EVIDENCE",
    credentials: false,
    network: "127.0.0.1 loopback only",
    roles,
    transcript,
    evidenceCeiling: "Fixture acceptance proves adapter validation and binding only; it is not hosted/provider/market evidence.",
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
