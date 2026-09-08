# MCP

The local MCP-like adapter exposes read, reasoning, SHADOW, and deterministic PAPER tools through the same `ZeroInfinityService`. It has no live-write tools.

## Tools

`tools/list` advertises:

- `get_capabilities`
- `get_readiness`
- `create_workflow`
- `submit_opportunity`
- `get_reasoning_receipt`
- `get_trade_thesis`
- `get_workflow`
- `run_shadow_workflow`
- `run_paper_live`

`run_paper_live` returns the deterministic `PaperReceipt` and keeps exchange writes disabled. `run_shadow_workflow` returns a local replay result with `noWrite: true`.

## Resources

`resources/list` advertises `zero-infinity://capabilities` and `zero-infinity://readiness`. `resources/read` returns standard JSON `contents` entries.

Malformed params and opportunities fail closed; invalid input is never silently replaced with `{}`. See [`docs/API.md`](API.md) and [`openapi.json`](../openapi.json) for the shared surface contract.
