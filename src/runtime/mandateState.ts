/**
 * 0-Infinity mandate runtime — canonical states, terminal set and the full
 * legal-transition table (change ZO-BIN-MB1-C, milestone M-B1).
 *
 * This module is the executable source for the transition table; its behavior is covered by runtime transition tests.
 *
 * Main line:
 *   ARMED -> TRIGGERED -> VALIDATING -> SUBMITTING -> ACKNOWLEDGED
 *         -> PARTIALLY_FILLED -> FILLED
 *
 * Side transitions:
 *   ARMED            -> EXPIRED | SUPERSEDED | INVALIDATED
 *   TRIGGERED        -> INVALIDATED
 *   VALIDATING       -> REFUSED
 *   SUBMITTING       -> FAILED | UNKNOWN
 *   ACKNOWLEDGED     -> CANCELLED
 *   PARTIALLY_FILLED -> FILLED | CANCELLED
 *
 * Fail-closed rules (M-B1):
 *   - Any (from, to) pair not listed above is illegal and never mutates the
 *     machine; it only produces a typed rejection.
 *   - Terminal states have NO outgoing transitions in M-B1.
 *   - UNKNOWN is terminal in M-B1 on purpose: reconciliation of an unknown
 *     submission state is OrderWriter / M-B5+ scope (INV-E04: unknown
 *     submission state never causes blind retry). This kernel fails closed
 *     until that milestone owns the decision.
 *
 * This module is pure: no I/O, no Date.now(), no Math.random().
 */

/** The exactly-14 canonical mandate runtime states. */
export const MANDATE_STATES = [
  "ARMED",
  "TRIGGERED",
  "VALIDATING",
  "SUBMITTING",
  "ACKNOWLEDGED",
  "PARTIALLY_FILLED",
  "FILLED",
  "REFUSED",
  "INVALIDATED",
  "EXPIRED",
  "SUPERSEDED",
  "CANCELLED",
  "FAILED",
  "UNKNOWN",
] as const;

export type MandateState = (typeof MANDATE_STATES)[number];

/**
 * Terminal states in M-B1: FILLED, REFUSED, INVALIDATED, EXPIRED, SUPERSEDED,
 * CANCELLED, FAILED, UNKNOWN. No outgoing transitions exist from any of them.
 */
export const TERMINAL_STATES = [
  "FILLED",
  "REFUSED",
  "INVALIDATED",
  "EXPIRED",
  "SUPERSEDED",
  "CANCELLED",
  "FAILED",
  "UNKNOWN",
] as const;

export type TerminalState = (typeof TERMINAL_STATES)[number];

const TERMINAL_STATE_SET: ReadonlySet<string> = new Set<string>(TERMINAL_STATES);

/** True iff `state` is terminal in M-B1 (no outgoing transitions exist). */
export function isTerminal(state: MandateState): boolean {
  return TERMINAL_STATE_SET.has(state);
}

/**
 * The complete legal-transition table is enumerated as executable data. Any
 * (from, to) pair absent here is illegal and must fail closed.
 */
export const TRANSITIONS: Readonly<Record<MandateState, readonly MandateState[]>> = Object.freeze({
  ARMED: ["TRIGGERED", "EXPIRED", "SUPERSEDED", "INVALIDATED"] as const,
  TRIGGERED: ["VALIDATING", "INVALIDATED"] as const,
  VALIDATING: ["SUBMITTING", "REFUSED"] as const,
  SUBMITTING: ["ACKNOWLEDGED", "FAILED", "UNKNOWN"] as const,
  ACKNOWLEDGED: ["PARTIALLY_FILLED", "CANCELLED"] as const,
  PARTIALLY_FILLED: ["FILLED", "CANCELLED"] as const,
  FILLED: [] as const,
  REFUSED: [] as const,
  INVALIDATED: [] as const,
  EXPIRED: [] as const,
  SUPERSEDED: [] as const,
  CANCELLED: [] as const,
  FAILED: [] as const,
  // UNKNOWN is terminal in M-B1 by design (see file header): reconciliation of
  // unknown submission state is later-milestone (OrderWriter / M-B5+) scope.
  UNKNOWN: [] as const,
});

/** True iff the edge from -> to is legal per the canonical table. */
export function isLegalTransition(from: MandateState, to: MandateState): boolean {
  return TRANSITIONS[from].includes(to);
}
