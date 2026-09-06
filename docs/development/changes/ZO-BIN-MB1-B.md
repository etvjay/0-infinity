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

`CANDIDATE / LOCAL_PASS — pending fresh independent review` (DECISION B-LOCK-001 remediation; local development backend evidence ceiling)

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
  revoke(mandateId: string): Promise<void>;
}
```

The implementation provides an adapter-owned transaction boundary. Memory persistence serializes all instances sharing one adapter. `JsonFilePersistence` is deliberately fail-closed under DECISION B-LOCK-001: it uses a single store-wide lock boundary because the file layout cannot prove key-level independence; active contention may wait only within `maxWaitMs` and returns typed `LOCK_CONTENTION`, while malformed, missing, released, orphan-looking, stale, dead-PID, timeout, restart, or otherwise ambiguous ownership returns typed `RECOVERY_BLOCKED`. No age, mtime, PID-death, timeout, release-marker-age, startup, or directory-existence heuristic may delete, rename, replace, or mutate a lock. Only the exact current in-process token plus filesystem lease identity may publish a `RELEASED` marker; ownership loss is fail-closed with no destructive fallback. A released marker can be reacquired only by that same exact in-process lease; after restart or by another unknown owner the scope remains blocked. The file adapter fsyncs temp files before replace; directory fsync, crash recovery, and production durability are not implemented or claimed. All mutations crossing a blocked boundary reject with `RECOVERY_BLOCKED`.

Authority status is store-level and separate from frozen M-B1-C runtime vocabulary: `ACTIVE`, `SUPERSEDED`, `REVOKED`, and `CONSUMED`; no `REVOKED` runtime state is added. `consumedAt` and `clientOrderId` are durable consumption identity, with atomic one-consumer semantics and same-client idempotent retry retained. `getActive` requires store status `ACTIVE`, runtime `ARMED`, and no revocation marker; revocation is irreversible and superseded/consumed/expired authorities cannot be reused. Snapshot load validates mandate structure, collision-safe canonical JSON scope, runtime vocabulary, authority status, uniqueness, all numeric/provenance/expiry invariants, revocation combinations, and client identity before authority is exposed.

### Revocation vocabulary contradiction

The canonical invariant `INV-M05` names revoked mandates, but frozen M-B1-C deliberately exposes exactly 14 runtime states and has no `REVOKED` state. B therefore persists `revoked: true` as a store-level fail-closed marker while retaining the underlying C state (normally `ARMED`); store reads and consume/supersede reject it. A persisted `state: "REVOKED"` is intentionally rejected as malformed runtime data rather than extending C. A future canonical contract must decide whether revocation becomes a C transition/state or remains an authority-layer marker.

## tests_required

- One active mandate per canonical scope across instances sharing a persistence boundary.
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
- Revoke and recover a mandate without reactivating it.
- Malformed snapshots, forged scopes, invalid mandates, invalid client IDs, and client-ID collisions.
- Atomic supersession under concurrent access.

## evidence_required

- `npm run check`.
- `npm test` including M-B1-C and A regression tests.
- Explicit race/crash/negative-test receipts.
- Independent review verdict.
- Proof ceiling: `LOCAL_PASS` only.

## evidence_produced

`npm run check` PASS; `npm test` PASS; `git diff --check` PASS after focused remediation. Focused compiled Node tests cover replaced RELEASED-directory identity blocking, coherent persisted authority/runtime/revocation/consumption combinations, and typed fail-closed revoke rejection for submitting, consumed, expired, superseded, and terminal mandates while preserving idempotent repeated revoke for canonical revoked records. Evidence ceiling: `LOCAL DEVELOPMENT BACKEND` only; candidate remains pending fresh independent review.

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

- Concrete durable backend remains bounded to a local deterministic persistence adapter for M-B1; production durability and crash-recovery guarantees are not claimed.
- The frozen C vocabulary versus canonical revoked invariant remains unresolved as described above.
- Full ExecutionIntent integration is deferred until M-B1-D/E and later execution milestones.
