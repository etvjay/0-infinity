# 0-infinity Invariants

```text
INV-P01 OPINION ≠ TRADE
INV-P02 FORECAST EDGE ≠ EXECUTABLE EDGE
INV-P03 REFUSAL is valid
INV-R01 Research may not send orders
INV-R03 OPPOSE may not be omitted
INV-R04 Council refusal may not be overridden
INV-M01 Mandates are immutable
INV-M04 MVP mandate is single-use
INV-M05 Superseded/expired/revoked/used mandates cannot execute
INV-H01 Hot path calls no LLM
INV-H03 Stale market state fails closed
INV-H04 Stale account state fails closed
INV-H05 Current executable edge must satisfy mandate floor
INV-E01 Only OrderWriter owns exchange writes
INV-E02 Mandate is consumed before outbound I/O
INV-E04 Unknown submission does not trigger blind retry
INV-D01 Builder cannot self-approve
INV-D02 Implementation does not automatically change Ground Truth
INV-D03 Ground Truth promotion requires tests + negative tests + review + evidence
```
