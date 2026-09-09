/**
 * ZO-BIN-MB1-C structural tests — canonical states, terminal set and the
 * transition table as data, checked against an independent transcription of
 * Deterministic: no I/O, no wall clock.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  isLegalTransition,
  isTerminal,
  MANDATE_STATES,
  TERMINAL_STATES,
  TRANSITIONS,
  type MandateState,
} from "../src/runtime/index.js";

/** The canonical table, transcribed independently from STATE_MACHINES.md. */
const DOC_TABLE: Record<MandateState, readonly MandateState[]> = {
  ARMED: ["TRIGGERED", "EXPIRED", "SUPERSEDED", "INVALIDATED"],
  TRIGGERED: ["VALIDATING", "INVALIDATED"],
  VALIDATING: ["SUBMITTING", "REFUSED"],
  SUBMITTING: ["ACKNOWLEDGED", "FAILED", "UNKNOWN"],
  ACKNOWLEDGED: ["PARTIALLY_FILLED", "CANCELLED"],
  PARTIALLY_FILLED: ["FILLED", "CANCELLED"],
  FILLED: [],
  REFUSED: [],
  INVALIDATED: [],
  EXPIRED: [],
  SUPERSEDED: [],
  CANCELLED: [],
  FAILED: [],
  UNKNOWN: [],
};

const DOC_TERMINAL: readonly MandateState[] = [
  "FILLED",
  "REFUSED",
  "INVALIDATED",
  "EXPIRED",
  "SUPERSEDED",
  "CANCELLED",
  "FAILED",
  "UNKNOWN",
];

const DOC_NON_TERMINAL: readonly MandateState[] = [
  "ARMED",
  "TRIGGERED",
  "VALIDATING",
  "SUBMITTING",
  "ACKNOWLEDGED",
  "PARTIALLY_FILLED",
];

test("exposes exactly the 14 canonical mandate states", () => {
  assert.deepEqual([...MANDATE_STATES], [
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
  ]);
});

test("exposes exactly the 8 canonical terminal states", () => {
  assert.deepEqual([...TERMINAL_STATES], [...DOC_TERMINAL]);
});

test("isTerminal classifies all 14 states", () => {
  for (const state of MANDATE_STATES) {
    assert.equal(isTerminal(state), DOC_TERMINAL.includes(state), `isTerminal(${state})`);
  }
  for (const state of DOC_NON_TERMINAL) {
    assert.equal(isTerminal(state), false, `isTerminal(${state})`);
  }
});

test("transition table matches STATE_MACHINES.md exactly (as data)", () => {
  assert.deepEqual(TRANSITIONS, DOC_TABLE);
});

test("transition table has 15 legal edges, no self-loops, valid targets", () => {
  let edges = 0;
  for (const from of MANDATE_STATES) {
    for (const to of TRANSITIONS[from]) {
      edges += 1;
      assert.notEqual(from, to, `no self-loop on ${from}`);
      assert.ok(MANDATE_STATES.includes(to), `target ${to} is a canonical state`);
    }
  }
  assert.equal(edges, 15);
});

test("isLegalTransition agrees with the table for all 196 ordered pairs", () => {
  for (const from of MANDATE_STATES) {
    for (const to of MANDATE_STATES) {
      const docLegal = DOC_TABLE[from].includes(to);
      assert.equal(isLegalTransition(from, to), docLegal, `${from} -> ${to}`);
    }
  }
});
