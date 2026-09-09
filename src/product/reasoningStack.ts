import { BuiltinWorkerAdapter, HttpAgentAdapter, McpWorkerAdapter, createOpenAICompatibleAdapterFromEnv, type OpenAICompatibleEnv, type Transport, type Clock } from "./adapters.js";
import type { ReasoningStack, RoleAdapter } from "./types.js";
import type { ReasoningProfile } from "./reasoningBudget.js";
import { ValidationError, freezeDeep } from "./types.js";

export type EndpointWorkerConfig = Readonly<{
  adapter: "http-agent" | "mcp-worker";
  endpoint: string;
  tool?: string;
  name?: string;
}>;
export type OpenAIWorkerConfig = Readonly<{
  adapter: "openai-compatible";
  baseUrl: string;
  model: string;
  apiKey?: string;
  name?: string;
}>;
export type BuiltinWorkerConfig = Readonly<{ adapter: "builtin"; name?: string }>;
export type WorkerBindingConfig = BuiltinWorkerConfig | OpenAIWorkerConfig | EndpointWorkerConfig;
export type ReasoningStackConfig = Readonly<{
  name: string;
  version: string;
  profile?: ReasoningProfile;
  advocate: WorkerBindingConfig;
  opposer: WorkerBindingConfig;
  marketAnalyst: WorkerBindingConfig;
  council: BuiltinWorkerConfig;
}>;

function endpoint(value: string): string {
  try { const url = new URL(value); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(); return url.toString().replace(/\/$/, ""); } catch { throw new ValidationError("worker endpoint must be an http(s) URL without credentials or query state"); }
}
function plain(adapter: RoleAdapter): RoleAdapter { return { name: adapter.name, independence: adapter.independence, invoke: adapter.invoke.bind(adapter) }; }
function transportFor(config: EndpointWorkerConfig): Transport {
  const url = endpoint(config.endpoint);
  if (config.adapter === "http-agent") return async (input, signal) => {
    const response = await fetch(url, { method: "POST", signal, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) throw new ValidationError(`HTTP worker returned ${response.status}`);
    return response.json();
  };
  const tool = config.tool ?? "role_artifact";
  return async (input, signal) => {
    const call = async (method: string, params: Record<string, unknown>) => {
      const response = await fetch(url, { method: "POST", signal, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: `${input.invocationId}:${method}`, method, params }) });
      if (!response.ok) throw new ValidationError(`MCP worker returned ${response.status}`);
      const body = await response.json() as Record<string, unknown>;
      if (body.error) throw new ValidationError("MCP worker returned an error");
      return body.result as Record<string, unknown>;
    };
    await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "zero-infinity-role-adapter", version: "v1" } });
    await call("tools/list", {});
    const result = await call("tools/call", { name: tool, arguments: { input } });
    if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent;
    const content = Array.isArray(result.content) ? result.content[0] as Record<string, unknown> : undefined;
    if (!content || content.type !== "text" || typeof content.text !== "string") throw new ValidationError("MCP worker artifact content malformed");
    return JSON.parse(content.text);
  };
}
function binding(config: WorkerBindingConfig, clock: Clock): RoleAdapter {
  if (config.adapter === "builtin") return plain(new BuiltinWorkerAdapter(config.name ?? "builtin-worker-v1", clock));
  if (config.adapter === "openai-compatible") {
    const adapter = createOpenAICompatibleAdapterFromEnv({ ZI_REASONING_OPENAI_BASE_URL: config.baseUrl, ZI_REASONING_OPENAI_MODEL: config.model, ZI_REASONING_OPENAI_API_KEY: config.apiKey ?? "runtime-only" }, undefined, clock);
    if (!adapter) throw new ValidationError("OpenAI-compatible worker configuration is invalid");
    return plain(config.name ? Object.assign(adapter, { name: config.name }) : adapter);
  }
  const name = config.name ?? `${config.adapter}:${endpoint(config.endpoint)}`;
  return plain(config.adapter === "http-agent" ? new HttpAgentAdapter(name, transportFor(config), clock) : new McpWorkerAdapter(name, transportFor(config), clock));
}
export function createReasoningStack(config: ReasoningStackConfig, clock: Clock = () => Date.now()): ReasoningStack {
  if (!config.name || !config.version) throw new ValidationError("reasoning stack name and version are required");
  if (config.council.adapter !== "builtin") throw new ValidationError("custom Council workers are not supported by the current canonical Council contract");
  return freezeDeep({ name: config.name, version: config.version, reasoningProfile: config.profile, bindings: { ADVOCATE: binding(config.advocate, clock), OPPOSER: binding(config.opposer, clock), MARKET_ANALYST: binding(config.marketAnalyst, clock), COUNCIL: binding(config.council, clock) }, capabilities: ["reasoning", "shadow", "readiness", "events"] as const });
}
