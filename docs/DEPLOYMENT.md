# Deployment

## Local REST and MCP

Build and run the dependency-free entrypoints:

```bash
npm install
npm run api                 # binds 127.0.0.1:8787 (override HOST/PORT)
npm run mcp                 # line-delimited JSON-RPC over stdin/stdout
curl http://127.0.0.1:8787/health
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"get_readiness","params":{}}' | npm run mcp
```

These surfaces share `ZeroInfinityService` and expose no live financial write endpoint. The local entrypoints remain available, and the same REST/MCP service responds at `https://zero-infinity-projection-store.microcosm.workers.dev`. The current response reports `version: v1`, `hostedEvidence: false`, and `authority: false`; no deployed commit SHA is inferred from those responses.

## GitHub Pages

`.github/workflows/pages.yml` publishes only `web/` as a static artifact on pushes to `main`. The public Pages site is reachable at `https://etvjay.github.io/0-infinity/`, including `/app/demo/`, `/app/try/`, and `/app/integrate/`. Pages hosts the static UI only; it cannot host the REST API or MCP process. A configured server host, domain, and operational controls are still required for hosted REST/MCP deployment.

Testnet status: **BINANCE_TESTNET = BLOCKED_EXTERNAL** for authenticated account/order lifecycle. Public testnet `exchangeInfo` metadata was read with HTTP 200; dedicated server-side testnet credentials were unavailable, so no authenticated request, order, cancel, or reconciliation was attempted.
