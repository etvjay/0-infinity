# CR-NETWORK-MCP-001

```yaml
change_id: CR-NETWORK-MCP-001
title: Expose the existing MCP handler over HTTP
objective: >
  Make the existing MCP capability externally reachable for authorized agents
  without introducing a second authority path.
status: CANDIDATE_PENDING_REVIEW
allowed_files:
  - src/product/http.ts
  - tests/product-access.remediation.test.ts
  - docs/development/CHANGE_RECORDS/CR-NETWORK-MCP-001.md
invariants:
  - POST /mcp delegates to the existing handleMcp implementation.
  - MCP cannot create mandates, intents, or direct orders.
  - capability response authority remains false.
  - no credentials or Testnet access are introduced.
  - local stdio MCP remains supported.
  - `POST /v1/shadow` remains registered alongside `POST /mcp` and `POST /v1/paper-live`.
evidence_required:
  - local HTTP MCP get_capabilities cold request.
  - malformed request behavior.
  - full test/build/check/diff gates.
  - exact-head independent review.
evidence_ceiling: LOCAL_PASS only until externally authenticated and cold-tested.
```
