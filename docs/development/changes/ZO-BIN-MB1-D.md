# ZO-BIN-MB1-D — Deterministic Mandate Evaluator

Branch target: `agent/mb1-evaluator`.

## Status

`IMPLEMENTED_LOCAL` — deterministic evaluator and focused tests added on integrated A/B/C baseline.

## Scope

- Added pure `evaluateMandate()` with injected time and versioned market/account envelopes.
- Returns frozen `ExecutionIntent` or structured `ExecutionRefusal`.
- Validates immutable mandate/provenance/bindings, runtime executability, authority status, expiry, freshness, state version, entry bounds/trigger, cost ceilings, executable edge, risk and exposure.
- No exchange, network, model, adapter, or OrderWriter code.

## Evidence

- `npm run check` — PASS.
- `npm test` — PASS: build plus 258 tests, 0 failures.
- Focused evaluator tests — PASS: 6 evaluator tests, including happy path and negative paths.
- `git diff --check` — PASS.

Proof ceiling remains `LOCAL_PASS`; no Binance or Ground Truth claim is made.

## Follow-ups / risks

- Evaluator state shapes are local M-B1-D contracts; live adapters and OrderWriter remain later milestones.
- `ExecutionIntent` carries bounded notional but does not create or submit an order.
- Authority status is supplied as an explicit evaluation input; store orchestration must bind it to persisted status before invocation.
