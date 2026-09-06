/**
 * 0-Infinity mandate runtime — transition events (change ZO-BIN-MB1-C, M-B1).
 *
 * Each lifecycle event deterministically targets exactly one state; the
 * transition function then checks the legal-transition table for the current
 * state. Events carry no payloads in M-B1 — the lifecycle is the contract.
 *
 * Pure: no I/O, no Date.now(), no Math.random().
 */

import type { MandateState } from "./mandateState.js";

/** The exactly-13 lifecycle event types; each maps to exactly one target state. */
export const MANDATE_EVENT_TYPES = [
  "TRIGGER",
  "VALIDATE",
  "REFUSE",
  "SUBMIT",
  "ACKNOWLEDGE",
  "SUBMIT_UNKNOWN",
  "FAIL",
  "PARTIAL_FILL",
  "FILL",
  "CANCEL",
  "EXPIRE",
  "SUPERSEDE",
  "INVALIDATE",
] as const;

export type MandateEventType = (typeof MANDATE_EVENT_TYPES)[number];

/** A mandate lifecycle event. Payload-free in M-B1. */
export interface MandateTransitionEvent {
  readonly type: MandateEventType;
}

/** Deterministic event -> target-state mapping (data, like the transition table). */
export const EVENT_TARGETS: Readonly<Record<MandateEventType, MandateState>> = Object.freeze({
  TRIGGER: "TRIGGERED",
  VALIDATE: "VALIDATING",
  REFUSE: "REFUSED",
  SUBMIT: "SUBMITTING",
  ACKNOWLEDGE: "ACKNOWLEDGED",
  SUBMIT_UNKNOWN: "UNKNOWN",
  FAIL: "FAILED",
  PARTIAL_FILL: "PARTIALLY_FILLED",
  FILL: "FILLED",
  CANCEL: "CANCELLED",
  EXPIRE: "EXPIRED",
  SUPERSEDE: "SUPERSEDED",
  INVALIDATE: "INVALIDATED",
});

/**
 * Resolve the single target state of an event. Throws TypeError on unknown
 * event types — a programmer error, not a lifecycle rejection.
 */
export function eventTargetState(event: MandateTransitionEvent): MandateState {
  const lookup = EVENT_TARGETS as Record<string, MandateState | undefined>;
  const target = lookup[event.type];
  if (target === undefined) {
    throw new TypeError(`Unknown mandate transition event: ${JSON.stringify(event)}`);
  }
  return target;
}
