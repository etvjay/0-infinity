# ZO-BIN-MB1-A — Domain Types + Mandate Compiler

## change_id

`ZO-BIN-MB1-A`

## objective

Implement the canonical domain boundary from accepted `TradeThesis` to immutable, versioned, bounded `ExecutionMandate` without network, model, exchange, or wall-clock I/O.

## baseline

`401eea8` — reviewed and integrated M-B1-C baseline.

## canonical_component

Reasoning-to-authority domain/compiler boundary; no execution authority.

## status

`INTEGRATED_LOCAL` — candidate `d65d231` independently re-reviewed; integrated on `main` as `f8b3901` with follow-up test commit `3d0dcf5`.

## dependencies

- Canonical docs and M-B1-C runtime vocabulary.
- No dependency on Binance API behavior.
- Must preserve `MandateRuntime` state vocabulary without reimplementing it.

## invariants

- `INV-P01` — opinion is not trade.
- `INV-M01` — mandates are immutable.
- `INV-M04` — MVP mandate is single-use.
- `INV-M05` — superseded/expired/revoked/used mandates cannot execute.
- `INV-E01` — compiler has no exchange write authority.
- `INV-D02` — implementation does not promote Ground Truth.

## allowed_files

- `src/domain/**`
- `tests/domain/**`
- `tests/domain*.test.ts`
- `docs/development/changes/ZO-BIN-MB1-A.md`

## forbidden_files

- `src/runtime/**` (M-B1-C is frozen for this slice)
- `src/store/**`
- `src/evaluator/**`
- `src/execution/**`
- Binance/network/model adapters
- live credentials, deployment, push, and Ground Truth status claims

## interfaces

```ts
compileMandate(workflow, thesis, policy, anchor, now?): ExecutionMandate
```

The exported domain types must represent the canonical `TradeThesis`, `ExecutionMandate`, provenance, account/product binding, validity, anchor, entry constraints, economic ceilings, risk ceilings, invalidation conditions, execution policy, version, and `maxUses = 1`. The compiler must reject malformed, incomplete, contradictory, expired, or authority-expanding inputs and must return a deeply immutable result.

## tests_required

- Deterministic compilation for identical inputs.
- Binding/provenance preservation.
- Explicit policy bounds and single-use default.
- Version and validity handling.
- Deep immutability of output.

## negative_tests_required

- Missing/invalid identifiers and bindings.
- Non-Binance venue or unsupported product/instrument.
- `NO_TRADE`/FLAT thesis or contradictory direction/side.
- Expired or non-finite timestamps.
- Invalid confidence, expected-move intervals, and cost/risk ceilings.
- Compiler attempts to widen thesis/policy authority.
- Attempt to override `maxUses = 1`.

## evidence_required

- `npm run check`.
- `npm test` including M-B1-C regression tests.
- Explicit domain negative-test receipt.
- Independent review verdict.
- Proof ceiling: `LOCAL_PASS` only.

## evidence_produced

- `npm run check` — PASS on candidate and integrated main.
- `npm test` — PASS: 230 tests, 0 failures on candidate and integrated main.
- `git diff --check` — PASS.
- Explicit compiler negative tests cover provenance, expiry shape, entry authority, negative ceilings, and caller mutation isolation.

## review_verdict

`APPROVE_WITH_REQUIRED_FOLLOWUPS` — independent re-review of `d65d231`; follow-up assertions for `minExecutableEdgeBps` and `maxLossBps` were added in `3d0dcf5`.

## ground_truth_before

Full M-B1: `PARTIAL / UNVERIFIED`; M-B1-C: `IMPLEMENTED / INTEGRATED / LOCAL_PASS`.

## ground_truth_after_candidate

A domain/compiler slice may be `LOCAL_PASS`; full M-B1 remains `PARTIAL / UNVERIFIED`.

## blockers

- Do not infer missing authority from vague thesis fields.
- Do not change M-B1-C runtime states.

## open_questions

- Exact persistence serialization and store ownership are deferred to M-B1-B.
- Evaluation semantics are deferred to M-B1-D.
