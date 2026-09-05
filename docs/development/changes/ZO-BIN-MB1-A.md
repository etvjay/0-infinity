# ZO-BIN-MB1-A — Domain Types + Mandate Compiler

Branch target: `agent/mb1-domain`.

Implement canonical `TradeThesis`, `ExecutionMandate`, supporting execution/refusal types, and deterministic `compileMandate()` with no network/model I/O. Mandate may not broaden thesis or operator policy. MVP `maxUses = 1`.

Required tests: deterministic compilation, binding preservation, policy bounds, expiry, invalid inputs.
