import { createInterface } from "node:readline";
import { handleMcp } from "./mcp.js";
import { ZeroInfinityService } from "./service.js";

// Line-delimited JSON-RPC keeps the local MCP entrypoint dependency-free.
const service = new ZeroInfinityService({ persistencePath: process.env.ZERO_INFINITY_PRODUCT_STORE_PATH });
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", async (line) => {
  if (!line.trim()) return;
  let query: unknown;
  try { query = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n"); return; }
  const response = await handleMcp(service, query);
  process.stdout.write(JSON.stringify(response) + "\n");
});
