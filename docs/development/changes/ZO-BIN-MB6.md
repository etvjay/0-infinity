# ZO-BIN-MB6 — Full Runtime / Recovery

This slice adds `RuntimeSupervisor` as a coordinator over the accepted mandate,
evaluator, store, and order-writer boundaries. It accepts only an explicit
`SHADOW` or `LOCAL_REPLAY` mode and an injected `OrderWriter`; it never reads
credentials, discovers adapters, or falls back to live execution.

Workflow records are versioned and persisted independently from mandate runtime
and order outcome. Triggering is idempotent. Recovery reconciles the persisted
client order id through the injected writer and never retries an `UNKNOWN`
submission. The M-B1 terminal `UNKNOWN` runtime state remains terminal; a later
order reconciliation updates the separate order/workflow outcome only.

Evidence ceiling: LOCAL/replay only. No network, credentials, MCP, wallet,
funds, Binance orders, or cancels are exercised or claimed.
