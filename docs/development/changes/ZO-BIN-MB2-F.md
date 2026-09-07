# ZO-BIN-MB2-F — Bounded Public USDⓈ-M Depth Integration Primitives

## status

`IMPLEMENTED / LOCAL_PASS / M-B2-F_REMEDIATED`

## baseline and scope

- baseline: `cfd37f395a3adbe85fad37a80b7e06cbd61b9dba`
- product family: `USD_M_FUTURES_UM`
- symbols: `BTCUSDT`, `ETHUSDT`
- scope: injected public REST depth snapshot source, exact update-ID normalization, depth lifecycle bridge/rebootstrap, connector routing seam, generation isolation, immutable snapshots
- evidence ceiling: `LOCAL_PASS`; no live depth or REST evidence is claimed

## implementation

- `src/market/depth.ts` adds `DepthSnapshotSource`, `UsdMFuturesRestClient`, `UsdMFuturesDepthSnapshotSource`, `normalizeUsdMFuturesDepthSnapshot`, and `UsdMFuturesDepthLifecycle`.
- The REST source performs only an injected `GET /fapi/v1/depth` request against the canonical public USD-M base URL and normalizes `lastUpdateId` to exact `bigint`; it accepts Binance responses without a response symbol and binds the requested symbol.
- The lifecycle keeps `DISCONNECTED`, `RECONNECTING`, `DEGRADED`, `SYNCED`, and `DESYNCED` state per symbol. It enters `SYNCED` only after a successful snapshot is accepted by the existing order-book bridge. Snapshot failures remain degraded; stale async sessions are rejected by per-symbol generations.
- `src/market/connectivity.ts` accepts an optional injected depth lifecycle. The connector validates/routs transport events only and leaves sequence/book semantics to the lifecycle; connection generation checks reject stale message/close callbacks. Receipt routing now always uses an explicit injected clock or the connector's deterministic `Date.now` fallback, so valid depth events are not silently dropped.
- `src/market/depth.ts` preserves the exact top-level `lastUpdateId` JSON lexeme before number coercion, rejects duplicate/missing/exponent/unsafe forms, and extracts symbols from JSON-string diffs before recording `DESYNCED` lifecycle state.
- Existing order-book normalization and immutable snapshot behavior remain unchanged. No account, MCP, execution, evaluator, OrderWriter, credential, or exchange-write code was touched.

## TDD and receipts

- RED: remediation regressions were added first. The focused run built successfully, then failed `4/24`: large unquoted JSON `lastUpdateId` was rounded/rejected, invalid-ID rejection missed a duplicate/missing case, JSON-string depth gaps left lifecycle status `SYNCED`, and omitted `receivedAt` dropped depth routing.
- GREEN: `24/24 PASS` focused depth/connectivity tests (`npm run build && node --test dist/tests/market.depth.integration.test.js dist/tests/market.connectivity.test.js`).
- full test receipt: `351/351 PASS` (`npm test`).
- typecheck: `PASS` (`npm run check`).
- build: `PASS` (`npm run build`).
- diff check: `PASS` (`git diff --check`).

## evidence ceiling and unresolved questions

Local injected tests do not prove Binance REST reachability, TLS/proxy behavior, rate limits, live depth event continuity, reconnect timing, or production readiness. A separate bounded public REST/depth read receipt is required before any live-depth claim. The production policy for snapshot polling, retry/backoff, stale-feed detection, and wiring a real HTTP client remains unresolved and intentionally out of scope. M-B2 overall remains incomplete.
