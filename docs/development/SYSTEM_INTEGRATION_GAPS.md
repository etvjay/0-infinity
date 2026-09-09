# Whole-System Integration Gaps

**Audit target:** 0-Infinity whole-system coherence across Web Demo/Try/Integrate, REST, MCP, SDK, adapters, reasoning, authority, state, evaluator, economics, paper/testnet/live boundaries.

**Audited head:** `d26e95ea149421f3b0dddea4b1a70c06d2fbf915` (implementation release; evidence revision is recorded separately).

## Evidence and verification

Read-only audit commands completed:

- `npm test`: **530/530 pass**; build passed.
- `npm run web:check`: **5/5 pass**; build passed.
- `npm run readiness:validate`: `{"valid":true,"status":"READINESS_PREPARED","liveWriteStatus":"DISABLED"}`.
- `git diff --check`: pass.

These results prove the tested slices only. They do not prove that separately tested modules are composed into the product service, nor live/testnet authority.

## Severity rules

- **P0:** product-facing behavior can violate the canonical authority/provenance boundary, or a claimed canonical path is not actually connected.
- **P1:** major whole-system capability, persistence, evidence, transport, or documentation gap that blocks coherent release claims but is fail-closed/no-write today.

## Gap matrix

| ID | Priority | Plane / boundary | Evidence of actual behavior | Gap / impact | Classification |
|---|---|---|---|---|---|
| G-001 | P2 | Product service -> authority | `src/product/service.ts`; `tests/product-service.execution.integration.test.ts` | The explicit `paperExecution` envelope now composes `TradeThesis -> compileMandate -> MandateStore -> RuntimeSupervisor -> evaluateMandate -> OrderWriter -> reconciliation`, while minimal opportunities refuse without synthetic authority. | **remediated; typed local Paper path is END_TO_END_PASS** |
| G-002 | P1 | Product service -> evidence lineage | `src/product/service.ts:20-21`; `src/reasoning/index.ts:160-165` | The Council and service still construct separate receipt objects. The product boundary does not yet verify/reconcile the Council-produced receipt/hash against the stored thesis and public receipt. | **boundary verification missing** |
| G-003 | P1 | Product service state/error semantics | `src/product/service.ts`; `src/product/types.ts`; `src/runtime/supervisor.ts` | Product workflows use `CREATED/COMPLETE/REASONING_INCOMPLETE/REFUSE`, while the canonical runtime has 14 states. `COMPLETE` means reasoning completion only; this is now documented as distinct from mandate/order completion, but the public product read model does not yet expose the canonical runtime chain. | **inconsistent read model; no authority violation after G-001 remediation** |
| G-004 | P1 | Persistence / restart | `src/product/service.ts:14`; `src/runtime/supervisor.ts:17-26`; `src/store/index.ts:106-152` | REST/MCP/SDK service maps are process-local and no product server wiring uses `MemoryWorkflowPersistence`, `JsonFilePersistence`, `MandateStore`, or runtime persistence. Restart loses workflow, thesis, and receipt lookup state. The separately implemented file persistence is explicitly local X2 and not connected to product access. | **backend-only implementation disconnected from hosted surface** |
| G-005 | P1 | Market/account state | `src/product/service.ts`; `tests/product-service.execution.integration.test.ts` | Explicit typed Paper inputs now produce evaluator-compatible market/account envelopes. Native market/account adapters are still not the product server’s authoritative source plane; Agentic MCP remains auth-blocked. | **typed local integration; external state-plane composition unproven** |
| G-006 | P2 | Economics | `src/evaluator/index.ts`; `src/economics/*` | Typed Paper evaluation carries spread, slippage, fee, funding, edge, risk, and exposure checks through the evaluator. The separate economics package remains a lower-level tested module rather than a product read-model artifact. | **bounded evaluator path composed; presentation gap remains** |
| G-007 | P2 | Exchange execution | `src/execution/index.ts`; `src/product/service.ts` | Typed Paper uses canonical `OrderWriter` and reconciliation with a no-write local replay adapter. Testnet/live remain denied. | **remediated for local Paper; external exchange path blocked by policy/credentials** |
| G-008 | P2 | Adapter independence/configuration | `src/product/service.ts`; `src/product/adapters.ts` | External provider selection remains server-side and evidence-tier-limited, but provider payload timestamps now use the injected service clock. Hosted provider inference remains unproven. | **clock continuity remediated; hosted provider evidence blocked external** |
| G-009 | P2 | REST/MCP contract | `src/product/http.ts`; `src/product/mcp.ts`; `tests/whole-system.integration.test.ts` | MCP now rejects missing workflow identifiers instead of coercing `undefined`; REST/MCP still expose the bounded product graph rather than every internal runtime object. | **identifier validation remediated; broader read-model gap remains** |
| G-010 | P1 | SDK/package boundary | `package.json:6-7`; `tsconfig.json:12`; `src/product/sdk.ts:1-7` | The package exports only `./sdk`; domain/compiler, evaluator, runtime, store, economics, Binance adapters, and canonical OrderWriter are not package exports. The SDK can drive only product convenience endpoints, so an integrator cannot reach the canonical authority graph through the declared package surface. | **backend/API surface incomplete** |
| G-011 | P1 | Static Demo evidence | `web/app/demo/index.html:45-53`; `docs/development/evidence/ZO-BIN-MB8-reasoning-refuse.json` | Demo is intentionally static/read-only and cites an accepted refusal fixture, while Try is live REST. This is a valid separation, but the Demo cannot demonstrate one connected canonical workflow; its refusal is a fixture, not a runtime readback. The page must remain labeled as such to avoid conflating the two surfaces. | **UI-only evidence; not an implementation defect, release evidence ceiling** |
| G-012 | P2 | UI/docs configuration drift | `web/app.js:3-5`; `docs/WEB_UI.md:19-25` | Documentation now states that Pages defaults to the configured hosted runtime and that local REST/UI parity requires an explicit `window.__ZERO_INFINITY_CONFIG__` override. | **remediated** |
| G-013 | P1 | Readiness/evidence ledger | `src/product/service.ts:25-26`; `docs/development/IMPLEMENTATION_LEDGER.md:7-13`; `docs/canonical/GROUND_TRUTH.md:51-58`; `docs/development/evidence/ZO-BIN-MB8-api-mcp-sdk-hosted.json:2-4` | Hosted readiness returns `ready:true`, but explicitly `hostedEvidence:false` and `liveWrites:false`; ledger says M-B8 NOT STARTED while MB8 hosted/read-only evidence files exist. Ground Truth still labels OrderWriter “NOT IMPLEMENTED / UNVERIFIED” despite source/tests implementing local/replay behavior. The claims are individually conservative but stale/incoherent across documents. | **documentation drift; evidence tier mismatch** |
| G-014 | P1 | Binance source truth | `src/binance/skills.ts:82-108`; `src/binance/agenticMcp.ts:100-114`; `docs/canonical/BINANCE_SOURCE_TRUTH.md:67-85` | Native public market/stream, authenticated account, Agentic MCP, and Skills Hub are separate source surfaces. Only Skills Hub can be injected into reasoning, and Agentic MCP is auth-blocked; no native state adapter is composed into `RuntimeSupervisor`/evaluator in the product server. | **partial/injected/blocked; no authoritative state-plane composition** |

## Plane audit

| Plane | Actual connected path | Missing or unproven |
|---|---|---|
| Identity | Workflow IDs generated in service; deterministic writer IDs only in isolated OrderWriter | One end-to-end workflow → thesis → mandate → clientOrderId lineage through product API |
| Hash/provenance | Role artifact hashes, Council receipt, service receipt, mandate provenance validators exist | Product boundary does not verify/reconcile all hashes; duplicate receipt constructors |
| State | Product status plus isolated runtime state machine | Product status is not canonical 14-state runtime; no durable product state |
| Error/refusal | Service catches role/Council failures; evaluator returns structured refusals in isolation | Product does not expose evaluator refusal codes or coherent runtime transitions |
| Transport | REST, MCP JSON-RPC, SDK, static UI Try | No canonical runtime/evaluation/order routes; MCP missing-field validation weak |
| Configuration | Env-selected OpenAI-compatible adapter; UI API base | Adapter tier not surfaced; UI docs/default disagree; injected ≠ external live |
| Binance | Skills artifact injection; Agentic MCP adapter; account/market modules | No native authenticated state-to-evaluator-to-writer composition; external auth/read blocked |
| Persistence | Local Memory/JSON/file and workflow CAS implementations | Product server uses in-memory maps; restart/readback durability absent |
| UI | Demo fixture, Integrate examples, Try REST calls | Demo cannot prove live connected graph; Integrate lists only convenience surface |

## Acceptance boundary

The repository is locally healthy and intentionally no-write at the hosted product boundary. The authoritative implementation graph is **not yet whole-system coherent**: reasoning/product access is composed, while mandate compilation, evaluator, runtime supervisor, canonical OrderWriter, and durable authority persistence remain separately implemented and test-verified but disconnected from REST/MCP/SDK and Try.

No runtime or UI files were modified by this audit.
