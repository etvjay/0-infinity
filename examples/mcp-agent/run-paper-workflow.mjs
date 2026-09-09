const endpoint = process.env.ZERO_INFINITY_MCP ?? "http://127.0.0.1:8787/mcp";

async function call(method, params = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
  });
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
  const message = await response.json();
  if (message.error) throw new Error(`${method}: ${message.error.message}`);
  return message.result;
}

const capabilities = await call("get_capabilities");
const readiness = await call("get_readiness");
const paper = await call("run_paper_live", {
  opportunity: { symbol: "BTCUSDT", side: "LONG" },
});
const workflowId = paper.workflowId ?? paper.result?.workflow?.workflowId;
if (!workflowId) throw new Error("paper result did not return workflowId");

const workflow = await call("get_workflow", { workflowId });
const receipt = await call("get_reasoning_receipt", { workflowId });
const thesis = await call("get_trade_thesis", { workflowId });

console.log(JSON.stringify({
  capabilities: {
    version: capabilities.version,
    roles: capabilities.roles,
    modes: capabilities.modes,
    authority: capabilities.authority,
    liveWrites: capabilities.liveWrites,
  },
  readiness: {
    ready: readiness.ready,
    mode: readiness.mode,
    hostedEvidence: readiness.hostedEvidence,
  },
  workflow: {
    workflowId,
    status: workflow.status ?? workflow.result?.workflow?.status,
  },
  paper: {
    mode: paper.mode,
    noWrite: paper.noWrite,
    status: paper.status,
    simulated: paper.paperReceipt?.simulated,
  },
  receipt: {
    present: Boolean(receipt),
    canonicalSha256: receipt?.canonicalSha256,
  },
  thesis: {
    present: Boolean(thesis),
  },
}, null, 2));
