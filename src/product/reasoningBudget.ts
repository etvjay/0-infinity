export const REASONING_PROFILES = ["FAST", "STANDARD", "DEEP"] as const;
export type ReasoningProfile = (typeof REASONING_PROFILES)[number];

export interface ReasoningBudget {
  readonly profile: ReasoningProfile;
  readonly roleTimeoutMs: number;
  readonly councilTimeoutMs: number;
  readonly workflowDeadlineMs: number;
  readonly maxEvidenceAgeMs?: number;
}

const DEFAULT_BUDGETS: Readonly<Record<ReasoningProfile, Omit<ReasoningBudget, "profile">>> = Object.freeze({
  FAST: Object.freeze({ roleTimeoutMs: 5_000, councilTimeoutMs: 5_000, workflowDeadlineMs: 15_000, maxEvidenceAgeMs: 300_000 }),
  STANDARD: Object.freeze({ roleTimeoutMs: 12_000, councilTimeoutMs: 12_000, workflowDeadlineMs: 30_000, maxEvidenceAgeMs: 300_000 }),
  DEEP: Object.freeze({ roleTimeoutMs: 30_000, councilTimeoutMs: 30_000, workflowDeadlineMs: 60_000, maxEvidenceAgeMs: 300_000 }),
});

export function resolveReasoningProfile(value: unknown): ReasoningProfile {
  if (typeof value !== "string" || !REASONING_PROFILES.includes(value as ReasoningProfile)) throw new TypeError("invalid reasoning profile");
  return value as ReasoningProfile;
}

export function profileBudget(profile: ReasoningProfile): ReasoningBudget {
  const resolved = resolveReasoningProfile(profile);
  return Object.freeze({ profile: resolved, ...DEFAULT_BUDGETS[resolved] });
}

export function reasoningBudgetFor(value: unknown): ReasoningBudget {
  return profileBudget(value === undefined ? "FAST" : resolveReasoningProfile(value));
}
