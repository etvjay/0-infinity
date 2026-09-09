import { BuiltinWorkerAdapter, HttpAgentAdapter, McpWorkerAdapter, createOpenAICompatibleAdapterFromEnv, type OpenAICompatibleEnv, type Transport, type Clock } from "./adapters.js";
import type { ReasoningStack, RoleAdapter, CouncilAdapter } from "./types.js";
import { validateCouncilDecisionCandidate, type CouncilDecisionCandidate, type CouncilInvocation } from "../reasoning/councilAdapter.js";
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
  council: WorkerBindingConfig;
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
class EndpointCouncilAdapter implements CouncilAdapter {
  readonly independence = "external" as const;
  constructor(public readonly name: string, private readonly transport: (input: CouncilInvocation, signal: AbortSignal) => Promise<unknown>, private readonly clock: Clock = () => Date.now()) {}
  async invokeCouncil(input: CouncilInvocation): Promise<unknown> { const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.max(1,input.deadlineAt-this.clock()));try{return await this.transport(input,controller.signal);}finally{clearTimeout(timer);} }
}
function candidateTransport(config: EndpointWorkerConfig): (input: CouncilInvocation, signal: AbortSignal) => Promise<unknown> {
  const url = endpoint(config.endpoint);
  const tool = config.tool ?? "council_decision";
  return async (input, signal) => {
    if (config.adapter === "http-agent") { const response = await fetch(url, { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify(input) }); if (!response.ok) throw new ValidationError(`Council HTTP worker returned ${response.status}`); return response.json(); }
    const call = async (method: string, params: Record<string, unknown>) => {
      const response = await fetch(url, { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: `${input.invocationId}:${method}`, method, params }) });
      if (!response.ok) throw new ValidationError(`Council worker returned ${response.status}`);
      const body = await response.json() as Record<string, unknown>;
      if (body.error || !body.result || typeof body.result !== "object") throw new ValidationError("Council worker returned an error");
      return body.result as Record<string, unknown>;
    };
    await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "zero-infinity-council-adapter", version: "v1" } });
    await call("tools/list", {});
    const result = await call("tools/call", { name: tool, arguments: { input } });
    if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent;
    const content = Array.isArray(result.content) ? result.content[0] as Record<string, unknown> : undefined;
    if (!content || content.type !== "text" || typeof content.text !== "string") throw new ValidationError("Council content malformed");
    return JSON.parse(content.text);
  };
}

function plainCouncil(adapter: CouncilAdapter): CouncilAdapter { return { name: adapter.name, independence: adapter.independence, invokeCouncil: adapter.invokeCouncil.bind(adapter) }; }
function councilBinding(config: WorkerBindingConfig, clock: Clock): RoleAdapter | CouncilAdapter {
  if(config.adapter==="builtin")return binding(config,clock);
  if(config.adapter==="http-agent"||config.adapter==="mcp-worker")return plainCouncil(new EndpointCouncilAdapter(config.name??`${config.adapter}:${endpoint(config.endpoint)}`,candidateTransport(config),clock));
  if(config.adapter!=="openai-compatible")throw new ValidationError("unsupported Council adapter");
  const adapter=createOpenAICompatibleAdapterFromEnv({ZI_REASONING_OPENAI_BASE_URL:config.baseUrl,ZI_REASONING_OPENAI_MODEL:config.model,ZI_REASONING_OPENAI_API_KEY:config.apiKey??"runtime-only"},undefined,clock);if(!adapter)throw new ValidationError("Council OpenAI-compatible configuration is invalid");
  return plainCouncil(new EndpointCouncilAdapter(config.name??`openai-compatible-council-v1:${config.model}`,async(input,signal)=>{const r=await fetch(`${endpoint(config.baseUrl)}/chat/completions`,{method:"POST",signal,headers:{"content-type":"application/json",authorization:`Bearer ${config.apiKey??"runtime-only"}`},body:JSON.stringify({model:config.model,temperature:0,response_format:{type:"json_object"},messages:[{role:"system",content:"Return only the canonical CouncilDecisionCandidate JSON. Do not include orders, mandates, intents, quantities, prices, or execution authority."},{role:"user",content:JSON.stringify(input)}]})});if(!r.ok)throw new ValidationError("Council provider unavailable");const b=await r.json() as any;return JSON.parse(b.choices?.[0]?.message?.content);},clock));
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
  if(config.council.adapter==="builtin")return freezeDeep({ name: config.name, version: config.version, ...(config.profile === undefined ? {} : { reasoningProfile: config.profile }), bindings: { ADVOCATE: binding(config.advocate, clock), OPPOSER: binding(config.opposer, clock), MARKET_ANALYST: binding(config.marketAnalyst, clock), COUNCIL: councilBinding(config.council, clock) }, capabilities: ["reasoning", "shadow", "readiness", "events"] as const });
  return freezeDeep({ name: config.name, version: config.version, ...(config.profile === undefined ? {} : { reasoningProfile: config.profile }), bindings: { ADVOCATE: binding(config.advocate, clock), OPPOSER: binding(config.opposer, clock), MARKET_ANALYST: binding(config.marketAnalyst, clock), COUNCIL: councilBinding(config.council, clock) }, capabilities: ["reasoning", "shadow", "readiness", "events"] as const });
}
