/**
 * Operational-only timing projections. These values are deliberately separate
 * from reasoning receipts, mandate hashes, and authority decisions.
 */

export type LatencyTimestamp = number;

function timestamp(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a finite non-negative timestamp`);
  return value;
}

function chronological(values: readonly [string, number][]): void {
  for (let i = 1; i < values.length; i += 1) {
    if (values[i][1] < values[i - 1][1]) throw new RangeError(`${values[i][0]} must not precede ${values[i - 1][0]}`);
  }
}

export interface ReasoningLatencyTraceInput {
  readonly advocateStartedAt: number;
  readonly advocateCompletedAt: number;
  readonly opposerStartedAt: number;
  readonly opposerCompletedAt: number;
  readonly marketAnalystStartedAt: number;
  readonly marketAnalystCompletedAt: number;
  readonly councilStartedAt: number;
  readonly councilCompletedAt: number;
  readonly receiptAt: number;
  readonly mandateArmedAt: number;
}

export interface ReasoningLatencyMetrics {
  readonly advocateMs: number;
  readonly opposerMs: number;
  readonly marketAnalystMs: number;
  readonly councilMs: number;
  readonly reasoningMs: number;
  readonly councilToMandateMs: number;
}

export class ReasoningLatencyTrace implements ReasoningLatencyTraceInput {
  readonly advocateStartedAt: number; readonly advocateCompletedAt: number;
  readonly opposerStartedAt: number; readonly opposerCompletedAt: number;
  readonly marketAnalystStartedAt: number; readonly marketAnalystCompletedAt: number;
  readonly councilStartedAt: number; readonly councilCompletedAt: number;
  readonly receiptAt: number; readonly mandateArmedAt: number;
  constructor(input: ReasoningLatencyTraceInput) {
    this.advocateStartedAt = timestamp(input.advocateStartedAt, "advocateStartedAt"); this.advocateCompletedAt = timestamp(input.advocateCompletedAt, "advocateCompletedAt");
    this.opposerStartedAt = timestamp(input.opposerStartedAt, "opposerStartedAt"); this.opposerCompletedAt = timestamp(input.opposerCompletedAt, "opposerCompletedAt");
    this.marketAnalystStartedAt = timestamp(input.marketAnalystStartedAt, "marketAnalystStartedAt"); this.marketAnalystCompletedAt = timestamp(input.marketAnalystCompletedAt, "marketAnalystCompletedAt");
    this.councilStartedAt = timestamp(input.councilStartedAt, "councilStartedAt"); this.councilCompletedAt = timestamp(input.councilCompletedAt, "councilCompletedAt");
    this.receiptAt = timestamp(input.receiptAt, "receiptAt"); this.mandateArmedAt = timestamp(input.mandateArmedAt, "mandateArmedAt");
    chronological([["advocateStartedAt", this.advocateStartedAt], ["advocateCompletedAt", this.advocateCompletedAt], ["opposerStartedAt", this.opposerStartedAt], ["opposerCompletedAt", this.opposerCompletedAt], ["marketAnalystStartedAt", this.marketAnalystStartedAt], ["marketAnalystCompletedAt", this.marketAnalystCompletedAt], ["councilStartedAt", this.councilStartedAt], ["councilCompletedAt", this.councilCompletedAt], ["receiptAt", this.receiptAt], ["mandateArmedAt", this.mandateArmedAt]]);
    Object.freeze(this);
  }
  metrics(): ReasoningLatencyMetrics { return Object.freeze({ advocateMs: this.advocateCompletedAt - this.advocateStartedAt, opposerMs: this.opposerCompletedAt - this.opposerStartedAt, marketAnalystMs: this.marketAnalystCompletedAt - this.marketAnalystStartedAt, councilMs: this.councilCompletedAt - this.councilStartedAt, reasoningMs: this.councilCompletedAt - this.advocateStartedAt, councilToMandateMs: this.mandateArmedAt - this.councilCompletedAt }); }
}

export interface HotPathLatencyTraceInput {
  readonly marketReceivedAt: number;
  readonly triggerEvaluatedAt: number;
  readonly economicsEvaluatedAt: number;
  readonly evaluateMandateAt: number;
  readonly intentAt: number;
  readonly writerPreIoAt: number;
  readonly outboundAt: number;
  readonly ackAt: number;
}

export interface HotPathLatencyMetrics {
  readonly marketToTriggerMs: number;
  readonly triggerToEconomicsMs: number;
  readonly economicsToMandateMs: number;
  readonly mandateToIntentMs: number;
  readonly intentToWriterMs: number;
  readonly writerToOutboundMs: number;
  readonly outboundToAckMs: number;
  readonly triggerToDecisionMs: number;
}

export class HotPathLatencyTrace implements HotPathLatencyTraceInput {
  readonly marketReceivedAt!: number; readonly triggerEvaluatedAt!: number; readonly economicsEvaluatedAt!: number; readonly evaluateMandateAt!: number; readonly intentAt!: number; readonly writerPreIoAt!: number; readonly outboundAt!: number; readonly ackAt!: number;
  constructor(input: HotPathLatencyTraceInput) {
    const keys: (keyof HotPathLatencyTraceInput)[] = ["marketReceivedAt", "triggerEvaluatedAt", "economicsEvaluatedAt", "evaluateMandateAt", "intentAt", "writerPreIoAt", "outboundAt", "ackAt"];
    for (const key of keys) this[key] = timestamp(input[key], key) as never;
    chronological([["marketReceivedAt", this.marketReceivedAt], ["triggerEvaluatedAt", this.triggerEvaluatedAt], ["economicsEvaluatedAt", this.economicsEvaluatedAt], ["evaluateMandateAt", this.evaluateMandateAt], ["intentAt", this.intentAt], ["writerPreIoAt", this.writerPreIoAt], ["outboundAt", this.outboundAt], ["ackAt", this.ackAt]]);
    Object.freeze(this);
  }
  metrics(): HotPathLatencyMetrics { return Object.freeze({ marketToTriggerMs: this.triggerEvaluatedAt - this.marketReceivedAt, triggerToEconomicsMs: this.economicsEvaluatedAt - this.triggerEvaluatedAt, economicsToMandateMs: this.evaluateMandateAt - this.economicsEvaluatedAt, mandateToIntentMs: this.intentAt - this.evaluateMandateAt, intentToWriterMs: this.writerPreIoAt - this.intentAt, writerToOutboundMs: this.outboundAt - this.writerPreIoAt, outboundToAckMs: this.ackAt - this.outboundAt, triggerToDecisionMs: this.intentAt - this.triggerEvaluatedAt }); }
}

export const MANDATORY_REASONING_ROLES = Object.freeze(["ADVOCATE", "OPPOSER", "MARKET_ANALYST", "COUNCIL"] as const);
export type MandatoryReasoningRole = (typeof MANDATORY_REASONING_ROLES)[number];
export type ReasoningProfile = "FAST" | "STANDARD" | "DEEP";
export interface ReasoningProfileConfig {
  readonly profile: ReasoningProfile;
  readonly roleTimeoutMs: number;
  readonly researchBudget: number;
  readonly toolBudget: number;
  readonly councilModelIdentifier: string;
  readonly mandatoryRoles: readonly MandatoryReasoningRole[];
}
export function validateReasoningProfileConfig(config: ReasoningProfileConfig): ReasoningProfileConfig {
  if (!config || !["FAST", "STANDARD", "DEEP"].includes(config.profile) || !Number.isFinite(config.roleTimeoutMs) || config.roleTimeoutMs <= 0 || !Number.isSafeInteger(config.researchBudget) || config.researchBudget < 0 || !Number.isSafeInteger(config.toolBudget) || config.toolBudget < 0 || typeof config.councilModelIdentifier !== "string" || config.councilModelIdentifier.trim() === "") throw new TypeError("reasoning profile config is malformed");
  const roles = [...config.mandatoryRoles];
  if (roles.length !== MANDATORY_REASONING_ROLES.length || MANDATORY_REASONING_ROLES.some((role) => !roles.includes(role)) || new Set(roles).size !== roles.length) throw new TypeError("all mandatory reasoning roles, including OPPOSER and COUNCIL, are required");
  return Object.freeze({ profile: config.profile, roleTimeoutMs: config.roleTimeoutMs, researchBudget: config.researchBudget, toolBudget: config.toolBudget, councilModelIdentifier: config.councilModelIdentifier, mandatoryRoles: Object.freeze(roles) });
}

export interface StructuralOpportunity { readonly venue: string; readonly instrument: string; readonly symbol: string; readonly direction?: string; readonly thesisId?: string; }
const STRUCTURAL_OPPORTUNITY_KEYS = new Set(["venue", "instrument", "symbol", "direction", "thesisId"]);
export function structuralOpportunityPrefilter(value: unknown): value is StructuralOpportunity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const x = value as Record<string, unknown>;
    if (Object.getPrototypeOf(x) !== Object.prototype) return false;
    const keys = Reflect.ownKeys(x);
    if (keys.some((key) => typeof key !== "string" || !STRUCTURAL_OPPORTUNITY_KEYS.has(key))) return false;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(x, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
    }
    const hasOwn = (key: string): boolean => Object.prototype.hasOwnProperty.call(x, key);
    if (!["venue", "instrument", "symbol"].every(hasOwn)) return false;
    const direction = hasOwn("direction") ? x.direction : undefined;
    const thesisId = hasOwn("thesisId") ? x.thesisId : undefined;
    if (![x.venue, x.instrument, x.symbol].every((v) => typeof v === "string" && v.trim().length > 0)) return false;
    return [direction, thesisId].every((v) => v === undefined || typeof v === "string");
  } catch {
    return false;
  }
}
export function opportunityDedupKey(value: StructuralOpportunity): string {
  if (!structuralOpportunityPrefilter(value)) throw new TypeError("opportunity does not pass structural prefilter");
  return JSON.stringify([value.venue, value.instrument, value.symbol, value.direction ?? "", value.thesisId ?? ""]);
}
