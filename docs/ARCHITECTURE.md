# Architecture

## Two clocks, one bounded decision

Zero Infinity deliberately separates slow reasoning from the deterministic execution hot path. ADVOCATE, OPPOSER, and MARKET_ANALYST complete before the service-owned COUNCIL convenes. The Council produces one bounded thesis/mandate decision; that result can feed one or more pure `evaluateMandate` calls against changing market/account state. FAST changes budgets and timeout configuration, not the mandatory role set: OPPOSER and COUNCIL are never skipped.

The operational telemetry types in `src/latency/` expose two immutable clocks without entering ReasoningReceipt hashes or authority decisions:

- **Reasoning clock:** role start/completion → Council start/completion → receipt → mandate armed.
- **Hot-path clock:** market received → trigger/economics/evaluateMandate → intent → writer pre-I/O → outbound/ack.

Expiry, stale state, authority status, and single-use remain fail-closed mandate rules. TTL is the mandate validity window; it is not a thesis horizon and neither is an HFT service-level guarantee. No second LLM call is made after mandate arming in the canonical hot closure, which contains no role adapter, reasoning runtime, Council, OpenAI, MCP, or fetch dependency. Timing claims remain `NOT_MEASURED` until runtime traces are actually emitted and collected.
