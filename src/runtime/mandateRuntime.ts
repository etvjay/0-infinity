/**
 * 0-Infinity mandate runtime — the deterministic lifecycle machine
 * (change ZO-BIN-MB1-C, milestone M-B1).
 *
 * The machine is a plain immutable value: { state, expiresAt, history }.
 * `transition()` is a pure function: it never mutates its input. It returns
 * either the next machine (ok: true) or a typed rejection (ok: false) while
 * the current machine stays exactly unchanged. Fail closed, always.
 *
 * Determinism: no Date.now(), no Math.random(), no I/O of any kind. All time
 * is injected via `at` / `now` parameters. Expiry applies only while ARMED and
 * is inclusive: a mandate is expired iff now >= expiresAt. An ARMED mandate at
 * or past its deadline must transition to EXPIRED and can do nothing else
 * TRIGGER, never SUPERSEDE — supersession past the deadline would misrecord
 * the timeline; a mandate superseded while fresh uses ARMED -> SUPERSEDED).
 *
 * M-B1 decision (flagged for review in the handoff): UNKNOWN is terminal
 * here. Reconciling an unknown submission state is OrderWriter / M-B5+ scope
 * (INV-E04: unknown submission state never causes blind retry); until that
 * milestone owns the transition, no path leaves UNKNOWN, so an unknown
 * submission can never re-enter the executable path.
 *
 * Note: transition timestamps are caller-provided and M-B1 does not enforce
 * monotonicity — the canonical table does not require it. Flagged as a
 * Ground Truth candidate in the change handoff, not implemented here.
 */

import {
  eventTargetState,
  type MandateTransitionEvent,
} from "./mandateEvents.js";
import {
  isLegalTransition,
  isTerminal,
  type MandateState,
} from "./mandateState.js";

/** One accepted lifecycle transition. Immutable. */
export interface TransitionRecord {
  readonly fromState: MandateState;
  readonly toState: MandateState;
  readonly at: number;
  readonly reason?: string;
}

/** Structurally accepted mandate input: the lifecycle only needs `expiresAt`. */
export interface MandateRuntimeInput {
  readonly expiresAt: number;
}

/** Immutable machine value: plain frozen state + history. */
export interface MandateRuntime {
  readonly state: MandateState;
  readonly expiresAt: number;
  readonly history: readonly TransitionRecord[];
}

export type RejectionCode =
  /** Edge not present in the canonical transition table. */
  | "ILLEGAL_TRANSITION"
  /** Source state is terminal; no outgoing transitions exist in M-B1. */
  | "TERMINAL_NO_OUTGOING"
  /** ARMED but past expiresAt: must transition to EXPIRED, nothing else. */
  | "EXPIRED_CANNOT_TRIGGER"
  /** EXPIRE attempted while now <= expiresAt: expiry is time-based. */
  | "EXPIRE_NOT_DUE";

/** Typed, structured rejection. Illegal transitions never mutate the machine. */
export interface TransitionRejection {
  readonly code: RejectionCode;
  readonly fromState: MandateState;
  readonly attemptedState: MandateState;
  readonly at: number;
  readonly message: string;
}

/** Result of a transition attempt: next machine, or typed rejection (fail closed). */
export type TransitionAttempt =
  | {
      readonly ok: true;
      readonly machine: MandateRuntime;
      readonly record: TransitionRecord;
    }
  | {
      readonly ok: false;
      readonly rejection: TransitionRejection;
    };

export interface TransitionOptions {
  /** Injected transition time (epoch ms). Required — no wall clock reads. */
  readonly at: number;
  /** Optional deterministic reason, preserved verbatim in history. */
  readonly reason?: string;
}

/** Thrown by assertExpiry when an ARMED mandate is expired at the injected now. */
export class MandateExpiryError extends Error {
  readonly rejection: TransitionRejection;

  constructor(rejection: TransitionRejection) {
    super(rejection.message);
    this.name = "MandateExpiryError";
    this.rejection = rejection;
  }
}

function freezeMachine(machine: MandateRuntime): MandateRuntime {
  return Object.freeze({
    state: machine.state,
    expiresAt: machine.expiresAt,
    history: Object.freeze(machine.history.slice()),
  });
}

/**
 * Create the initial machine: ARMED with an empty history. There is no way to
 * construct a machine in any other state, so no terminal state can be
 * reactivated and no history can be forged.
 */
export function createMandateRuntime(input: MandateRuntimeInput): MandateRuntime {
  const expiresAt = input.expiresAt;
  if (!Number.isFinite(expiresAt)) {
    throw new TypeError(`expiresAt must be a finite number, got ${String(expiresAt)}`);
  }
  if (expiresAt < 0) {
    throw new RangeError(`expiresAt must be non-negative, got ${String(expiresAt)}`);
  }
  return freezeMachine({ state: "ARMED", expiresAt, history: [] });
}

/** History accessor. The returned array is frozen and append-only by construction. */
export function getHistory(machine: MandateRuntime): readonly TransitionRecord[] {
  return machine.history;
}

/** Deterministic expiry check on any structural mandate input: expired iff now >= expiresAt. */
export function isExpired(mandate: { readonly expiresAt: number }, now: number): boolean {
  if (!Number.isFinite(mandate.expiresAt) || !Number.isFinite(now)) throw new TypeError("expiry timestamps must be finite");
  if (mandate.expiresAt < 0 || now < 0) throw new RangeError("expiry timestamps must be non-negative");
  return now >= mandate.expiresAt;
}

/**
 * Fail-closed expiry assertion: throws MandateExpiryError (carrying a typed
 * rejection) iff the machine is ARMED and expired at the injected `now`.
 * Non-ARMED states are governed by the transition table, not by expiry.
 */
export function assertExpiry(machine: MandateRuntime, now: number): void {
  if (!Number.isFinite(now)) {
    throw new TypeError(`now must be a finite number, got ${String(now)}`);
  }
  if (now < 0) {
    throw new RangeError(`now must be non-negative, got ${String(now)}`);
  }
  if (machine.state === "ARMED" && now >= machine.expiresAt) {
    const rejection: TransitionRejection = Object.freeze({
      code: "EXPIRED_CANNOT_TRIGGER",
      fromState: machine.state,
      attemptedState: "EXPIRED",
      at: now,
      message: `Mandate expired at ${machine.expiresAt}; ARMED mandate must transition to EXPIRED (injected now ${now})`,
    });
    throw new MandateExpiryError(rejection);
  }
}

/**
 * Attempt one lifecycle transition. Pure: on rejection the input machine is
 * returned untouched (state and history unchanged); on acceptance a new frozen
 * machine with the appended immutable record is returned.
 */
export function transition(
  machine: MandateRuntime,
  event: MandateTransitionEvent,
  options: TransitionOptions,
): TransitionAttempt {
  const at = options.at;
  if (!Number.isFinite(at)) {
    throw new TypeError(`transition 'at' must be a finite number, got ${String(at)}`);
  }
  if (at < 0) {
    throw new RangeError(`transition 'at' must be non-negative, got ${String(at)}`);
  }
  const attemptedState = eventTargetState(event);
  const fromState = machine.state;

  const reject = (code: RejectionCode, message: string): TransitionAttempt => {
    const rejection: TransitionRejection = Object.freeze({
      code,
      fromState,
      attemptedState,
      at,
      message,
    });
    const attempt: TransitionAttempt = { ok: false, rejection };
    return Object.freeze(attempt);
  };

  // Terminal states have no outgoing transitions in M-B1 (UNKNOWN included).
  if (isTerminal(fromState)) {
    return reject(
      "TERMINAL_NO_OUTGOING",
      `Terminal mandate state ${fromState} has no outgoing transitions (attempted ${event.type} -> ${attemptedState})`,
    );
  }

  // Time-based expiry, injected time only: an ARMED mandate past its deadline
  // must transition to EXPIRED and can do nothing else (never TRIGGER).
  if (fromState === "ARMED" && at >= machine.expiresAt) {
    if (attemptedState !== "EXPIRED") {
      return reject(
        "EXPIRED_CANNOT_TRIGGER",
        `Mandate expired at ${machine.expiresAt}; ARMED mandate cannot ${event.type} at ${at} and must transition to EXPIRED`,
      );
    }
  } else if (attemptedState === "EXPIRED") {
    // EXPIRE is only legal from ARMED, and only once the deadline is reached.
    if (fromState !== "ARMED") {
      return reject(
        "ILLEGAL_TRANSITION",
        `Illegal mandate transition: ${fromState} -> EXPIRED via ${event.type} (only ARMED expires)`,
      );
    }
    if (at < machine.expiresAt) {
      return reject(
        "EXPIRE_NOT_DUE",
        `Expiry is time-based: mandate expires at ${machine.expiresAt}; cannot EXPIRE at ${at}`,
      );
    }
  }

  if (!isLegalTransition(fromState, attemptedState)) {
    return reject(
      "ILLEGAL_TRANSITION",
      `Illegal mandate transition: ${fromState} -> ${attemptedState} via ${event.type}`,
    );
  }

  const record: TransitionRecord = Object.freeze({
    fromState,
    toState: attemptedState,
    at,
    reason: options.reason,
  });

  const next: MandateRuntime = {
    state: attemptedState,
    expiresAt: machine.expiresAt,
    history: [...machine.history, record],
  };

  const accepted: TransitionAttempt = {
    ok: true,
    machine: freezeMachine(next),
    record,
  };
  return Object.freeze(accepted);
}
