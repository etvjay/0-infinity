# 0-infinity

**A control layer between trading agents and execution.**

Agents can propose a market opportunity. 0-infinity runs bounded evidence and opposition through a Council, produces inspectable reasoning artifacts, checks executable economics, and returns a bounded decision result or refusal. A Council result is not a live order: the public product has no financial-write path.

The public UI is intentionally small and is hosted at [`etvjay.github.io/0-infinity`](https://etvjay.github.io/0-infinity/):

- **Landing** — what 0-infinity is and why it exists;
- **Demo** — the canonical read-only construct;
- **Try** — a no-write SHADOW/PAPER workflow for `BTCUSDT`;
- **Integrate** — the implemented REST, MCP, and SDK entry points.

It is not a trading dashboard, HFT system, profitability claim, or live-order console.

## Decision path

```text
Opportunity → Evidence + Opposition → Council → Reasoning Receipt
           → Workflow / Thesis → Economics → TRADE or REFUSE
```

The deterministic service currently uses the roles `ADVOCATE`, `OPPOSER`, `MARKET_ANALYST`, and `COUNCIL`. The returned artifacts are inspectable references and bounded claims, not private chain-of-thought.

## Evidence and authority boundary

| Surface | Current boundary |
|---|---|
| `SHADOW` | `SHADOW_PASS`: deterministic local replay; no exchange write |
| `PAPER` | `PAPER_MARKET_PASS`: simulated execution; the API mode is `PAPER_LIVE`; no exchange write |
| Binance public market read | `LIVE_READ_PASS` is bounded market input only; it does not prove private account state, synchronized depth, profitability, or production safety |
| Hosted REST/MCP | The configured runtime responds to health, readiness, capabilities, workflow, SHADOW/PAPER, and JSON-RPC probes. Its readiness response still reports `hostedEvidence: false`; no durability claim is made |
| SDK | `ZeroInfinityClient` and the `examples/consumer` fixture are implemented and tested against a configured REST base URL; this does not authenticate Binance or authorize writes |
| Binance Agentic MCP | `AUTH_BLOCKED_EXTERNAL`: authorization was not completed. No authenticated read or financial tool evidence is claimed |
| Binance Futures Testnet | `CREDENTIAL_REQUIRED` / `BLOCKED_EXTERNAL`: public metadata was readable, but no authenticated account, order, cancel, or reconciliation lifecycle is claimed |
| `LIVE` / mainnet | `NOT_AUTHORIZED`: locked; no live financial write is exposed or claimed |

The repository's readiness manifest keeps `accountRead`, `mcpRead`, and all write capabilities disabled. No API keys, tokens, cookies, private keys, or credentials belong in this repository.

## Run locally

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run check
npm run web:check
npm test
npm run demo
npm run readiness:validate
npm run secret-scan
```

`npm run demo` is credential-free and network-free. It exercises economics-edge refusal, a valid shadow receipt, and unknown-outcome reconciliation without blind retry. The validation and demo commands write/read bounded artifacts under `docs/development/evidence/`.

Run the local REST service and static UI in separate terminals:

```bash
npm run api                         # http://127.0.0.1:8787
python3 -m http.server 4173 --directory web
```

The static page defaults to `http://127.0.0.1:8787`. A hosted page can set the same value before loading `web/app.js`:

```js
window.__ZERO_INFINITY_CONFIG__ = {
  apiBase: "https://your-configured-runtime"
};
```

Run the local line-delimited JSON-RPC MCP entry point with:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"get_readiness","params":{}}' | npm run mcp
```

## REST entry points

The currently verified hosted runtime is:

```text
https://http--zero-infinity-runtime--tw56snbf4tjj.code.run
```

Use a configured base URL rather than baking this deployment into a client. Implemented routes are:

```text
GET  /health
GET  /readiness
GET  /capabilities
POST /v1/workflows
POST /v1/workflows/:id/submit
GET  /v1/workflows/:id
GET  /v1/workflows/:id/receipt
GET  /v1/workflows/:id/thesis
POST /v1/shadow
POST /v1/paper-live
POST /mcp
```

Example no-write call:

```bash
export ZERO_INFINITY_API=http://127.0.0.1:8787
curl -sS -X POST "$ZERO_INFINITY_API/v1/shadow" \
  -H 'content-type: application/json' \
  -d '{"symbol":"BTCUSDT","side":"LONG"}'
```

The REST and MCP surfaces share `ZeroInfinityService`; neither exposes live financial writes. See [`docs/API.md`](docs/API.md) for validation and error behavior.

## MCP entry point

The network JSON-RPC endpoint is `POST <configured-runtime>/mcp`. The local development transport is `npm run mcp` over stdin/stdout. `tools/list` advertises exactly:

```text
get_capabilities
get_readiness
create_workflow
submit_opportunity
get_reasoning_receipt
get_trade_thesis
run_shadow_workflow
run_paper_live
get_workflow
```

`resources/list` advertises `zero-infinity://capabilities` and `zero-infinity://readiness`. MCP provides read, reasoning, SHADOW, and deterministic PAPER operations only; it is not Binance Agentic MCP authentication or a live-write adapter. See [`docs/MCP.md`](docs/MCP.md).

## SDK entry point

The package export is `0-infinity/sdk`, implemented by `src/product/sdk.ts`:

```ts
import { ZeroInfinityClient } from "0-infinity/sdk";

const zero = new ZeroInfinityClient(fetch, apiBase);
const workflow = await zero.createWorkflow({
  symbol: "BTCUSDT",
  venue: "BINANCE",
  product: "USD_M_FUTURES"
});
await zero.submitOpportunity(workflow.workflowId);
const receipt = await zero.getReasoningReceipt(workflow.workflowId);
```

Available client methods are `createWorkflow`, `submitOpportunity`, `getWorkflow`, `getReasoningReceipt`, `getTradeThesis`, `runShadowWorkflow`, `runPaperLiveWorkflow`, `capabilities`, and `readiness`. The consumer fixture is in [`examples/consumer`](examples/consumer).

## Evidence references

- UI contract: [`docs/WEB_UI.md`](docs/WEB_UI.md)
- REST contract: [`docs/API.md`](docs/API.md)
- MCP contract: [`docs/MCP.md`](docs/MCP.md)
- Deployment and hosted boundary: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- Submission evidence ceiling: [`docs/SUBMISSION.md`](docs/SUBMISSION.md)
- Current demo script: [`docs/submission/VIDEO_SCRIPT.md`](docs/submission/VIDEO_SCRIPT.md)
- Evidence artifacts: [`docs/development/evidence/`](docs/development/evidence/)

The media under `docs/submission/media/` was made for the former console and is historical until a fresh capture of the simplified UI exists. The latest local closeout commits are `3967fc7`, `afbbfe8`, and `b52735`; they are local until explicitly pushed.
