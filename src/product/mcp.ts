import { ZeroInfinityService } from "./service.js";
import { createReasoningStack, type ReasoningStackConfig } from "./reasoningStack.js";
import { exactOwnPlain, ValidationError } from "./types.js";
export const MCP_TOOLS = ["get_capabilities", "get_readiness", "register_reasoning_stack", "create_workflow", "submit_opportunity", "get_reasoning_receipt", "get_trade_thesis", "run_shadow_workflow", "run_paper_live", "get_workflow"] as const;
export const MCP_RESOURCES = [
  { uri: "zero-infinity://capabilities", name: "Capabilities", mimeType: "application/json" },
  { uri: "zero-infinity://readiness", name: "Readiness", mimeType: "application/json" },
] as const;
export interface McpResponse { readonly jsonrpc: "2.0"; readonly id: string | number | null; readonly result?: unknown; readonly error?: { readonly code: number; readonly message: string }; }
function plainObject(value: unknown, message: string): Record<string, unknown> { if (!exactOwnPlain(value, Object.keys((value as Record<string, unknown>) ?? {}))) throw new ValidationError(message); return value as Record<string, unknown>; }
export async function handleMcp(service: ZeroInfinityService, query: unknown): Promise<McpResponse> {
  if (!exactOwnPlain(query, ["jsonrpc", "id", "method", "params"], ["jsonrpc", "id", "method"])) return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  const q = query as Record<string, unknown>; const id = typeof q.id === "string" || typeof q.id === "number" ? q.id : null; const method = q.method;
  try {
    const p = q.params === undefined ? {} : plainObject(q.params, "params must be a plain object");
    if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "0-infinity", version: "v1" } } };
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { version: "v1", tools: MCP_TOOLS.map(name => ({ name })) } };
    if (method === "resources/list") return { jsonrpc: "2.0", id, result: { version: "v1", resources: MCP_RESOURCES } };
    if (method === "resources/read") { if (!exactOwnPlain(p, ["uri"], ["uri"]) || typeof p.uri !== "string") throw new ValidationError("resource uri is required"); const resource = MCP_RESOURCES.find(x => x.uri === p.uri); if (!resource) throw new ValidationError("resource not found"); const value = p.uri.endsWith("capabilities") ? service.getCapabilities() : service.getReadiness(); return { jsonrpc: "2.0", id, result: { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: JSON.stringify(value) }] } }; }
    if (method === "register_reasoning_stack") { const config = plainObject(p.config, "config must be a plain object") as unknown as ReasoningStackConfig; const text = JSON.stringify(config); if(/"(?:apiKey|token|password|secret|privateKey|authorization)"\s*:/i.test(text)) throw new ValidationError("credentials must be supplied through the server runtime, not MCP"); const stack = service.registerStack(createReasoningStack(config)); return { jsonrpc: "2.0", id, result: { name: stack.name, version: stack.version, capabilities: stack.capabilities } }; }
    if (method === "get_capabilities") return { jsonrpc: "2.0", id, result: service.getCapabilities() };    if (method === "get_readiness") return { jsonrpc: "2.0", id, result: service.getReadiness() };
    if (method === "create_workflow") { const opportunity = plainObject(p.opportunity, "opportunity must be a plain object"); return { jsonrpc: "2.0", id, result: service.createWorkflow(opportunity) }; }
    if (method === "run_shadow_workflow") { const opportunity = plainObject(p.opportunity, "opportunity must be a plain object"); return { jsonrpc: "2.0", id, result: await service.runShadowWorkflow(opportunity) }; }
    if (method === "run_paper_live") { const opportunity = plainObject(p.opportunity, "opportunity must be a plain object"); return { jsonrpc: "2.0", id, result: await service.runPaperLiveWorkflow(opportunity) }; }
    if (method === "submit_opportunity" || method === "get_workflow" || method === "get_reasoning_receipt" || method === "get_trade_thesis") {
      if (typeof p.workflowId !== "string" || p.workflowId.length === 0) throw new ValidationError("workflowId is required");
      if (method === "submit_opportunity") return { jsonrpc: "2.0", id, result: await service.submitOpportunity(p.workflowId) };
      const value = method === "get_workflow" ? service.getWorkflow(p.workflowId) : method === "get_reasoning_receipt" ? service.getReasoningReceipt(p.workflowId) : service.getTradeThesis(p.workflowId);
      if (value === undefined) return { jsonrpc: "2.0", id, error: { code: -32004, message: method === "get_workflow" ? "workflow not found" : method === "get_reasoning_receipt" ? "reasoning receipt not found" : "trade thesis not found" } };
      return { jsonrpc: "2.0", id, result: value };
    }
    return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
  } catch (error) { return { jsonrpc: "2.0", id, error: { code: -32000, message: error instanceof Error ? error.message : "request failed" } }; }
}
