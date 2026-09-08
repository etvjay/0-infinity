# CR-REST-SERIALIZATION-001

```yaml
change_id: CR-REST-SERIALIZATION-001
title: Serialize BigInt state at the REST boundary
objective: >
  Make the existing REST workflow/PAPER responses usable by external clients
  when canonical runtime state contains bigint versions.
status: CANDIDATE_PENDING_REVIEW
root_cause: JSON.stringify on HTTP response bodies did not provide a BigInt replacer.
allowed_files:
  - src/product/http.ts
  - tests/product-access.remediation.test.ts
  - docs/development/CHANGE_RECORDS/CR-REST-SERIALIZATION-001.md
invariants:
  - Internal canonical bigint state remains bigint.
  - REST wire output is JSON-safe and deterministic.
  - No authority or execution semantics change.
  - No credentials or live writes are introduced.
test_required:
  - External HTTP server workflow submit and PAPER response serialization.
evidence_ceiling: LOCAL_PASS only; no hosted availability claim.
implementation_plan:
  - Add a real HTTP regression test covering workflow and PAPER responses.
  - Serialize bigint values as explicit decimal strings with an `n` suffix at the wire boundary.
  - Run full gates and exact-head review.
```
