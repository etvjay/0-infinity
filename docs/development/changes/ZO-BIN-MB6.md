# ZO-BIN-MB6 — Full Runtime / Recovery

This slice adds `RuntimeSupervisor` as a coordinator over the accepted mandate,
evaluator, store, and order-writer boundaries. It accepts only an explicit
`SHADOW` or `LOCAL_REPLAY` mode and an injected `OrderWriter`; it never reads
credentials, discovers adapters, or falls back to live execution.

Workflow records are versioned and persisted independently from mandate runtime
and order outcome. Triggering is idempotent. Recovery reconciles the persisted
client order id through the injected writer and never retries an `UNKNOWN`
submission. The M-B1 terminal `UNKNOWN` runtime state remains terminal; a later
order reconciliation records the separate order outcome with explicit
`recoveryStatus: RECONCILED`.

## Acceptance receipt

- reviewed candidate: `5c51584826876fe344337b9a0c19b83b4bb84a74`
- independent exact-head review: `APPROVE`; safe to integrate: `true`
- focused RuntimeSupervisor: `19/19`
- focused OrderWriter: `25/25`
- full suite: `444/444`
- `npm run check`: `PASS`
- `npm run build`: `PASS`
- `git diff --check`: `PASS`
- working tree before this documentation-only reconciliation: clean
- changed implementation surfaces: `src/runtime/supervisor.ts`, `src/evaluator/index.ts`, `src/execution/index.ts`; tests in `tests/runtime.supervisor.test.ts` and `tests/execution.order-writer.test.ts`

Evidence ceiling: `LOCAL_PASS` for deterministic local/replay implementation and
adversarial tests only. No network, credentials, MCP, wallet, funds, Binance
orders, cancels, live execution, production durability, crash-recovery proof,
exactly-once exchange behavior, or profitability claim.
