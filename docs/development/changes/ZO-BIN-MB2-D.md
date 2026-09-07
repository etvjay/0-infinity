# ZO-BIN-MB2-D — Deterministic Public USDⓈ-M Connectivity Lifecycle

## status

`IMPLEMENTED / LOCAL_PASS`

## baseline and scope

- baseline: `bfe1e6218e1590e36b86b78f0f807259223d22bd`
- depends_on: `M-B1`, `M-B2-A`, `M-B2-B`, `M-B2-C`
- product boundary: `USD_M_FUTURES_UM` only; configured symbols remain `BTCUSDT` and `ETHUSDT`.
- evidence ceiling: `LOCAL_PASS`; no live Binance connectivity is claimed.

This slice adds a public-market lifecycle adapter around an injected transport. It validates configured UM market streams, emits official `SUBSCRIBE`/`UNSUBSCRIBE` payloads with unsigned-integer request IDs, tracks `IDLE`/`SUBSCRIBING`/`SUBSCRIBED`/`BACKOFF`/`FAILED`/`STOPPED`, routes only public `bookTicker`/`depthUpdate` events for configured symbols, feeds optional existing market/order-book interfaces using an injected receipt clock, and reconnects through an injected scheduler with bounded deterministic backoff. Unsubscribe invalidates and closes the active connection, cancels stale scheduled reconnect work by lifecycle token, successful subscription ACKs reset reconnect attempts, malformed/error ACKs fail closed into bounded reconnect, and only the supported `bookTicker`, `depth`, `depth@100ms`, and `depth@500ms` stream grammar is accepted. Public `st`/`ps` metadata is checked before forwarding.

## forbidden scope

No private user-data, listenKey, credentials, account state, REST snapshot acquisition, orders, cancels, transfers, withdrawals, security methods, evaluator, OrderWriter, MCP, Skills Hub, x402, Wallet/Web3, or exchange writes. No live transport implementation is included; tests use a deterministic fake transport and scheduler.

## official source records verified

```yaml
binance_product: USD_M_FUTURES_UM
api_family: Binance USDⓈ-M Futures WebSocket Market Streams
transport: WebSocket
endpoint_or_method: wss://fstream.binance.com; SUBSCRIBE; UNSUBSCRIBE
source_url: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/ws-streams/public
source_url_2: https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Live-Subscribing-Unsubscribing-to-streams
source_class: S1 official Binance Developer Docs
verified_at: 2026-09-07T07:57:48Z
claim_supported: the official public UM market-stream control page (source_url_2) documents SUBSCRIBE/UNSUBSCRIBE with params and a numeric unsigned-integer id; that stream-control id is distinct from the general WebSocket API's string request-id convention, which this public market-stream adapter does not implement.
```

## implementation and receipts

- implementation: `src/market/connectivity.ts`
- tests: `tests/market.connectivity.test.ts`
- strict TDD RED: the two new focused regressions failed before remediation: unsubscribe during `BACKOFF` restarted a connection, and caller-owned stream/backoff arrays changed later payload/timing.
- focused GREEN: `15/15 PASS` (`npm run build && node --test dist/tests/market.connectivity.test.js`).
- full receipt: `342/342 PASS` (`npm test`).
- typecheck: `PASS` (`npm run check`).
- build: `PASS` (`npm run build`).
- diff check: `PASS` (`git diff --check`).
- live/private evidence: none; this record must not be read as a connectivity or production-readiness claim.

## risks and unresolved questions

- Backoff is deterministic and bounded, but production policy for jitter, connection-level timeouts, stale-feed detection, and snapshot/rebootstrap orchestration remains for a later slice.
- The adapter validates routing/discriminators before forwarding; full payload normalization remains in existing market/order-book interfaces and callers must inject a receipt clock.
- Official docs expose a second public endpoint (`wss://stream.binancefuture.com`) and post-CM merged-stream metadata; this slice intentionally preserves the canonical `wss://fstream.binance.com` endpoint and UM `st` boundary.
- Actual public connection, TLS/proxy behavior, server timing, rate limits, and live event receipts remain unresolved because no network transport was exercised.
- Private user-data authentication, subscription lifecycle, account event semantics, and any credential environment remain unresolved and intentionally out of scope.

M-B2 overall promotion is not changed by this record.
