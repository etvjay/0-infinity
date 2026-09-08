# ZO-BIN-MB7 deterministic SHADOW campaign

Status: remediation candidate; independent approval is not claimed.

- Campaign: `ZO-BIN-MB7-SHADOW-DETERMINISTIC-V1`
- Mode: `SHADOW`
- Workflows: 20; exact required scenario set exercised once
- Artifact: `docs/development/evidence/ZO-BIN-MB7-shadow-campaign.json`
- Artifact SHA-256: `8310beb0f09e136091746cfbabed09120fcff18da5026d5147f4fc401ca43f26`
- Reviewed campaign code SHA (git HEAD used during generation): `81fbeff09034582bd03ec197b7f6474121453dc6`
- Docs commit SHA: recorded only after this documentation update; it is not the reviewed campaign code SHA
- Outcomes: 4 ACKNOWLEDGED, 1 PARTIALLY_FILLED, 2 FILLED, 1 FAILED/REJECTED, 1 UNKNOWN, 9 REFUSED, 1 EXPIRED, 1 RECOVERY_BLOCKED
- Metrics: approvals 7; mandates 19; council refusals 1; recovered 1; not exercised 0; deterministic runs 2
- Refusal codes: `THRESHOLD_NOT_MET` 1, `MARKET_STATE_STALE` 1, `ACCOUNT_STATE_STALE` 1, `COST_CEILING` 1, `RISK_LIMIT` 1, `AUTHORITY_STATUS` 2, `MANDATE_EXPIRED` 1

The council-refusal receipt is a real `conveneEvidenceCouncil` refusal with code `THRESHOLD_NOT_MET`; evaluator edge collapse is recorded separately as its own evaluator refusal. Expiry uses the runtime transition API and accepts only the exact `EXPIRED`/`MANDATE_EXPIRED` outcome. Order-absent recovery uses a fresh empty `MemoryOrderPersistence`/`MemoryWorkflowPersistence` boundary and records the actual `RECOVERY_BLOCKED: workflow is not persisted` error.

The validator binds all three 40-hex SHA fields exactly, rejects environment SHA overrides, requires one-to-one workflow/receipt lineage, exact scenario semantics, recomputed metrics, zero critical invariant counters, deterministic replay digest, artifact hash, and no unsupported fields. Mutation tests rehash-independent semantic copies and remain rejected.

Exact receipts executed:

1. `npm run shadow:campaign`
2. `npm run evidence:mb7`
3. `node --test dist/tests/shadow.mb7.remediation.test.js dist/tests/shadow.mb7.test.js`
4. `npm test`
5. `npm run check`
6. `git diff --check`

Evidence ceiling: deterministic local replay only using injected clocks, council/compiler APIs, `RuntimeSupervisor` in explicit SHADOW mode, `MemoryPersistence`, `MemoryOrderPersistence`, and replay fixtures. No live market/account truth, exchange execution, credentials, wallet/funds behavior, or M-B2-G recovery is proven. M-B2-G remains `BLOCKED_EXTERNAL`.

Unresolved: independent approval/review and all live/network evidence remain outside this campaign. No `SHADOW_PASS` or independent approval claim is made.
