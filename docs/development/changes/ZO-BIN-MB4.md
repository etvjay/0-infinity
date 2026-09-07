# ZO-BIN-MB4 — Bounded Deterministic Local Evidence Council

## status

`IMPLEMENTED / LOCAL_PASS`

## baseline and scope

- baseline: `f23ecca829f2af43bc74ddf92e3559498eaa0d8c`
- depends_on: `M-B1` immutable `TradeThesis`; `M-B3` `ExecutionEconomicsResult` as supplied evidence only
- scope: pure local council over explicit advocate, opposing, market/account, and policy inputs; fail-closed shape/freshness/trust/threshold checks; deterministic thesis or typed refusal
- evidence ceiling: `LOCAL_PASS` only; no live or production claim

## implementation

- `src/reasoning/index.ts` exports immutable input types, `conveneEvidenceCouncil`, `CouncilResult`, and typed refusal codes.
- Canonical own-enumerable string-key validation rejects missing, stale, contradictory, malformed, inherited, hidden, symbol-keyed, and unsupported fields.
- Output preserves supplied references/hashes in `TradeThesis.reasoning`, freezes the returned tree, and uses explicit stable identifiers or deterministic SHA-256 identifiers.
- The council does not create, consume, issue, or compile any authority object. M-B3 economics is never computed; a supplied economics refusal rejects the council.

## TDD and verification receipts

- RED: `npm run build` failed before the reasoning module existed with missing `../src/reasoning/index.js`.
- GREEN: focused `node --test dist/tests/reasoning.council.test.js` — `5/5 PASS`.
- Full `npm test` — `375/375 PASS`; `npm run check`, `npm run build`, and `git diff --check` — PASS.
- Coverage includes agreement/contradiction, trust/economics refusal, stale evidence, thresholds, deterministic replay, immutability, prototype pollution boundaries, exact provenance, and no-authority boundary.

## exclusions and unresolved evidence

No network, credentials, MCP, exchange reads/writes, mandate compilation, authority store operations, live freshness, production durability, or profitability claim.
