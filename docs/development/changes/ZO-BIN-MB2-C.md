# ZO-BIN-MB2-C — Local USDⓈ-M Account-State Normalization

## status

`IMPLEMENTED / LOCAL_PASS`

## baseline and dependencies

- baseline: `95ca2fb01f75e03c345a6f5609682902ac48ed00`
- depends_on: `M-B1`, `M-B2-A`, `M-B2-B`
- evidence ceiling: `LOCAL_PASS`; no live Binance evidence is claimed.

## allowed scope

Deterministic, network-free normalization of caller-supplied Binance USDⓈ-M `ACCOUNT_UPDATE` payloads into typed immutable local account state. The explicitly supported local schema covers the `USD_M_FUTURES_UM` family, `BTCUSDT`/`ETHUSDT` positions, `USDT` balances, wallet/cross-wallet/change amounts, position amount, entry price, realized/unrealized PnL, margin type, isolated wallet, position side, chronology, and exact non-negative `u` version IDs. Object and JSON-text inputs are accepted; canonical decimal strings and exact bigint versions are preserved.

## forbidden scope

No network, WebSocket, REST, listenKey, credentials, account login, account writes, exchange writes, evaluator/EvaluationPolicy, OrderWriter, order/cancel/transfer/withdrawal, MCP, Skills Hub, x402, Wallet/Web3, or execution capability. The normalized account state is not market state and does not grant execution authority.

## implementation

`normalizeUsdMFuturesAccountState` is exported from `src/account/index.ts`. It requires the explicit `productFamily: "USD_M_FUTURES_UM"` and `e: "ACCOUNT_UPDATE"` discriminator, rejects malformed or unsupported fields, and returns deeply frozen state. Unsupported assets, symbols, event types, numeric coercions, future timestamps, and incoherent chronology fail closed.

## verification receipts

- strict TDD: focused tests were written before production implementation; the first focused run failed because `src/account/index.ts` did not exist.
- focused account normalizer: `4/4 PASS`
- typecheck: `PASS`
- build: `PASS`
- full suite: `326/326 PASS`
- diff check: `PASS`
- evidence ceiling: `LOCAL_PASS` only; no live connectivity, credential, authenticated account, evaluator, or execution evidence.

## unresolved source questions

- Official production acquisition, authentication, subscription, reconnect, and account-stream timing remain intentionally unresolved; this slice accepts caller-supplied payloads only.
- This slice intentionally supports only the documented local `ACCOUNT_UPDATE` subset above. Other Binance account event types and fields require current official source verification before support.
