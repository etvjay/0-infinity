/**
 * ZO-BIN-MB1-C history tests — refusal/failure reasons and timestamps are
 * preserved verbatim, records and machine values are immutable, and the
 * history accessor returns the frozen append-only log.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  createMandateRuntime,
  getHistory,
  transition,
  type MandateEventType,
  type MandateRuntime,
  type MandateState,
  type TransitionRecord,
} from "../src/runtime/index.js";

const EXPIRES_AT = 10_000;

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

function lastRecord(machine: MandateRuntime): TransitionRecord {
  const history = getHistory(machine);
  const last = history[history.length - 1];
  assert.ok(last !== undefined);
  return last;
}

test("refusal reason and timestamps preserved on the REFUSED path", () => {
  const machine = driveTo("REFUSED");
  const history = getHistory(machine);
  assert.equal(history.length, 3);
  assert.deepEqual(history, [
    { fromState: "ARMED", toState: "TRIGGERED", at: 100, reason: "trigger: entry condition met" },
    { fromState: "TRIGGERED", toState: "VALIDATING", at: 200, reason: "hot-path evaluation" },
    { fromState: "VALIDATING", toState: "REFUSED", at: 300, reason: "executable edge below floor" },
  ]);
  const last = lastRecord(machine);
  assert.equal(last.toState, "REFUSED");
  assert.equal(last.at, 300);
  assert.equal(last.reason, "executable edge below floor");
});

test("failure reason and timestamp preserved on the FAILED path", () => {
  const machine = driveTo("FAILED");
  const last = lastRecord(machine);
  assert.equal(last.fromState, "SUBMITTING");
  assert.equal(last.toState, "FAILED");
  assert.equal(last.at, 400);
  assert.equal(last.reason, "submit error");
});

test("unknown-submission reason preserved on the UNKNOWN path", () => {
  const machine = driveTo("UNKNOWN");
  const last = lastRecord(machine);
  assert.equal(last.fromState, "SUBMITTING");
  assert.equal(last.toState, "UNKNOWN");
  assert.equal(last.at, 400);
  assert.equal(last.reason, "ack timeout");
});

test("cancel reason preserved on the CANCELLED path", () => {
  const machine = driveTo("CANCELLED");
  const last = lastRecord(machine);
  assert.equal(last.fromState, "ACKNOWLEDGED");
  assert.equal(last.toState, "CANCELLED");
  assert.equal(last.at, 500);
  assert.equal(last.reason, "cancel requested");
});

test("expiry, supersede and invalidation records preserved from ARMED", () => {
  const expired = lastRecord(driveTo("EXPIRED"));
  assert.deepEqual(expired, {
    fromState: "ARMED",
    toState: "EXPIRED",
    at: 20_000,
    reason: "ttl elapsed",
  });
  const superseded = lastRecord(driveTo("SUPERSEDED"));
  assert.equal(superseded.fromState, "ARMED");
  assert.equal(superseded.toState, "SUPERSEDED");
  assert.equal(superseded.at, 100);
  assert.equal(superseded.reason, "replaced by newer mandate");
  const invalidated = lastRecord(driveTo("INVALIDATED"));
  assert.equal(invalidated.fromState, "ARMED");
  assert.equal(invalidated.toState, "INVALIDATED");
  assert.equal(invalidated.at, 100);
  assert.equal(invalidated.reason, "invalidation condition hit");
});

test("getHistory returns the frozen append-only history of the machine", () => {
  const armed = createMandateRuntime({ expiresAt: EXPIRES_AT });
  const before = getHistory(armed);
  assert.equal(before, armed.history);
  assert.ok(Object.isFrozen(before));
  assert.equal(before.length, 0);

  const result = transition(armed, { type: "TRIGGER" }, { at: 100, reason: "trigger: entry condition met" });
  if (!result.ok) {
    assert.fail(result.rejection.message);
  }
  assert.equal(before.length, 0); // old history untouched
  const after = getHistory(result.machine);
  assert.notEqual(after, before);
  assert.equal(after.length, 1);
  assert.ok(Object.isFrozen(after));
  for (const record of after) {
    assert.ok(Object.isFrozen(record));
  }
});

test("history records are frozen and cannot gain properties", () => {
  const machine = driveTo("REFUSED");
  const record = lastRecord(machine);
  assert.ok(Object.isFrozen(record));
  assert.throws(() => {
    (record as { extra?: number }).extra = 1;
  }, TypeError);
});

test("machine values are frozen: state and history cannot be mutated", () => {
  const machine = driveTo("FILLED");
  assert.ok(Object.isFrozen(machine));
  assert.ok(Object.isFrozen(machine.history));
  assert.throws(() => {
    (machine as { state?: string }).state = "ARMED";
  }, TypeError);
  assert.throws(() => {
    (machine.history as TransitionRecord[]).push({
      fromState: "FILLED",
      toState: "ARMED",
      at: 999,
      reason: "forged",
    });
  }, TypeError);
  assert.equal(machine.state, "FILLED");
  assert.equal(machine.history.length, 6);
});

test("intermediate machines remain byte-identical through the main line", () => {
  let machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  const snapshots: MandateRuntime[] = [machine];
  const serialized: string[] = [JSON.stringify(machine)];
  for (const step of PATHS.FILLED) {
    const result = transition(machine, { type: step.type }, { at: step.at, reason: step.reason });
    if (!result.ok) {
      assert.fail(result.rejection.message);
    }
    machine = result.machine;
    snapshots.push(machine);
    serialized.push(JSON.stringify(machine));
  }
  snapshots.forEach((snapshot, i) => {
    assert.equal(JSON.stringify(snapshot), serialized[i]);
    assert.equal(snapshot.history.length, i);
  });
});
