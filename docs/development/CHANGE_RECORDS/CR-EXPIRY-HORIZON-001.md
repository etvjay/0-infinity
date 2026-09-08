# CR-EXPIRY-HORIZON-001

```yaml
change_id: CR-EXPIRY-HORIZON-001
title: Canonicalize expiry boundaries and constrain mandates to thesis validity
objective: >
  Remove the evaluator/runtime/store temporal inconsistency and ensure a compiled
  ExecutionMandate cannot remain executable after its TradeThesis validity horizon.
canonical_component: evaluator, runtime mandate lifecycle, RuntimeSupervisor, MandateStore, domain compiler
status: CANDIDATE_PENDING_REVIEW
requirements:
  - Expiry is inclusive: now < expiresAt is active; now >= expiresAt is expired.
  - Runtime, evaluator, MandateStore, restore, lookup, and consumption use the same boundary.
  - A mandate expiry must be no later than the thesis concrete validity end.
  - A thesis concrete validity end must be within createdAt + horizonMs.
  - Thesis horizon remains distinct from shorter mandate TTL.
  - Standalone runtime APIs reject non-finite and negative timestamp inputs.
invariants:
  - No component may execute an authority considered expired by another component.
  - Exact-boundary evaluation and restore cannot emit or return active execution authority.
  - Expired ARMED authority is retired before active lookup or consumption.
  - Forged runtime expiry fields fail closed at runtime and supervisor boundaries.
  - No LLM, network, or model call is introduced in the evaluator/store/runtime closure.
dependencies:
  - Existing TradeThesis.createdAt, TradeThesis.expiresAt, TradeThesis.horizonMs
  - Existing ExecutionMandate.expiresAt and invalidation.thesisExpiry
allowed_files:
  - src/domain/index.ts
  - src/runtime/mandateRuntime.ts
  - src/runtime/supervisor.ts
  - src/store/index.ts
  - tests/domain.compiler.test.ts
  - tests/integrated.adversarial.test.ts
  - tests/runtime.expiry.test.ts
  - tests/runtime.supervisor.test.ts
  - tests/store.remediation.test.ts
  - docs/development/CHANGE_RECORDS/CR-EXPIRY-HORIZON-001.md
forbidden_files:
  - src/reasoning/index.ts
  - src/execution/index.ts
  - src/product/server.ts
  - src/testnet/index.ts
  - any credential or deployment configuration
implementation_plan:
  - Add RED boundary tests at below, exact, and above expiry for runtime and store.
  - Add RED compiler tests for thesis horizon containment and shorter mandate TTL.
  - Add hostile runtime timestamp and exact-boundary restore tests.
  - Change all expiry comparisons to inclusive >= semantics.
  - Reject thesis concrete expiry beyond createdAt + horizonMs.
  - Reject malformed runtime expiry values and expired READY restore records.
  - Run focused and full gates.
  - Obtain fresh exact-head independent review.
tests_required:
  - runtime expiry boundary suite
  - domain compiler horizon suite
  - MandateStore exact-boundary suite
  - integrated expiry and RuntimeSupervisor restore suite
  - full npm test suite
negative_tests_required:
  - now below, equal to, and above expiresAt
  - NaN, Infinity, negative now, and negative expiresAt
  - forged runtime machine expiry
  - thesis expiry beyond horizon
  - exact-boundary READY restore
  - expired reissue and consumption
  - no authority after expiry
 evidence_required:
  - focused runtime/store/domain/supervisor tests
  - full npm test
  - typecheck/build/diff-check
  - independent exact-head review
  - no-write and hot-path audit unchanged
evidence_produced:
  - RED focused run demonstrated the pre-fix boundary failures
  - GREEN focused expiry/store/domain/supervisor run: 34/34
  - GREEN full suite after restore-guard reconciliation: 518/518
  - focused runtime/store/domain/supervisor suite: 34/34
  - implementation commits: fc9dea9, 8de9f59, 8056a43, d39cfcc
  - final exact-head review pending
ground_truth_before:
  - evaluator used now >= expiresAt
  - runtime and store used now > expiresAt
  - compiler capped mandate TTL at thesis expiresAt but did not bind expiresAt to horizonMs
  - standalone runtime and restore boundaries were weaker than persisted/evaluator validation
ground_truth_after_candidate:
  - evaluator, runtime, store, supervisor restore, and authority lookup use inclusive expiry
  - thesis validity is bounded by createdAt + horizonMs
  - mandate TTL remains independently shorter when policy validityMs is shorter
  - standalone runtime timestamps and forged runtime expiry fields fail closed
review_verdict: PENDING
evidence_ceiling: LOCAL_PASS only; deterministic local authority/runtime tests and static review. No live exchange, deployment, production durability, profitability, or financial-write evidence.
blockers:
  - No live financial write is authorized.
open_questions: []
```
