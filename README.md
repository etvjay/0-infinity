# 0-infinity

**Evidence before action.**

## The failure mode

A trading agent can be persuasive without being correct. A Council can approve a thesis while spread, slippage, fees, or funding have already erased its executable edge. Treating a proposal, an approval, and an exchange order as the same event turns uncertainty into authority too early.

0-infinity is not a trading dashboard, HFT system, profitability claim, or live-order console. It is a control layer between a market hypothesis and execution. Its public product has no financial-write path.

## What 0-infinity does

An opportunity enters as a bounded hypothesis. The system gathers evidence, forces opposition, records the decision artifacts, checks executable economics, and returns a bounded result or refusal. Reasoning is inspectable through structured references and receipts; private chain-of-thought is not exposed.

The authority progression is deliberately explicit:

```text
0 AUTHORITY → EVIDENCE + OPPOSITION → BOUNDED AUTHORITY → EXECUTION CONDITIONED
```

An agent may reason without being authorized to trade. A Council decision may compile into a short-lived Execution Mandate without becoming an order. The market-facing path remains deterministic and must revalidate the conditions before any execution path could proceed.

## One opportunity, end to end

The deterministic service uses four roles: `ADVOCATE`, `OPPOSER`, `MARKET_ANALYST`, and `COUNCIL`.

1. The **Advocate** builds the strongest case for the opportunity.
2. The **Opposer** searches for reasons the case should fail.
3. The **Market Analyst** checks the relevant market inputs.
4. The **Council** adjudicates the bounded evidence and produces a decision.
5. A **Reasoning Receipt** records what supported the decision, what opposed it, and what uncertainty remained.
6. If approved, an **Execution Mandate** expresses temporary, bounded authority: its symbol, side, size, price, limits, lifetime, and use are explicit.
7. The deterministic market path revalidates spread, slippage, fees, funding, and the required edge.

If the economics no longer hold, the result is `REFUSED` with `EDGE_COLLAPSED`. Council approval does not override changed execution reality.

## Binance Agent OS context

0-infinity is designed as a control and authority layer around agent intelligence in the Binance Agent OS context. The intelligence source is replaceable: agents and models can enter through MCP, REST, SDK, or adapter boundaries while the evidence, authority, and revalidation rules remain the same. This repository does not claim authenticated Binance Agentic MCP access, authenticated Futures Testnet execution, profitability, or live financial authority.

## Interfaces

The same bounded service is available through:

- **MCP** — network JSON-RPC at `POST <configured-runtime>/mcp`, or the local line-delimited transport via `npm run mcp`;
- **REST** — health, readiness, capabilities, workflow, receipt, thesis, SHADOW, and deterministic PAPER routes;
- **SDK** — the `0-infinity/sdk` package export and `ZeroInfinityClient`;
- **Adapters** — explicit boundaries for bringing external agents and providers into the existing role and evidence model.

See the [REST contract](docs/API.md), [MCP contract](docs/MCP.md), and [SDK contract](docs/SDK.md) for the implemented names and validation rules. No interface exposes a live financial write.

## Current public routes

The static public UI is hosted at [`https://etvjay.github.io/0-infinity/`](https://etvjay.github.io/0-infinity/):

- `/` — landing explanation and architecture;
- `/app/demo/` — canonical read-only construct;
- `/app/try/` — no-write SHADOW/PAPER workflow for `BTCUSDT`;
- `/app/integrate/` — MCP, REST, and SDK examples.

The route inventory is documented in [`docs/WEB_UI.md`](docs/WEB_UI.md). The static UI and the REST/MCP runtime are separate deployments.

## Evidence boundary

The repository demonstrates deterministic local behavior, SHADOW replay, PAPER simulation, bounded public market-read evidence, and fail-closed authority boundaries. `LIVE` is `NOT_AUTHORIZED`; Testnet account/order lifecycle and authenticated Agentic MCP access remain externally blocked. Hosted responses are bounded probes, not proof of production durability or live financial authority.

For the detailed evidence ceiling and current submission wording, see [`docs/SUBMISSION.md`](docs/SUBMISSION.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), and the [evidence appendix](docs/development/evidence/). The repository readiness manifest keeps account reads, MCP reads, and all write capabilities disabled. No credentials belong in this repository.

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

`npm run demo` is credential-free and network-free. It exercises economics-edge refusal, a valid shadow receipt, and unknown-outcome reconciliation without blind retry. Run the local REST service and static UI in separate terminals:

```bash
npm run api                         # http://127.0.0.1:8787
python3 -m http.server 4173 --directory web
```

The local REST service is also the default API target for the static UI. A hosted page can set a configured runtime before loading `web/app.js`:

```js
window.__ZERO_INFINITY_CONFIG__ = {
  apiBase: "https://your-configured-runtime"
};
```

The current hosted runtime is documented, with its evidence limits, in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). The current demo narration is [`docs/submission/VIDEO_SCRIPT.md`](docs/submission/VIDEO_SCRIPT.md).
