# ZO-BIN-MB1-C — Mandate Runtime State Machine

Branch target: `agent/mb1-state-machine`.

Implement canonical lifecycle and illegal-transition rejection with no network/model dependency. Terminal states cannot reactivate; expired/superseded mandates cannot return executable.

## Status

`INTEGRATED_LOCAL` — cherry-picked into `main` as `17a5ea3` from reviewed worker commit `b74765e`.

## Evidence produced

- `npm run check` — PASS on integrated `main`.
- `npm test` — PASS: build plus 224 tests, 0 failures.
- `node --test dist/tests/runtime.transitions-illegal.test.js` — PASS: 175 tests, 0 failures.
- `git diff --check` — PASS.
- Independent review of `b74765e` — `APPROVE_WITH_REQUIRED_FOLLOWUPS`; safe to integrate as M-B1-C.

## Required follow-ups

- This is only the runtime state-machine slice; domain/compiler, store, evaluator and integrated adversarial coverage remain pending.
- UNKNOWN is terminal in M-B1; reconciliation remains later OrderWriter scope.
- Timestamp chronology is caller-provided and not enforced by this slice.
- Proof ceiling is `LOCAL_PASS`; no Binance/runtime/live-execution claim is established.
