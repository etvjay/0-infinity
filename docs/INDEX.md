# Documentation index

Use the Cloudflare Worker as the hosted REST/MCP front door:

`https://zero-infinity-projection-store.microcosm.workers.dev`

The Northflank service is a private upstream behind that front door. It is not a public client endpoint and must not be copied into user or judge instructions. The GitHub Pages site is the static UI: `https://etvjay.github.io/0-infinity/`.

## 1. Cold-start user and judge guides

- [`../README.md`](../README.md) — product explanation, limits, local runbook, and public routes.
- [`JUDGE_QUICKSTART.md`](JUDGE_QUICKSTART.md) — exact hosted probes and local verification commands with expected output shapes.
- [`SUBMISSION.md`](SUBMISSION.md) — judge-facing copy and evidence ceiling.
- [`WEB_UI.md`](WEB_UI.md) — static UI routes and local UI setup.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — local REST/MCP entrypoints and deployment boundaries.

## 2. Canonical architecture and explanation

- [`canonical/GROUND_TRUTH.md`](canonical/GROUND_TRUTH.md) — invariants, status vocabulary, and evidence ceiling.
- [`canonical/ARCHITECTURE.md`](canonical/ARCHITECTURE.md) — reasoning clock, deterministic hot path, and authority boundaries.
- [`canonical/WORKFLOWS.md`](canonical/WORKFLOWS.md) — workflow composition.
- [`canonical/PRODUCT_SPEC.md`](canonical/PRODUCT_SPEC.md) and [`canonical/PRODUCT_SCHEMA.md`](canonical/PRODUCT_SCHEMA.md) — product contract and schemas.
- [`REASONING_RUNTIME.md`](REASONING_RUNTIME.md) — reasoning and receipt behavior.

## 3. API, SDK, and MCP integration

- [`API.md`](API.md) — REST routes, validation, errors, and CORS.
- [`SDK.md`](SDK.md) — `0-infinity/sdk` and `ZeroInfinityClient`.
- [`MCP.md`](MCP.md) — network JSON-RPC tools and resources.
- [`../openapi.json`](../openapi.json) — machine-readable REST contract.
- [`../examples/mcp-agent/`](../examples/mcp-agent/) — runnable MCP agent example, pointed at the Cloudflare front door.
- [`../examples/consumer/`](../examples/consumer/) — consumer-shaped SDK smoke fixture.
- [`BRING_YOUR_OWN_AGENT.md`](BRING_YOUR_OWN_AGENT.md) — adapter boundary for external agents.

## 4. Verified evidence

- [`development/EVIDENCE_LEDGER.md`](development/EVIDENCE_LEDGER.md) — evidence index and status vocabulary.
- [`development/evidence/ZO-BIN-FINAL-system-integration.json`](development/evidence/ZO-BIN-FINAL-system-integration.json) — current integration receipt; its `finalVerdict` is `GAPS_REMAIN`.
- [`development/evidence/ZO-BIN-MB8-api-mcp-sdk-hosted.json`](development/evidence/ZO-BIN-MB8-api-mcp-sdk-hosted.json) — hosted probe receipt; retained as a receipt, not a deployment identity claim.
- [`development/SUBMISSION_CHECKLIST.md`](development/SUBMISSION_CHECKLIST.md) — submission matrix and blockers.

Evidence tiers are explicit: local tests and probes do not prove authenticated Binance access, production durability, profitability, or live financial authority.

## 5. Experiments and historical change records

- [`development/changes/`](development/changes/) — milestone and experiment records; preserve their original observations.
- [`development/CHANGE_RECORDS/`](development/CHANGE_RECORDS/) — structured change records.
- [`development/evidence/`](development/evidence/) — JSON/markdown receipts, including historical endpoint observations.
- [`submission/`](submission/) — prepared submission material and media artifacts.

Historical artifacts are not current endpoint instructions. When an old URL appears in a receipt or transcript, it is evidence of the endpoint used at that time; current readers should use the Cloudflare front door above.
