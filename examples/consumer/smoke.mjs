import { ZeroInfinityClient } from "../../dist/src/product/sdk.js";

const base = process.env.ZERO_INFINITY_BASE_URL ?? "https://zero-infinity-projection-store.microcosm.workers.dev";
const client = new ZeroInfinityClient(async (url, init = {}) => {
  const response = await fetch(url, {
    method: init.method,
    body: init.body,
    headers: init.headers,
  });
  return { status: response.status, json: () => response.json() };
}, base);

const opportunity = { symbol: "BTCUSDT", venue: "BINANCE", product: "USD_M_FUTURES" };
const workflow = await client.createWorkflow(opportunity);
const result = await client.submitOpportunity(workflow.workflowId);
const receipt = await client.getReasoningReceipt(workflow.workflowId);
if (result.workflow.status !== "COMPLETE" || !receipt.workflowId) {
  throw new Error("SDK consumer workflow did not complete");
}
console.log(JSON.stringify({ workflowId: workflow.workflowId, status: result.workflow.status, receiptWorkflowId: receipt.workflowId }));
