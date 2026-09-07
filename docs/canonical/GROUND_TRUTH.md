# 0-infinity Ground Truth

**Product:** Binance-native evidence-bounded trading-agent execution system.

## Core invariant

```text
OPINION ≠ TRADE
```

Expanded:

```text
observation ≠ evidence
evidence ≠ thesis
thesis ≠ executable edge
executable edge ≠ authority
authority ≠ execution
transaction receipt ≠ profitable outcome
```

## Target runtime

```text
reasoning → TradeThesis → ExecutionMandate
Binance state → trigger → evaluateMandate()
ExecutionIntent → one OrderWriter → receipt/reconciliation
```

## Hard authority rules

1. Reasoning never sends orders.
2. Hot path never calls an LLM.
3. Only one component owns exchange write authority.
4. Mandates are immutable.
5. MVP mandates are single-use.
6. Superseded/revoked/consumed/expired mandates cannot execute.
7. Execution uses current market/account state.
8. Executable edge must still exist at submission.
9. Stale state fails closed.
10. Unknown submission state never causes blind retry.
11. Every order binds to one mandate.
12. Every mandate binds to one thesis/council decision.

## Current implementation status

| Component | Status |
|---|---|
| Product definition / invariants / workflow | CANONICAL |
| TradeThesis / ExecutionMandate schemas | CANONICAL TARGET |
| Mandate kernel | LOCAL_PASS (M-B1 A–E integrated and independently reviewed; local X2 evidence only) |
| Binance market/account adapters | NOT IMPLEMENTED |
| Execution-cost model | NOT IMPLEMENTED |
| OrderWriter/reconciliation | NOT IMPLEMENTED |
| Live Binance reads | UNVERIFIED |
| Shadow workflow | UNVERIFIED |
| Live bounded execution | UNVERIFIED |
| Profitable alpha | NOT CLAIMED |

Ground Truth promotion requires implementation + tests + negative tests + independent review + required runtime evidence.
