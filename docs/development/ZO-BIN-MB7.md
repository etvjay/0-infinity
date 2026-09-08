# ZO-BIN-MB7 deterministic SHADOW campaign

Status: provisional candidate evidence; deterministic local replay only.

- Campaign: `ZO-BIN-MB7-SHADOW-DETERMINISTIC-V1`
- Mode: `SHADOW`
- Workflows: 20; all required scenario classes exercised or explicitly bounded
- Artifact: `docs/development/evidence/ZO-BIN-MB7-shadow-campaign.json`
- Artifact SHA-256: `df801a7dca5f75cb8d69882c2c793b2cfe0652d46cb371f048c6459f5fd099ed`
- Campaign code SHA: `8503c0a7b7fd514d740d7e3b5ea30df1520c58ca`
- Outcomes: 4 ACKNOWLEDGED, 1 PARTIALLY_FILLED, 2 FILLED, 1 FAILED/REJECTED, 1 UNKNOWN, 10 REFUSED, 1 RECOVERY_BLOCKED
- Recovery: order-found UNKNOWN reconciliation exercised; order-absent is explicitly bounded `RECOVERY_BLOCKED` because the injected OrderWriter has no order-lookup boundary
- Duplicate coverage: duplicate trigger leaves version unchanged; duplicate FILLED event leaves receipt unchanged; out-of-order terminal event is refused
- Restart/restore: persisted workflow restored and version checked
- Isolation: simultaneous BTCUSDT/ETHUSDT workflow identities checked for cross-symbol contamination
- Invariant counters: duplicate economic consequences, illegal regressions, contradictory executions permitted, cross-symbol contamination, blind retries, and post-ambiguity authority minting are all zero

Exact receipts executed:

1. `npm run shadow:campaign`
2. `npm run evidence:mb7`
3. `node --test dist/tests/shadow.mb7.test.js`
4. `npm test`
5. `npm run check`
6. `git diff --check`

Evidence ceiling: deterministic replay-only behavior using injected clocks, council/compiler APIs, `RuntimeSupervisor` in explicit SHADOW mode, `MemoryPersistence`, `MemoryOrderPersistence`, and injected adapter outcomes. It proves no live market/account truth, exchange writes/cancels, credentials, wallet/funds behavior, or M-B2-G recovery.

Unresolved: independent approval and any live/network evidence remain outside this campaign and are not claimed.
