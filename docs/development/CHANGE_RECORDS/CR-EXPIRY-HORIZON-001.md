# CR-EXPIRY-HORIZON-001

```yaml
change_id: CR-EXPIRY-HORIZON-001
title: Canonicalize expiry boundaries and constrain mandates to thesis validity
objective: >
  Remove the evaluator/runtime/store temporal inconsistency and ensure a compiled
  ExecutionMandate cannot remain executable after its TradeThesis validity horizon.
canonical_component: evaluator, runtime mandate lifecycle, MandateStore, domain compiler
status: CANDIDATE_PENDING_REVIEW
requirements:
  - Expiry is inclusive: now < expiresAt is active; now >= expiresAt is expired.
  - Runtime, evaluator, MandateStore, restore, lookup, and consumption use the same boundary.
  - A mandate expiry must be no later than the thesis concrete validity end.
  - A thesis concrete validity end must be within createdAt + horizonMs.
  - Thesis horizon remains distinct from shorter mandate TTL.
invariants:
  - No component may execute an authority considered expired by another component.
  - Exact-boundary evaluation cannot emit an ExecutionIntent.
  - Expired ARMED authority is retired before active lookup or consumption.
  - No LLM, network, or model call is introduced in the evaluator/store/runtime closure.
dependencies:
  - Existing TradeThesis.createdAt, TradeThesis.expiresAt, TradeThesis.horizonMs
  - Existing ExecutionMandate.expiresAt and invalidation.thesisExpiry
allowed_files:
  - src/runtime/mandateRuntime.ts
  - src/store/index.ts
  - src/domain/index.ts
  - tests/runtime.expiry.test.ts
  - tests/store.remediation.test.ts
  - tests/domain.compiler.test.ts
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
  - Change all expiry comparisons to inclusive >= semantics.
  - Reject thesis concrete expiry beyond createdAt + horizonMs.
  - Run focused and full gates.
  - Obtain fresh exact-head independent review.
evidence_required:
  - focused runtime/store/domain tests
  - full npm test
  - typecheck/build/diff-check
  - independent exact-head review
  - no-write and hot-path audit unchanged
ground_truth_before:
  - evaluator uses now >= expiresAt
  - runtime and store use now > expiresAt
  - compiler caps mandate TTL at thesis expiresAt but does not bind expiresAt to horizonMs
ground_truth_after_candidate:
  - pending implementation and review
blockers:
  - No live financial write is authorized.
open_questions: []
```
