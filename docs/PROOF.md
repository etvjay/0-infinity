# Public proof summary

This document is the public, bounded proof surface for Zero Infinity. It is intentionally a summary, not the private ground-truth ledger, experiment archive, or operational transcript.

## Architecture

The system separates reasoning from authority and execution:

```text
opportunity
  → workflow
  → evidence and role analyses
  → Council decision
  → ReasoningReceipt
  → TradeThesis
  → ExecutionMandate
  → market/account revalidation
  → evaluator
  → ExecutionIntent or refusal
  → canonical writer
  → order/reconciliation receipt
```

The reasoning roles are upstream of the service-owned Council. The Council decision is not itself an order. A mandate is bounded, short-lived, single-use authority; the evaluator rechecks market state, account state, policy, expiry, binding, economics, and runtime state before the canonical writer can proceed.

See [`ARCHITECTURE.md`](ARCHITECTURE.md), [`REASONING_RUNTIME.md`](REASONING_RUNTIME.md), and the public implementations under `src/reasoning/`, `src/domain/`, `src/evaluator/`, `src/runtime/`, and `src/execution/`.

## Security properties

The public implementation and tests establish these properties:

- reasoning does not equal authority;
- authority does not equal execution;
- workflow, symbol, venue, instrument, account, thesis, evidence, and receipt bindings are checked;
- mandates have explicit expiry and `maxUses: 1`;
- stale market/account state, invalid transitions, invalid authority, expired mandates, policy violations, and weak executable edge fail closed;
- the canonical writer consumes authority before submission and preserves ambiguous outcomes as `UNKNOWN` rather than blindly retrying;
- minimal public `PAPER_LIVE` requests refuse without minting a mandate, intent, or paper receipt;
- public capabilities report `authority: false` and `writes: []`;
- `LIVE_CONFIRMED` and authenticated Binance Testnet capabilities remain blocked.

These are implementation/test claims, not a claim of a completed external exchange security review.

## Capability matrix

| Surface or mode | Public status | Write behavior | Evidence path |
|---|---|---|---|
| REST health/readiness/capabilities | available | no financial write | `docs/API.md`, `scripts/front-door-smoke.mjs` |
| MCP bounded tools/resources | available for bounded flows | no financial write | `docs/MCP.md`, `examples/mcp-agent/` |
| SDK workflow/read model | available | no financial write by default | `docs/SDK.md`, `examples/consumer/` |
| SHADOW | available | local/replay only | `src/shadow/`, shadow tests |
| PAPER_LIVE minimal request | available as fail-closed refusal | no write; `CAPABILITY_DENIED` | `docs/JUDGE_QUICKSTART.md` |
| PAPER typed execution path | covered locally with canonical writer | local paper/replay only | product execution integration tests |
| Binance Testnet runner composition | local composed | `BINANCE_TESTNET` now routes through RuntimeSupervisor → OrderWriter → BinanceTestnetAdapter; account-read remains the credential gate |
| Binance authenticated Testnet | blocked | not authorized | readiness/capability boundary |
| LIVE_CONFIRMED | blocked | disabled | readiness/capability boundary |
| hosted provider-backed reasoning | not configured | unavailable | provider/readiness boundary |

Profiles are resolved per workflow with these bounded defaults:

- `FAST`: 5s role, 5s Council, 15s reasoning workflow deadline.
- `STANDARD`: 12s role, 12s Council, 30s reasoning workflow deadline.
- `DEEP`: 30s role, 30s Council, 60s reasoning workflow deadline.

The workflow read model records the selected profile, effective budget, role start/completion/duration, Council timing, total reasoning duration, and failure reason when applicable. Evidence freshness is evaluated separately from provider latency; a profile cannot create authority from stale evidence.
## ReasoningReceipt example

The following is a redacted structural example. Hashes, IDs, timestamps, and evidence references are placeholders and are not external receipts.

```json
{
  "receiptVersion": "ZO-BIN-REASONING-RECEIPT-V2",
  "workflowId": "<workflow-id>",
  "createdAt": 0,
  "opportunity": {
    "venue": "BINANCE",
    "product": "USD_M_FUTURES",
    "symbol": "BTCUSDT"
  },
  "evidence": {
    "evidenceBundleHash": "<evidence-bundle-hash>",
    "supporting": [{
      "ref": "<supporting-ref>",
      "hash": "<supporting-hash>",
      "workflowId": "<workflow-id>",
      "venue": "BINANCE",
      "product": "USD_M_FUTURES",
      "symbol": "BTCUSDT"
    }],
    "opposing": [{
      "ref": "<opposing-ref>",
      "hash": "<opposing-hash>",
      "workflowId": "<workflow-id>",
      "venue": "BINANCE",
      "product": "USD_M_FUTURES",
      "symbol": "BTCUSDT"
    }]
  },
  "analyses": {
    "advocate": "<advocate-ref>",
    "oppose": "<oppose-ref>",
    "market": "<market-ref>"
  },
  "council": {
    "decision": "APPROVE",
    "direction": "LONG",
    "confidence": 0.0,
    "expectedMoveBps": 0,
    "horizonMs": 1,
    "strongestSupport": "<supporting-ref>",
    "strongestOpposition": "<opposing-ref>",
    "invalidation": ["stale evidence"],
    "unresolved": []
  },
  "rationale": {
    "method": "<method>",
    "claims": []
  },
  "output": {
    "councilDecisionHash": "<council-decision-hash>"
  },
  "canonicalSha256": "<canonical-receipt-hash>"
}
```

`createReasoningReceipt()` canonicalizes, freezes, and hashes the receipt. `verifyReasoningReceipt()` can additionally reconcile it against a workflow/evidence registry. See `src/reasoning/receipt.ts` and `tests/reasoning.receipt.test.ts`.

## Mandate example

This is also structural and redacted. It shows the authority boundary, not a permission to trade.

```json
{
  "mandateId": "<workflow-id>:<thesis-id>:1",
  "workflowId": "<workflow-id>",
  "thesisId": "<thesis-id>",
  "venue": "BINANCE",
  "instrument": "USD_M_FUTURES",
  "symbol": "BTCUSDT",
  "side": "BUY",
  "accountId": "<account-id>",
  "expiresAt": 0,
  "validity": { "issuedAt": 0 },
  "anchor": {
    "stateVersion": "<bigint-version>",
    "observedAt": 0,
    "receivedAt": 0,
    "markPrice": 1
  },
  "entry": {
    "minPrice": 1,
    "maxPrice": 2,
    "trigger": "BELOW",
    "maxSpreadBps": 0,
    "maxSlippageBps": 0
  },
  "economics": {
    "minExecutableEdgeBps": 0,
    "maxFeeBps": 0,
    "maxFundingCostBps": 0,
    "maxNotional": 1
  },
  "risk": { "maxLossBps": 0 },
  "execution": { "method": "LIMIT" },
  "version": 1,
  "maxUses": 1
}
```

The real compiler requires provenance, hashes, policy, chronology, symbol allowlisting, direction/side consistency, anchor state, and coherent expiry. It rejects `FLAT`/no-trade theses and unsupported authority fields. See `src/domain/index.ts` and `tests/domain.compiler.test.ts`.

## Test methodology

The public verification layers are:

1. deterministic unit tests for receipt validation, canonicalization, mandate compilation, state transitions, evaluator refusals, persistence, adapters, and order writing;
2. integration tests for product service, REST, MCP, SDK, SHADOW, PAPER refusal, workflow reads, and cross-surface equivalence;
3. UI contract tests for public routes, assets, hydration boundaries, and private-reasoning redaction;
4. local readiness/demo and secret-scan gates;
5. hosted read-only/front-door probes where the upstream is reachable.

Run locally:

```bash
npm ci
npm run judge:local
npm run web:check
npm run smoke:hosted
```

The current verified local run reports **557/557 tests passing** and **7/7 UI tests passing**. At the time of this document update, the hosted front door and hosted SDK/MCP smoke pass; hosted smoke is read-only/bounded and does not prove authenticated exchange state.

## Provider results

Local Ollama was reachable at the local OpenAI-compatible endpoint and the actual provider adapter path was exercised. Results are separated by correctness and budget:

- `llama3.2:1b`: structured role output valid; FAST failed at the 5s role budget in the cold/warm matrix; STANDARD cold role ~10.1s and warm role ~3.8s; DEEP passed. A warmed full three-role STANDARD workflow completed in ~11.3s with receipt and thesis. Classified `LOCAL_PROVIDER_PASS` for STANDARD when warmed, `FAST_PROFILE_FAIL` for the measured boundary, and `PERFORMANCE_PROFILE_DEPENDENT` overall.
- `llama3.2:3b`: FAST and STANDARD role budgets timed out in the measured run; DEEP produced valid structured role output in ~25.3s. Classified `DEEP_PROFILE_PASS`, `FAST_PROFILE_FAIL`, `STANDARD_PROFILE_FAIL` for that run.
- `qwen2.5-7b-4k:latest`: timed out under FAST, STANDARD, and DEEP in the measured adapter run. Classified `FAST_PROFILE_FAIL`, `STANDARD_PROFILE_FAIL`, `DEEP_PROFILE_FAIL` for that run.
- hosted provider-backed reasoning: `NOT_CONFIGURED`.

These are local-provider measurements, not hosted-provider proof. Latency is not authority: a successful provider artifact still must pass Council, receipt provenance, thesis compilation, mandate validity, freshness, and deterministic evaluation.

A real heterogeneous local consumer now completes with Advocate through the OpenAI-compatible Ollama adapter, Opposer through a separate HTTP worker process, Market Analyst through a separate MCP worker process, and Council through a separate HTTP Council worker. The workflow reached `COMPLETE`; its composition retained all four external adapter identities, the Council candidate passed canonical validation, and the receipt preserved the same workflow ID plus Council adapter provenance. This is `HETEROGENEOUS_FULL_COUNCIL_STACK_PASS` and local-provider evidence only.


A packed-package consumer installed the distributable package artifact into a clean temporary directory and used only the exported `0-infinity/product` entrypoint. With separate HTTP Advocate/Opposer/Council and MCP Market Analyst workers, it completed canonical Paper (`FILLED`, `noWrite: true`) and a high-edge-floor run reached evaluator refusal `EXECUTABLE_EDGE_TOO_LOW`, also with `noWrite: true`. This is `PACKED_PACKAGE_CONSUMER_PASS`, `BYO_TO_PAPER_PASS`, and `BYO_TO_REFUSAL_PASS`; registry publication remains pending npm authorization.

REST and MCP stack registration are now public configuration surfaces: `POST /v1/reasoning-stacks` and MCP `register_reasoning_stack` accept the validated `ReasoningStackConfig`, register a frozen stack identity, return sanitized composition, and reject credential-bearing fields. Provider keys remain a server-runtime concern.

The public Integrate surface now distinguishes the two directions: MCP/REST/SDK call 0-infinity, while RoleAdapters bring external intelligence into the reasoning stack. It names the implemented worker boundaries (`Builtin`, `OpenAI-compatible`, `HTTP Agent`, `MCP Worker`), maps Advocate/Opposer/Market Analyst/Council roles, and states that external adapters cannot create theses, mandates, intents, or receipts. The credential-free HTTP Agent/MCP Worker examples, real local OpenAI-compatible path, external Council candidate validation, and packed consumer path are tested separately; this is local/contract evidence, not a claim that every hosted provider is configured.

The fresh public-only judge initially identified two P1 comprehension gaps: Try did not immediately state that public modes are no-write, and Integrate depended on hydration for its first example while the external artifact envelope was not published normatively. The bounded remediation adds the no-financial-write copy to Try, a static MCP example to Integrate, the exact role-artifact envelope plus current configuration boundary to `docs/BRING_YOUR_OWN_AGENT.md`, and validated REST/MCP stack registration. No authority or credential-management feature was added.

The final bounded remediation places the four adapter families and the `RoleArtifact` identity fields directly in the static Integrate HTML; the focused UI test now checks those static labels. REST/MCP registration is now covered by the product access tests. No provider-specific or authority feature was added.

## Browser proof

A real Chromium/CDP journey on the public Pages surface passed: Landing → Demo → Integrate → Try; REST and SDK integration tabs rendered; Try selected BTCUSDT/LONG/SHADOW; clicking `Run SHADOW` reached `API · connected`, rendered `ACTUAL · COMPLETE`, and exposed returned structured artifact/receipt controls. The same result survived browser refresh through session-scoped restoration, and the mobile viewport had no horizontal overflow. The page stated that no exchange write occurred. No credential or financial-write path was used.
## System integration result

A fresh delegated agent run was blocked at the transport layer by a transient upstream `503`; Python `urllib` also received Cloudflare 1010 browser-signature blocking. Later Node/curl retries passed MCP initialization and bounded SDK/MCP smoke. This is an availability/client-variance limitation, not evidence of a protocol or authority regression.
The 10-round Node availability campaign returned 10/10 HTTP 200 for each of health, readiness, capabilities, MCP initialize, and MCP tools/list. This is bounded evidence, not an SLA. Northflank logs and direct probes showed the earlier 503s occurred at the private runtime process/deployment layer: Northflank reported deployment complete while the listener was intermittently refusing connections; one bounded service restart restored it.
- one workflow identity is preserved across service, REST, MCP, and SDK reads;
- SHADOW and PAPER capability responses agree across thin surfaces;
- refusal remains explicit and equivalent across surfaces;
- MCP initialization and explicit unknown-workflow errors work;
- reasoning failure does not mint a thesis, mandate, or paper receipt;
- typed local paper execution reaches the canonical mandate/runtime/evaluator/writer/reconciliation path when complete inputs are supplied;
- minimal public PAPER remains fail-closed when those inputs are absent.

The result is bounded local/public integration proof, not proof of authenticated Testnet, LIVE execution, profitability, or hosted provider-backed reasoning.

## Final external closeout matrix

| Capability | Status | Evidence / blocker |
|---|---|---|
| Core system | `PASS` | canonical local suite and hosted bounded surfaces |
| BYO intelligence | `PASS` | heterogeneous external Council and packed consumer |
| Advisory mode | `PASS` | service, REST, MCP, SDK return `ADVISORY` mandate with `noWrite: true` |
| Advisory mandate | `HOSTED_PROVEN` | public `POST /v1/advisory` returned `200`, `mode: ADVISORY`, `status: MANDATE_ISSUED`, `noWrite: true`; response included receipt, thesis, mandate, bounds, expiry, provenance |
| Portable mandate | `PASS` | public serializer/verifier and clean packed consumer readback |
| Enforced execution | `LOCALLY_PROVEN` | existing Paper/LocalReplay path; no authenticated venue connector |
| Agent session model | `CONTRACT_ONLY` | public bounded bearer-protected deployment; no short-lived scoped agent session exchange |
| VenueConnection | `CONTRACT_ONLY` | account/connector boundary is represented by existing policy/account inputs; no hosted venue connection is configured |
| Hosted remote BYO | `BLOCKED_EXTERNAL` | public `POST /v1/reasoning-stacks` returns `401 unauthorized` without deployment bearer authorization; no remote worker campaign was claimed |
| Hosted provider reasoning | `NOT_CONFIGURED` | hosted `/readiness` reports `providerBackedReasoning.configured: false` and Builtin adapter |
| Public npm distribution | `BLOCKED_AUTH` | package is public-ready and packable; `npm whoami` returns `ENEEDAUTH`, so no publication was attempted |
| Hosted resilience | `PASS` | 10 rounds × 5 endpoints = 50/50 HTTP 200, zero transport errors; bounded evidence, not an SLA |
| Binance public data | `PASS` | existing bounded public market evidence |
| Binance authenticated/Testnet | `CREDENTIAL_REQUIRED` | no dedicated Testnet credentials present in runtime; no authenticated request attempted |
| LIVE | `NOT_AUTHORIZED` | intentionally locked |

The hosted remote BYO, hosted provider, npm publication, and Binance Testnet statuses are external blockers, not fabricated passes. The package is prepared for publication with license metadata, public exports, declaration files, and a clean packed-consumer path.

## Evidence boundary

This public proof summary intentionally excludes private implementation ledgers, detailed experiments, agent transcripts, submission drafts, video scripts, operational secrets, and historical internal receipts. Those remain outside the public repository.
