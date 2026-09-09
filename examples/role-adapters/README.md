# Local HTTP Agent and MCP Worker adapters

This is a **credential-free local/injected example**. It does not contact a provider, exchange, Testnet, LIVE, or a chain. The HTTP server binds to `127.0.0.1`; the MCP worker uses an in-memory JSON-RPC line loopback.

From the repository root:

```bash
npm run build
node examples/role-adapters/run.mjs
```

The JSON transcript demonstrates:

- valid `ADVOCATE`, `OPPOSER`, and `MARKET_ANALYST` artifacts over both loopback transports;
- workflow, invocation, role, kind, and `BTCUSDT` symbol binding;
- the adapter's bounded 5-second timeout path;
- accepted artifacts marked `independence: "external"`;
- malformed HTTP envelope refusal;
- HTTP `403` refusal;
- contradictory MCP artifact refusal;
- refusal when an external adapter is asked to invoke the service-owned `COUNCIL` role;
- no private chain-of-thought and no financial-write fields.

The fixture's output is adapter-boundary evidence only. It is not live provider evidence or market evidence. A sample transcript is checked in as [`transcript.json`](transcript.json).
