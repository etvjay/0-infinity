import { createServer } from "node:http";
import { ZeroInfinityService } from "./service.js";
import { createReasoningStack, type ReasoningStackConfig } from "./reasoningStack.js";
import type { AnchorState, CompilerPolicy } from "../domain/index.js";
import { handleMcp } from "./mcp.js";
import { exactOwnPlain, ValidationError } from "./types.js";
const MAX_JSON = 64 * 1024;
function bodyObject(value: unknown): Record<string, unknown> { if (!exactOwnPlain(value, Object.keys((value as Record<string, unknown>) ?? {}))) throw new ValidationError("JSON object required"); if (JSON.stringify(value, (_key, child) => typeof child === "bigint" ? `${child}n` : child).length > MAX_JSON) throw new ValidationError("payload too large"); return value as Record<string, unknown>; }
function stackConfig(value: unknown): ReasoningStackConfig { const config = bodyObject(value); const text = JSON.stringify(config); if(/"(?:apiKey|token|password|secret|privateKey|authorization)"\s*:/i.test(text)) throw new ValidationError("credentials must be supplied through the server runtime, not the API"); return config as unknown as ReasoningStackConfig; }
function anchorValue(value: unknown): AnchorState { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("anchor must be a plain object"); const copy = { ...(value as Record<string, unknown>) }; if (typeof copy.stateVersion === "string" && /^\d+n$/.test(copy.stateVersion)) copy.stateVersion = BigInt(copy.stateVersion.slice(0, -1)); if (typeof copy.stateVersion !== "bigint") throw new ValidationError("anchor.stateVersion must be bigint or serialized bigint"); return copy as unknown as AnchorState; }
function advisoryInput(value: unknown): { opportunity: Readonly<Record<string, unknown>>; compilerPolicy: CompilerPolicy; anchor: AnchorState; stackName?: string; stackVersion?: string } { const body = bodyObject(value); if (!exactOwnPlain(body, ["opportunity", "compilerPolicy", "anchor", "stackName", "stackVersion"], ["opportunity", "compilerPolicy", "anchor"]) || !exactOwnPlain(body.opportunity, Object.keys(body.opportunity as object))) throw new ValidationError("advisory requires opportunity, compilerPolicy, and anchor"); if (body.stackName !== undefined && typeof body.stackName !== "string") throw new ValidationError("stackName must be a string"); if (body.stackVersion !== undefined && typeof body.stackVersion !== "string") throw new ValidationError("stackVersion must be a string"); return { opportunity: body.opportunity as Readonly<Record<string, unknown>>, compilerPolicy: body.compilerPolicy as CompilerPolicy, anchor: anchorValue(body.anchor), ...(body.stackName === undefined ? {} : { stackName: body.stackName as string }), ...(body.stackVersion === undefined ? {} : { stackVersion: body.stackVersion as string }) }; }
function stackSummary(service: ZeroInfinityService, config: ReasoningStackConfig): unknown { const stack = service.registerStack(createReasoningStack(config)); return { name: stack.name, version: stack.version, capabilities: stack.capabilities, composition: Object.entries(stack.bindings).map(([role, adapter]) => ({ role, adapter: adapter.name, independence: adapter.independence })) }; }
function notFound(): { status: number; body: unknown } { return { status: 404, body: { error: "NOT_FOUND", message: "workflow not found" } }; }
export async function handleRequest(service: ZeroInfinityService, method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  try {
    if (method === "GET" && path === "/health") return { status: 200, body: { ok: true, version: "v1" } };
    if (method === "GET" && path === "/capabilities") return { status: 200, body: service.getCapabilities() };
    if (method === "GET" && path === "/readiness") return { status: 200, body: service.getReadiness() };
    if (method === "POST" && path === "/v1/reasoning-stacks") return { status: 201, body: stackSummary(service, stackConfig(body ?? {})) };
    if (method === "POST" && path === "/v1/advisory") { const input = advisoryInput(body ?? {}); return { status: 200, body: await service.runAdvisoryWorkflow(input.opportunity, input.compilerPolicy, input.anchor, input.stackName, input.stackVersion) }; }
    let match = path.match(/^\/v1\/workflows\/([^/]+)$/);
    if (method === "POST" && path === "/v1/workflows") return { status: 201, body: service.createWorkflow(bodyObject(body ?? {})) };
    if (method === "GET" && match) { const value = service.getWorkflow(match[1]); return value ? { status: 200, body: value } : notFound(); }
    match = path.match(/^\/v1\/workflows\/([^/]+)\/submit$/);
    if (method === "POST" && match) { if (!service.getWorkflow(match[1])) return notFound(); return { status: 200, body: await service.submitOpportunity(match[1]) }; }
    match = path.match(/^\/v1\/workflows\/([^/]+)\/receipt$/);
    if (method === "GET" && match) { const value = service.getReasoningReceipt(match[1]); return value ? { status: 200, body: value } : notFound(); }
    match = path.match(/^\/v1\/workflows\/([^/]+)\/thesis$/);
    if (method === "GET" && match) { const value = service.getTradeThesis(match[1]); return value ? { status: 200, body: value } : notFound(); }
    match = path.match(/^\/v1\/workflows\/([^/]+)\/mandate$/);
    if (method === "GET" && match) { const value = service.getMandate(match[1]); return value ? { status: 200, body: value } : notFound(); }
    if (method === "POST" && path === "/mcp") return { status: 200, body: await handleMcp(service, body) };
    if (method === "POST" && path === "/v1/shadow") return { status: 200, body: await service.runShadowWorkflow(bodyObject(body ?? {})) };
    if (method === "POST" && path === "/v1/paper-live") return { status: 200, body: await service.runPaperLiveWorkflow(bodyObject(body ?? {})) };
    return { status: 404, body: { error: "NOT_FOUND" } };
  } catch (error) { return { status: error instanceof ValidationError ? 400 : 500, body: { error: error instanceof Error ? error.name : "ERROR", message: error instanceof Error ? error.message : "request failed" } }; }
}
const PUBLIC_UI_ORIGIN = "https://etvjay.github.io";
const CORS_METHODS = "GET, POST, OPTIONS";
const CORS_HEADERS = "content-type, accept";
function allowedOrigin(origin: string | undefined): string | undefined {
  if (!origin) return undefined;
  const configured = process.env.STATIC_UI_ORIGIN;
  if (configured && origin === configured) return origin;
  if (origin === PUBLIC_UI_ORIGIN) return origin;
  try {
    const parsed = new URL(origin);
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) return origin;
  } catch { /* malformed Origin is not allowed */ }
  return undefined;
}
function applyCors(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse): boolean {
  const origin = allowedOrigin(request.headers.origin);
  if (origin) { response.setHeader("access-control-allow-origin", origin); response.setHeader("vary", "Origin"); }
  if (request.method === "OPTIONS") {
    if (!origin) { response.statusCode = 403; response.end(JSON.stringify({ error: "CORS_ORIGIN_NOT_ALLOWED" })); return false; }
    response.statusCode = 204;
    response.setHeader("access-control-allow-methods", CORS_METHODS);
    response.setHeader("access-control-allow-headers", CORS_HEADERS);
    response.setHeader("access-control-max-age", "600");
    response.end();
    return false;
  }
  return true;
}
export const createHttpServer = (service = new ZeroInfinityService({ persistencePath: process.env.ZERO_INFINITY_PRODUCT_STORE_PATH })) => createServer((request, response) => {
  if (!applyCors(request, response)) return;
  if (request.headers["content-type"] && !request.headers["content-type"].startsWith("application/json")) { response.statusCode = 415; response.end(JSON.stringify({ error: "UNSUPPORTED_MEDIA_TYPE" })); return; }
  let raw = ""; request.on("data", chunk => { raw += chunk; if (raw.length > MAX_JSON) request.destroy(); }).on("end", async () => { let body: unknown; try { body = raw ? JSON.parse(raw) : undefined; } catch { response.statusCode = 400; response.end(JSON.stringify({ error: "INVALID_JSON" })); return; } const result = await handleRequest(service, request.method ?? "GET", new URL(request.url ?? "/", "http://localhost").pathname, body); response.statusCode = result.status; response.setHeader("content-type", "application/json"); response.end(JSON.stringify(result.body, (_key, value) => typeof value === "bigint" ? `${value}n` : value)); });
});
