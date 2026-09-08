import { createServer } from "node:http";
import { ZeroInfinityService } from "./service.js";
import { handleMcp } from "./mcp.js";
import { exactOwnPlain, ValidationError } from "./types.js";
const MAX_JSON = 64 * 1024;
function bodyObject(value: unknown): Record<string, unknown> { if (!exactOwnPlain(value, Object.keys((value as Record<string, unknown>) ?? {}))) throw new ValidationError("JSON object required"); if (JSON.stringify(value).length > MAX_JSON) throw new ValidationError("payload too large"); return value as Record<string, unknown>; }
function notFound(): { status: number; body: unknown } { return { status: 404, body: { error: "NOT_FOUND", message: "workflow not found" } }; }
export async function handleRequest(service: ZeroInfinityService, method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  try {
    if (method === "GET" && path === "/health") return { status: 200, body: { ok: true, version: "v1" } };
    if (method === "GET" && path === "/capabilities") return { status: 200, body: service.getCapabilities() };
    if (method === "GET" && path === "/readiness") return { status: 200, body: service.getReadiness() };
    let match = path.match(/^\/v1\/workflows\/([^/]+)$/);
    if (method === "POST" && path === "/v1/workflows") return { status: 201, body: service.createWorkflow(bodyObject(body ?? {})) };
    if (method === "GET" && match) { const value = service.getWorkflow(match[1]); return value ? { status: 200, body: value } : notFound(); }
    match = path.match(/^\/v1\/workflows\/([^/]+)\/submit$/);
    if (method === "POST" && match) { if (!service.getWorkflow(match[1])) return notFound(); return { status: 200, body: await service.submitOpportunity(match[1]) }; }
    match = path.match(/^\/v1\/workflows\/([^/]+)\/receipt$/);
    if (method === "GET" && match) { const value = service.getReasoningReceipt(match[1]); return value ? { status: 200, body: value } : notFound(); }
    match = path.match(/^\/v1\/workflows\/([^/]+)\/thesis$/);
    if (method === "GET" && match) { const value = service.getTradeThesis(match[1]); return value ? { status: 200, body: value } : notFound(); }
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
export const createHttpServer = (service = new ZeroInfinityService()) => createServer((request, response) => {
  if (!applyCors(request, response)) return;
  if (request.headers["content-type"] && !request.headers["content-type"].startsWith("application/json")) { response.statusCode = 415; response.end(JSON.stringify({ error: "UNSUPPORTED_MEDIA_TYPE" })); return; }
  let raw = ""; request.on("data", chunk => { raw += chunk; if (raw.length > MAX_JSON) request.destroy(); }).on("end", async () => { let body: unknown; try { body = raw ? JSON.parse(raw) : undefined; } catch { response.statusCode = 400; response.end(JSON.stringify({ error: "INVALID_JSON" })); return; } const result = await handleRequest(service, request.method ?? "GET", new URL(request.url ?? "/", "http://localhost").pathname, body); response.statusCode = result.status; response.setHeader("content-type", "application/json"); response.end(JSON.stringify(result.body, (_key, value) => typeof value === "bigint" ? `${value}n` : value)); });
});
