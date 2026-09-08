# CR-MARKET-TRIGGER-001

```yaml
change_id: CR-MARKET-TRIGGER-001
title: Compose versioned market observation into deterministic trigger evaluation
objective: >
  Complete the existing market-state to RuntimeSupervisor to evaluator to
  OrderWriter path without adding a second authority or execution architecture.
status: CANDIDATE_PENDING_REVIEW
canonical_components:
  - UsdMFuturesMarketState
  - UsdMFuturesMarketConnectivity
  - RuntimeSupervisor
  - evaluateMandate
  - OrderWriter
requirements:
  - An existing mandate can be armed without a model or network call.
  - A versioned normalized market observation can replace the stored observation.
  - Observation then runs the existing trigger/economics/evaluator/writer closure.
  - Market/account/workflow bindings remain fail closed.
  - No RoleAdapter, Council, MCP, fetch, or model call is reachable in this closure.
invariants:
  - HOT_PATH_MODEL_INVOCATIONS = 0
  - One OrderWriter remains the only execution writer.
  - No observation can create a mandate or intent without an existing mandate.
  - Lower-version, stale, future, mismatched, or malformed observations fail closed.
allowed_files:
  - src/runtime/supervisor.ts
  - tests/runtime.supervisor.test.ts
  - docs/development/CHANGE_RECORDS/CR-MARKET-TRIGGER-001.md
forbidden_files:
  - src/reasoning/index.ts
  - src/domain/index.ts
  - src/execution/index.ts
  - src/testnet/index.ts
  - credentials/deployment configuration
implementation_plan:
  - Add RED tests for arm, observation replacement, trigger, writer receipt, bindings, and lower-version rejection.
  - Implement arm through the existing RuntimeSupervisor persistence boundary.
  - Implement observeMarket through existing CAS persistence and triggerOnce.
  - Run focused/full gates and exact-head review.
tests_required:
  - runtime supervisor composition suite
  - market connectivity suite
  - full npm test suite
  - typecheck/build/diff-check
evidence_produced:
  - RED missing-arm test demonstrated the absent composition surface.
  - GREEN focused supervisor suite: 22/22.
  - GREEN full suite: 520/520.
  - implementation commits: bdeff86, ccd3dbb.
  - final exact-head review pending.
evidence_ceiling: >
  LOCAL_PASS only; injected deterministic market/account envelopes and local/replay writer.
  No live exchange execution, production durability, synchronized live market truth,
  or production latency claim.
open_questions: []
```
