# 0-infinity Product Specification

## Product statement

0-infinity is an evidence-bounded trading-agent execution system for Binance Agent OS.

## Core primitive

`ExecutionMandate` is an immutable, short-lived, bounded authorization compiled from an accepted thesis. It binds exact venue/account, symbol/instrument, side, lifetime, economic floor, entry bounds, cost ceilings, exposure limits, invalidation, execution method and provenance. A mandate is not an order.

## MVP scope

Initial symbols: `BTCUSDT`, `ETHUSDT`.
Decision: `LONG | SHORT | NO_TRADE`.
One explicitly selected Binance product family: `USD_M_FUTURES_UM` (Binance USDⓈ-M Futures).

Must be real before submission: Agent OS-connected state, structured reasoning/council output, mandate compilation, deterministic hot-path validation, explicit refusal, bounded execution/proposal, provenance.

Excluded: HFT claims, generic multi-exchange routing, strategy marketplace, self-modifying policy, multiple worker writers, profitable-alpha claims without evidence.

## Executable edge

```text
executableEdgeBps = expectedMoveBps - spreadCostBps - slippageBps - feeBps - fundingCostBps
```

If executable edge falls below mandate floor, refuse.

Only `OrderWriter` may write to the exchange.
