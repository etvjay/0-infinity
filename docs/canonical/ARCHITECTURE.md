# 0-infinity Architecture

## Three planes

```text
REASONING PLANE
discovery → evidence/oppose/market workers → deterministic Council → TradeThesis → compileMandate()

HOT DATA PLANE
Binance market/account streams → versioned local state → trigger → evaluateMandate()

EXECUTION PLANE
ExecutionIntent → one OrderWriter → durable submission → ACK/fills → reconciliation → ledger
```

Many analysts. One council. One active authority lane. One execution writer.

The hot path performs no research/model calls.

Correct crash ordering:

```text
construct intent
→ persist SUBMITTING + consume mandate + clientOrderId
→ durable commit
→ outbound exchange write
→ ACK
→ reconcile user/order stream
```

Unknown submission state is reconciled before retry.
