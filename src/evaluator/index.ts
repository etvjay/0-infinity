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
export type RefusalCode =
  | "INVALID_BINDING" | "AUTHORITY_STATUS" | "RUNTIME_NOT_EXECUTABLE" | "MANDATE_EXPIRED"
  | "MARKET_STATE_STALE" | "ACCOUNT_STATE_STALE" | "STATE_VERSION_STALE" | "STATE_BINDING"
  | "ENTRY_TRIGGER_NOT_MET" | "ENTRY_PRICE_OUT_OF_BOUNDS" | "COST_CEILING" | "EXECUTABLE_EDGE_TOO_LOW"
  | "RISK_LIMIT" | "EXPOSURE_LIMIT";
export interface ExecutionRefusal { readonly kind: "EXECUTION_REFUSAL"; readonly code: RefusalCode; readonly message: string; readonly mandateId: string; readonly workflowId: string; }
export interface ExecutionIntent {
  readonly kind: "EXECUTION_INTENT"; readonly mandateId: string; readonly workflowId: string;
  readonly symbol: string; readonly side: Side; readonly method: ExecutionMandate["execution"]["method"];
  readonly price: number; readonly notional: number; readonly executableEdgeBps: number;
  readonly marketStateVersion: bigint; readonly accountStateVersion: bigint;
}

const refusal = (code: RefusalCode, message: string, mandate: ExecutionMandate, workflow: EvaluationWorkflow): ExecutionRefusal => Object.freeze({ kind: "EXECUTION_REFUSAL", code, message, mandateId: mandate.mandateId, workflowId: workflow.workflowId });
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const deeplyFrozen = (value: unknown, seen = new Set<object>()): boolean => {
  if (!value || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((child) => deeplyFrozen(child, seen));
};

export function evaluateMandate(
  workflow: EvaluationWorkflow,
  mandate: ExecutionMandate,
  runtime: MandateRuntime,
  market: StateEnvelope<LiveMarketState>,
  account: StateEnvelope<LiveAccountState>,
  policy: EvaluationPolicy,
  now: number,
): ExecutionIntent | ExecutionRefusal {
  if (!deeplyFrozen(mandate) || mandate.version !== 1 || mandate.maxUses !== 1 || mandate.expiresAt !== runtime?.expiresAt || mandate.provenance.thesisId !== mandate.thesisId || mandate.provenance.thesisHash !== mandate.thesisHash || mandate.provenance.method !== mandate.method || mandate.provenance.advocateRef !== mandate.advocateRef || mandate.provenance.opposeRef !== mandate.opposeRef || mandate.provenance.marketAnalysisRef !== mandate.marketAnalysisRef || mandate.provenance.evidenceBundleHash !== mandate.evidenceBundleHash || mandate.provenance.councilDecisionHash !== mandate.councilDecisionHash || (mandate.invalidation.direction === "LONG" ? "BUY" : "SELL") !== mandate.side) return refusal("INVALID_BINDING", "mandate is mutable or structurally inconsistent", mandate, workflow ?? { workflowId: "" });
  if (!workflow || workflow.workflowId !== mandate.workflowId || (workflow.thesisId !== undefined && workflow.thesisId !== mandate.thesisId) || (workflow.mandateId !== undefined && workflow.mandateId !== mandate.mandateId)) return refusal("INVALID_BINDING", "workflow, thesis, or mandate identity does not match", mandate, workflow ?? { workflowId: "" });
  if (workflow.authorityStatus !== undefined && workflow.authorityStatus !== "ACTIVE") return refusal("AUTHORITY_STATUS", `authority status ${workflow.authorityStatus} is not executable`, mandate, workflow);
  if (runtime.state !== "ARMED" && runtime.state !== "TRIGGERED" && runtime.state !== "VALIDATING") return refusal("RUNTIME_NOT_EXECUTABLE", `runtime state ${runtime.state} is not executable`, mandate, workflow);
  if (!finite(now) || now > mandate.expiresAt || now > mandate.invalidation.thesisExpiry) return refusal("MANDATE_EXPIRED", "mandate or thesis has expired", mandate, workflow);
  if (!market || !account || !finite(market.observedAt) || !finite(market.receivedAt) || market.receivedAt < market.observedAt || now - market.observedAt > policy.maxMarketAgeMs || now - market.receivedAt > policy.maxMarketAgeMs) return refusal("MARKET_STATE_STALE", "market state is stale or chronologically invalid", mandate, workflow);
  if (!finite(account.observedAt) || !finite(account.receivedAt) || account.receivedAt < account.observedAt || now - account.observedAt > policy.maxAccountAgeMs || now - account.receivedAt > policy.maxAccountAgeMs) return refusal("ACCOUNT_STATE_STALE", "account state is stale or chronologically invalid", mandate, workflow);
  if (market.version < mandate.anchor.stateVersion || market.version - mandate.anchor.stateVersion > policy.maxAnchorVersionLag) return refusal("STATE_VERSION_STALE", "market state version is not within the mandate anchor window", mandate, workflow);
  if (market.value.venue !== mandate.venue || market.value.instrument !== mandate.instrument || market.value.symbol !== mandate.symbol || account.value.accountId !== mandate.accountId) return refusal("STATE_BINDING", "live state binding does not match the mandate", mandate, workflow);
  const values = [market.value.bidPrice, market.value.askPrice, market.value.markPrice, market.value.expectedMoveBps, market.value.spreadBps, market.value.slippageBps, market.value.feeBps, market.value.fundingCostBps, account.value.availableNotional, account.value.currentNotional, account.value.currentLossBps];
  if (values.some((value) => !finite(value))) return refusal("STATE_BINDING", "live state contains non-finite values", mandate, workflow);
  const entryPrice = mandate.side === "BUY" ? market.value.askPrice : market.value.bidPrice;
  if (entryPrice <= 0 || entryPrice < mandate.entry.minPrice || entryPrice > mandate.entry.maxPrice) return refusal("ENTRY_PRICE_OUT_OF_BOUNDS", "current entry price is outside mandate bounds", mandate, workflow);
  if ((mandate.entry.trigger === "BELOW" && market.value.markPrice > mandate.entry.maxPrice) || (mandate.entry.trigger === "ABOVE" && market.value.markPrice < mandate.entry.minPrice)) return refusal("ENTRY_TRIGGER_NOT_MET", "entry trigger is not met", mandate, workflow);
  if (market.value.spreadBps > mandate.entry.maxSpreadBps || market.value.slippageBps > mandate.entry.maxSlippageBps || market.value.feeBps > mandate.economics.maxFeeBps || market.value.fundingCostBps > mandate.economics.maxFundingCostBps) return refusal("COST_CEILING", "one or more execution costs exceed mandate ceilings", mandate, workflow);
  const executableEdgeBps = market.value.expectedMoveBps - market.value.spreadBps - market.value.slippageBps - market.value.feeBps - market.value.fundingCostBps;
  if (executableEdgeBps < mandate.economics.minExecutableEdgeBps) return refusal("EXECUTABLE_EDGE_TOO_LOW", "executable edge is below the mandate floor", mandate, workflow);
  if (account.value.currentLossBps > mandate.risk.maxLossBps) return refusal("RISK_LIMIT", "current account loss exceeds mandate risk ceiling", mandate, workflow);
  const notional = mandate.economics.maxNotional;
  if (notional > account.value.availableNotional || account.value.currentNotional + notional > mandate.economics.maxNotional) return refusal("EXPOSURE_LIMIT", "available or aggregate exposure exceeds mandate ceiling", mandate, workflow);
  return Object.freeze({ kind: "EXECUTION_INTENT", mandateId: mandate.mandateId, workflowId: mandate.workflowId, symbol: mandate.symbol, side: mandate.side, method: mandate.execution.method, price: entryPrice, notional, executableEdgeBps, marketStateVersion: market.version, accountStateVersion: account.version });
}
