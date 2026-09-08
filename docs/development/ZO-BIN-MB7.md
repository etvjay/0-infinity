# ZO-BIN-MB7 deterministic SHADOW campaign

Status: `SHADOW_PASS` — independently approved deterministic local replay evidence; no live or production claim.

- Campaign: `ZO-BIN-MB7-SHADOW-DETERMINISTIC-V1`
- Mode: `SHADOW`
- Workflows: 20; exact required scenario set exercised once
- Artifact: `docs/development/evidence/ZO-BIN-MB7-shadow-campaign.json`
- Artifact payload SHA-256 (`artifactPayloadSha256`): `905566e0c9834efc0016f05f2239e8a3b625bff75e0f5541a41f5af81206f75b`
- Runner implementation SHA (`runnerImplementationSha`): `9c6357f1f71eb9e9c11540930a7605cfff6aeed2`
- Validator implementation SHA (`validatorImplementationSha`): `473dea420b38d4f192dadec8723538f05ed090e5`
- Reviewed integration/docs tree: `d3b78f2f29235baf2970436ef90f867a4a83a757`
- Independent exact-head review: `APPROVE`; `safe_to_integrate: true`
- Outcomes: 4 ACKNOWLEDGED, 1 PARTIALLY_FILLED, 2 FILLED, 1 FAILED/REJECTED, 1 UNKNOWN, 9 REFUSED, 1 EXPIRED, 1 RECOVERY_BLOCKED
- Metrics: approvals 7; mandates 19; council refusals 1; recovered 1; not exercised 0; deterministic runs 2
- Critical invariant counters: duplicate economic consequences 0; illegal state regressions 0; contradictory executions permitted 0; cross-symbol contamination 0; blind retries 0; post-ambiguity authority minting 0

The council-refusal receipt is a real `conveneEvidenceCouncil` refusal with code `THRESHOLD_NOT_MET`; evaluator edge collapse is recorded separately as its own evaluator refusal. Expiry uses the runtime transition API and accepts only the exact `EXPIRED`/`MANDATE_EXPIRED` outcome. Order-absent recovery uses a fresh empty `MemoryOrderPersistence`/`MemoryWorkflowPersistence` boundary and records the actual `RECOVERY_BLOCKED: workflow is not persisted` error.

The validator binds runner and validator provenance separately, rejects environment SHA overrides, requires one-to-one workflow/receipt lineage, exact scenario semantics, recomputed metrics, zero critical invariant counters, deterministic replay digest, `artifactPayloadSha256` (payload digest excluding its own field), and no unsupported fields. Mutation tests rehash-independent semantic copies and remain rejected.

Evidence ceiling: deterministic local replay only using injected clocks, council/compiler APIs, `RuntimeSupervisor` in explicit SHADOW mode, `MemoryPersistence`, `MemoryOrderPersistence`, and replay fixtures. No live market/account truth, exchange execution, credentials, wallet/funds behavior, or M-B2-G recovery is proven. M-B2-G remains `BLOCKED_EXTERNAL`.

No claim is made for live/testnet execution, production durability, crash recovery, exactly-once exchange behavior, or profitability.
