# ZO-BIN-MB4 — Bounded Deterministic Local Evidence Council

## status

`LOCAL_PASS`

- This is a local evidence ceiling only and is not live, production, execution, or profitability evidence.

## baseline and scope

- baseline: `f23ecca829f2af43bc74ddf92e3559498eaa0d8c`
- depends_on: `M-B1` immutable `TradeThesis`; `M-B3` `ExecutionEconomicsResult` as supplied evidence only
- scope: pure local council over explicit advocate, opposing, market/account, and policy inputs; fail-closed shape/freshness/trust/threshold checks; deterministic thesis or typed refusal
- evidence ceiling: `LOCAL_PASS` only; no live or production claim

## implementation

- `src/reasoning/index.ts` exports immutable input types, `conveneEvidenceCouncil`, `CouncilResult`, and typed refusal codes.
- `src/reasoning/handoff.ts` adds a pure local/replay handoff: default `PROPOSAL`/`REFUSAL`, explicit `APPROVAL_REQUIRED` then `MANDATE_COMPILED`, and separate `EVALUATED_INTENT`/refusal boundary.
- Caller-supplied compiler policy, anchor/time, replay market/account envelopes, and bound frozen M-B3 economics are revalidated; no authority is issued or consumed by council output.
- Canonical own-data string-key validation now inspects the complete prototype chain, including `Object.prototype`, and rejects unsupported own/inherited enumerable, non-enumerable, and symbol keys.
- Optional `thesisId` and `thesisHash` are accepted only as non-empty strings; all evidence timestamps are finite, non-negative, chronological, and fresh.
- Supplied economics is accepted only as the canonical deeply frozen `ASSESSMENT` shape (including frozen fills); unsupported or mutable economics refuses. `REFUSAL` economics remains an explicit council refusal.

## TDD and verification receipts

- RED: newly added economics fills regressions initially failed before remediation (sparse and non-enumerable numeric array entries were accepted); existing prototype-pollution regressions remained covered.
- GREEN: focused economics `15/15 PASS`; focused reasoning council `12/12 PASS`.
- Full `npm test` — `385/385 PASS`; `npm run check`, `npm run build`, and `git diff --check` — PASS.
- Candidate: `e883dabc6b07ca7fde6ba1c47fc8a8dc7af86137`; independent review found no implementation blockers, but receipt-only reconciliation remains pending.

## exclusions and unresolved evidence

No network, credentials, MCP, exchange reads/writes, mandate compilation, authority store operations, live freshness, production durability, or profitability claim.
