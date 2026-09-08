import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export type ReadinessPolicy = Readonly<{
  product: "USD_M_FUTURES";
  symbols: readonly ["BTCUSDT", "ETHUSDT"];
  maxNotional: number; maxQuantity: number; maxSpreadBps: number; maxSlippageBps: number; maxFeeBps: number; maxFundingCostBps: number;
  freshnessMs: number; requireSynchronizedBook: true; requireConfirmation: true;
}>;
const POLICY_KEYS = ["product","symbols","maxNotional","maxQuantity","maxSpreadBps","maxSlippageBps","maxFeeBps","maxFundingCostBps","freshnessMs","requireSynchronizedBook","requireConfirmation"] as const;
const freeze = <T>(v: T): T => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const child of Object.values(v as Record<string, unknown>)) freeze(child); } return v; };
const finitePositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
export function validateReadinessPolicy(input: unknown): ReadinessPolicy {
  if (!input || typeof input !== "object" || Object.getPrototypeOf(input) !== Object.prototype) throw new TypeError("policy must be a plain object");
  const value = input as Record<string, unknown>;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== POLICY_KEYS.length || keys.some(k => typeof k !== "string" || !POLICY_KEYS.includes(k as typeof POLICY_KEYS[number]))) throw new TypeError("policy fields must be explicit and canonical");
  for (const key of POLICY_KEYS) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d || !d.enumerable || !('value' in d)) throw new TypeError(`policy.${key} must be an own data field`); }
  if (value.product !== "USD_M_FUTURES" || !Array.isArray(value.symbols) || value.symbols.length !== 2 || value.symbols[0] !== "BTCUSDT" || value.symbols[1] !== "ETHUSDT") throw new RangeError("only the USD-M futures BTCUSDT/ETHUSDT allowlist is authorized");
  for (const key of ["maxNotional","maxQuantity","maxSpreadBps","maxSlippageBps","maxFeeBps","maxFundingCostBps","freshnessMs"]) if (!finitePositive(value[key])) throw new RangeError(`${key} must be positive and finite`);
  if (value.requireSynchronizedBook !== true || value.requireConfirmation !== true) throw new RangeError("synchronized book and confirmation are mandatory");
  return freeze({ product: "USD_M_FUTURES", symbols: freeze(["BTCUSDT", "ETHUSDT"] as ["BTCUSDT", "ETHUSDT"]), maxNotional: value.maxNotional as number, maxQuantity: value.maxQuantity as number, maxSpreadBps: value.maxSpreadBps as number, maxSlippageBps: value.maxSlippageBps as number, maxFeeBps: value.maxFeeBps as number, maxFundingCostBps: value.maxFundingCostBps as number, freshnessMs: value.freshnessMs as number, requireSynchronizedBook: true, requireConfirmation: true });
}

export type ConfirmationState = "READY_FOR_CONFIRMATION" | "CONFIRMATION_REQUESTED" | "CONFIRMED" | "DENIED" | "EXPIRED" | "INVALIDATED";
export type ConfirmationIntent = Readonly<Record<string, unknown>>;
const encode = (v: unknown): unknown => typeof v === "bigint" ? `${v}n` : Array.isArray(v) ? v.map(encode) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, encode((v as Record<string, unknown>)[k])])) : v;
const fingerprint = (v: unknown) => createHash("sha256").update(JSON.stringify(encode(v))).digest("hex");
export class ConfirmationBoundary {
  private current: ConfirmationState = "READY_FOR_CONFIRMATION";
  private token?: string; private bound?: string; private expiresAt = 0;
  constructor(private readonly ttlMs: number, private readonly nowSkewMs = 0) { if (!finitePositive(ttlMs)) throw new RangeError("confirmation TTL must be positive"); }
  get state(): ConfirmationState { return this.current; }
  request(intent: ConfirmationIntent, now: number): Readonly<{ token: string; intentFingerprint: string; expiresAt: number }> {
    if (this.current !== "READY_FOR_CONFIRMATION") throw new Error(`confirmation cannot be requested from ${this.current}`);
    const bound = fingerprint(intent); this.bound = bound; this.expiresAt = now + this.ttlMs; this.token = fingerprint({ bound, now, ttl: this.ttlMs }); this.current = "CONFIRMATION_REQUESTED";
    return freeze({ token: this.token, intentFingerprint: bound, expiresAt: this.expiresAt });
  }
  confirm(intent: ConfirmationIntent, token: string, now: number): boolean {
    if (this.current !== "CONFIRMATION_REQUESTED" || token !== this.token || now >= this.expiresAt || fingerprint(intent) !== this.bound) { this.current = now >= this.expiresAt ? "EXPIRED" : "INVALIDATED"; return false; }
    this.current = "CONFIRMED"; return true;
  }
  deny(): void { if (this.current === "CONFIRMATION_REQUESTED") this.current = "DENIED"; }
  revalidate(intent: ConfirmationIntent, now: number, check: () => boolean): boolean {
    if (this.current !== "CONFIRMED") return false;
    if (now >= this.expiresAt || fingerprint(intent) !== this.bound || !check()) { this.current = now >= this.expiresAt ? "EXPIRED" : "INVALIDATED"; return false; }
    return true;
  }
}

export type KillSwitchState = "ENABLED" | "HALTED";
export class KillSwitch {
  private current: KillSwitchState = "ENABLED";
  get state(): KillSwitchState { return this.current; }
  halt(_reason: string): void { this.current = "HALTED"; }
  allowsNewWork(): false { return false; }
  allowsReconciliation(): true { return true; }
  assertNewWorkBlocked(): never { throw new Error(`new mandate exercise, intent, and confirmation requests are blocked by kill switch ${this.current}`); }
}

export const capabilityManifest = freeze({ mode: "submission-ready-shadow/readiness", venue: "Binance", product: "USD_M_FUTURES", symbols: ["BTCUSDT", "ETHUSDT"], marketRead: true, accountRead: false, mcpRead: false, liveWrite: false, cancelWrite: false, transferWrite: false, withdrawalWrite: false, requiresConfirmation: true, evidenceCeiling: "LOCAL_PASS plus bounded LIVE_READ_PASS market bookTicker only; no account, MCP, or live-write proof" });
export const mcpProbeReceipt = freeze({ receiptId: "ZO-BIN-MCP-401-AGENTIC-READ-ONLY", endpoint: "https://agent.binance.com/mcp/agentic", status: 401, wwwAuthenticate: "Bearer resource_metadata=https://agent.binance.com/.well-known/oauth-protected-resource/gateway-mcp", credentialsSupplied: false, authAttempted: false, capability: "mcpRead", evidence: "BLOCKED_EXTERNAL" });
export const secretManifest = freeze([
  { name: "BINANCE_API_KEY", purpose: "future authenticated account/read integration", availability: "not supplied", sensitivity: "secret", evidence: "not used" },
  { name: "BINANCE_API_SECRET", purpose: "future authenticated account/read integration", availability: "not supplied", sensitivity: "secret", evidence: "not used" },
  { name: "BINANCE_MCP_BEARER_TOKEN", purpose: "future authenticated MCP read", availability: "not supplied", sensitivity: "secret", evidence: "401 preserved; no auth guessed" },
]);
export const startupSafetyReport = ["mode: SHADOW/READINESS", "LIVE WRITE DISABLED", "writer: LocalReplayOrderWriter", "market: LIVE_READ_PASS bounded public bookTicker evidence", "account: BLOCKED_EXTERNAL", "Agentic MCP BLOCKED_EXTERNAL 401", "kill switch: ENABLED", "allowlist: USD_M_FUTURES BTCUSDT/ETHUSDT", "external emergency stop: documentation only; never invoked"].join("\n");

export interface DemoArtifact { readonly status: string; readonly codeSha: string; readonly mode: string; readonly capabilities: typeof capabilityManifest; readonly scenarioIds: readonly string[]; readonly receiptRefs: readonly string[]; readonly mb7Ref: string; readonly mcpEvidenceRef: string; readonly externalBlockers: readonly string[]; readonly liveWriteStatus: "DISABLED"; }
export function validateDemoArtifact(value: unknown): value is DemoArtifact {
  try { if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false; const x = value as Record<string, unknown>; const required = ["status","codeSha","mode","capabilities","scenarioIds","receiptRefs","mb7Ref","mcpEvidenceRef","externalBlockers","liveWriteStatus"]; if (Reflect.ownKeys(x).length !== required.length || required.some(k => !Object.prototype.hasOwnProperty.call(x,k))) return false; return x.status === "READINESS_PREPARED" && typeof x.codeSha === "string" && /^[0-9a-f]{40}$/.test(x.codeSha) && x.mode === "submission-ready-shadow/readiness" && x.liveWriteStatus === "DISABLED" && JSON.stringify(x.scenarioIds) === JSON.stringify(["economics-edge-collapse","valid-shadow-execution","unknown-recovery"]) && Array.isArray(x.receiptRefs) && x.receiptRefs.length === 3 && x.mb7Ref === "ZO-BIN-MB7-SHADOW-DETERMINISTIC-V1" && x.mcpEvidenceRef === mcpProbeReceipt.receiptId && Array.isArray(x.externalBlockers) && (x.capabilities as any)?.liveWrite === false && (x.capabilities as any)?.mcpRead === false; } catch { return false; }
}
export function repositorySha(): string { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); }
