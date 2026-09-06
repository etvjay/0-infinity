/**
 * ZO-BIN-MB1-C positive tests — every legal edge of the canonical table is
 * accepted, appends an immutable record and leaves prior machine values
 * untouched. Deterministic: injected times only.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  createMandateRuntime,
  EVENT_TARGETS,
  getHistory,
  isTerminal,
  MANDATE_STATES,
  TRANSITIONS,
  transition,
  type MandateEventType,
  type MandateRuntime,
  type MandateState,
} from "../src/runtime/index.js";

const EXPIRES_AT = 10_000;

/** Canonical legal edges, transcribed independently from STATE_MACHINES.md. */
const LEGAL_EDGES: readonly (readonly [MandateState, MandateState])[] = [
  ["ARMED", "TRIGGERED"],
  ["TRIGGERED", "VALIDATING"],
  ["VALIDATING", "SUBMITTING"],
  ["SUBMITTING", "ACKNOWLEDGED"],
  ["ACKNOWLEDGED", "PARTIALLY_FILLED"],
  ["PARTIALLY_FILLED", "FILLED"],
  ["ARMED", "EXPIRED"],
  ["ARMED", "SUPERSEDED"],
  ["ARMED", "INVALIDATED"],
  ["TRIGGERED", "INVALIDATED"],
  ["VALIDATING", "REFUSED"],
  ["SUBMITTING", "FAILED"],
  ["SUBMITTING", "UNKNOWN"],
  ["ACKNOWLEDGED", "CANCELLED"],
  ["PARTIALLY_FILLED", "CANCELLED"],
];

/** Inverse of EVENT_TARGETS, used to drive a specific edge. */
const EVENT_FOR_TARGET: Partial<Record<MandateState, MandateEventType>> = {
  TRIGGERED: "TRIGGER",
  VALIDATING: "VALIDATE",
  SUBMITTING: "SUBMIT",
  ACKNOWLEDGED: "ACKNOWLEDGE",
  PARTIALLY_FILLED: "PARTIAL_FILL",
  FILLED: "FILL",
  REFUSED: "REFUSE",
  INVALIDATED: "INVALIDATE",
  EXPIRED: "EXPIRE",
  SUPERSEDED: "SUPERSEDE",
  CANCELLED: "CANCEL",
  FAILED: "FAIL",
  UNKNOWN: "SUBMIT_UNKNOWN",
};

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

test("createMandateRuntime starts ARMED with empty frozen history", () => {
  const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  assert.equal(machine.state, "ARMED");
  assert.equal(machine.expiresAt, EXPIRES_AT);
  assert.deepEqual(getHistory(machine), []);
  assert.ok(Object.isFrozen(machine));
  assert.ok(Object.isFrozen(machine.history));
});

test("driveTo reaches all 14 states through legal paths only", () => {
  for (const state of MANDATE_STATES) {
    const machine = driveTo(state);
    assert.equal(machine.state, state);
  }
});

for (const [from, to] of LEGAL_EDGES) {
  const eventType = EVENT_FOR_TARGET[to];
  if (eventType === undefined) {
    throw new Error(`no event maps to target state ${to}`);
  }
  const at = from === "ARMED" && to === "EXPIRED" ? 20_000 : 700;
  test(`legal edge accepted: ${from} --${eventType}--> ${to}`, () => {
    const before = driveTo(from);
    const result = transition(before, { type: eventType }, { at, reason: `-> ${to}` });
    if (!result.ok) {
      assert.fail(`legal edge ${from} -> ${to} rejected: ${result.rejection.message}`);
    }
    assert.equal(result.machine.state, to);
    assert.equal(result.record.fromState, from);
    assert.equal(result.record.toState, to);
    assert.equal(result.record.at, at);
    assert.equal(result.record.reason, `-> ${to}`);
    assert.equal(result.machine.history.length, before.history.length + 1);
    assert.deepEqual(result.machine.history.slice(0, -1), [...before.history]);
    assert.ok(Object.isFrozen(result.machine));
    assert.ok(Object.isFrozen(result.machine.history));
    assert.ok(Object.isFrozen(result.record));
    // the input machine is never mutated
    assert.equal(before.state, from);
    assert.equal(before.history.length, PATHS[from].length);
  });
}

test("main line ARMED -> TRIGGERED -> ... -> FILLED records the full immutable history", () => {
  let machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  const snapshots: MandateRuntime[] = [machine];
  for (const step of PATHS.FILLED) {
    const result = transition(machine, { type: step.type }, { at: step.at, reason: step.reason });
    if (!result.ok) {
      assert.fail(`main line rejected at ${step.type}: ${result.rejection.message}`);
    }
    machine = result.machine;
    snapshots.push(machine);
  }
  assert.equal(machine.state, "FILLED");
  assert.ok(isTerminal(machine.state));
  assert.deepEqual(getHistory(machine), [
    { fromState: "ARMED", toState: "TRIGGERED", at: 100, reason: "trigger: entry condition met" },
    { fromState: "TRIGGERED", toState: "VALIDATING", at: 200, reason: "hot-path evaluation" },
    { fromState: "VALIDATING", toState: "SUBMITTING", at: 300, reason: "persisted SUBMITTING" },
    { fromState: "SUBMITTING", toState: "ACKNOWLEDGED", at: 400, reason: "exchange ack" },
    { fromState: "ACKNOWLEDGED", toState: "PARTIALLY_FILLED", at: 500, reason: "partial fill 0.5 BTC" },
    { fromState: "PARTIALLY_FILLED", toState: "FILLED", at: 600, reason: "fully filled" },
  ]);
  const expectedStates: readonly MandateState[] = [
    "ARMED",
    "TRIGGERED",
    "VALIDATING",
    "SUBMITTING",
    "ACKNOWLEDGED",
    "PARTIALLY_FILLED",
    "FILLED",
  ];
  snapshots.forEach((snapshot, i) => {
    assert.equal(snapshot.state, expectedStates[i]);
    assert.equal(snapshot.history.length, i);
    assert.ok(Object.isFrozen(snapshot));
  });
});

test("transition never mutates the input machine", () => {
  const armed = createMandateRuntime({ expiresAt: EXPIRES_AT });
  const snapshot = JSON.stringify(armed);
  const result = transition(armed, { type: "TRIGGER" }, { at: 100, reason: "x" });
  if (!result.ok) {
    assert.fail(`unexpected rejection: ${result.rejection.message}`);
  }
  assert.equal(JSON.stringify(armed), snapshot);
  assert.equal(armed.state, "ARMED");
  assert.equal(armed.history.length, 0);
  assert.notEqual(result.machine, armed);
});

test("transition rejects non-finite injected time (determinism guard)", () => {
  const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  for (const at of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => transition(machine, { type: "TRIGGER" }, { at }), TypeError);
  }
  assert.equal(machine.state, "ARMED");
  assert.equal(machine.history.length, 0);
});

test("createMandateRuntime rejects non-finite expiresAt", () => {
  assert.throws(() => createMandateRuntime({ expiresAt: Number.NaN }), TypeError);
  assert.throws(() => createMandateRuntime({ expiresAt: Number.POSITIVE_INFINITY }), TypeError);
  assert.throws(() => createMandateRuntime({ expiresAt: Number.NEGATIVE_INFINITY }), TypeError);
});

test("unknown event types throw TypeError (programmer error, not lifecycle rejection)", () => {
  const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  assert.throws(
    () => transition(machine, { type: "NOPE" as MandateEventType }, { at: 100 }),
    TypeError,
  );
  assert.equal(machine.state, "ARMED");
});

test("legal edges in code equal the independently transcribed list", () => {
  const codeEdges: string[] = [];
  for (const from of MANDATE_STATES) {
    for (const to of TRANSITIONS[from]) {
      codeEdges.push(`${from}->${to}`);
    }
  }
  const docEdges = LEGAL_EDGES.map(([f, t]) => `${f}->${t}`).sort();
  assert.deepEqual(codeEdges.sort(), docEdges);
});

test("every state except ARMED is targeted by exactly one event", () => {
  for (const state of MANDATE_STATES) {
    if (state === "ARMED") {
      continue;
    }
    const eventType = EVENT_FOR_TARGET[state];
    assert.ok(eventType !== undefined, `missing event for ${state}`);
    assert.equal(EVENT_TARGETS[eventType], state);
  }
});
