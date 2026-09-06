# ZO-BIN-MB1-D — Deterministic Mandate Evaluator

Branch target: `agent/mb1-evaluator`.

## Status

`REMEDIATED_LOCAL` — the prior independent review verdict was `REVISE` and blocked integration. The review identified these exact fail-open findings: unvalidated `EvaluationPolicy` values (`NaN`/`Infinity` ages and unbounded/invalid bigint lag); optional `thesisHash` values not type-checked; future mandate anchors accepted; deeply frozen forged runtimes accepted without canonical history validation; reported `spreadBps` not reconciled with bid/ask; compiler-compatible trigger conditions effectively vacuous; stale test-count/documentation claims; and practical `any` use in the evaluator.

This remediation adds focused RED/GREEN coverage and closes each listed evaluator finding without changing the authority store, runtime transition implementation, or external integrations.

## Scope and contract

- `evaluateMandate()` remains deterministic, pure, injected-time, and no-I/O.
- Explicit `ACTIVE` authority remains required and authority is separate from runtime state.
- Mandates, intents, and refusals are frozen at their immutable boundaries; hostile input returns a frozen structured refusal rather than throwing.
- Evaluation policy ages are finite, non-negative, and bounded by `Number.MAX_SAFE_INTEGER`; version lag is a non-negative bigint bounded to `1_000_000_000n`.
- `thesisHash` is either absent/`undefined` or a non-empty string and must agree with provenance.
- Anchor timestamps must not be future-dated and must be chronologically at or before live observations/receipts; anchor version must be within live version bounds.
- Runtime state, expiry, frozen history, legal transition sequence, monotonic finite timestamps, and optional non-empty reasons are validated canonically rather than trusted because an object is frozen.
- Reported spread uses the explicit ask-relative convention: `(ask - bid) / ask * 10_000`; negative, impossible, or inconsistent reported values refuse evaluation (absolute tolerance `1e-9`).
- Canonical inclusive triggers are non-vacuous: `BELOW` requires `markPrice <= minPrice`; `ABOVE` requires `markPrice >= maxPrice`. Entry price bounds remain independently enforced.

## Evidence

- Focused evaluator RED: 3 new assertions failed before implementation (policy validation, spread reconciliation, and trigger-sensitive behavior).
- Focused compiled evaluator tests — PASS: 17 tests, 0 failures.
- `npm run check` — PASS.
- `npm test` — PASS: build plus 269 tests, 0 failures.
- `npm run build` — PASS.
- `git diff --check` — PASS.

Proof ceiling remains `LOCAL_PASS`; no Binance, exchange, Ground Truth, or production-readiness claim is made.

## Remaining contract decisions / risks

- The policy bigint lag cap (`1_000_000_000n`) and ask-relative spread convention are explicit local M-B1-D contracts and should be ratified by the owning product/domain specification if a different bound or quote convention is required.
- Trigger semantics are now canonical and tested locally, but downstream product owners must preserve the `ABOVE >= maxPrice` / `BELOW <= minPrice` interpretation when compiling mandates.
- Runtime transition timestamp monotonicity and reason semantics are enforced by evaluator input validation; the runtime transition API itself still documents caller-provided timestamps and remains unchanged.
- Live adapters and OrderWriter remain later milestones; this evaluator does not submit orders or make network calls.
