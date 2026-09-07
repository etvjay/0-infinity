# ZO-BIN-MB4 — Bounded Deterministic Local Evidence Council

## status

`PROVISIONAL_LOCAL_PASS`

- This is a local evidence ceiling only and is not live, production, execution, or profitability evidence.

## baseline and scope

- baseline: `f23ecca829f2af43bc74ddf92e3559498eaa0d8c`
- depends_on: `M-B1` immutable `TradeThesis`; `M-B3` `ExecutionEconomicsResult` as supplied evidence only
- scope: pure local council over explicit advocate, opposing, market/account, and policy inputs; fail-closed shape/freshness/trust/threshold checks; deterministic thesis or typed refusal
- evidence ceiling: `LOCAL_PASS` only; no live or production claim

## implementation

- `src/reasoning/index.ts` exports immutable input types, `conveneEvidenceCouncil`, `CouncilResult`, and typed refusal codes.
- `src/reasoning/handoff.ts` adds a pure local/replay handoff: default `PROPOSAL`/`REFUSAL`, explicit `APPROVAL_REQUIRED` then `MANDATE_COMPILED`, and separate `EVALUATED_INTENT`/refusal boundary.
- Caller-supplied compiler policy, anchor/time, replay market/account envelopes, and bound frozen M-B3 economics are revalidated; economics requires explicit `LOCAL`/`REPLAY` provenance plus a frozen `SYNCED`/trusted order-book assertion; no authority is issued or consumed by council output.
- Canonical own-data string-key validation now inspects the complete prototype chain, including `Object.prototype`, and rejects unsupported own/inherited enumerable, non-enumerable, and symbol keys.
- Optional `thesisId` and `thesisHash` are accepted only as non-empty strings; all evidence timestamps are finite, non-negative, chronological, and fresh.
- Supplied economics is accepted only as the canonical deeply frozen `ASSESSMENT` shape (including exact decimal fields and dense frozen fills); unsupported or mutable economics refuses. Approval is accepted only when `request.approve === true`; compile request/policy/anchor shapes are validated before compilation.

## TDD and verification receipts

- RED: four new handoff regressions failed before remediation: valid substituted policy/anchor compiled, `approve: 1` became `APPROVAL_REQUIRED`, frozen economics with mutable nested order book was accepted, and hidden numeric `allowedSymbols` entries were accepted.
- GREEN: focused handoff `15/15 PASS`; focused economics `15/15 PASS`; focused reasoning `12/12 PASS`.
- RED: replacing the explicit canonical Array.prototype allowlist with an unconditional acceptance mutant made both fresh-process pollution regressions fail (`PROPOSAL` instead of `REFUSAL`); restored implementation passes.
- Full `npm test` — `400/400 PASS`; `npm run check`, `npm run build`, and `git diff --check` — PASS.
- Candidate code head: remediation commit pending; exact-head independent review remains pending.

## exclusions and unresolved evidence

No network, credentials, MCP, exchange reads/writes, mandate compilation, authority store operations, live freshness, production durability, or profitability claim.
