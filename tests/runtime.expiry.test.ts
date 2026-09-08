/**
 * ZO-BIN-MB1-C expiry tests — time-based, deterministic, injected-now only.
 * An ARMED mandate past expiresAt must transition to EXPIRED and must never
 * TRIGGER; expiry boundaries are strict (expired iff now > expiresAt).
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  assertExpiry,
  createMandateRuntime,
  getHistory,
  isExpired,
  isTerminal,
  MandateExpiryError,
  transition,
  type MandateRuntime,
} from "../src/runtime/index.js";

const EXPIRES_AT = 10_000;

function driveTriggered(expiresAt: number = EXPIRES_AT): MandateRuntime {
  const armed = createMandateRuntime({ expiresAt });
  const result = transition(armed, { type: "TRIGGER" }, { at: 100, reason: "trigger: entry condition met" });
  if (!result.ok) {
    assert.fail(result.rejection.message);
  }
  return result.machine;
}

test("ARMED past deadline transitions to EXPIRED and preserves the record", () => {
  const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  assert.equal(isExpired(machine, EXPIRES_AT + 1), true);
  const result = transition(machine, { type: "EXPIRE" }, { at: EXPIRES_AT + 1, reason: "ttl elapsed" });
  if (!result.ok) {
    assert.fail(result.rejection.message);
  }
  assert.equal(result.machine.state, "EXPIRED");
  assert.ok(isTerminal(result.machine.state));
  assert.deepEqual(getHistory(result.machine), [
    { fromState: "ARMED", toState: "EXPIRED", at: EXPIRES_AT + 1, reason: "ttl elapsed" },
  ]);
  // original ARMED machine untouched
  assert.equal(machine.state, "ARMED");
  assert.equal(machine.history.length, 0);
});

test("expired ARMED mandate must never TRIGGER", () => {
  const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  const result = transition(machine, { type: "TRIGGER" }, { at: EXPIRES_AT + 1, reason: "late trigger" });
  if (result.ok) {
    assert.fail("expired ARMED mandate accepted TRIGGER");
  }
  assert.equal(result.rejection.code, "EXPIRED_CANNOT_TRIGGER");
  assert.equal(machine.state, "ARMED");
  assert.equal(machine.history.length, 0);
});

test("expired ARMED mandate cannot SUPERSEDE either (fail closed)", () => {
  const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  const result = transition(machine, { type: "SUPERSEDE" }, { at: EXPIRES_AT + 1, reason: "late supersede" });
  if (result.ok) {
    assert.fail("expired ARMED mandate accepted SUPERSEDE");
  }
  assert.equal(result.rejection.code, "EXPIRED_CANNOT_TRIGGER");
  assert.equal(machine.state, "ARMED");
});

test("boundary: TRIGGER at exactly expiresAt is refused", () => {
  const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  const result = transition(machine, { type: "TRIGGER" }, { at: EXPIRES_AT, reason: "exact boundary" });
  if (result.ok) {
    assert.fail("TRIGGER accepted at exact expiry");
  }
  assert.equal(result.rejection.code, "EXPIRED_CANNOT_TRIGGER");
  assert.equal(machine.state, "ARMED");
});

test("boundary: EXPIRE at exactly expiresAt is accepted", () => {
  const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  const result = transition(machine, { type: "EXPIRE" }, { at: EXPIRES_AT, reason: "exact boundary" });
  if (!result.ok) {
    assert.fail(result.rejection.message);
  }
  assert.equal(result.machine.state, "EXPIRED");
  assert.equal(result.machine.history[0]?.at, EXPIRES_AT);
});

test("EXPIRE before the deadline is rejected and state unchanged", () => {
  const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  const result = transition(machine, { type: "EXPIRE" }, { at: EXPIRES_AT - 1, reason: "too early" });
  if (result.ok) {
    assert.fail("EXPIRE accepted before the deadline");
  }
  assert.equal(result.rejection.code, "EXPIRE_NOT_DUE");
  assert.equal(machine.state, "ARMED");
  assert.equal(machine.history.length, 0);
});

test("isExpired is inclusive: expired iff now >= expiresAt", () => {
  const mandate = { expiresAt: 100 };
  assert.equal(isExpired(mandate, 99), false);
  assert.equal(isExpired(mandate, 100), true);
  assert.equal(isExpired(mandate, 101), true);
});

test("assertExpiry throws MandateExpiryError carrying a typed rejection when expired and ARMED", () => {
  const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  assert.throws(
    () => assertExpiry(machine, EXPIRES_AT + 1),
    (err: unknown) => {
      assert.ok(err instanceof MandateExpiryError);
      const rejection = (err as MandateExpiryError).rejection;
      assert.equal(rejection.code, "EXPIRED_CANNOT_TRIGGER");
      assert.equal(rejection.fromState, "ARMED");
      assert.equal(rejection.at, EXPIRES_AT + 1);
      assert.ok(rejection.message.length > 0);
      return true;
    },
  );
});

test("assertExpiry rejects at the exact deadline and passes before it or after leaving ARMED", () => {
  const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  assert.doesNotThrow(() => assertExpiry(machine, EXPIRES_AT - 1));
  assert.throws(() => assertExpiry(machine, EXPIRES_AT), MandateExpiryError);
  // expiry gates ARMED only; TRIGGERED is governed by the transition table
  const triggered = driveTriggered();
  assert.doesNotThrow(() => assertExpiry(triggered, 50_000));
});

test("assertExpiry rejects non-finite injected now", () => {
  const machine = createMandateRuntime({ expiresAt: EXPIRES_AT });
  assert.throws(() => assertExpiry(machine, Number.NaN), TypeError);
  assert.throws(() => assertExpiry(machine, Number.POSITIVE_INFINITY), TypeError);
});
