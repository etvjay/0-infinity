# Product Access API

The product-access surface is bounded and no-write by default. Runtime modes exposed by this candidate are `SHADOW` and `PAPER_LIVE`; `BINANCE_TESTNET` and `LIVE_CONFIRMED` are denied. No REST endpoint submits a live order.

## REST

- `GET /health` → `{ ok: true, version }`
- `GET /capabilities` → version, roles, capabilities, empty `writes`, and `authority: false`
- `GET /readiness` → bounded-local readiness; `liveWrites: false`
- `POST /v1/workflows` with a plain JSON object opportunity → `201` workflow record
- `GET /v1/workflows/{workflowId}` → workflow record or `404 { error: "NOT_FOUND", message }`
- `POST /v1/workflows/{workflowId}/submit` → bounded workflow result or 404
- `GET /v1/workflows/{workflowId}/receipt` and `/thesis` → artifact or 404
- `POST /v1/shadow` with a plain JSON object → no-write shadow result
- `POST /v1/paper-live` with a plain JSON object → deterministic PAPER_LIVE result and PaperReceipt; no exchange write

Malformed JSON objects, arrays, inherited/custom-prototype objects, and accessor-backed objects are rejected with `400`. Unknown routes and workflows return `404`; unsupported content types return `415`.

## MCP

`tools/list` advertises `get_capabilities`, `get_readiness`, `create_workflow`, `submit_opportunity`, `get_reasoning_receipt`, `get_trade_thesis`, `run_shadow_workflow`, and `get_workflow`.

`resources/list` advertises the canonical JSON resources `zero-infinity://capabilities` and `zero-infinity://readiness`. `resources/read` accepts `{ "uri": "..." }` and returns standard `contents` entries containing JSON text. Invalid params are errors; malformed opportunities are never replaced with `{}`.

See [`openapi.json`](../openapi.json) for machine-readable REST schemas and error contracts.
