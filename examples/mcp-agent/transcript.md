# Historical cold-agent walkthrough (read-only)

Public target: `https://zero-infinity-projection-store.microcosm.workers.dev/mcp`
The current public proof is maintained in [`docs/PROOF.md`](../../docs/PROOF.md). Re-run the bounded hosted evidence with `npm run smoke:hosted`; workflow IDs are generated at runtime.
The agent uses the hosted MCP JSON-RPC boundary. No credentials are supplied and no exchange write is available.

## Implemented method names

- SDK `ZeroInfinityClient`: `createWorkflow`, `submitOpportunity`, `getWorkflow`, `getReasoningReceipt`, `getTradeThesis`, `runShadowWorkflow`, `runPaperLiveWorkflow`, `capabilities`, `readiness`.
- MCP: `tools/list`, `resources/list`, `resources/read`, `get_capabilities`, `get_readiness`, `create_workflow`, `submit_opportunity`, `get_reasoning_receipt`, `get_trade_thesis`, `run_shadow_workflow`, `run_paper_live`, `get_workflow`.
- REST: `GET /health`, `GET /capabilities`, `GET /readiness`, `POST /v1/workflows`, `GET /v1/workflows/{workflowId}`, `POST /v1/workflows/{workflowId}/submit`, `GET /v1/workflows/{workflowId}/receipt`, `GET /v1/workflows/{workflowId}/thesis`, `POST /v1/shadow`, `POST /v1/paper-live`.

## Actual hosted run

```text
GET /health                       -> 200 {"ok":true,"version":"v1"}
GET /readiness                    -> 200 {"ready":true,"mode":"bounded-local","liveWrites":false,"hostedEvidence":false}
GET /capabilities                 -> 200 {"modes":["SHADOW","PAPER_LIVE"],"writes":[],"authority":false}
MCP tools/list                    -> 200, 9 tools; names match the MCP list above
MCP run_shadow_workflow           -> 200 {"mode":"SHADOW","noWrite":true,"workflowId":"wf-1788942350916-3","status":"COMPLETE"}
REST POST /v1/paper-live          -> 200 {"mode":"PAPER_LIVE","noWrite":true,"workflowId":"wf-1788942351062-4","status":"COMPLETE","paperReceipt":{"simulated":true,"outcome":"FILLED"}}
OPTIONS /health, GitHub origin   -> 204, allow-origin=https://etvjay.github.io
OPTIONS /health, evil origin     -> 403 {"error":"CORS_ORIGIN_NOT_ALLOWED"}
```

## Local SDK consumer

From the repository root: `npm run build`; then `cd examples/consumer && npm install --ignore-scripts && npm run smoke` returned:

```text
{"workflowId":"wf-1788942294515-47","status":"COMPLETE","receiptWorkflowId":"wf-1788942294515-47"}
```

The hosted checks prove only bounded read/discovery plus SHADOW/PAPER behavior. They do not prove credentials, authenticated account state, exchange execution, profitability, or production readiness.
