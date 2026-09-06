/**
 * ZO-BIN-MB1-C exhaustive negative tests — every illegal (state, event) pair
 * in the 14-state lifecycle is rejected with a typed rejection and the machine
 * is provably unchanged (state, history, frozen identity). Deterministic:
 * injected times only.
 *
 * Coverage: 14 states x 13 events = 182 (state, event) pairs. 14 pairs are
 * legal at the probe time NEG_AT (every legal edge except ARMED -> EXPIRED,
 * which is not due at NEG_AT and is therefore rejected here) and are accepted
 * in runtime.transitions-legal.test.ts. The remaining 168 pairs are rejected
 * here, one test each — this covers every illegal edge of the table including
 * self-transitions and every terminal reactivation. No event targets ARMED
 * (asserted separately), so the initial state can never be (re)entered.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  createMandateRuntime,
  EVENT_TARGETS,
  isTerminal,
  MANDATE_EVENT_TYPES,
  MANDATE_STATES,
  transition,
  type MandateEventType,
  type MandateRuntime,
  type MandateState,
  type RejectionCode,
} from "../src/runtime/index.js";

const EXPIRES_AT = 10_000;
/** Probe time before expiry: pure transition-table semantics. */
const NEG_AT = 100;

type Step = { readonly type: MandateEventType; readonly at: number; readonly reason?: string };

const T = (type: MandateEventType, at: number, reason: string): Step => ({ type, at, reason });

const COMMON: readonly Step[] = [
  T("TRIGGER", 100, "trigger: entry condition met"),
  T("VALIDATE", 200, "hot-path evaluation"),
  T("SUBMIT", 300, "persisted SUBMITTING"),
];

/** Legal-only paths reaching every state from a fresh ARMED machine. */
const PATHS: Record<MandateState, readonly Step[]> = {
  ARMED: [],
  TRIGGERED: [T("TRIGGER", 100, "trigger: entry condition met")],
  VALIDATING: [
    T("TRIGGER", 100, "trigger: entry condition met"),
    T("VALIDATE", 200, "hot-path evaluation"),
  ],
  SUBMITTING: COMMON,
  ACKNOWLEDGED: [...COMMON, T("ACKNOWLEDGE", 400, "exchange ack")],
  PARTIALLY_FILLED: [...COMMON, T("ACKNOWLEDGE", 400, "exchange ack"), T("PARTIAL_FILL", 500, "partial fill 0.5 BTC")],
  FILLED: [
    ...COMMON,
    T("ACKNOWLEDGE", 400, "exchange ack"),
    T("PARTIAL_FILL", 500, "partial fill 0.5 BTC"),
    T("FILL", 600, "fully filled"),
  ],
  REFUSED: [
    T("TRIGGER", 100, "trigger: entry condition met"),
    T("VALIDATE", 200, "hot-path evaluation"),
    T("REFUSE", 300, "executable edge below floor"),
  ],
  INVALIDATED: [T("INVALIDATE", 100, "invalidation condition hit")],
  EXPIRED: [T("EXPIRE", 20_000, "ttl elapsed")],
  SUPERSEDED: [T("SUPERSEDE", 100, "replaced by newer mandate")],
  CANCELLED: [...COMMON, T("ACKNOWLEDGE", 400, "exchange ack"), T("CANCEL", 500, "cancel requested")],
  FAILED: [...COMMON, T("FAIL", 400, "submit error")],
  UNKNOWN: [...COMMON, T("SUBMIT_UNKNOWN", 400, "ack timeout")],
};

function driveTo(state: MandateState, expiresAt: number = EXPIRES_AT): MandateRuntime {
  let machine = createMandateRuntime({ expiresAt });
  for (const step of PATHS[state]) {
    const result = transition(machine, { type: step.type }, { at: step.at, reason: step.reason });
    if (result.ok) {
      machine = result.machine;
    } else {
      assert.fail(`path to ${state} rejected at ${step.type}: ${result.rejection.message}`);
    }
  }
  assert.equal(machine.state, state);
  return machine;
}

/** Every legal edge except ARMED -> EXPIRED (not due at NEG_AT). */
const LEGAL_AT_NEG: readonly (readonly [MandateState, MandateState])[] = [
  ["ARMED", "TRIGGERED"],
  ["TRIGGERED", "VALIDATING"],
  ["VALIDATING", "SUBMITTING"],
  ["SUBMITTING", "ACKNOWLEDGED"],
  ["ACKNOWLEDGED", "PARTIALLY_FILLED"],
  ["PARTIALLY_FILLED", "FILLED"],
  ["ARMED", "SUPERSEDED"],
  ["ARMED", "INVALIDATED"],
  ["TRIGGERED", "INVALIDATED"],
  ["VALIDATING", "REFUSED"],
  ["SUBMITTING", "FAILED"],
  ["SUBMITTING", "UNKNOWN"],
  ["ACKNOWLEDGED", "CANCELLED"],
  ["PARTIALLY_FILLED", "CANCELLED"],
];

function isLegalAtNeg(from: MandateState, to: MandateState): boolean {
  return LEGAL_AT_NEG.some(([f, t]) => f === from && t === to);
}

function expectedCode(from: MandateState, to: MandateState): RejectionCode {
  if (isTerminal(from)) {
    return "TERMINAL_NO_OUTGOING";
  }
  if (from === "ARMED" && to === "EXPIRED") {
    return "EXPIRE_NOT_DUE"; // NEG_AT < expiresAt
  }
  return "ILLEGAL_TRANSITION";
}

let negativeCases = 0;

for (const from of MANDATE_STATES) {
  for (const eventType of MANDATE_EVENT_TYPES) {
    const to: MandateState = EVENT_TARGETS[eventType];
    if (isLegalAtNeg(from, to)) {
      continue; // accepted in runtime.transitions-legal.test.ts
    }
    negativeCases += 1;
    test(`illegal transition fails closed: ${from} --${eventType}--> ${to}`, () => {
      const machine = driveTo(from);
      const historyBefore = machine.history;
      const snapshot = JSON.stringify({ state: machine.state, history: machine.history });

      const result = transition(machine, { type: eventType }, { at: NEG_AT, reason: "negative probe" });

      if (result.ok) {
        assert.fail(`expected rejection for ${from} --${eventType}--> ${to}`);
      }
      assert.equal(result.rejection.code, expectedCode(from, to));
      assert.equal(result.rejection.fromState, from);
      assert.equal(result.rejection.attemptedState, to);
      assert.equal(result.rejection.at, NEG_AT);
      assert.ok(result.rejection.message.length > 0);
      // fail closed: state and history unchanged, input machine untouched
      assert.equal(machine.state, from);
      assert.equal(machine.history, historyBefore);
      assert.equal(
        JSON.stringify({ state: machine.state, history: machine.history }),
        snapshot,
      );
      assert.ok(Object.isFrozen(machine));
      assert.ok(Object.isFrozen(machine.history));
    });
  }
}

test("exhaustive negative sweep rejected exactly the 168 illegal (state, event) pairs", () => {
  // 14 states x 13 events = 182 pairs; 14 legal at NEG_AT, covered positively.
  // The 15th legal edge (ARMED -> EXPIRED, due only past the deadline) is
  // covered positively in runtime.transitions-legal.test.ts.
  assert.equal(negativeCases, 182 - 14);
});

test("no event targets ARMED: nothing can (re)enter the initial state", () => {
  for (const eventType of MANDATE_EVENT_TYPES) {
    assert.notEqual(EVENT_TARGETS[eventType], "ARMED", `${eventType} must not target ARMED`);
  }
});

test("superseded mandate cannot return to ARMED or reactivate", () => {
  const machine = driveTo("SUPERSEDED");
  assert.equal(machine.history.length, 1);
  for (const eventType of MANDATE_EVENT_TYPES) {
    const result = transition(machine, { type: eventType }, { at: 700, reason: "reactivation attempt" });
    if (result.ok) {
      assert.fail(`SUPERSEDED must not accept ${eventType}`);
    }
    assert.equal(result.rejection.code, "TERMINAL_NO_OUTGOING");
    assert.equal(machine.state, "SUPERSEDED");
  }
  assert.equal(machine.history.length, 1);
});

test("expired mandate cannot be re-armed, triggered or superseded", () => {
  const machine = driveTo("EXPIRED");
  for (const eventType of MANDATE_EVENT_TYPES) {
    const result = transition(
      machine,
      { type: eventType },
      { at: EXPIRES_AT + 2_000, reason: "post-expiry attempt" },
    );
    if (result.ok) {
      assert.fail(`EXPIRED must not accept ${eventType}`);
    }
    assert.equal(result.rejection.code, "TERMINAL_NO_OUTGOING");
    assert.equal(machine.state, "EXPIRED");
  }
  assert.equal(machine.history.length, 1);
});

test("UNKNOWN is terminal in M-B1: no reconciliation retry from the lifecycle (INV-E04)", () => {
  const machine = driveTo("UNKNOWN");
  for (const eventType of MANDATE_EVENT_TYPES) {
    const result = transition(machine, { type: eventType }, { at: 700, reason: "blind retry attempt" });
    if (result.ok) {
      assert.fail(`UNKNOWN must not accept ${eventType}`);
    }
    assert.equal(result.rejection.code, "TERMINAL_NO_OUTGOING");
    assert.equal(machine.state, "UNKNOWN");
  }
  assert.equal(machine.history.length, 4);
});

test("no terminal state can be reactivated by TRIGGER", () => {
  for (const terminal of MANDATE_STATES) {
    if (!isTerminal(terminal)) {
      continue;
    }
    const machine = driveTo(terminal);
    const result = transition(machine, { type: "TRIGGER" }, { at: 700, reason: "reactivation attempt" });
    if (result.ok) {
      assert.fail(`terminal state ${terminal} was reactivated`);
    }
    assert.equal(result.rejection.code, "TERMINAL_NO_OUTGOING");
    assert.equal(machine.state, terminal);
  }
});

test("expired ARMED mandate cannot TRIGGER, SUPERSEDE or take any other non-EXPIRE action", () => {
  for (const eventType of MANDATE_EVENT_TYPES) {
    if (eventType === "EXPIRE") {
      continue; // the one legal move past the deadline (positive suite)
    }
    const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
    const result = transition(
      machine,
      { type: eventType },
      { at: EXPIRES_AT + 1, reason: "late probe" },
    );
    if (result.ok) {
      assert.fail(`expired ARMED mandate must not accept ${eventType}`);
    }
    assert.equal(result.rejection.code, "EXPIRED_CANNOT_TRIGGER");
    assert.equal(result.rejection.fromState, "ARMED");
    assert.equal(machine.state, "ARMED");
    assert.equal(machine.history.length, 0);
  }
});
