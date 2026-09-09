import { ZeroInfinityClient } from "../dist/src/product/sdk.js";

const base = (process.env.ZERO_INFINITY_BASE_URL ?? "https://zero-infinity-projection-store.microcosm.workers.dev").replace(/\/$/, "");
const fetcher = async (url, init = {}) => {
  const response = await fetch(url, {
    method: init.method,
    body: init.body,
    headers: init.headers,
  });
  return { status: response.status, json: () => response.json() };
};
const client = new ZeroInfinityClient(fetcher, base);
const [capabilities, readiness, paper] = await Promise.all([
  client.capabilities(),
  client.readiness(),
  client.runPaperLiveWorkflow({ symbol: "BTCUSDT", side: "LONG" }),
]);
if (capabilities.authority !== false || !Array.isArray(capabilities.writes) || capabilities.writes.length !== 0) throw new Error("SDK smoke observed write authority");
if (readiness.ready !== true || readiness.liveWrites !== false) throw new Error("SDK smoke observed unready runtime");
if (paper.status !== "REFUSED" || paper.code !== "CAPABILITY_DENIED") throw new Error("SDK smoke expected bounded PAPER refusal");

const mcpResponse = await fetch(`${base}/mcp`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: "judge-smoke", method: "get_capabilities", params: {} }),
});
if (!mcpResponse.ok) throw new Error(`MCP HTTP ${mcpResponse.status}`);
const mcp = await mcpResponse.json();
if (mcp.error || mcp.result?.authority !== false || !Array.isArray(mcp.result?.writes) || mcp.result.writes.length !== 0) throw new Error("MCP smoke did not return read-only capabilities");
console.log(JSON.stringify({ base, sdk: { readiness: readiness.ready, paperStatus: paper.status, code: paper.code }, mcp: { jsonrpc: mcp.jsonrpc, authority: mcp.result.authority, writes: mcp.result.writes } }));
