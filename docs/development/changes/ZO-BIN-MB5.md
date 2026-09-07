# ZO-BIN-MB5 — Bounded local OrderWriter and reconciliation

## status

`REMEDIATION_COMPLETE / PROVISIONAL`

Independent review of the exact parent candidate `2f0b3c9e28d419ddd65da58f02b3e2fd4fb8e32` returned `REVISE`; this remediation remains provisional pending a fresh exact-head review. No `LOCAL_PASS` approval is claimed.

M-B5 is a local/replay-only execution boundary. It is not exchange, live, testnet, production durability, or profitability evidence.

## implementation

- `src/execution/index.ts` adds one serialized `OrderWriter` around the existing `MandateStore.consumeForSubmission` semantic.
- Client IDs are deterministic SHA-256 derivations of `(mandateId, workflowId, attempt)`.
- Intent and fill-event validation requires frozen canonical own-data objects with the exact Object prototype, enumerable data descriptors, and no unsupported inherited, hidden, symbol, or accessor keys; persisted mandate bindings enforce workflow, symbol, side, method, account (when supplied), and entry price bounds.
- Same-client retries compare a complete canonical intent fingerprint, including method, quantity, account, notional, executable edge, and both state versions. Receipts bind account, method, attempt, economics, state versions, adapter acceptance provenance, and fill-event provenance.
- Persistence precedes every adapter call. Adapter timeout or thrown call becomes `UNKNOWN`; the writer refuses blind retry. ACKNOWLEDGED does not imply a fill.
- Reconciliation is idempotent by event ID, treats fill quantities as cumulative watermarks, rejects `FILLED` without a cumulative quantity reaching the requested quantity, ignores out-of-order lower snapshots, and computes weighted average price from newly observed cumulative quantity. Cancellation durably records `REQUESTED` before the adapter, refuses `REJECTED`/`FAILED` terminal submissions before adapter invocation, maps adapter uncertainty to durable local `UNKNOWN`, refuses blind retry, and requires deterministic client-ID/mandate/workflow/attempt/intent-fingerprint ownership.
- Reconciliation refuses fills after terminal `REJECTED`/`FAILED` submission outcomes, `CANCELLED`, or uncertain (`UNKNOWN`) cancellation, preserving the terminal/uncertain receipt without fill or outcome mutation. Duplicate event IDs remain idempotent before terminal rejection checks. Every submit retry, reconciliation, and cancellation path validates the complete frozen persisted receipt schema, including deterministic identity, intent bindings, enums, quantities/prices, provenance, event-array descriptors, immutability, and status/cancellation consistency; partial-fill events require positive cumulative quantity and valid fill price.
- Persisted receipts bind stored quantity exactly to intent quantity, enforce outcome/provenance/fill/cancellation coherence, and verify exact decimal `averagePrice * filledQuantity = filledNotional`; partially filled orders cannot be converted into positive-fill cancellations. Frozen receipt arrays require canonical `Array.prototype` descriptors and reject prototype pollution. Adapter results are revalidated at runtime against exact own data fields/enums before final persistence; invalid injected results fail closed.
- `MemoryOrderPersistence.failNextSave()` and writer hooks model local persistence/crash windows and replay boundaries; no production crash-safety claim is made.

## TDD and verification receipts

- RED: focused rejected/failed fill regressions failed before implementation with missing expected rejections.
- RED: focused rejected/failed cancellation regression failed before implementation with missing expected rejections.
- RED: new forged-persisted-receipt, array-pollution, adapter-result, and partial-cancellation regressions failed before implementation (`3` focused failures across the two RED runs; prior suite `413/413 PASS`).
- GREEN: focused execution tests `22/22 PASS`.
- Full `npm test`: `422/422 PASS`.
- `npm run check`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.

## review and evidence ceiling

- remediation_code_head: `3abf64e056b0a9160df75fa877829b7be9fe9d9c`
- review verdict: `REVISE` (provisional pending fresh review of the remediation head)
- focused: `22/22`; full: `422/422`
- evidence ceiling: local/replay implementation evidence only; no approval or `LOCAL_PASS` claim.

## exclusions and risks

No network, credentials, MCP, evaluator/reasoning changes, Binance order/cancel writes, live evidence, testnet evidence, production durability, or crash-recovery guarantee. M-B1 keeps UNKNOWN terminal; M-B5 reconciliation is intentionally isolated in this local writer. Legacy persisted orders without the new internal fill-notional field fall back to their stored average and filled quantity; no production migration is claimed.
