# ZO-BIN-MB7 deterministic SHADOW campaign

Status: candidate evidence only; no SHADOW_PASS or independent approval claim.

- Campaign: `ZO-BIN-MB7-SHADOW-DETERMINISTIC-V1`
- Mode: `SHADOW`
- Workflows: 17 (11 executed, 6 explicitly NOT_EXERCISED)
- Artifact: `docs/development/evidence/ZO-BIN-MB7-shadow-campaign.json`
- Artifact SHA-256: `7133329ac25bd4a726b59d7667cd3c2b36b12415386a5d4caaf801328f470766`
- Outcomes: 3 ACKNOWLEDGED, 1 FAILED/REJECTED, 1 UNKNOWN, 6 REFUSED, 6 NOT_EXERCISED
- Recovery: 1 UNKNOWN order-found reconciliation; order-absent is NOT_EXERCISED
- Authority/economic/live violations: 0 / 0 / 0
- Refusal codes: `EXECUTABLE_EDGE_TOO_LOW=1`, `RISK_LIMIT=2`, `COST_CEILING=1`, `AUTHORITY_STATUS=2`

Exact receipts executed:

1. `npm run shadow:campaign`
2. `npm run evidence:mb7`
3. `node --test dist/tests/shadow.mb7.test.js`
4. `npm test`
5. `npm run check`

Evidence ceiling: deterministic replay-only behavior using injected clocks, council/handoff/compiler APIs, `RuntimeSupervisor` in explicit SHADOW mode, `MemoryPersistence`, `MemoryOrderPersistence`, and injected adapter outcomes. It proves no live market/account truth, exchange writes/cancels, credentials, wallet/funds behavior, or M-B2-G recovery.

Unresolved/not exercised: expiry in this new runner, partial/fill/reject reconciliation matrix beyond writer/supervisor accepted tests, duplicate trigger/event suppression in this runner, out-of-order terminal events, restart/restore, unknown order-absent recovery, and contradictory-authority workflow creation. These are recorded as bounded NOT_EXERCISED rather than invented semantics.
