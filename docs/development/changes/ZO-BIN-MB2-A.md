# ZO-BIN-MB2-A — Binance State Plane Product-Family Decision + Read-Only Boundary

## status

`DECISION_RECORDED / IMPLEMENTATION_PENDING`

## baseline

Canonical local main `387b26e` with M-B1 closed at `LOCAL_PASS`.

## decision

Select **Binance USDⓈ-M Futures (UM)** as the M-B2 MVP product family.

Rationale from the canonical product contract:

- `TradeThesis` and `ExecutionMandate` already distinguish `USD_M_FUTURES`.
- The canonical decision model supports `LONG | SHORT`, while Spot does not provide equivalent short-position semantics.
- The hot-path economics include `fundingCostBps`, current notional, exposure, and loss bounds; these are first-class USDⓈ-M concerns.
- The selected symbols remain `BTCUSDT` and `ETHUSDT`.

This decision does not authorize orders, cancellations, transfers, withdrawals, or security changes.

## official source records

```yaml
binance_product: USD_M_FUTURES_UM
api_family: Binance USDⓈ-M Futures WebSocket Market Streams + WebSocket API User Data Streams
transport: WebSocket
market_endpoint: wss://fstream.binance.com
user_data_endpoint: wss://ws-fapi.binance.com/ws-fapi/v1
market_source_url: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/ws-streams/public
user_data_source_url: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/ws-api/user-data-streams
source_class: S1 official Binance Developer Docs
verified_at: 2026-09-07T06:21:41Z
claim_supported: public market streams expose bookTicker/depth payloads; USD-M user-data stream uses userDataStream.start/ping/stop; no order-write method is used by M-B2-A
```

## M-B2 hard boundary

M-B2 is **LIVE READ / NO WRITE**.

Allowed:

- connect and subscribe to public market streams;
- parse and normalize USDⓈ-M market state;
- version, timestamp, cache, reconnect, and detect stale/out-of-order events;
- prepare private user-data read adapters only when credentials are available;
- expose canonical `StateEnvelope` snapshots and read-only evidence.

Forbidden:

- order placement, cancellation, modification, or trade methods;
- fund transfers, withdrawals, or account-security changes;
- mandate issue/consume/revoke/supersede authority;
- a second evaluator or LLM in stream handling;
- any exchange-write capability in adapters.

## implementation slices

- M-B2-A: USDⓈ-M public market-state adapter and canonical read-only interface.
- M-B2-B: local order-book reconstruction and normalization.
- M-B2-C: USDⓈ-M account/user-data adapter; private evidence only when credentials are available.
- M-B2-D: reconnection, ordering, freshness, and recovery.
- M-B2-E: integrated read-only adversarial and live-read evidence.

## evidence ceiling

This decision record is `LOCAL_PASS` for source selection only. It establishes no Binance connectivity or live-read evidence. M-B2 must keep public market, private account, and any testnet/live evidence separate.

## open questions

- Exact authenticated user-data credential boundary and environment remain to be established in M-B2-C; absence of credentials must not block public market and replay work.
- Order-book snapshot source and REST/WebSocket reconciliation must be verified against the current official USDⓈ-M docs before M-B2-B.
