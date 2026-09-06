import type { ExecutionMandate, Instrument, Side, Venue } from "../domain/index.js";
import type { MandateRuntime } from "../runtime/mandateRuntime.js";

export interface StateEnvelope<T> { readonly version: bigint; readonly observedAt: number; readonly receivedAt: number; readonly value: T; }
export interface LiveMarketState {
  readonly venue: Venue; readonly instrument: Instrument; readonly symbol: string;
  readonly bidPrice: number; readonly askPrice: number; readonly markPrice: number;
  readonly expectedMoveBps: number; readonly spreadBps: number; readonly slippageBps: number;
  readonly feeBps: number; readonly fundingCostBps: number;
}
export interface LiveAccountState { readonly accountId: string; readonly availableNotional: number; readonly currentNotional: number; readonly currentLossBps: number; }
export interface EvaluationPolicy { readonly maxMarketAgeMs: number; readonly maxAccountAgeMs: number; readonly maxAnchorVersionLag: bigint; }
export interface EvaluationWorkflow { readonly workflowId: string; readonly thesisId?: string; readonly mandateId?: string; readonly authorityStatus?: "ACTIVE" | "SUPERSEDED" | "REVOKED" | "CONSUMED"; }
export type RefusalCode = "INVALID_BINDING" | "AUTHORITY_STATUS" | "RUNTIME_NOT_EXECUTABLE" | "MANDATE_EXPIRED" | "MARKET_STATE_STALE" | "ACCOUNT_STATE_STALE" | "STATE_VERSION_STALE" | "STATE_BINDING" | "ENTRY_TRIGGER_NOT_MET" | "ENTRY_PRICE_OUT_OF_BOUNDS" | "COST_CEILING" | "EXECUTABLE_EDGE_TOO_LOW" | "RISK_LIMIT" | "EXPOSURE_LIMIT";
export interface ExecutionRefusal { readonly kind: "EXECUTION_REFUSAL"; readonly code: RefusalCode; readonly message: string; readonly mandateId: string; readonly workflowId: string; }
export interface ExecutionIntent { readonly kind: "EXECUTION_INTENT"; readonly mandateId: string; readonly workflowId: string; readonly symbol: string; readonly side: Side; readonly method: ExecutionMandate["execution"]["method"]; readonly price: number; readonly notional: number; readonly executableEdgeBps: number; readonly marketStateVersion: bigint; readonly accountStateVersion: bigint; }

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";
const frozenTree = (v: unknown, seen = new Set<object>()): boolean => { if (!object(v)) return true; if (seen.has(v)) return true; seen.add(v); return Object.isFrozen(v) && Object.values(v).every((x) => frozenTree(x, seen)); };
const nonNegative = (v: unknown): boolean => finite(v) && (v as number) >= 0;
const text = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

function validMandate(m: unknown): m is ExecutionMandate {
  if (!object(m) || !frozenTree(m) || m.version !== 1 || m.maxUses !== 1) return false;
  const x = m as any;
  const strings = [x.mandateId,x.workflowId,x.thesisId,x.method,x.advocateRef,x.opposeRef,x.marketAnalysisRef,x.evidenceBundleHash,x.councilDecisionHash,x.symbol,x.accountId];
  if (strings.some((v) => !text(v)) || x.venue !== "BINANCE" || !["SPOT","USD_M_FUTURES"].includes(x.instrument) || !["BUY","SELL"].includes(x.side)) return false;
  if (!object(x.validity) || !nonNegative(x.validity.issuedAt) || !nonNegative(x.expiresAt) || x.expiresAt <= x.validity.issuedAt) return false;
  if (!object(x.anchor) || typeof x.anchor.stateVersion !== "bigint" || x.anchor.stateVersion < 0n || !nonNegative(x.anchor.observedAt) || !nonNegative(x.anchor.receivedAt) || x.anchor.receivedAt < x.anchor.observedAt || !finite(x.anchor.markPrice) || x.anchor.markPrice <= 0) return false;
  if (!object(x.entry) || !nonNegative(x.entry.minPrice) || !nonNegative(x.entry.maxPrice) || x.entry.minPrice <= 0 || x.entry.maxPrice < x.entry.minPrice || !["ABOVE","BELOW"].includes(x.entry.trigger) || !nonNegative(x.entry.maxSpreadBps) || !nonNegative(x.entry.maxSlippageBps)) return false;
  if (!object(x.economics) || ["minExecutableEdgeBps","maxFeeBps","maxFundingCostBps","maxNotional"].some((k) => !nonNegative(x.economics[k])) || x.economics.maxNotional <= 0) return false;
  if (!object(x.risk) || !nonNegative(x.risk.maxLossBps) || !object(x.invalidation) || !["LONG","SHORT"].includes(x.invalidation.direction) || (x.invalidation.direction === "LONG" ? "BUY" : "SELL") !== x.side || !nonNegative(x.invalidation.thesisExpiry) || x.invalidation.thesisExpiry < x.expiresAt) return false;
  if (!object(x.execution) || !["LIMIT","MARKET"].includes(x.execution.method)) return false;
  if (!object(x.provenance) || x.provenance.thesisId !== x.thesisId || x.provenance.method !== x.method || x.provenance.advocateRef !== x.advocateRef || x.provenance.opposeRef !== x.opposeRef || x.provenance.marketAnalysisRef !== x.marketAnalysisRef || x.provenance.evidenceBundleHash !== x.evidenceBundleHash || x.provenance.councilDecisionHash !== x.councilDecisionHash || x.provenance.thesisHash !== x.thesisHash) return false;
  return true;
}

export function evaluateMandate(workflow: EvaluationWorkflow, mandate: ExecutionMandate, runtime: MandateRuntime, market: StateEnvelope<LiveMarketState>, account: StateEnvelope<LiveAccountState>, policy: EvaluationPolicy, now: number): ExecutionIntent | ExecutionRefusal {
  const m = mandate as any, w = workflow as any;
  const refuse = (code: RefusalCode, message: string): ExecutionRefusal => Object.freeze({ kind: "EXECUTION_REFUSAL", code, message, mandateId: typeof m?.mandateId === "string" ? m.mandateId : "", workflowId: typeof w?.workflowId === "string" ? w.workflowId : "" });
  try {
    if (!validMandate(mandate) || !object(workflow) || !text(w.workflowId)) return refuse("INVALID_BINDING", "mandate is mutable or structurally inconsistent");
    if (w.workflowId !== m.workflowId || (w.thesisId !== undefined && w.thesisId !== m.thesisId) || (w.mandateId !== undefined && w.mandateId !== m.mandateId)) return refuse("INVALID_BINDING", "workflow, thesis, or mandate identity does not match");
    if (w.authorityStatus !== "ACTIVE") return refuse("AUTHORITY_STATUS", "explicit ACTIVE authority status is required");
    if (!object(runtime) || !["ARMED","TRIGGERED","VALIDATING"].includes(runtime.state) || runtime.expiresAt !== m.expiresAt || !frozenTree(runtime)) return refuse("RUNTIME_NOT_EXECUTABLE", "runtime is not executable or bound to mandate");
    if (!finite(now) || now > m.expiresAt || now > m.invalidation.thesisExpiry) return refuse("MANDATE_EXPIRED", "mandate or thesis has expired");
    if (!object(market) || !object(account) || !finite(market.observedAt) || !finite(market.receivedAt) || market.observedAt > now || market.receivedAt > now || market.receivedAt < market.observedAt || now - market.observedAt > policy.maxMarketAgeMs || now - market.receivedAt > policy.maxMarketAgeMs) return refuse("MARKET_STATE_STALE", "market state is stale or chronologically invalid");
    if (!finite(account.observedAt) || !finite(account.receivedAt) || account.observedAt > now || account.receivedAt > now || account.receivedAt < account.observedAt || now - account.observedAt > policy.maxAccountAgeMs || now - account.receivedAt > policy.maxAccountAgeMs) return refuse("ACCOUNT_STATE_STALE", "account state is stale or chronologically invalid");
    if (typeof market.version !== "bigint" || market.version < 0n || market.version < m.anchor.stateVersion || market.version - m.anchor.stateVersion > policy.maxAnchorVersionLag || typeof account.version !== "bigint" || account.version < 0n || account.version > market.version + policy.maxAnchorVersionLag || market.version - account.version > policy.maxAnchorVersionLag) return refuse("STATE_VERSION_STALE", "state versions are incoherent or outside the bounded lag");
    const mv: any = (market as any).value, av: any = (account as any).value;
    if (!object(mv) || !object(av) || mv.venue !== m.venue || mv.instrument !== m.instrument || mv.symbol !== m.symbol || av.accountId !== m.accountId) return refuse("STATE_BINDING", "live state binding does not match the mandate");
    const bid = mv.bidPrice as number, ask = mv.askPrice as number, mark = mv.markPrice as number, expected = mv.expectedMoveBps as number;
    const spread = mv.spreadBps as number, slippage = mv.slippageBps as number, fee = mv.feeBps as number, funding = mv.fundingCostBps as number;
    const available = av.availableNotional as number, current = av.currentNotional as number, loss = av.currentLossBps as number;
    const nums = [bid,ask,mark,expected,spread,slippage,fee,funding,available,current,loss];
    if (nums.some((v) => !nonNegative(v)) || bid <= 0 || ask <= 0 || bid > ask || mark < bid || mark > ask) return refuse("STATE_BINDING", "live state contains impossible values");
    const entryPrice: number = m.side === "BUY" ? ask : bid;
    if (entryPrice < m.entry.minPrice || entryPrice > m.entry.maxPrice) return refuse("ENTRY_PRICE_OUT_OF_BOUNDS", "current entry price is outside mandate bounds");
    if ((m.entry.trigger === "BELOW" && mark > m.entry.maxPrice) || (m.entry.trigger === "ABOVE" && mark < m.entry.minPrice)) return refuse("ENTRY_TRIGGER_NOT_MET", "entry trigger is not met");
    if (spread > m.entry.maxSpreadBps || slippage > m.entry.maxSlippageBps || fee > m.economics.maxFeeBps || funding > m.economics.maxFundingCostBps) return refuse("COST_CEILING", "execution costs exceed mandate ceilings");
    const edge = expected - spread - slippage - fee - funding;
    if (!finite(edge) || edge < m.economics.minExecutableEdgeBps) return refuse("EXECUTABLE_EDGE_TOO_LOW", "executable edge is below the mandate floor");
    if (loss > m.risk.maxLossBps) return refuse("RISK_LIMIT", "current account loss exceeds mandate risk ceiling");
    const notional = m.economics.maxNotional;
    if (!finite(notional) || notional <= 0 || notional > available || current < 0 || current + notional > m.economics.maxNotional) return refuse("EXPOSURE_LIMIT", "available or aggregate exposure exceeds mandate ceiling");
    return Object.freeze({ kind: "EXECUTION_INTENT", mandateId: m.mandateId, workflowId: m.workflowId, symbol: m.symbol, side: m.side, method: m.execution.method, price: entryPrice, notional, executableEdgeBps: edge, marketStateVersion: market.version, accountStateVersion: account.version });
  } catch { return refuse("INVALID_BINDING", "malformed evaluation input"); }
}
