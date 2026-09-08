# CR-PAPER-MARKET-001

```yaml
change_id: CR-PAPER-MARKET-001
title: Capture bounded native Binance top-of-book observations for PAPER evidence
objective: >
  Demonstrate a moving native Binance public market read feeding the existing
  normalized market boundary and deterministic top-of-book paper model without
  depth, account, Skills, Agentic MCP, or exchange-write claims.
status: CANDIDATE_PENDING_REVIEW
scope:
  symbols: [BTCUSDT, ETHUSDT]
  selected_symbol: BTCUSDT
  product: USD_M_FUTURES
  source: wss://fstream.binance.com/ws/btcusdt@bookTicker public bookTicker
  model: TOP_OF_BOOK_PAPER_MODEL
  execution: SIMULATED
invariants:
  - Native public market input is read-only.
  - No LLM, Binance Skills, Agentic MCP, or remote reasoning call is in the market path.
  - No synchronized depth or private account state is claimed.
  - Every paper result is linked to workflow, ReasoningReceipt, TradeThesis, ExecutionMandate, ExecutionIntent, and PaperReceipt where the path emits them.
allowed_files:
  - scripts/paper-market-session.mjs
  - docs/development/evidence/ZO-BIN-MB8-paper-market-input.json
  - docs/development/evidence/ZO-BIN-MB8-paper-market-session.json
  - docs/development/CHANGE_RECORDS/CR-PAPER-MARKET-001.md
forbidden_files:
  - credentials
  - src/testnet/index.ts
  - live writer/mainnet configuration
evidence:
  inputObservationCount: 5
  evaluationCount: 2
  successfulPath: EXECUTION_INTENT -> PAPER FILLED
  refusalPath: EXECUTABLE_EDGE_TOO_LOW
  reasoningReceiptHash: sha256:be1caf78970d9db125a1020a7c3e0f74924f31d004527bc38b4975ac9bf19ab4
  thesisHash: sha256:2476d71b142e0715f9b682cfb32a95d666fb38aa50a396ae07ccdd6b4191fcd7
  mandateHash: sha256:54f37f8a78d78993d4e14aceae74c8d853e7649c8b59f0158cf75b65f2ea13c7
  ceiling: >
    Bounded native public market observations plus deterministic local PAPER
    simulation. No synchronized depth, private account truth, exchange write,
    profitability, or production readiness claim.
```
