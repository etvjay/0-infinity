# Bring your own intelligence

0-infinity is provider-neutral at the intelligence boundary. Bring an existing model, agent, risk engine, or quant worker into a role; 0-infinity validates the result before it can enter the Council.

```text
Your model / agent / worker
        ↓
RoleAdapter
        ↓
validated, workflow-bound RoleArtifact
        ↓
Council → Reasoning Receipt → Trade Thesis
        ↓
short-lived Execution Mandate
        ↓
model-free market revalidation and execution/refusal
```

## Two integration directions

- **Use 0-infinity:** call the product through MCP, REST, or the Node SDK.
- **Bring intelligence into 0-infinity:** bind workers through a RoleAdapter to `ADVOCATE`, `OPPOSER`, `MARKET_ANALYST`, or the service-owned `COUNCIL` boundary.

These are different boundaries. An adapter is not an access client.

## Supported worker boundaries

The implemented adapter families are:

- **Builtin** — deterministic service-owned worker;
- **OpenAI-compatible** — any compatible endpoint, including local models;
- **HTTP Agent** — an injected HTTP transport returning the role artifact envelope;
- **MCP Worker** — an injected MCP transport returning the same envelope.

The public examples in [`examples/role-adapters/`](../examples/role-adapters/) exercise the HTTP Agent and MCP Worker boundaries. The OpenAI-compatible path is exercised by the local Ollama adapter tests and bounded provider measurements.

## Role contract

Every worker must return one strict, bounded artifact for its invocation. The service binds and validates `workflowId`, `invocationId`, `role`, artifact kind, symbol, evidence timestamps, and provenance before freezing the artifact.

External workers are limited to pre-Council roles. They cannot create or inject a `TradeThesis`, `ExecutionMandate`, `ExecutionIntent`, or `OrderReceipt`. The service and deterministic execution runtime create downstream authority and consequence records.

Each role remains mandatory:

- `ADVOCATE` — proposes the strongest supported case;
- `OPPOSER` — challenges the case before authority can exist;
- `MARKET_ANALYST` — supplies trusted market/account state;
- `COUNCIL` — adjudicates the artifacts and produces explicit approval or refusal.

Different roles may use different adapters and providers. The workflow records the effective adapter names and stack version; fallback or provider changes must not be silent.

## Minimal adapter shape

The injected transport receives a `RoleInvocation` and returns only the artifact envelope:

```ts
{
  workflowId,
  invocationId,
  role,
  kind,
  payload
}
```

## Normative external artifact envelope

The current adapter contract is this exact JSON object; no additional top-level keys are accepted:

```json
{
  "workflowId": "wf-example",
  "invocationId": "wf-example:OPPOSER",
  "role": "OPPOSER",
  "kind": "OPPOSE",
  "payload": {
    "kind": "OPPOSE",
    "ref": "worker-reference",
    "hash": "worker-evidence-hash",
    "symbol": "BTCUSDT",
    "direction": "LONG",
    "recommendation": "AGREE",
    "observedAt": 1700000000000,
    "expiresAt": 1700000300000
  }
}
```

For `ADVOCATE`, `kind` is `ADVOCATE` and the payload additionally requires `direction`, non-negative `expectedMoveBps`, and `confidence` from `0` through `1`. For `MARKET_ANALYST`, `kind` is `MARKET_ACCOUNT` and the payload requires `market: "TRUSTED"` and `account: "TRUSTED"`. The outer `role`, `workflowId`, `invocationId`, and `kind` must agree with the invocation; `symbol` must agree with the opportunity; `expiresAt` must be after `observedAt`; and authority-shaped fields such as `order`, `mandate`, `intent`, `trade`, `quantity`, or `price` are rejected.

This is a role-artifact contract, not a hosted provider-registration API. Current public configuration is through injected transports and the OpenAI-compatible environment boundary; no public endpoint claims to register arbitrary remote workers or credentials. A developer connecting a remote worker must supply the transport in its own runtime and keep credentials outside the artifact. Rejection is fail-closed and does not produce a thesis or mandate.


## Consumer configuration path

A consumer can create and inject a stack without editing 0-infinity source code:

```ts
import { ZeroInfinityService, createReasoningStack } from "0-infinity/product";

const stack = createReasoningStack({
  name: "my-stack",
  version: "v1",
  profile: "STANDARD",
  advocate: { adapter: "openai-compatible", baseUrl: process.env.ALPHA_URL!, model: process.env.ALPHA_MODEL!, apiKey: process.env.ALPHA_KEY },
  opposer: { adapter: "http-agent", endpoint: process.env.RISK_WORKER_URL! },
  marketAnalyst: { adapter: "mcp-worker", endpoint: process.env.MARKET_WORKER_URL!, tool: "role_artifact" },
  council: { adapter: "http-agent", endpoint: process.env.COUNCIL_WORKER_URL! }
});
const service = new ZeroInfinityService({ reasoningStack: stack });
const workflow = service.createWorkflow({ symbol: "BTCUSDT", side: "LONG" }, "my-stack", "v1");
const result = await service.submitOpportunity(workflow.workflowId);
```

The configuration is runtime-only. Endpoint credentials are not placed in workflows, artifacts, receipts, or persisted projections. The current public path supports external Advocate, Opposer, Market Analyst, and Council workers through their distinct boundaries. Provider-backed Council output is a `CouncilDecisionCandidate`, not a pre-Council `RoleArtifact`; 0-infinity validates it against the stack, workflow, evidence, and mandatory opposition before canonical Council/thesis processing.


Bring your own intelligence does not transfer execution authority. 0-infinity retains the role contracts, mandatory opposition, Council constitution, Reasoning Receipt, Trade Thesis, short-lived freshness-bound mandate, market revalidation, execution policy, and receipt. A Council `APPROVE` is not an order; current execution economics can still produce `REFUSED` / `EDGE_COLLAPSED`.

Hosted credentials, authenticated Binance state, Testnet lifecycle, and LIVE authorization are not implied by adapter support.
