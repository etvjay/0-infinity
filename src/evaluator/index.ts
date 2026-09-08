import { runInNewContext } from "node:vm";
import type { ExecutionMandate, Instrument, Side, Venue } from "../domain/index.js";
import { MANDATE_STATES, isLegalTransition, type MandateState } from "../runtime/mandateState.js";
import type { MandateRuntime } from "../runtime/mandateRuntime.js";

export interface StateEnvelope<T> { readonly version: bigint; readonly observedAt: number; readonly receivedAt: number; readonly value: T; }
export interface LiveMarketState { readonly venue: Venue; readonly instrument: Instrument; readonly symbol: string; readonly bidPrice: number; readonly askPrice: number; readonly markPrice: number; readonly expectedMoveBps: number; readonly spreadBps: number; readonly slippageBps: number; readonly feeBps: number; readonly fundingCostBps: number; }
export interface LiveAccountState { readonly accountId: string; readonly availableNotional: number; readonly currentNotional: number; readonly currentLossBps: number; }
export interface EvaluationPolicy { readonly maxMarketAgeMs: number; readonly maxAccountAgeMs: number; readonly maxAnchorVersionLag: bigint; }
export interface EvaluationWorkflow { readonly workflowId: string; readonly thesisId?: string; readonly mandateId?: string; readonly authorityStatus?: "ACTIVE" | "SUPERSEDED" | "REVOKED" | "CONSUMED"; }
export type RefusalCode = "INVALID_BINDING" | "AUTHORITY_STATUS" | "RUNTIME_NOT_EXECUTABLE" | "MANDATE_EXPIRED" | "MARKET_STATE_STALE" | "ACCOUNT_STATE_STALE" | "STATE_VERSION_STALE" | "STATE_BINDING" | "ENTRY_TRIGGER_NOT_MET" | "ENTRY_PRICE_OUT_OF_BOUNDS" | "COST_CEILING" | "EXECUTABLE_EDGE_TOO_LOW" | "RISK_LIMIT" | "EXPOSURE_LIMIT";
export interface ExecutionRefusal { readonly kind: "EXECUTION_REFUSAL"; readonly code: RefusalCode; readonly message: string; readonly mandateId: string; readonly workflowId: string; }
export interface ExecutionIntent { readonly kind: "EXECUTION_INTENT"; readonly mandateId: string; readonly workflowId: string; readonly symbol: string; readonly side: Side; readonly method: ExecutionMandate["execution"]["method"]; readonly price: number; readonly notional: number; readonly executableEdgeBps: number; readonly marketStateVersion: bigint; readonly accountStateVersion: bigint; }

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";
const frozenTree = (v: unknown, seen = new Set<object>()): boolean => { if (!object(v)) return true; if (seen.has(v)) return true; seen.add(v); return Object.isFrozen(v) && Object.values(v).every((x) => frozenTree(x, seen)); };
const nonNegative = (v: unknown): v is number => finite(v) && v >= 0;
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const MAX_AGE = Number.MAX_SAFE_INTEGER;

type PrototypeContract = { keys: readonly PropertyKey[]; descriptors: Record<string, { enumerable: boolean; configurable: boolean; writable?: boolean; type: string; source?: string }> };
function pristinePrototypeContracts(): { object: PrototypeContract; array: PrototypeContract } {
  return runInNewContext(`(() => {
    const describe = (p) => ({ keys: Reflect.ownKeys(p), descriptors: Object.fromEntries(Reflect.ownKeys(p).map((k) => {
      const d = Object.getOwnPropertyDescriptor(p, k); const v = d.value;
      return [typeof k === "symbol" ? "symbol:" + (k.description ?? "") : k, { enumerable: d.enumerable, configurable: d.configurable, writable: "writable" in d ? d.writable : undefined, type: "value" in d ? typeof v : "accessor", source: typeof v === "function" ? Function.prototype.toString.call(v) : undefined }];
    })) });
    return { object: describe(Object.prototype), array: describe(Array.prototype) };
  })()`) as { object: PrototypeContract; array: PrototypeContract };
}
function canonicalSymbol(description: string): symbol | undefined {
  if (description === "Symbol.iterator") return Symbol.iterator;
  if (description === "Symbol.unscopables") return Symbol.unscopables;
  return undefined;
}
function pristinePrototype(p: object, contract: PrototypeContract): boolean {
  const keys = Reflect.ownKeys(p); if (keys.length !== contract.keys.length) return false;
  if (!keys.every((k) => contract.keys.some((expected) => {
    if (typeof expected === "symbol") return typeof k === "symbol" && canonicalSymbol(expected.description ?? "") === k;
    return k === expected;
  }))) return false;
  return keys.every((key) => {
    const name = typeof key === "symbol" ? "symbol:" + (key.description ?? "") : key;
    const expected = contract.descriptors[name]; const actual = Object.getOwnPropertyDescriptor(p, key);
    if (!expected || !actual || actual.enumerable !== expected.enumerable || actual.configurable !== expected.configurable || ("writable" in actual ? actual.writable : undefined) !== expected.writable || ("value" in actual ? typeof actual.value : "accessor") !== expected.type) return false;
    return expected.source === undefined || ("value" in actual && typeof actual.value === "function" && Function.prototype.toString.call(actual.value) === expected.source);
  });
}
function pristineIntrinsics(): boolean { const c = pristinePrototypeContracts(); return pristinePrototype(Object.prototype, c.object) && pristinePrototype(Array.prototype, c.array); }

export function isCanonicalFrozenObject(value: unknown, keys: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  if (!pristineIntrinsics() || !object(value) || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)) return false;
  const allowed = new Set([...keys, ...optional]);
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== "string" || !allowed.has(key)) || keys.some((key) => !own.includes(key))) return false;
  return own.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !!descriptor && "value" in descriptor && descriptor.enumerable && !descriptor.writable && !descriptor.configurable;
  });
}

export function isCanonicalFrozenArray(value: unknown): value is readonly unknown[] {
  if (!pristineIntrinsics() || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || !Object.isFrozen(value)) return false;
  const own = Reflect.ownKeys(value);
  if (own.length !== value.length + 1 || !own.includes("length")) return false;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || lengthDescriptor.value !== value.length || lengthDescriptor.writable || lengthDescriptor.enumerable || lengthDescriptor.configurable) return false;
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !descriptor.enumerable || descriptor.writable || descriptor.configurable || !("value" in descriptor)) return false;
  }
  return own.every((key) => key === "length" || (typeof key === "string" && /^\d+$/.test(key) && Number(key) < value.length));
}

export function validMandate(value: unknown): value is ExecutionMandate {
  try {
  const mandateKeys = ["mandateId", "workflowId", "thesisId", "method", "advocateRef", "opposeRef", "marketAnalysisRef", "evidenceBundleHash", "councilDecisionHash", "provenance", "venue", "instrument", "symbol", "side", "accountId", "expiresAt", "validity", "anchor", "entry", "economics", "risk", "invalidation", "execution", "version", "maxUses"];
  if (!isCanonicalFrozenObject(value, mandateKeys, ["thesisHash", "reasoningReceiptHash"]) || !frozenTree(value) || value.version !== 1 || value.maxUses !== 1) return false;
  const x = value as Record<string, any>;
  const strings = [x.mandateId, x.workflowId, x.thesisId, x.method, x.advocateRef, x.opposeRef, x.marketAnalysisRef, x.evidenceBundleHash, x.councilDecisionHash, x.symbol, x.accountId];
  if (strings.some((v) => !text(v)) || (x.thesisHash !== undefined && !text(x.thesisHash)) || (x.reasoningReceiptHash !== undefined && !text(x.reasoningReceiptHash)) || x.venue !== "BINANCE" || !["SPOT", "USD_M_FUTURES"].includes(String(x.instrument)) || !["BUY", "SELL"].includes(String(x.side))) return false;
  const validity = x.validity, anchor = x.anchor, entry = x.entry, economics = x.economics, risk = x.risk, invalidation = x.invalidation, execution = x.execution, provenance = x.provenance;
  if (!isCanonicalFrozenObject(validity, ["issuedAt"]) || !nonNegative(validity.issuedAt) || !nonNegative(x.expiresAt) || x.expiresAt <= validity.issuedAt) return false;
  if (!isCanonicalFrozenObject(anchor, ["stateVersion", "observedAt", "receivedAt", "markPrice"]) || typeof anchor.stateVersion !== "bigint" || anchor.stateVersion < 0n || !nonNegative(anchor.observedAt) || !nonNegative(anchor.receivedAt) || anchor.receivedAt < anchor.observedAt || !finite(anchor.markPrice) || anchor.markPrice <= 0) return false;
  if (!isCanonicalFrozenObject(entry, ["minPrice", "maxPrice", "trigger", "maxSpreadBps", "maxSlippageBps"]) || !positive(entry.minPrice) || !finite(entry.maxPrice) || entry.maxPrice < entry.minPrice || !["ABOVE", "BELOW"].includes(String(entry.trigger)) || !nonNegative(entry.maxSpreadBps) || !nonNegative(entry.maxSlippageBps)) return false;
  if (!isCanonicalFrozenObject(economics, ["minExecutableEdgeBps", "maxFeeBps", "maxFundingCostBps", "maxNotional"]) || ["minExecutableEdgeBps", "maxFeeBps", "maxFundingCostBps"].some((k) => !nonNegative(economics[k])) || !positive(economics.maxNotional)) return false;
  if (!isCanonicalFrozenObject(risk, ["maxLossBps"]) || !nonNegative(risk.maxLossBps) || !isCanonicalFrozenObject(invalidation, ["thesisExpiry", "direction"]) || !["LONG", "SHORT"].includes(String(invalidation.direction)) || (invalidation.direction === "LONG" ? "BUY" : "SELL") !== x.side || !nonNegative(invalidation.thesisExpiry) || invalidation.thesisExpiry < x.expiresAt) return false;
  if (!isCanonicalFrozenObject(execution, ["method"]) || !["LIMIT", "MARKET"].includes(String(execution.method))) return false;
  if (!isCanonicalFrozenObject(provenance, ["thesisId", "method", "advocateRef", "opposeRef", "marketAnalysisRef", "evidenceBundleHash", "councilDecisionHash"], ["thesisHash", "reasoningReceiptHash"]) || provenance.thesisId !== x.thesisId || provenance.thesisHash !== x.thesisHash || provenance.method !== x.method || provenance.advocateRef !== x.advocateRef || provenance.opposeRef !== x.opposeRef || provenance.marketAnalysisRef !== x.marketAnalysisRef || provenance.evidenceBundleHash !== x.evidenceBundleHash || provenance.councilDecisionHash !== x.councilDecisionHash || provenance.reasoningReceiptHash !== x.reasoningReceiptHash) return false;
  return true;
  } catch { return false; }
}
function positive(v: unknown): v is number { return finite(v) && v > 0; }
function validPolicy(value: unknown): value is EvaluationPolicy { return object(value) && finite(value.maxMarketAgeMs) && value.maxMarketAgeMs >= 0 && value.maxMarketAgeMs <= MAX_AGE && finite(value.maxAccountAgeMs) && value.maxAccountAgeMs >= 0 && value.maxAccountAgeMs <= MAX_AGE && typeof value.maxAnchorVersionLag === "bigint" && value.maxAnchorVersionLag >= 0n; }
function validRuntime(value: unknown, now: number): value is MandateRuntime {
  if (!object(value) || !frozenTree(value) || !MANDATE_STATES.includes(value.state as MandateState) || !finite(value.expiresAt) || !Array.isArray(value.history) || !Object.isFrozen(value.history)) return false;
  let previous: MandateState = "ARMED", previousAt = -Infinity;
  for (const record of value.history) {
    if (!object(record) || !Object.isFrozen(record) || record.fromState !== previous || !MANDATE_STATES.includes(record.toState as MandateState) || !finite(record.at) || record.at < 0 || record.at > now || record.at < previousAt || (record.reason !== undefined && !text(record.reason)) || !isLegalTransition(record.fromState as MandateState, record.toState as MandateState)) return false;
    previous = record.toState as MandateState; previousAt = record.at;
  }
  return previous === value.state;
}

export function evaluateMandate(workflow: EvaluationWorkflow, mandate: ExecutionMandate, runtime: MandateRuntime, market: StateEnvelope<LiveMarketState>, account: StateEnvelope<LiveAccountState>, policy: EvaluationPolicy, now: number): ExecutionIntent | ExecutionRefusal {
  const m = object(mandate) ? mandate : undefined, w = object(workflow) ? workflow : undefined;
  const refuse = (code: RefusalCode, message: string): ExecutionRefusal => Object.freeze({ kind: "EXECUTION_REFUSAL", code, message, mandateId: text(m?.mandateId) ? m.mandateId : "", workflowId: text(w?.workflowId) ? w.workflowId : "" });
  try {
    if (!validMandate(mandate) || !w || !text(w.workflowId) || !validPolicy(policy) || !finite(now)) return refuse("INVALID_BINDING", "evaluation input is malformed");
    if (w.workflowId !== mandate.workflowId || (w.thesisId !== undefined && w.thesisId !== mandate.thesisId) || (w.mandateId !== undefined && w.mandateId !== mandate.mandateId)) return refuse("INVALID_BINDING", "workflow identity does not match mandate");
    if (w.authorityStatus !== "ACTIVE") return refuse("AUTHORITY_STATUS", "explicit ACTIVE authority status is required");
    if (!validRuntime(runtime, now) || runtime.expiresAt !== mandate.expiresAt || !["ARMED", "TRIGGERED", "VALIDATING"].includes(runtime.state)) return refuse("RUNTIME_NOT_EXECUTABLE", "runtime is not executable or canonically formed");
    if (now > mandate.expiresAt || now > mandate.invalidation.thesisExpiry) return refuse("MANDATE_EXPIRED", "mandate or thesis has expired");
    if (!object(market) || !object(account) || !finite(market.observedAt) || !finite(market.receivedAt) || market.observedAt > now || market.receivedAt > now || market.receivedAt < market.observedAt || now - market.observedAt > policy.maxMarketAgeMs || now - market.receivedAt > policy.maxMarketAgeMs) return refuse("MARKET_STATE_STALE", "market state is stale or chronologically invalid");
    if (!nonNegative(account.observedAt) || !nonNegative(account.receivedAt) || account.observedAt > now || account.receivedAt > now || account.receivedAt < account.observedAt || now - account.observedAt > policy.maxAccountAgeMs || now - account.receivedAt > policy.maxAccountAgeMs) return refuse("ACCOUNT_STATE_STALE", "account state is stale or chronologically invalid");
    if (mandate.anchor.observedAt > market.observedAt || mandate.anchor.receivedAt > market.receivedAt || typeof market.version !== "bigint" || market.version < 0n || market.version < mandate.anchor.stateVersion || market.version - mandate.anchor.stateVersion > policy.maxAnchorVersionLag || typeof account.version !== "bigint" || account.version < 0n) return refuse("STATE_VERSION_STALE", "state versions or anchor chronology are incoherent");
    const mv = market.value, av = account.value;
    if (!object(mv) || !object(av) || mv.venue !== mandate.venue || mv.instrument !== mandate.instrument || mv.symbol !== mandate.symbol || av.accountId !== mandate.accountId) return refuse("STATE_BINDING", "live state binding does not match mandate");
    const bid = mv.bidPrice, ask = mv.askPrice, mark = mv.markPrice, expected = mv.expectedMoveBps, spread = mv.spreadBps, slippage = mv.slippageBps, fee = mv.feeBps, funding = mv.fundingCostBps, available = av.availableNotional, current = av.currentNotional, loss = av.currentLossBps;
    const nums = [bid, ask, mark, expected, spread, slippage, fee, funding, available, current, loss];
    const canonicalSpread = finite(bid) && finite(ask) && ask > 0 ? (ask - bid) / ((ask + bid) / 2) * 10_000 : NaN;
    if (nums.some((v) => !nonNegative(v)) || bid <= 0 || ask <= 0 || bid > ask || mark < bid || mark > ask || spread < 0 || !finite(canonicalSpread) || spread !== canonicalSpread) return refuse("STATE_BINDING", "live state contains impossible or inconsistent values");
    const entryPrice = mandate.side === "BUY" ? ask : bid;
    if (entryPrice < mandate.entry.minPrice || entryPrice > mandate.entry.maxPrice) return refuse("ENTRY_PRICE_OUT_OF_BOUNDS", "current entry price is outside mandate bounds");
    if ((mandate.entry.trigger === "BELOW" && mark > mandate.entry.minPrice) || (mandate.entry.trigger === "ABOVE" && mark < mandate.entry.maxPrice)) return refuse("ENTRY_TRIGGER_NOT_MET", "entry trigger is not met");
    if (spread > mandate.entry.maxSpreadBps || slippage > mandate.entry.maxSlippageBps || fee > mandate.economics.maxFeeBps || funding > mandate.economics.maxFundingCostBps) return refuse("COST_CEILING", "execution costs exceed mandate ceilings");
    const edge = expected - spread - slippage - fee - funding;
    if (!finite(edge) || edge < mandate.economics.minExecutableEdgeBps) return refuse("EXECUTABLE_EDGE_TOO_LOW", "executable edge is below mandate floor");
    if (loss > mandate.risk.maxLossBps) return refuse("RISK_LIMIT", "current account loss exceeds mandate risk ceiling");
    const notional = mandate.economics.maxNotional;
    if (current + notional > mandate.economics.maxNotional || notional > available) return refuse("EXPOSURE_LIMIT", "available or aggregate exposure exceeds mandate ceiling");
    return Object.freeze({ kind: "EXECUTION_INTENT", mandateId: mandate.mandateId, workflowId: mandate.workflowId, symbol: mandate.symbol, side: mandate.side, method: mandate.execution.method, accountId: mandate.accountId, price: entryPrice, notional, executableEdgeBps: edge, marketStateVersion: market.version, accountStateVersion: account.version });
  } catch { return refuse("INVALID_BINDING", "malformed evaluation input"); }
}
