# CR-REST-SERIALIZATION-001

```yaml
change_id: CR-REST-SERIALIZATION-001
title: Serialize BigInt state at the REST boundary
objective: >
  Make the existing REST workflow/PAPER responses usable by external clients
  when canonical runtime state contains bigint versions.
status: ACCEPTED_LOCAL_PASS
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
evidence_produced:
  - External HTTP regression asserts PAPER BigInt wire values are strings matching /^\\d+n$/.
  - Internal handleRequest assertion confirms the same field remains bigint.
  - npm run check: PASS.
  - npm test: 521/521 PASS.
  - npm run build: PASS.
  - npm run secret-scan: PASS, 160 tracked/scanned, valuesPrinted=false.
  - git diff --check: PASS.
  - exact candidate: 87fee9d.
  - final exact-head review: APPROVE, safe_to_integrate=true at 87fee9d.
review_verdict: APPROVE
evidence_ceiling: >
  LOCAL_PASS only for deterministic local real-HTTP serialization and local
  test/build/secret evidence. No hosted availability, deployment, production
  durability, live execution, exchange-write, or profitability claim.
blockers: []
open_questions: []
```
