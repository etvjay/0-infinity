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

The current verified local run reports **548/548 tests passing** and **5/5 UI tests passing**. At the time of this document update, the hosted front door and hosted SDK/MCP smoke pass; hosted smoke is read-only/bounded and does not prove authenticated exchange state.

## Provider results

Local Ollama was reachable at the local OpenAI-compatible endpoint and the actual provider adapter path was exercised. Results are separated by correctness and budget:

- `llama3.2:1b`: structured role output valid; warm end-to-end three-role flow completed under FAST (~8.7s), STANDARD (~8.5s), and DEEP (~8.6s) in the measured run. Classified `LOCAL_PROVIDER_PASS` for that run.
- `llama3.2:3b`: FAST and STANDARD role budgets timed out in the measured run; DEEP produced valid structured role output in ~25.3s. Classified `DEEP_PROFILE_PASS`, `FAST_PROFILE_FAIL`, `STANDARD_PROFILE_FAIL` for that run.
- `qwen2.5-7b-4k:latest`: timed out under FAST, STANDARD, and DEEP in the measured adapter run. Classified `FAST_PROFILE_FAIL`, `STANDARD_PROFILE_FAIL`, `DEEP_PROFILE_FAIL` for that run.
- hosted provider-backed reasoning: `NOT_CONFIGURED`.

These are local-provider measurements, not hosted-provider proof. Latency is not authority: a successful provider artifact still must pass Council, receipt provenance, thesis compilation, mandate validity, freshness, and deterministic evaluation.

## Browser proof

A real Chromium/CDP journey on the public Pages surface passed: Landing → Demo → Integrate → Try; REST and SDK integration tabs rendered; Try selected BTCUSDT/LONG/SHADOW; clicking `Run SHADOW` reached `API · connected`, rendered `ACTUAL · COMPLETE`, and exposed returned structured artifact/receipt controls. The page stated that no exchange write occurred. No credential or financial-write path was used.
## System integration result

The local flagship integration tests currently prove that:

- one workflow identity is preserved across service, REST, MCP, and SDK reads;
- SHADOW and PAPER capability responses agree across thin surfaces;
- refusal remains explicit and equivalent across surfaces;
- MCP initialization and explicit unknown-workflow errors work;
- reasoning failure does not mint a thesis, mandate, or paper receipt;
- typed local paper execution reaches the canonical mandate/runtime/evaluator/writer/reconciliation path when complete inputs are supplied;
- minimal public PAPER remains fail-closed when those inputs are absent.

The result is bounded local/public integration proof, not proof of authenticated Testnet, LIVE execution, profitability, or hosted provider-backed reasoning.

## Evidence boundary

This public proof summary intentionally excludes private implementation ledgers, detailed experiments, agent transcripts, submission drafts, video scripts, operational secrets, and historical internal receipts. Those remain outside the public repository.
