# Whole-System Integration Gaps

**Audit target:** 0-Infinity whole-system coherence across Web Demo/Try/Integrate, REST, MCP, SDK, adapters, reasoning, authority, state, evaluator, economics, paper/testnet/live boundaries.

**Audited implementation:** `b72fac2` (product persistence/readback remediation; final documentation revision is recorded by Git).

## Evidence and verification

Read-only audit commands completed:

- `npm test`: **540/540 pass**; build passed.
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
| G-002 | P1 | Product service -> evidence lineage | `src/product/service.ts`; `src/reasoning/receipt.ts` | Product publication verifies the receipt against the thesis and exposes the verified receipt on the workflow read model. | **remediated; no unverified receipt is published** |
| G-003 | P1 | Product service state/error semantics | `src/product/service.ts`; `src/product/types.ts`; `src/runtime/supervisor.ts` | Product workflow status remains reasoning-level (`CREATED/COMPLETE/REASONING_INCOMPLETE/REFUSE`), while `execution` on a paper workflow exposes the canonical mandate, authority status, runtime state/history, evaluator outcome, order receipt, and reconciliation outcome. | **remediated for typed local Paper readback; live/testnet state remains unclaimed** |
| G-004 | P1 | Persistence / restart | `src/product/service.ts`; `src/product/persistence.ts`; `tests/product-access.remediation.test.ts` | Product access uses memory persistence by default and an explicitly configured atomic JSON projection store; restart/readback and corrupt-record rejection are covered locally. Hosted durability/HA remains unclaimed. | **remediated locally; hosted durability external/unclaimed** |
| G-005 | P1 | Market/account state | `src/product/service.ts`; `tests/product-service.execution.integration.test.ts` | Explicit typed Paper inputs now produce evaluator-compatible market/account envelopes. Native market/account adapters are still not the product server’s authoritative source plane; Agentic MCP remains auth-blocked. | **typed local integration; external state-plane composition unproven** |
| G-006 | P2 | Economics | `src/evaluator/index.ts`; `src/economics/*` | Typed Paper evaluation carries spread, slippage, fee, funding, edge, risk, and exposure checks through the evaluator. The separate economics package remains a lower-level tested module rather than a product read-model artifact. | **bounded evaluator path composed; presentation gap remains** |
| G-007 | P2 | Exchange execution | `src/execution/index.ts`; `src/product/service.ts` | Typed Paper uses canonical `OrderWriter` and reconciliation with a no-write local replay adapter. Testnet/live remain denied. | **remediated for local Paper; external exchange path blocked by policy/credentials** |
| G-008 | P2 | Adapter independence/configuration | `src/product/service.ts`; `src/product/adapters.ts` | External provider selection remains server-side and evidence-tier-limited, but provider payload timestamps now use the injected service clock. Hosted provider inference remains unproven. | **clock continuity remediated; hosted provider evidence blocked external** |
| G-009 | P2 | REST/MCP contract | `src/product/http.ts`; `src/product/mcp.ts`; `tests/whole-system.integration.test.ts` | Existing workflow reads return the same bounded projection through REST, MCP, and SDK; typed Paper execution includes canonical mandate/runtime/evaluator/order/reconciliation artifacts. | **remediated for local Paper readback; no new write surface added** |
| G-010 | P1 | SDK/package boundary | `package.json:6-7`; `src/product/sdk.ts`; `tests/whole-system.integration.test.ts` | SDK workflow reads are equivalent to REST and MCP and carry the bounded canonical Paper projection; internal modules remain intentionally non-exported implementation details rather than speculative package primitives. | **remediated for existing product workflow surface** |
| G-011 | P1 | Static Demo evidence | `web/app/demo/index.html:45-53`; `docs/development/evidence/ZO-BIN-MB8-reasoning-refuse.json` | Demo is intentionally static/read-only and cites an accepted refusal fixture, while Try is live REST. This is a valid separation, but the Demo cannot demonstrate one connected canonical workflow; its refusal is a fixture, not a runtime readback. The page must remain labeled as such to avoid conflating the two surfaces. | **UI-only evidence; not an implementation defect, release evidence ceiling** |
| G-012 | P2 | UI/docs configuration drift | `web/app.js:3-5`; `docs/WEB_UI.md:19-25` | Documentation now states that Pages defaults to the configured hosted runtime and that local REST/UI parity requires an explicit `window.__ZERO_INFINITY_CONFIG__` override. | **remediated** |
| G-013 | P1 | Readiness/evidence ledger | `src/product/service.ts`; `docs/development/IMPLEMENTATION_LEDGER.md`; `docs/canonical/GROUND_TRUTH.md` | Product readiness remains bounded-local with `hostedEvidence:false` and `liveWrites:false`; local Paper workflow readback now exposes the verified canonical artifacts. The ledgers must distinguish local/replay implementation from external Binance evidence. | **documentation/evidence tier boundary; no live claim** |
| G-014 | P1 | Binance source truth | `src/binance/skills.ts:82-108`; `src/binance/agenticMcp.ts:100-114`; `docs/canonical/BINANCE_SOURCE_TRUTH.md:67-85` | Native public market/stream, authenticated account, Agentic MCP, and Skills Hub are separate source surfaces. Only Skills Hub can be injected into reasoning, and Agentic MCP is auth-blocked; no native state adapter is composed into `RuntimeSupervisor`/evaluator in the product server. | **partial/injected/blocked; no authoritative state-plane composition** |

## Plane audit

| Plane | Actual connected path | Missing or unproven |
|---|---|---|
| Identity | Workflow IDs generated in service; typed Paper projection carries mandate, client order, order, and receipt lineage | Native exchange identity and live account attribution remain unclaimed |
| Hash/provenance | Role artifact hashes, verified service receipt, thesis receipt hash, and mandate provenance validators are exposed in the product workflow | External provider/Testnet/live receipt lineage remains unproven |
| State | Product status plus paper execution projection and persisted workflow projection | Product reasoning status remains separate from canonical runtime status; live/testnet state is not claimed |
| Error/refusal | Service catches role/Council failures; Paper execution publishes evaluator result/refusal code and runtime transitions | External provider/auth failures remain bounded and explicit |
| Transport | REST, MCP JSON-RPC, SDK, static UI Try | No separate internal-authority package exports; bounded product surface is intentional |
| Configuration | Env-selected OpenAI-compatible adapter; UI API base | Adapter tier not surfaced as hosted provider evidence; injected ≠ external live |
| Binance | Skills artifact injection; Agentic MCP adapter; account/market modules | No native authenticated state-to-evaluator-to-writer composition; external auth/read blocked |
| Persistence | Product projection persistence is memory by default and JSON-file when explicitly configured; canonical Paper projection is read back after restart | Hosted durability/HA remains unclaimed |
| UI | Demo fixture, Integrate examples, Try REST calls | Demo cannot prove live connected graph; Integrate lists bounded product surface |

## Acceptance boundary

The repository is locally healthy and intentionally no-write at the hosted product boundary. Reasoning/product access and the typed local Paper path are composed through REST/MCP/SDK workflow reads; external Binance/Testnet/live evidence and hosted durability remain outside the verified boundary.

No runtime or UI files were modified by this remediation; product access and documentation were updated only.
