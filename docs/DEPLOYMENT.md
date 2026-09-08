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

These surfaces share `ZeroInfinityService` and expose no live financial write endpoint. The local entrypoints remain available, and the same REST/MCP service is independently verified on Northflank at `https://http--zero-infinity-runtime--tw56snbf4tjj.code.run` for deployed SHA `e1f9d2fd3764eb63aefca7b75815ed2d8280c1ce`.

## GitHub Pages

`.github/workflows/pages.yml` is ready to publish only `web/` as a static artifact on pushes to `main`. The attempted deployment was **BLOCKED_EXTERNAL**: GitHub Pages is not enabled and the available Actions/PAT credentials returned `403 Resource not accessible by integration/personal access token` when creating the Pages site. No public Web URL is claimed. If Pages is enabled for `etvjay/0-infinity`, the expected URL format is `https://etvjay.github.io/0-infinity/`; this URL is not verified here. Pages cannot host the REST API or MCP process. A configured server host, domain, and operational controls are still required for hosted REST/MCP deployment.

Testnet status: **BINANCE_TESTNET = BLOCKED_EXTERNAL** for authenticated account/order lifecycle. Public testnet `exchangeInfo` metadata was read with HTTP 200; dedicated server-side testnet credentials were unavailable, so no authenticated request, order, cancel, or reconciliation was attempted.
