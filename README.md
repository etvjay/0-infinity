# 0-infinity

**Evidence before action.**

Start here: [`docs/INDEX.md`](docs/INDEX.md) for the documentation map, or [`docs/JUDGE_QUICKSTART.md`](docs/JUDGE_QUICKSTART.md) for the shortest verified path. The hosted REST/MCP front door is `https://zero-infinity-projection-store.microcosm.workers.dev`; Northflank remains private upstream only.

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
- **REST** — health, readiness, capabilities, stack registration, advisory mandate issuance, workflow, receipt, thesis, mandate, SHADOW, and bounded PAPER routes; no route performs a live financial write;
- **SDK** — the `0-infinity/sdk` package export and `ZeroInfinityClient`;
- **Adapters** — explicit boundaries for bringing external agents and providers into the existing role and evidence model.

See the [REST contract](docs/API.md), [MCP contract](docs/MCP.md), and [SDK contract](docs/SDK.md) for the implemented names and validation rules. No interface exposes a live financial write.

## Watch an agent use 0-infinity

The fastest way to understand the integration is the runnable [MCP agent example](examples/mcp-agent/). It connects to the hosted runtime and drives one bounded BTCUSDT paper workflow:

```text
capabilities → readiness → paper workflow → workflow record
             → Reasoning Receipt → Trade Thesis

Advisory consumers use the same reasoning path and receive a portable no-write mandate that can be independently verified.
```

Run it with:

```bash
ZERO_INFINITY_MCP=https://zero-infinity-projection-store.microcosm.workers.dev/mcp \
  node examples/mcp-agent/run-paper-workflow.mjs
```

The example prints the returned decision boundary, receipt presence, and simulated/no-write status. It is the concrete agent-facing counterpart to the public [Demo](https://etvjay.github.io/0-infinity/app/demo/) and [Try](https://etvjay.github.io/0-infinity/app/try/) surfaces.

## Current public routes

The static public UI is hosted at [`https://etvjay.github.io/0-infinity/`](https://etvjay.github.io/0-infinity/):

- `/` — landing explanation and architecture;
- `/app/demo/` — canonical read-only construct;
- `/app/try/` — no-write SHADOW workflow for `BTCUSDT`; PAPER_LIVE is visibly bounded and refuses when canonical execution state is unavailable;
- `/app/integrate/` — MCP, REST, and SDK examples.

The route inventory is documented in [`docs/WEB_UI.md`](docs/WEB_UI.md). The static UI and the REST/MCP runtime are separate deployments.

## See an agent drive the runtime

A complete hosted MCP example is in [`examples/mcp-agent`](examples/mcp-agent/). It runs the same bounded paper workflow an external agent would use: capabilities, readiness, `run_paper_live`, workflow retrieval, Reasoning Receipt, and Trade Thesis. The example also shows the equivalent REST and SDK calls.

This is a paper-trading governance flow. The current runtime does not expose payment tools, authenticated Binance account actions, or live financial writes.

## Evidence boundary

The repository demonstrates deterministic local reasoning, SHADOW replay, advisory mandate issuance and verification, bounded PAPER capability checks, public market-read evidence, and fail-closed authority boundaries. A minimal public PAPER_LIVE request still refuses when canonical market/account/policy state is absent. `LIVE` is `NOT_AUTHORIZED`; Testnet account/order lifecycle and authenticated Agentic MCP access remain externally blocked. Hosted responses are bounded probes, not proof of production durability or live financial authority.

For public verification, start with [`docs/JUDGE_QUICKSTART.md`](docs/JUDGE_QUICKSTART.md) and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Internal ground truth, experiment ledgers, detailed receipts, and submission drafts are maintained outside the public repository. No credentials belong in this repository.

## Reproduce the package without npm registry access

The package metadata, exports, declarations, and license are ready for publication, but this environment is not authenticated to npm. Until an authorized publisher runs `npm publish`, reproduce the exact package locally from the canonical source:

```bash
git clone https://github.com/etvjay/0-infinity.git
cd 0-infinity
git checkout f53203b33c9845ec16b39c9ccee2379b21c4d009
npm ci
npm run build
mkdir -p /tmp/0-infinity-pack
npm pack --pack-destination /tmp/0-infinity-pack
mkdir /tmp/0-infinity-consumer
cd /tmp/0-infinity-consumer
npm init -y
npm install /tmp/0-infinity-pack/0-infinity-0.1.0.tgz
node -e "import('0-infinity/mandate').then(({verifySerializedMandate}) => console.log(typeof verifySerializedMandate))"
```

Expected output is `function`. This proves the public packed-consumer path without claiming that the package is already available from the npm registry.


```bash
npm ci
npm run quickstart
npm run judge:local
```

`quickstart` runs the deterministic demo and readiness validation. `judge:local`
runs type-checking, the full test suite, the web contract check, readiness
validation, and the repository secret scan. No service, account, token, or
financial write is required.

For the public read-only runtime, run:

```bash
npm run smoke:hosted
```

This checks the front door health/capability/readiness routes, then exercises the
SDK and MCP read-only surfaces. Override `ZERO_INFINITY_FRONT_DOOR` or
`ZERO_INFINITY_BASE_URL` to smoke a compatible deployment. The hosted smoke does
not use credentials and never sends a projection write.

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

The current hosted runtime is documented, with its evidence limits, in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Submission scripts and media are maintained outside the public repository.
