# Public documentation index

This repository contains the public product, safe integration guidance, runnable examples, tests, and bounded verification commands.

Hosted front door:

`https://zero-infinity-projection-store.microcosm.workers.dev`

The Northflank service is a private upstream behind that front door. The GitHub Pages site is the static UI:

`https://etvjay.github.io/0-infinity/`

## Cold-start guides

- [`../README.md`](../README.md) — product explanation and first run.
- [`JUDGE_QUICKSTART.md`](JUDGE_QUICKSTART.md) — credential-free judge verification.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — local REST/MCP entrypoints and deployment boundary.
- [`WEB_UI.md`](WEB_UI.md) — public routes and local UI setup.

## Public system explanation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — public architecture overview.
- [`REASONING_RUNTIME.md`](REASONING_RUNTIME.md) — public reasoning and receipt behavior.
- [`API.md`](API.md) — REST routes, validation, errors, and CORS.
- [`MCP.md`](MCP.md) — network JSON-RPC tools and resources.
- [`SDK.md`](SDK.md) — `0-infinity/sdk` and `ZeroInfinityClient`.
- [`BRING_YOUR_OWN_AGENT.md`](BRING_YOUR_OWN_AGENT.md) — public adapter boundary.
- [`../openapi.json`](../openapi.json) — machine-readable REST contract.

## Runnable examples and tests

- [`../examples/mcp-agent/`](../examples/mcp-agent/) — bounded hosted MCP example.
- [`../examples/consumer/`](../examples/consumer/) — consumer-shaped SDK smoke fixture.
- [`../scripts/`](../scripts/) — credential-free local and hosted smoke commands.
- [`../tests/`](../tests/) — executable implementation and contract tests.

## Public boundaries

The public repository deliberately does not include private ground truth, internal implementation ledgers, agent task instructions, detailed experiment receipts, submission drafts, video scripts, or unreleased media. Those materials are maintained outside the public GitHub tree.

The public claims remain bounded: no authenticated Binance account/Testnet proof, LIVE authority, profitability claim, or hosted provider-backed reasoning claim is made here.
