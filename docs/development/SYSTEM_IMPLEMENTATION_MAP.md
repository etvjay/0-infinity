# 0-Infinity Actual Implementation Map

**Audit basis:** repository `9c3502f08112bfcb1262792f76230d89aac4511c` (`main`, local canonical candidate). This map describes source reachability and verified behavior, not the intended architecture.

## End-to-end graph

```text
Web static routes
  /app/demo/       -> static canonical state/artifact fixture (no API call)
  /app/integrate/  -> static names/examples for REST, MCP, SDK, adapters
  /app/try/        -> fetch POST /v1/shadow or /v1/paper-live

REST createHttpServer / handleRequest
MCP line protocol or POST /mcp / handleMcp
SDK ZeroInfinityClient -> handleRequest (serviceFetch) or caller-supplied fetch
        |
        v
ZeroInfinityService (in-memory workflows, receipts, theses)
        |
        +-> BuiltinWorkerAdapter OR configured OpenAI-compatible TransportAdapter
        |       ADVOCATE -> OPPOSE -> MARKET_ACCOUNT artifacts
        +-> optional BinanceSkillsAdapter ticker read -> sourceEvidence on market artifact
        +-> conveneEvidenceCouncil -> TradeThesis
        +-> service.receipt -> ReasoningReceipt
        +-> status COMPLETE / REFUSE / REASONING_INCOMPLETE
        |
        +-- PAPER_LIVE with explicit paperExecution envelope
        |     -> compileMandate -> MandateStore -> RuntimeSupervisor
        |     -> evaluateMandate -> OrderWriter -> reconciliation/final receipt
        +-- PAPER_LIVE minimal public opportunity
              -> REFUSED/CAPABILITY_DENIED (no synthetic intent)
        |
        X  product-facing read model still does not expose the full mandate/runtime
           chain from ordinary workflow reads

Separate source graph (tests/scripts reachable, not product API wired):
TradeThesis -> compileMandate -> ExecutionMandate
ExecutionMandate + MandateStore + createMandateRuntime + state envelopes
  -> RuntimeSupervisor -> evaluateMandate -> ExecutionIntent
  -> OrderWriter -> ExchangeAdapter -> order receipt/reconciliation
```

## Component reachability

| Component | Source | Reachable from REST/MCP/SDK service? | Evidence state |
|---|---|---:|---|
| Web landing | `web/index.html` | no | static verified |
| Web Demo | `web/app/demo/index.html` | no; read-only fixture | static verified; fixture-bound |
| Web Integrate | `web/app/integrate/index.html`, `web/app.js` | no | static examples |
| Web Try | `web/app/try/index.html`, `web/app.js` | yes, via REST only | local/hosted read-only evidence |
| REST | `src/product/http.ts` | entry surface | local tests + hosted evidence |
| MCP | `src/product/mcp.ts`, `mcp-server.ts` | entry surface | local tests + hosted evidence |
| SDK | `src/product/sdk.ts` | entry surface | local consumer + hosted evidence |
| role adapters | `src/product/adapters.ts` | yes, inside `ZeroInfinityService` | builtin/injected/external rehearsal; no live provider claim |
| Council / receipt | `src/reasoning/index.ts`, `receipt.ts` | yes, inside service | local tests |
| Binance Skills | `src/binance/skills.ts` | optional service injection | injected and public-read evidence; blocked external states preserved |
| Agentic MCP | `src/binance/agenticMcp.ts` | no | auth-blocked external adapter/tests |
| domain compiler | `src/domain/index.ts` | yes, via explicit `paperExecution` envelope in `runPaperLiveWorkflow` | typed Paper integration test |
| mandate store | `src/store/index.ts` | yes, per typed Paper run (in-memory) | local/replay persistence tests; product restart not durable |
| mandate runtime | `src/runtime/mandateRuntime.ts` | yes, through `RuntimeSupervisor` in typed Paper run | state-machine tests |
| evaluator | `src/evaluator/index.ts` | yes, through `RuntimeSupervisor` in typed Paper run | deterministic evaluator tests |
| economics | `src/economics/*` | no; evaluator performs bounded edge/cost checks for typed Paper | local economics tests |
| OrderWriter | `src/execution/index.ts` | yes, through typed Paper run; no external exchange write | `tests/product-service.execution.integration.test.ts` |
| RuntimeSupervisor | `src/runtime/supervisor.ts` | yes, typed Paper run in `LOCAL_REPLAY` mode | local/replay tests |
| PAPER_LIVE minimal form | `src/product/service.ts`, REST/MCP/SDK/Web | refuses with `CAPABILITY_DENIED` | fail-closed contract test |
| Binance exchange/testnet writers | `src/testnet/*`, `src/account/*` | no | credential/external gates; no live write proof |

## Authority and persistence boundary

The production-facing service owns in-memory workflow maps (`service.ts:14`) and its paper writer (`service.ts:15`). The authority path is independently implemented around `MandateStore`, `RuntimeSupervisor`, and `OrderWriter`, but no constructor or route composes those objects with `ZeroInfinityService`. The hosted evidence therefore proves reasoning/product access and simulated paper output, not mandate-backed execution.

The static Demo intentionally does not run a workflow. The Try page calls the service's convenience endpoints and presents returned values; it cannot prove the separate mandate/evaluator/order path.
