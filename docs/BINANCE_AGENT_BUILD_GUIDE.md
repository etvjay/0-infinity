# 0-infinity Binance Agent Build Guide

## Purpose

This is the single operational guide for building the Binance Agent OS product with no Delphi runtime representation.

## Product

0-infinity converts slower evidence-backed reasoning into short-lived immutable execution mandates. A deterministic low-latency runtime may exercise a mandate only while fresh Binance market/account state still satisfies the mandate's economic, freshness, risk and authority constraints.

## Decisive workflow

```text
Opportunity
→ cheap triage
→ parallel evidence / oppose / market analysis
→ Evidence Council
→ TradeThesis | REFUSE
→ compileMandate()
→ immutable ExecutionMandate
→ ARMED
→ continuous Binance state
→ trigger
→ evaluateMandate()
→ ExecutionIntent | ExecutionRefusal
→ single OrderWriter
→ ACK/fills/cancel
→ reconciliation
→ ledger/outcome
```

## Three planes

```text
REASONING PLANE
candidate → research → advocate/oppose/market → Council → thesis → mandate

HOT DATA PLANE
live market/account state → versions → trigger → deterministic validation/economics

EXECUTION PLANE
one OrderWriter → durable submission → exchange → acknowledgement/fills → reconciliation
```

## Mandatory read order

1. `docs/BINANCE_AGENT_BUILD_GUIDE.md`
2. `docs/canonical/BINANCE_SOURCE_TRUTH.md`
3. `docs/canonical/GROUND_TRUTH.md`
4. `docs/canonical/PRODUCT_SPEC.md`
5. `docs/canonical/PRODUCT_SCHEMA.md`
6. `docs/canonical/ARCHITECTURE.md`
7. `docs/canonical/WORKFLOWS.md`
8. `docs/canonical/REQUIREMENTS.md`
9. `docs/development/INVARIANTS.md`
10. `docs/development/INTERFACES.md`
11. `docs/development/AUTHORITY_MAP.md`
12. `docs/development/STATE_MACHINES.md`
13. current Change Record

## Truth split

```text
0-infinity canonical docs → what product we build
official Binance docs → what Binance supports/how it behaves
assigned branch → what currently exists in code
Change Record → what this agent may change
```

If Binance capability conflicts with product architecture, emit `SOURCE_CONFLICT` and stop that slice for review.

## Build order

```text
M-B0 Canonicalization                 ✅
M-B1 Mandate Kernel                   ← current
M-B2 Binance State Plane              live read / no write
M-B3 Execution Economics              shadow assessment
M-B4 Binance Reasoning Workflow       end-to-end shadow
M-B5 OrderWriter + Reconciliation     controlled canary
M-B6 Full Workflow Runtime            recovery/reconciliation
M-B7 Sustained Shadow Evidence
M-B8 Controlled Live Evidence + submission freeze
```

## M-B1

```text
TradeThesis
→ compileMandate()
→ ExecutionMandate
→ MandateStore
→ state machine
→ evaluateMandate()
→ ExecutionIntent | ExecutionRefusal
```

Parallel agents:

```text
A — domain types + compileMandate()
B — MandateStore + supersession / persistence
C — mandate runtime state machine
D — evaluateMandate() after A interface freeze
E — independent adversarial/property testing after integration
```

Proof ceiling: `LOCAL_PASS`. No live Binance claim.

## Hard invariants

```text
REASONING NEVER SENDS ORDERS.
HOT PATH NEVER CALLS AN LLM.
ONLY ONE COMPONENT OWNS EXCHANGE WRITE AUTHORITY.
MANDATES ARE IMMUTABLE.
SUPERSEDED/EXPIRED/REVOKED/USED MANDATES CANNOT EXECUTE.
MANDATE IS CONSUMED BEFORE OUTBOUND ORDER I/O.
EXECUTION USES CURRENT BINANCE STATE.
EXECUTABLE EDGE MUST STILL EXIST AT SUBMISSION.
STALE MARKET/ACCOUNT STATE FAILS CLOSED.
UNKNOWN SUBMISSION STATE NEVER CAUSES BLIND RETRY.
EVERY ORDER BINDS TO ONE MANDATE.
EVERY MANDATE BINDS TO ONE THESIS/COUNCIL DECISION.
```

## Governing maxim

```text
Pull product meaning from 0-infinity.
Pull exchange behavior from Binance.
Pull implementation scope from the Change Record.
Pull current code from the assigned branch.
```
