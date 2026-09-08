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

These surfaces share `ZeroInfinityService` and expose no live financial write endpoint. They are local entrypoints, not hosted service claims.

## GitHub Pages

`.github/workflows/pages.yml` publishes only `web/` as a static artifact on pushes to `main`. If Pages is enabled for `etvjay/0-infinity`, the expected URL format is `https://etvjay.github.io/0-infinity/`; this URL is **not verified here**. Pages cannot host the REST API or MCP process. A configured server host, domain, and operational controls are still required for hosted REST/MCP deployment.

Testnet status: **BINANCE_TESTNET = BLOCKED_EXTERNAL** for authenticated account/order lifecycle. Public testnet `exchangeInfo` metadata was read with HTTP 200; dedicated server-side testnet credentials were unavailable, so no authenticated request, order, cancel, or reconciliation was attempted.
