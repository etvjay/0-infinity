# ZO-BIN-MB1-E — Integrated Adversarial Test Harness

## Status

`IMPLEMENTED / INTEGRATED / LOCAL_PASS` — historical candidate review APPROVE on exact candidate `1d6cb0e`; integrated into canonical main as commits `69d31b2` and `bea62e4` (final integration HEAD `bea62e4`). The historical candidate review is resolved; the current kernel review remains pending independent review.

- Baseline: `4bbf63db8fde5a61ceb4ed5884392581909292c4` (`docs: record integrated M-B1-D local pass`).
- Remediation base: `429d8f47e3f6000e2f2d3dea310ede67031a2ea3` (`test: add integrated M-B1-E adversarial harness`).
- Scope: tests and this change record only; no production source, network, credentials, Binance, deployment, push, or Ground Truth changes.
- Changed: `tests/integrated.adversarial.test.ts` and this record.

## Prior review findings and corrections

The independent E review returned `APPROVE_WITH_REQUIRED_FOLLOWUPS` with `safe_to_integrate: false` for harness issues only, not a production defect:

1. Binding swaps and malformed cases used mutable top-level spreads. Evaluator frozen-tree validation short-circuited before field-specific validation. The harness now uses `altered()`, which structured-clones, applies the mutation, and deeply freezes the complete altered object before evaluation.
2. Freshness cases coupled `observedAt` and `receivedAt`. Market and account observedAt and receivedAt boundaries are now four independent loops; the other timestamp is held fixed and valid, with `receivedAt >= observedAt` maintained for valid cases.
3. The spread loop varied a local number but never compiled or evaluated mandates with the candidate `maxSpreadBps`. It now compiles below/equal/above mandates against the computed midpoint spread and distinguishes `COST_CEILING` from deliberately inconsistent quote data (`STATE_BINDING`).
4. The JSON lock test only installed an ambiguous lock; it did not exercise an active timeout or replacement-lock protection. It now holds a real active transaction for bounded contention, waits for `owner.json` with deterministic 1ms polling capped at 100 attempts, and fails with an explicit assertion if acquisition is not observed. The replacement-lock path now reads the exact replacement `owner.json` and deep-asserts both token and status remain unchanged after the original lease attempts release.
5. The subprocess test threw inside a callback whose `finally` released the lock, so it was not crash evidence. It now runs a child process that fails with status 17 after leaving an active lock, then asserts lock retention and fail-closed `LOCK_CONTENTION`.
6. The UNKNOWN test only checked direct transition terminality. It now passes the terminal UNKNOWN runtime to `evaluateMandate` and asserts structured `RUNTIME_NOT_EXECUTABLE`, while retaining the direct `TERMINAL_NO_OUTGOING` assertion.

The follow-up review specifically required two further harness corrections: (a) replace the unbounded `setImmediate` owner-file wait with bounded deterministic polling and an explicit acquisition assertion; and (b) replace the replacement-lock status-only check with an exact `owner.json` deep assertion covering the replacement payload/token. Both are implemented here.

## Coverage and evidence

There are 10 focused E subtests, preserving all prior E areas: strict expiry/non-rearm; authority and live-state bindings; deeply frozen malformed/non-finite inputs; independent freshness and version boundaries; midpoint spread, BUY/SELL symmetry, cost, edge, risk, and exposure limits; store idempotency/conflict/serialization; supersede/revoke/terminal history; ambiguous, active-contention, and replacement-lock filesystem behavior; child-process failure/lock retention plus separate durable reload; frozen deterministic outputs; and terminal UNKNOWN refusal.

TDD evidence: the remediation assertion was first run RED at 9/10: the replacement payload deep assertion correctly rejected the intentionally mismatched expected status (`REPLACED` vs actual `ACTIVE`). After correcting the expected replacement payload, the focused run was GREEN at 10/10.

- Focused GREEN: `npm run build && node --test dist/tests/integrated.adversarial.test.js` — 10/10 passing.
- Focused repeat: the same build and test command repeated 3 times — 10/10 passing each run (30/30 subtests).
- Full: `npm run check` — passed (`tsc -p tsconfig.json --noEmit`).
- Full: `npm test` — 290/290 passing, including 10 E tests.
- Full: `npm run build` — passed (`tsc -p tsconfig.json`).
- Hygiene: `git diff --check` — passed with no output.

Evidence ceiling is `LOCAL_PASS`. Current integrated verification at canonical HEAD `535a967d8d1a109a92bcf58f2174616137205284` is `npm test` — 294/294, focused evaluator — 29/29, and integrated E — 10/10; current kernel review remains pending. This record does not claim full M-B1 promotion, live execution, external integration evidence, or a general crash-recovery protocol. The child-process scenario uses deterministic nonzero `process.exit(17)` after creating an active lock rather than SIGKILL: a safe deterministic kill point would require timing/synchronization machinery that could make this bounded harness flaky. It proves child failure plus lock retention and fail-closed refusal only; it does not prove recovery or orphan reclamation. Ambiguous locks are never deleted or reclaimed by the harness.

## Findings / risks

No production defect was isolated. Filesystem contention assertions use bounded waits and real lock files; they do not use wall-clock time for domain/evaluator boundaries. The replacement-lock test intentionally leaves the replacement active until test-directory cleanup, and verifies the original lease cannot release it. JSON persistence remains a local X2 adapter with no crash-recovery claim.

## Open questions

- What durable recovery protocol, if any, should a later milestone own for a process that fails while holding a JSON lock?
- Should runtime transition timestamps be required to be monotonic? The current canonical C contract explicitly leaves this unimplemented and flagged.
- Is a deterministic SIGKILL harness worth owning in a later milestone, with an explicit synchronization protocol and separate flake budget?
