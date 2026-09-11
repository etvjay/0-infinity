import { ZeroInfinityService } from "./service.js";
import { createReasoningStack, type ReasoningStackConfig } from "./reasoningStack.js";
import type { AnchorState, CompilerPolicy } from "../domain/index.js";
import { exactOwnPlain, ValidationError } from "./types.js";
export const MCP_TOOLS = ["get_capabilities", "get_readiness", "register_reasoning_stack", "run_advisory", "get_mandate", "create_workflow", "submit_opportunity", "get_reasoning_receipt", "get_trade_thesis", "run_shadow_workflow", "run_paper_live", "get_workflow"] as const;
export const MCP_RESOURCES = [
  { uri: "zero-infinity://capabilities", name: "Capabilities", mimeType: "application/json" },
  { uri: "zero-infinity://readiness", name: "Readiness", mimeType: "application/json" },
] as const;
export interface McpResponse { readonly jsonrpc: "2.0"; readonly id: string | number | null; readonly result?: unknown; readonly error?: { readonly code: number; readonly message: string }; }
function plainObject(value: unknown, message: string): Record<string, unknown> { if (!exactOwnPlain(value, Object.keys((value as Record<string, unknown>) ?? {}))) throw new ValidationError(message); return value as Record<string, unknown>; }
function anchorValue(value: unknown): AnchorState { const anchor = plainObject(value, "anchor must be a plain object"); const copy = { ...anchor }; if (typeof copy.stateVersion === "string" && /^\d+n$/.test(copy.stateVersion)) copy.stateVersion = BigInt(copy.stateVersion.slice(0, -1)); if (typeof copy.stateVersion !== "bigint") throw new ValidationError("anchor.stateVersion must be bigint or serialized bigint"); return copy as unknown as AnchorState; }
function toolSchema(name: string): Record<string, unknown> {
  if (name === "run_advisory") return { type: "object", properties: { opportunity: { type: "object", additionalProperties: true }, compilerPolicy: { type: "object", additionalProperties: true }, anchor: { type: "object", properties: { stateVersion: { type: "string", pattern: "^[0-9]+n$" }, observedAt: { type: "number" }, receivedAt: { type: "number" }, markPrice: { type: "number" } }, required: ["stateVersion", "observedAt", "receivedAt", "markPrice"], additionalProperties: false }, stackName: { type: "string" }, stackVersion: { type: "string" } }, required: ["opportunity", "compilerPolicy", "anchor"], additionalProperties: false };
  if (name === "get_mandate") return { type: "object", properties: { workflowId: { type: "string" } }, required: ["workflowId"], additionalProperties: false };
  return { type: "object", properties: {}, additionalProperties: true };
}
export async function handleMcp(service: ZeroInfinityService, query: unknown): Promise<McpResponse> {
  if (!exactOwnPlain(query, ["jsonrpc", "id", "method", "params"], ["jsonrpc", "id", "method"])) return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  const q = query as Record<string, unknown>; const id = typeof q.id === "string" || typeof q.id === "number" ? q.id : null; const method = q.method;
  try {
    const p = q.params === undefined ? {} : plainObject(q.params, "params must be a plain object");
    if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "0-infinity", version: "v1" } } };
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { version: "v1", tools: MCP_TOOLS.map(name => ({ name, description: `0-infinity ${name} tool`, inputSchema: toolSchema(name) })) } };
    if (method === "resources/list") return { jsonrpc: "2.0", id, result: { version: "v1", resources: MCP_RESOURCES.map(resource => ({ ...resource, description: `${resource.name} resource` })) } };
    if (method === "resources/templates/list") return { jsonrpc: "2.0", id, result: { resourceTemplates: [] } };
    if (method === "resources/read") { if (!exactOwnPlain(p, ["uri"], ["uri"]) || typeof p.uri !== "string") throw new ValidationError("resource uri is required"); const resource = MCP_RESOURCES.find(x => x.uri === p.uri); if (!resource) throw new ValidationError("resource not found"); const value = p.uri.endsWith("capabilities") ? service.getCapabilities() : service.getReadiness(); return { jsonrpc: "2.0", id, result: { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: JSON.stringify(value) }] } }; }
    if (method === "tools/call") {
      if (typeof p.name !== "string" || !p.name) throw new ValidationError("tool name is required");
      const argumentsValue = p.arguments === undefined ? {} : plainObject(p.arguments, "tool arguments must be a plain object");
      const inner = await handleMcp(service, { jsonrpc: "2.0", id, method: p.name, params: argumentsValue });
      if (inner.error) return { jsonrpc: "2.0", id, error: inner.error };
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(inner.result, (_key, value) => typeof value === "bigint" ? `${value}n` : value) }], isError: false } };
    }
    if (method === "register_reasoning_stack") { const config = plainObject(p.config, "config must be a plain object") as unknown as ReasoningStackConfig; const text = JSON.stringify(config); if(/"(?:apiKey|token|password|secret|privateKey|authorization)"\s*:/i.test(text)) throw new ValidationError("credentials must be supplied through the server runtime, not MCP"); const stack = service.registerStack(createReasoningStack(config)); return { jsonrpc: "2.0", id, result: { name: stack.name, version: stack.version, capabilities: stack.capabilities } }; }
    if (method === "run_advisory") { const opportunity = plainObject(p.opportunity, "opportunity must be a plain object"); if (!plainObject(p.compilerPolicy, "compilerPolicy must be a plain object")) throw new ValidationError("compilerPolicy is required"); return { jsonrpc: "2.0", id, result: await service.runAdvisoryWorkflow(opportunity, p.compilerPolicy as unknown as CompilerPolicy, anchorValue(p.anchor), typeof p.stackName === "string" ? p.stackName : "default", typeof p.stackVersion === "string" ? p.stackVersion : "v1") }; }
    if (method === "get_mandate") { if (typeof p.workflowId !== "string" || p.workflowId.length === 0) throw new ValidationError("workflowId is required"); const value = service.getMandate(p.workflowId); if (value === undefined) return { jsonrpc: "2.0", id, error: { code: -32004, message: "mandate not found" } }; return { jsonrpc: "2.0", id, result: value }; }
    if (method === "get_capabilities") return { jsonrpc: "2.0", id, result: service.getCapabilities() };    if (method === "get_readiness") return { jsonrpc: "2.0", id, result: service.getReadiness() };    if (method === "create_workflow") { const opportunity = plainObject(p.opportunity, "opportunity must be a plain object"); return { jsonrpc: "2.0", id, result: service.createWorkflow(opportunity) }; }
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
