# MCP

The 0-infinity MCP adapter exposes read, reasoning, SHADOW, and deterministic PAPER tools through the same `ZeroInfinityService`. It has no live-write tools and is independently verified over the hosted runtime at `https://zero-infinity-projection-store.microcosm.workers.dev`. The local stdin/stdout entrypoint remains available for development.

## Tools

`tools/list` advertises:

- `get_capabilities`
- `get_readiness`
- `register_reasoning_stack`
- `run_advisory`
- `get_mandate`
- `create_workflow`
- `submit_opportunity`
- `get_reasoning_receipt`
- `get_trade_thesis`
- `get_workflow`
- `run_shadow_workflow`
- `run_paper_live`

`run_advisory` executes the same reasoning/Council path and returns a bounded `ExecutionMandate` with `noWrite: true`. It does not invoke a venue connector. `run_paper_live` returns the deterministic `PaperReceipt` and keeps exchange writes disabled. `run_shadow_workflow` returns a local replay result with `noWrite: true`. `register_reasoning_stack` validates and freezes provider/worker bindings; credential-like fields are rejected.

## Resources

`resources/list` advertises `zero-infinity://capabilities` and `zero-infinity://readiness`. `resources/read` returns standard JSON `contents` entries.

Malformed params and opportunities fail closed; invalid input is never silently replaced with `{}`. See [`docs/API.md`](API.md) and [`openapi.json`](../openapi.json) for the shared surface contract.
