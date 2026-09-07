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
| Mandate kernel (M-B1) | IMPLEMENTED / INTEGRATED / LOCAL_PASS — A Domain/compiler, B MandateStore/authority persistence, C Runtime state machine, D Deterministic evaluator, E Integrated adversarial harness; independently reviewed `APPROVE` at integrated reviewed HEAD `db1d0df`; canonical main after ledger/docs integration `387b26e` |
| Binance market/account adapters | NOT IMPLEMENTED / UNVERIFIED |
| Execution-cost model | NOT IMPLEMENTED |
| OrderWriter/reconciliation | NOT IMPLEMENTED / UNVERIFIED live behavior |
| Live Binance reads | UNVERIFIED |
| Shadow Binance workflow | UNVERIFIED |
| Live bounded execution | UNVERIFIED |
| Production durability | NOT CLAIMED |
| Profitable alpha | NOT CLAIMED |

## M-B1 evidence receipt

- Full suite: `298/298 PASS` (authoritative total; focused suites overlap this total).
- Domain compiler: `13/13 PASS`.
- Evaluator: `29/29 PASS`.
- Integrated adversarial E: `10/10 PASS`.
- Runtime/store focused: `246/246 PASS`.
- Typecheck: `PASS`.
- Build: `PASS`.
- `git diff --check`: `PASS`.
- Evidence ceiling: `LOCAL_PASS`.
- Exclusions: no Binance connectivity, no live exchange behavior, no production durability, no profitability claim, and no live execution.

Local persistence behavior is locally verified and fail-closed. Production-grade cross-process/distributed crash durability is not established.

Ground Truth promotion requires implementation + tests + negative tests + independent review + required runtime evidence.
