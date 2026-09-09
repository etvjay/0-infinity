# MCP agent example

This example shows an external agent driving the hosted 0-infinity MCP surface through a bounded paper-trading workflow.

It is intentionally not a payment or live-order flow: the implemented MCP surface exposes SHADOW and deterministic PAPER only. The same `ZeroInfinityService` authority path is used by MCP, REST, and the TypeScript SDK.

## Run

```bash
ZERO_INFINITY_MCP=https://zero-infinity-projection-store.microcosm.workers.dev/mcp \
  node examples/mcp-agent/run-paper-workflow.mjs
```

The script performs:

1. `get_capabilities`
2. `get_readiness`
3. `run_paper_live`
4. `get_workflow`
5. `get_reasoning_receipt`
6. `get_trade_thesis`

It prints only bounded summary fields and never prints credentials or private chain-of-thought.

## Equivalent surfaces

REST:

```bash
ZERO_INFINITY_API=https://zero-infinity-projection-store.microcosm.workers.dev \
curl -sS -X POST "$ZERO_INFINITY_API/v1/paper-live" \
  -H 'content-type: application/json' \
  -d '{"symbol":"BTCUSDT","side":"LONG"}'
```

SDK:

```ts
const result = await zero.runPaperLiveWorkflow({
  symbol: "BTCUSDT",
  side: "LONG",
});
```

MCP is the agent-facing JSON-RPC boundary; REST and SDK are equivalent access paths into the same governed service, not bypasses around it.
