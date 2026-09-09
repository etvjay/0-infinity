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

The payload is parsed, schema-validated, role-validated, workflow-bound, provenance-bound, and frozen. Invalid JSON, timeouts, wrong roles, malformed evidence, replay conflicts, and authority-shaped fields fail closed as reasoning failure.

## What 0-infinity still controls

Bring your own intelligence does not transfer execution authority. 0-infinity retains the role contracts, mandatory opposition, Council constitution, Reasoning Receipt, Trade Thesis, short-lived freshness-bound mandate, market revalidation, execution policy, and receipt. A Council `APPROVE` is not an order; current execution economics can still produce `REFUSED` / `EDGE_COLLAPSED`.

Hosted credentials, authenticated Binance state, Testnet lifecycle, and LIVE authorization are not implied by adapter support.
