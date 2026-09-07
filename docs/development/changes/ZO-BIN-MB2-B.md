# ZO-BIN-MB2-B — Local USDⓈ-M Order-Book Reconstruction

## status

`IMPLEMENTED / LOCAL_PASS`

## baseline and dependencies

- baseline: `d39e3b695db3be2682a285e44d2ef02a6a4bdbb2`
- depends_on: `M-B1`, `M-B2-A`
- evidence ceiling: `LOCAL_PASS`; no live Binance connectivity is claimed.

## allowed scope

Deterministic local USDⓈ-M order-book reconstruction: snapshot normalization; bounded buffered `depthUpdate` reconciliation; exact bigint `U/u/pu/lastUpdateId`; supported UM product and `BTCUSDT`/`ETHUSDT` boundary; bootstrap bridge `U <= S` and `u >= S`; post-sync `pu` continuity; absolute quantities; zero and missing deletion; canonical decimal keys and bid/ask ordering; best levels; immutable caller-independent views; chronology; stale/duplicate/overlap handling; fail-closed crossed books, buffer overflow, and non-bridging ranges; explicit re-bootstrap; per-symbol isolation; depth metadata.

## forbidden scope

No WebSocket, fetch, HTTP, API keys, account/user-data, evaluator/EvaluationPolicy, OrderWriter, order/cancel/transfer/withdrawal, or exchange-write capability. This change introduces no network or write authority.

## implementation

`UsdMFuturesOrderBook` is exported from `src/market/index.ts`. The API is local and deterministic: `ingestSnapshot`, `ingestDiff`, `getSnapshot`/`snapshot`, `status`, and `rebootstrap`. Buffer size is explicit through `maxBufferedUpdates` (default 1000). Existing M-B2-A bookTicker normalization remains available and its exact update-ID discipline is preserved.

## verification receipts

- strict TDD: focused tests were written before production implementation and initially failed because the order-book API did not exist.
- focused order-book: `12/12 PASS`
- typecheck: `PASS`
- build: `PASS`
- full suite: `321/321 PASS`
- diff check: `PASS`
- evidence ceiling: `LOCAL_PASS` only; independent review is required before integration.

## unresolved connection/order-book source questions

- Official snapshot acquisition and REST/WebSocket timing remain intentionally unresolved for M-B2-C/M-B2-D; this slice accepts caller-supplied snapshots only.
- Exact production snapshot endpoint, stream reconnect policy, and live evidence must be verified against current official Binance documentation before any integration slice.
