# ZO-BIN-MB1-D — Deterministic Mandate Evaluator

Branch target: `agent/mb1-evaluator`.

## Status

`REVIEWED / APPROVE_WITH_REQUIRED_FOLLOWUPS` — independent review found no execution-logic defect, but `safe_to_integrate: false` because the midpoint-relative spread basis and explicit same-stream anchor-lag policy affect authorization and require canonical domain/product ratification before integration. Add independent observedAt/receivedAt freshness boundary cases before closeout.

This remediation adds focused RED/GREEN coverage and closes each listed evaluator finding without changing the authority store, runtime transition implementation, or external integrations.

## Scope and contract

- `evaluateMandate()` remains deterministic, pure, injected-time, and no-I/O.
- Explicit `ACTIVE` authority remains required and authority is separate from runtime state.
- Mandates, intents, and refusals are frozen at their immutable boundaries; hostile input returns a frozen structured refusal rather than throwing.
- Evaluation policy ages are finite, non-negative, and bounded by `Number.MAX_SAFE_INTEGER`; `maxAnchorVersionLag` is a non-negative bigint supplied explicitly by the caller, with no evaluator-imposed lag cap.
- `thesisHash` is either absent/`undefined` or a non-empty string and must agree with provenance.
- Anchor timestamps must not be future-dated and must be chronologically at or before live observations/receipts; anchor version must be within live version bounds.
- Runtime state, expiry, frozen history, legal transition sequence, monotonic finite timestamps, and optional non-empty reasons are validated canonically rather than trusted because an object is frozen.
- `market.version` is ordered only against the same-stream `mandate.anchor.stateVersion`, using the explicit policy lag; `account.version` is only validated as a non-negative replay/identity field and is never compared with market or anchor versions.
- Reported spread uses the explicit symmetric midpoint-relative convention `(ask - bid) / ((ask + bid) / 2) * 10_000`; reconciliation uses deterministic exact numeric equality, not a policy tolerance. Spread remains distinct from `slippageBps`, which is independently checked against its mandate ceiling and included in executable-edge calculation.
- Canonical inclusive triggers are non-vacuous: `BELOW` requires `markPrice <= minPrice`; `ABOVE` requires `markPrice >= maxPrice`. Trigger thresholds come only from mandate fields; entry price bounds remain independently enforced.

## Ratified conventions

- Same-stream `market.version` ↔ `mandate.anchor.stateVersion` only, with `maxAnchorVersionLag` supplied by `EvaluationPolicy`; never `market.version` ↔ `account.version`.
- Midpoint-relative spread `(ask-bid)/((ask+bid)/2)*10000`, same basis for `maxSpreadBps` and both BUY/SELL.
- Spread distinct from slippage.
- No hidden trigger tolerances/defaults.

## Evidence

- Candidate: `6a5e28922f9757c0726876efaa69a25b67e46ccc` (`6a5e289`). Prior review: `APPROVE_WITH_REQUIRED_FOLLOWUPS`; `safe_to_integrate: false` only for these ratification/freshness followups.
- Final focused compiled evaluator tests — PASS: 28 tests, 0 failures; includes 3-point boundary coverage for market observedAt, market receivedAt, account observedAt, account receivedAt, spread below/equal/above `maxSpreadBps`, and BUY/SELL symmetry.
- `npm run check` — PASS.
- `npm test` — PASS: build plus 280 tests, 0 failures.
- `npm run build` — PASS.
- `git diff --check` — PASS.

Integration status: pending final independent review.

Proof ceiling remains `LOCAL_PASS`; no Binance, exchange, Ground Truth, or production-readiness claim is made.

## Remaining contract decisions / risks

- The explicit same-stream lag policy and midpoint-relative spread convention are local M-B1-D conventions and require canonical domain/product ratification before they can be treated as broader protocol policy.
- Trigger semantics are now canonical and tested locally, but downstream product owners must preserve the `ABOVE >= maxPrice` / `BELOW <= minPrice` interpretation when compiling mandates.
- Runtime transition timestamp monotonicity and reason semantics are enforced by evaluator input validation; the runtime transition API itself still documents caller-provided timestamps and remains unchanged.
- Live adapters and OrderWriter remain later milestones; this evaluator does not submit orders or make network calls.
