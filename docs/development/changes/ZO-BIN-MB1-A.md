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

`REMEDIATED / INTEGRATED / LOCAL_PASS` — compiler validation defects fixed in reviewed candidate `c1247f5a06c2aa4fc9bbdb4696b283fb001f4be2` and integrated into canonical main as `34b8977678ecb8f49dbed52b8ca4dfa60cdb3503`. This component record does not claim full-kernel approval; the current kernel remediation remains pending independent review.

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

## remediation_findings

- `compileMandate` previously accepted negative `anchor.stateVersion` values.
- `compileMandate` previously copied numeric `thesisHash` values into mandate provenance.
- `compileMandate` previously accepted negative thesis, anchor, and `now` timestamp fields despite downstream non-negative timestamp contracts.

## evidence_produced

- `npm run check` — PASS on this remediation candidate.
- `npm test` — PASS: 295 tests, 0 failures on this remediation candidate.
- `npm run build` — PASS on this remediation candidate.
- `git diff --check` — PASS.
- Explicit compiler negative tests cover provenance, expiry shape, entry authority, negative ceilings, and caller mutation isolation.
- Remediation RED — focused compiler run failed 3 new assertions: negative state version, numeric thesis hash, and negative timestamps.
- Remediation GREEN — focused compiler run passed 9/9 tests after minimal validation changes.
- Authority-expansion remediation RED — focused compiler run failed 1 assertion: unsupported `reasoning.hiddenPolicy` was projected into authority.
- Authority-expansion remediation GREEN — focused compiler run passed 10/10 tests after rejecting reasoning keys outside the canonical six-field allowlist.
- Full-suite and build receipts for this candidate are recorded below; evidence ceiling remains `LOCAL_PASS`. The current canonical HEAD is `86b09e48db24f2e6a2e821df37e49d2cadc89dc2`; the current kernel remediation remains pending independent review.

## review_verdict

`APPROVE_WITH_REQUIRED_FOLLOWUPS` — prior independent review identified the remediation defects addressed by this candidate; parent integration and independent review remain pending.

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
