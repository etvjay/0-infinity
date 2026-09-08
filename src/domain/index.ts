export type Venue = "BINANCE";
export type Instrument = "SPOT" | "USD_M_FUTURES";
export type Direction = "LONG" | "SHORT" | "FLAT";
export type Side = "BUY" | "SELL";
export type EntryTrigger = "ABOVE" | "BELOW";

export interface TradeThesis {
  readonly thesisId: string; readonly thesisHash?: string; readonly venue: Venue; readonly instrument: Instrument; readonly symbol: string;
  readonly direction: Direction; readonly side?: Side; readonly horizonMs: number; readonly confidence: number;
  readonly expectedMove: { readonly bps: number; readonly lowerBps: number; readonly upperBps: number };
  readonly reasoning: { readonly method: string; readonly advocateRef: string; readonly opposeRef: string; readonly marketAnalysisRef: string; readonly evidenceBundleHash: string; readonly councilDecisionHash: string; readonly reasoningReceiptHash?: string };
  readonly createdAt: number; readonly expiresAt: number;
}

export interface CompilerPolicy {
  readonly accountId: string; readonly validityMs: number;
  readonly minExecutableEdgeBps: number; readonly maxSpreadBps: number; readonly maxSlippageBps: number;
  readonly maxFeeBps: number; readonly maxFundingCostBps: number; readonly maxNotional: number; readonly maxLossBps: number;
  readonly execution: "LIMIT" | "MARKET";
  readonly minEntryPrice: number; readonly maxEntryPrice: number; readonly entryTrigger: EntryTrigger;
  /** Explicitly extending this list is the only way to authorize non-MVP symbols. */
  readonly allowedSymbols?: readonly string[];
}

export interface AnchorState {
  readonly stateVersion: bigint; readonly observedAt: number; readonly receivedAt: number; readonly markPrice: number;
}

export interface MandateProvenance {
  readonly thesisId: string; readonly thesisHash?: string; readonly method: string; readonly advocateRef: string;
  readonly opposeRef: string; readonly marketAnalysisRef: string; readonly evidenceBundleHash: string; readonly councilDecisionHash: string; readonly reasoningReceiptHash?: string;
}

export interface ExecutionMandate {
  readonly mandateId: string; readonly workflowId: string; readonly thesisId: string; readonly thesisHash?: string;
  readonly method: string; readonly advocateRef: string; readonly opposeRef: string; readonly marketAnalysisRef: string;
  readonly evidenceBundleHash: string; readonly councilDecisionHash: string; readonly provenance: MandateProvenance;
  readonly venue: Venue; readonly instrument: Instrument; readonly symbol: string; readonly side: Side; readonly accountId: string;
  /** Canonical expiry consumed by MandateRuntime. */
  readonly expiresAt: number;
  readonly validity: { readonly issuedAt: number };
  readonly anchor: AnchorState;
  readonly entry: { readonly minPrice: number; readonly maxPrice: number; readonly trigger: EntryTrigger; readonly maxSpreadBps: number; readonly maxSlippageBps: number };
  readonly economics: { readonly minExecutableEdgeBps: number; readonly maxFeeBps: number; readonly maxFundingCostBps: number; readonly maxNotional: number };
  readonly risk: { readonly maxLossBps: number };
  readonly invalidation: { readonly thesisExpiry: number; readonly direction: Direction };
  readonly execution: { readonly method: "LIMIT" | "MARKET" };
  readonly version: 1; readonly maxUses: 1;
}

const CANONICAL_REASONING_KEYS = ["method", "advocateRef", "opposeRef", "marketAnalysisRef", "evidenceBundleHash", "councilDecisionHash", "reasoningReceiptHash"] as const;

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}

const MVP_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT"]);
function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`);
  return value;
}
function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}
function positive(value: unknown, name: string): number {
  const number = finite(value, name);
  if (number <= 0) throw new RangeError(`${name} must be positive`);
  return number;
}
function nonNegative(value: unknown, name: string): number {
  const number = finite(value, name);
  if (number < 0) throw new RangeError(`${name} must not be negative`);
  return number;
}
function enumerableKeysIncludingPrototype(value: object): Set<string> {
  const keys = new Set<string>();
  const seen = new Set<object>();
  let current: object | null = value;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    for (const key of Object.keys(current)) keys.add(key);
    current = Object.getPrototypeOf(current);
  }
  return keys;
}

export function compileMandate(
  workflow: { readonly workflowId: string }, thesis: TradeThesis, policy: CompilerPolicy, anchor: AnchorState, now?: number,
): ExecutionMandate {
  requiredString(workflow?.workflowId, "workflowId");
  if (Object.keys(workflow).some((key) => key !== "workflowId")) throw new RangeError("workflow contains unsupported authority fields");
  requiredString(thesis?.thesisId, "thesisId"); requiredString(thesis?.symbol, "symbol");
  if (thesis.venue !== "BINANCE") throw new RangeError("venue must be BINANCE");
  if (thesis.instrument !== "SPOT" && thesis.instrument !== "USD_M_FUTURES") throw new RangeError("unsupported instrument");
  const policyKeys = new Set(["accountId", "validityMs", "minExecutableEdgeBps", "maxSpreadBps", "maxSlippageBps", "maxFeeBps", "maxFundingCostBps", "maxNotional", "maxLossBps", "execution", "minEntryPrice", "maxEntryPrice", "entryTrigger", "allowedSymbols"]);
  for (const key of Object.keys(policy)) if (!policyKeys.has(key)) throw new RangeError(`policy field ${key} would expand authority`);
  for (const key of ["minEntryPrice", "maxEntryPrice", "entryTrigger"] as const) if (!(key in policy)) throw new TypeError(`policy.${key} is required`);
  const symbols = policy.allowedSymbols ?? [...MVP_SYMBOLS];
  if (!Array.isArray(symbols) || symbols.length === 0 || symbols.some((s) => typeof s !== "string" || s.trim() === "")) throw new TypeError("allowedSymbols must be non-empty strings");
  if (!symbols.includes(thesis.symbol)) throw new RangeError("symbol is not authorized by policy");
  if (thesis.direction !== "LONG" && thesis.direction !== "SHORT") throw new RangeError("FLAT/NO_TRADE cannot compile");
  const expectedSide = thesis.direction === "LONG" ? "BUY" : "SELL";
  const expectedTrigger = thesis.direction === "LONG" ? "BELOW" : "ABOVE";
  if (thesis.side !== undefined && thesis.side !== expectedSide) throw new RangeError("direction/side contradiction");
  if (policy.entryTrigger !== expectedTrigger) throw new RangeError("entry trigger/side contradiction");
  if (policy.entryTrigger !== "ABOVE" && policy.entryTrigger !== "BELOW") throw new RangeError("invalid entry trigger");

  for (const [name, value] of Object.entries(thesis.expectedMove)) finite(value, `expectedMove.${name}`);
  if (!(thesis.expectedMove.lowerBps <= thesis.expectedMove.bps && thesis.expectedMove.bps <= thesis.expectedMove.upperBps)) throw new RangeError("expectedMove interval is incoherent");
  positive(thesis.horizonMs, "horizonMs"); finite(thesis.confidence, "confidence");
  if (thesis.confidence < 0 || thesis.confidence > 1) throw new RangeError("confidence must be between 0 and 1");
  if (thesis.thesisHash !== undefined) requiredString(thesis.thesisHash, "thesisHash");
  nonNegative(thesis.createdAt, "createdAt"); nonNegative(thesis.expiresAt, "expiresAt");
  if (thesis.expiresAt <= thesis.createdAt) throw new RangeError("thesis validity is incoherent");
  for (const key of enumerableKeysIncludingPrototype(thesis.reasoning)) if (!CANONICAL_REASONING_KEYS.includes(key as typeof CANONICAL_REASONING_KEYS[number])) throw new RangeError(`reasoning field ${key} would expand authority`);
  for (const key of CANONICAL_REASONING_KEYS) {
    if (key === "reasoningReceiptHash" && thesis.reasoning[key] === undefined) continue;
    if (!Object.prototype.propertyIsEnumerable.call(thesis.reasoning, key)) throw new TypeError(`reasoning.${key} must be an own enumerable property`);
    requiredString(thesis.reasoning[key], `reasoning.${key}`);
  }
  requiredString(policy.accountId, "accountId");
  for (const [key, value] of Object.entries(policy)) if (key !== "accountId" && key !== "execution" && key !== "allowedSymbols" && key !== "entryTrigger") finite(value as unknown, `policy.${key}`);
  if (policy.validityMs <= 0 || policy.minEntryPrice <= 0 || policy.maxEntryPrice <= 0 || policy.minEntryPrice > policy.maxEntryPrice) throw new RangeError("policy bounds are incoherent");
  for (const field of ["minExecutableEdgeBps", "maxSpreadBps", "maxSlippageBps", "maxFeeBps", "maxFundingCostBps", "maxLossBps"] as const) if (policy[field] < 0) throw new RangeError(`${field} must not be negative`);
  if (policy.maxNotional <= 0) throw new RangeError("maxNotional must be positive");
  if (policy.execution !== "LIMIT" && policy.execution !== "MARKET") throw new RangeError("invalid execution method");
  if (!anchor || typeof anchor.stateVersion !== "bigint") throw new TypeError("anchor.stateVersion must be bigint");
  if (anchor.stateVersion < 0n) throw new RangeError("anchor.stateVersion must not be negative");
  nonNegative(anchor.observedAt, "anchor.observedAt"); nonNegative(anchor.receivedAt, "anchor.receivedAt"); positive(anchor.markPrice, "anchor.markPrice");
  if (anchor.receivedAt < anchor.observedAt) throw new RangeError("anchor chronology is incoherent");
  const issuedAt = now === undefined ? thesis.createdAt : now;
  nonNegative(issuedAt, "now");
  if (issuedAt < thesis.createdAt || issuedAt >= thesis.expiresAt) throw new RangeError("thesis is expired or not yet valid");
  const expiresAt = Math.min(thesis.expiresAt, issuedAt + policy.validityMs);
  if (expiresAt <= issuedAt) throw new RangeError("mandate validity is incoherent");
  const anchorSnapshot = { stateVersion: anchor.stateVersion, observedAt: anchor.observedAt, receivedAt: anchor.receivedAt, markPrice: anchor.markPrice };
  const provenance: MandateProvenance = { thesisId: thesis.thesisId, thesisHash: thesis.thesisHash, ...thesis.reasoning };
  const mandate: ExecutionMandate = {
    mandateId: `${workflow.workflowId}:${thesis.thesisId}:1`, workflowId: workflow.workflowId, thesisId: thesis.thesisId, thesisHash: thesis.thesisHash,
    ...thesis.reasoning, provenance, venue: thesis.venue, instrument: thesis.instrument, symbol: thesis.symbol, side: expectedSide, accountId: policy.accountId,
    expiresAt, validity: { issuedAt }, anchor: anchorSnapshot,
    entry: { minPrice: policy.minEntryPrice, maxPrice: policy.maxEntryPrice, trigger: policy.entryTrigger, maxSpreadBps: policy.maxSpreadBps, maxSlippageBps: policy.maxSlippageBps },
    economics: { minExecutableEdgeBps: policy.minExecutableEdgeBps, maxFeeBps: policy.maxFeeBps, maxFundingCostBps: policy.maxFundingCostBps, maxNotional: policy.maxNotional },
    risk: { maxLossBps: policy.maxLossBps }, invalidation: { thesisExpiry: thesis.expiresAt, direction: thesis.direction }, execution: { method: policy.execution }, version: 1, maxUses: 1,
  };
  return freezeDeep(mandate);
}
