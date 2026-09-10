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

This is a role-artifact contract, not a credential-management API. Current public configuration is available through the SDK, REST stack-registration endpoint, and MCP registration tool. A developer connecting a remote worker must supply the transport endpoint in its own runtime and keep credentials outside the artifact. Rejection is fail-closed and does not produce a thesis or mandate.


## REST and MCP stack registration

A deployed consumer can register a frozen stack without importing repository source:

```http
POST /v1/reasoning-stacks
content-type: application/json
```

The body is the same `ReasoningStackConfig` accepted by `createReasoningStack`. The endpoint returns the registered stack identity and sanitized composition. MCP consumers use the `register_reasoning_stack` tool with `{ "config": ... }`. Both surfaces validate the stack before registration and reject credential-bearing fields; provider keys belong in the server runtime environment only.


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

## Advisory mandate and portable verification

Use the same canonical path without invoking a venue connector:

```text
workflow → Advocate/Opposer/Market Analyst → Council
→ ReasoningReceipt → TradeThesis → ExecutionMandate
→ return to the agent/user
```

The SDK method is `runAdvisoryWorkflow`; REST uses `POST /v1/advisory`; MCP uses `run_advisory`. The response is explicitly `mode: "ADVISORY"` and `noWrite: true`. A consumer can serialize the mandate and verify it through `0-infinity/mandate` using `serializeMandate`, `parseMandate`, or `verifySerializedMandate`. Verification provides canonical integrity, binding, expiry, bounds, and provenance assurance; it is not a cryptographic signature claim.

Hosted credentials, authenticated Binance state, Testnet lifecycle, and LIVE authorization are not implied by adapter support.