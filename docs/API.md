# Product Access API

The product-access surface is bounded and no-write by default. Runtime modes exposed by this candidate are `SHADOW` and `PAPER_LIVE`; `BINANCE_TESTNET` and `LIVE_CONFIRMED` are denied. No REST endpoint submits a live order.

## REST

- `GET /health` → `{ ok: true, version }`
- `GET /capabilities` → version, roles, capabilities, empty `writes`, and `authority: false`
- `GET /readiness` → bounded-local readiness; `liveWrites: false`
- `POST /v1/workflows` accepts an optional `reasoningProfile` of `FAST`, `STANDARD`, or `DEEP`. The service resolves one bounded budget per workflow and exposes the resolved profile, budget, and reasoning timing in the workflow read model. Profiles affect reasoning-resource budgets only; they do not remove OPPOSER/COUNCIL, widen authority, or change the deterministic execution lane.
- `GET /v1/workflows/{workflowId}` → workflow record or `404 { error: "NOT_FOUND", message }`
- `POST /v1/workflows/{workflowId}/submit` → bounded workflow result or 404
- `GET /v1/workflows/{workflowId}/receipt` and `/thesis` → artifact or 404
- `POST /v1/shadow` with a plain JSON object → no-write shadow result
- `POST /v1/paper-live` with a plain JSON object → bounded PAPER_LIVE capability check; minimal opportunities return `REFUSED` with `CAPABILITY_DENIED` rather than fabricating a mandate or PaperReceipt; no exchange write

Malformed JSON objects, arrays, inherited/custom-prototype objects, and accessor-backed objects are rejected with `400`. Unknown routes and workflows return `404`; unsupported content types return `415`.

Browser callers may use CORS from the configured `STATIC_UI_ORIGIN`, the published UI origin, or localhost/127.0.0.1. Preflight is `OPTIONS` with `204`, `GET, POST, OPTIONS`, and `content-type, accept`; other origins receive `403`. Responses do not allow credentials.

## MCP

`tools/list` advertises `get_capabilities`, `get_readiness`, `create_workflow`, `submit_opportunity`, `get_reasoning_receipt`, `get_trade_thesis`, `run_shadow_workflow`, `run_paper_live`, and `get_workflow`.

`resources/list` advertises the canonical JSON resources `zero-infinity://capabilities` and `zero-infinity://readiness`. `resources/read` accepts `{ "uri": "..." }` and returns standard `contents` entries containing JSON text. Invalid params are errors; malformed opportunities are never replaced with `{}`.

See [`openapi.json`](../openapi.json) for machine-readable REST schemas and error contracts.
