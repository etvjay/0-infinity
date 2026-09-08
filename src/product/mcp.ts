import { ZeroInfinityService } from "./service.js";
import { exactOwnPlain } from "./types.js";
export const MCP_TOOLS = ["get_capabilities", "get_readiness", "create_workflow", "submit_opportunity", "get_reasoning_receipt", "get_trade_thesis", "run_shadow_workflow", "get_workflow"] as const;
export interface McpResponse { readonly jsonrpc: "2.0"; readonly id: string | number | null; readonly result?: unknown; readonly error?: { readonly code: number; readonly message: string }; }
export async function handleMcp(service: ZeroInfinityService, query: unknown): Promise<McpResponse> {
  if (!exactOwnPlain(query, ["jsonrpc", "id", "method", "params"], ["jsonrpc", "id", "method"])) return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  const q = query as Record<string, unknown>; const id = typeof q.id === "string" || typeof q.id === "number" ? q.id : null; const method = q.method; const params = q.params; const p = exactOwnPlain(params, Object.keys((params as Record<string, unknown>) ?? {})) ? params as Record<string, unknown> : {};
  try {
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { version: "v1", tools: MCP_TOOLS.map(name => ({ name })) } };
    if (method === "get_capabilities") return { jsonrpc: "2.0", id, result: service.getCapabilities() };
    if (method === "get_readiness") return { jsonrpc: "2.0", id, result: service.getReadiness() };
    if (method === "create_workflow") return { jsonrpc: "2.0", id, result: service.createWorkflow(exactOwnPlain(p.opportunity, Object.keys((p.opportunity as Record<string, unknown>) ?? {})) ? p.opportunity as Record<string, unknown> : {}) };
    if (method === "submit_opportunity") return { jsonrpc: "2.0", id, result: await service.submitOpportunity(String(p.workflowId)) };
    if (method === "get_workflow") return { jsonrpc: "2.0", id, result: service.getWorkflow(String(p.workflowId)) };
    if (method === "get_reasoning_receipt") return { jsonrpc: "2.0", id, result: service.getReasoningReceipt(String(p.workflowId)) };
    if (method === "get_trade_thesis") return { jsonrpc: "2.0", id, result: service.getTradeThesis(String(p.workflowId)) };
    if (method === "run_shadow_workflow") return { jsonrpc: "2.0", id, result: await service.runShadowWorkflow(exactOwnPlain(p.opportunity, Object.keys((p.opportunity as Record<string, unknown>) ?? {})) ? p.opportunity as Record<string, unknown> : {}) };
    return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
  } catch (error) { return { jsonrpc: "2.0", id, error: { code: -32000, message: error instanceof Error ? error.message : "request failed" } }; }
}
