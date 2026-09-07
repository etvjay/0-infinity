# Binance Source Truth

## Source precedence

```text
S0 — Current official Binance Agent OS / MCP docs
S1 — Current official Binance Developer Docs for the exact product/API family
S2 — Exact endpoint/method schema/reference/changelog
S3 — Official Binance clarification when S0-S2 are silent
S4 — 0-infinity canonical product docs
S5 — repository code/tests/examples
S6 — secondary sources/model memory
```

S6 is discovery-only and may not establish API semantics.

Official roots:

- https://www.binance.com/en/support/announcement/detail/07d45cdd3831498f8a4ff339031a8480
- https://www.binance.com/en/blog/ecosystem/5991233187660196794
- `https://agent.binance.com/mcp/agentic`
- https://developers.binance.com/

Never silently mix Spot, Margin, USD-M Futures, COIN-M Futures, Portfolio Margin, or Options.

Every consequential Binance implementation decision records:

```yaml
binance_product:
api_family:
transport:
endpoint_or_method:
source_url:
source_class:
verified_at:
claim_supported:
```

If official source access is unavailable, use `SOURCE_UNVERIFIED` or `BLOCKED_SOURCE`, not guesses.

If Binance docs conflict with architecture, emit `SOURCE_CONFLICT` for orchestrator/reviewer resolution.

## Frozen M-B2 product-family decision

- MVP family: `USD_M_FUTURES_UM` (Binance USDⓈ-M Futures).
- Public market transport: official USDⓈ-M WebSocket Market Streams at `wss://fstream.binance.com`.
- Private read transport: official USDⓈ-M WebSocket API user-data streams at `wss://ws-fapi.binance.com/ws-fapi/v1`.
- Decision record: `docs/development/changes/ZO-BIN-MB2-A.md`.
- Scope: live read / no write; no order, cancellation, transfer, withdrawal, or security method is authorized by M-B2.

## Canonical surface boundaries (2026-09-07)

The following Binance-related surfaces are distinct and non-interchangeable. A surface may provide capability, evidence, account access, or product UX without acquiring execution authority.

| Surface | Canonical role | Status and evidence boundary |
|---|---|---|
| Native Binance APIs and WebSockets | **Hot market/account data plane**: obtain product-scoped market and account state, normalize it into local state, and feed the deterministic hot path. | **Canonical for M-B2.** The frozen family is `USD_M_FUTURES_UM`; M-B2-A/B are live-read/no-write slices only. The official UM endpoints and source records above establish the selected transport, not live connectivity or write authority. |
| Binance Agentic MCP | **Agent OS tool/account/access plane** and, eventually, a bounded trade-handoff plane. It may expose tools or account context to an agent, subject to explicit adapter and authority boundaries. | **PLANNED / UNVERIFIED in this repository.** The official MCP root is listed above, but no existing source record here substantiates tool semantics, account scope, permissions, or a trade handoff. It is not an execution writer. |
| Binance Skills Hub | **Reasoning/evidence capability plane**: skills may help discover, analyze, or structure evidence and reasoning inputs. | **PLANNED / UNVERIFIED in this repository.** No existing official source record here establishes a Skills Hub contract or runtime dependency. Skill output is not a `TradeThesis` or an `ExecutionMandate`. |
| Agentic Wallet / Web3 | **Optional on-chain capability plane** for wallet and Web3 operations when separately adopted and authorized. | **PLANNED / UNVERIFIED in this repository.** It is outside the USD-M Futures M-B2 source truth and must not be assumed to provide exchange execution authority. |
| x402 | **Future paid-evidence/research-spend plane** for bounded acquisition of paid research or evidence. | **PLANNED / UNVERIFIED in this repository.** Any future `ResearchSpendMandate` is distinct from an `ExecutionMandate`: research spend may authorize a bounded evidence purchase, but it cannot authorize an order, and an `ExecutionMandate` cannot be used as research-spend authorization. |
| Binance AI Chat | **Reference/product UX surface** for human-facing exploration or product reference. | **PLANNED / UNVERIFIED as an integration in this repository.** It is not a canonical runtime dependency, source of hot state, mandate evaluator, or execution authority. |

### Architecture boundaries

```text
DATA PLANE
native Binance APIs/WebSockets → versioned local state → evaluateMandate()

AGENT TOOL PLANE
Skills Hub / Agentic MCP → reasoning, account, and tool capabilities

EXECUTION AUTHORITY
ExecutionIntent → one OrderWriter → approved execution adapter → confirmation

OPTIONAL ONCHAIN
Agentic Wallet / Web3 skills / x402 → separately bounded optional capabilities
```

The boundaries are hard rules, not product substitutions:

- Capability is not execution authority.
- Skill output is not `TradeThesis`, and `TradeThesis` is not `ExecutionMandate`.
- Agentic MCP cannot become a second `OrderWriter`, whether it is used for account access, tool invocation, or a future trade handoff.
- The hot data path remains native API/WebSocket state → local state → deterministic `evaluateMandate()`; it does not depend on Skills Hub, MCP, x402, Wallet/Web3, or AI Chat.
- Only the approved execution adapter behind the single `OrderWriter` may perform an exchange write, after the existing authority checks and explicit confirmation path.
- `ResearchSpendMandate` and `ExecutionMandate` are separate authority types with separate scopes, ceilings, and confirmation semantics; neither is interchangeable with the other.

### M-B2 preservation and evidence ceilings

- `USD_M_FUTURES_UM` remains the sole M-B2 product-family source truth. This section does not broaden M-B2 to Spot, Margin, COIN-M Futures, Portfolio Margin, Options, Wallet/Web3, x402, MCP, Skills Hub, or AI Chat.
- M-B2-A and M-B2-B remain **LIVE READ / NO WRITE**: public market-state ingestion and local order-book reconstruction/normalization, with read-only evidence only. Freshness and ordering/recovery work remains bounded by the M-B2 decision record and does not expand authority.
- M-B2 does not authorize order placement, cancellation, modification, transfers, withdrawals, security changes, mandate issue/consume/revoke/supersede, or any exchange-write method.
- The evidence ceiling remains `LOCAL_PASS` for source selection and local implementation evidence; it does not establish Binance connectivity, live-read evidence, authenticated account evidence, live execution, or production readiness.
- Claims about Agentic MCP, Skills Hub, x402, Agentic Wallet/Web3, or Binance AI Chat remain `PLANNED / UNVERIFIED` unless a future record cites a current official source and states the exact supported claim.

This canonical section is an additive documentation boundary; it does not alter the M-B2 decision record or authorize any new runtime capability.
