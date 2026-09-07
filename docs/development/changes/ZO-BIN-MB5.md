# ZO-BIN-MB5 — Bounded local OrderWriter and reconciliation

## status

`LOCAL_PASS`

M-B5 is a local/replay-only execution boundary. It is not exchange, live, testnet, production durability, or profitability evidence.

## implementation

- `src/execution/index.ts` adds one serialized `OrderWriter` around the existing `MandateStore.consumeForSubmission` semantic.
- Client IDs are deterministic SHA-256 derivations of `(mandateId, workflowId, attempt)`.
- Intent validation requires a frozen, deeply immutable `EXECUTION_INTENT`; quantity and price are narrowed only, and persisted mandate bindings enforce workflow, symbol, side, method, account (when supplied), and entry price bounds.
- Persistence precedes every adapter call. Adapter timeout or thrown call becomes `UNKNOWN`; the writer refuses blind retry. ACKNOWLEDGED does not imply a fill.
- Reconciliation is idempotent by event ID, monotonic, cumulative, and computes weighted average fill price. Cancellation is limited to writer-owned IDs.
- `MemoryOrderPersistence.failNextSave()` and writer hooks model local persistence/crash windows and replay boundaries; no production crash-safety claim is made.

## TDD and verification receipts

- RED: the new execution tests initially failed because `src/execution/index.ts` did not exist.
- GREEN: focused execution tests `3/3 PASS`.
- Full `npm test`: `403/403 PASS`.
- `npm run check`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.

## exclusions and risks

No network, credentials, MCP, evaluator/reasoning changes, Binance order/cancel writes, live evidence, testnet evidence, production durability, or crash-recovery guarantee. M-B1 keeps UNKNOWN terminal; M-B5 reconciliation is intentionally isolated in this local writer.
