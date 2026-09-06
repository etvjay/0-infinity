# ZO-BIN-MB1-B — Mandate Store + Atomic Consumption

## change_id

`ZO-BIN-MB1-B`

## objective

Implement persistent mandate authority state with one active mandate per canonical execution scope, immutable historical versions, atomic supersession, and single-use consume-before-submission semantics. No Binance order sending.

## baseline

`401eea8` initially; implementation must rebase/start from the reviewed A integration baseline before coding B.

## canonical_component

Mandate authority/persistence boundary between immutable domain mandates and later execution submission.

## status

`PROPOSED` — blocked until M-B1-A domain interfaces are reviewed and integrated.

## dependencies

- M-B1-A reviewed and integrated domain types.
- M-B1-C runtime state vocabulary; no parallel state machine.
- No Binance API behavior or live credentials.

## invariants

- `INV-M01` — stored mandates are immutable.
- `INV-M04` — MVP mandate is single-use.
- `INV-M05` — superseded/expired/revoked/used mandates cannot execute.
- `INV-E02` — mandate is consumed before outbound I/O.
- `INV-E04` — unknown submission cannot trigger blind retry.
- `INV-D02` — implementation does not promote Ground Truth.

## allowed_files

- `src/store/**`
- `tests/store/**`
- `tests/store*.test.ts`
- `docs/development/changes/ZO-BIN-MB1-B.md`

## forbidden_files

- `src/runtime/**` (M-B1-C is frozen)
- `src/domain/**` except type-only imports after A integration
- evaluator, Binance/network/model, OrderWriter, live adapters
- live credentials, deployment, push, and Ground Truth status claims

## interfaces

```ts
interface MandateStore {
  issue(mandate: ExecutionMandate): Promise<void>;
  getActive(key: AuthorityKey): ExecutionMandate | null;
  supersede(oldMandateId: string, replacement: ExecutionMandate): Promise<void>;
  consumeForSubmission(mandateId: string, clientOrderId: string): Promise<void>;
}
```

The implementation must provide a durable boundary for the persisted authority record, consumed marker, deterministic client order identity, and `SUBMITTING` runtime state. A successful consume operation must atomically prevent reuse and survive reload. Crash simulation must not claim outbound exchange effects.

## tests_required

- One active mandate per canonical scope.
- Immutable historical versions.
- Atomic supersession and active selection.
- Durable reload preserving consumed/superseded/expired state.
- Consume-before-submission record contains deterministic client identity and `SUBMITTING` state.

## negative_tests_required

- Two consumers racing for one mandate.
- Duplicate consume request.
- Consume superseded, expired, revoked, consumed, or terminal mandate.
- Crash before durable consume and recovery after durable consume.
- Attempt to reactivate consumed authority.
- Atomic supersession under concurrent access.

## evidence_required

- `npm run check`.
- `npm test` including M-B1-C and A regression tests.
- Explicit race/crash/negative-test receipts.
- Independent review verdict.
- Proof ceiling: `LOCAL_PASS` only.

## evidence_produced

Pending A interface freeze and B implementation/review.

## review_verdict

Pending independent review.

## ground_truth_before

Full M-B1: `PARTIAL / UNVERIFIED`; M-B1-C: `IMPLEMENTED / INTEGRATED / LOCAL_PASS`.

## ground_truth_after_candidate

Store slice may be `LOCAL_PASS`; full M-B1 remains `PARTIAL / UNVERIFIED`.

## blockers

- Do not implement persistence against an unreviewed or guessed A contract.
- Do not represent exchange submission or live crash recovery.

## open_questions

- Concrete durable backend remains bounded to a local deterministic persistence adapter for M-B1; production durability is not claimed.
- Full ExecutionIntent integration is deferred until M-B1-D/E and later execution milestones.
