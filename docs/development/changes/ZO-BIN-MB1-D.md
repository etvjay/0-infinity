# ZO-BIN-MB1-D — Deterministic Mandate Evaluator

Branch target: `agent/mb1-evaluator`.

## Status

`REMEDIATED_LOCAL` — the prior independent review verdict was `REVISE` and blocked integration. The review identified these exact findings: cross-stream `account.version`/`market.version` comparison; hidden `MAX_VERSION_LAG` policy; ask-relative spread reconciliation; an undocumented floating tolerance affecting authorization; and missing complete freshness boundary coverage. Earlier evaluator hardening also covered malformed policies, provenance, chronology, runtime history, and trigger behavior.

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

## Evidence

- Focused evaluator RED: 4 new assertions failed before implementation (cross-stream account version, hidden lag cap, midpoint spread, and boundary behavior).
- Focused compiled evaluator tests — PASS: 22 tests, 0 failures.
- `npm run check` — PASS.
- `npm test` — PASS: build plus 274 tests, 0 failures.
- `npm run build` — PASS.
- `git diff --check` — PASS.

Proof ceiling remains `LOCAL_PASS`; no Binance, exchange, Ground Truth, or production-readiness claim is made.

## Remaining contract decisions / risks

- The explicit same-stream lag policy and midpoint-relative spread convention are local M-B1-D conventions and require canonical domain/product ratification before they can be treated as broader protocol policy.
- Trigger semantics are now canonical and tested locally, but downstream product owners must preserve the `ABOVE >= maxPrice` / `BELOW <= minPrice` interpretation when compiling mandates.
- Runtime transition timestamp monotonicity and reason semantics are enforced by evaluator input validation; the runtime transition API itself still documents caller-provided timestamps and remains unchanged.
- Live adapters and OrderWriter remain later milestones; this evaluator does not submit orders or make network calls.
