# 0-infinity Submission Checklist

Status is evidence-bounded. `HOSTED_PASS`, `TESTNET_PASS`, and account-bound social actions require external receipts; local tests do not upgrade those states.

| Requirement | Artifact / command | Status | Evidence / link | Owner | Blocker |
|---|---|---|---|---|---|
| Follow @Binance | Account action | USER_ACTION_REQUIRED | Not verifiable from repository | User | Logged-in Binance account required |
| Repost announcement | Account action | USER_ACTION_REQUIRED | Not verifiable from repository | User | Logged-in X account required |
| X submission | Prepared copy below | PREPARED | `docs/submission/X_SUBMISSION.md` | 0-infinity | User must post |
| Demo video | Submission media | LOCAL_ARTIFACT | `docs/submission/media/0-infinity-demo.mp4` — 1920×1080, 125s, burned-in captions, truthful blocked Testnet status | 0-infinity | Upload destination still required |
| GitHub | `https://github.com/etvjay/0-infinity` | PASS | Public repository; final candidate SHA is pushed only after final review | 0-infinity | Verify origin/main after push |
| Survey | Prepared answers | USER_INPUT_REQUIRED | `docs/submission/SURVEY_ANSWERS.md` | User | Account-specific fields |
| Hosted Web | GitHub Pages workflow | BLOCKED_EXTERNAL | `docs/DEPLOYMENT.md` | 0-infinity | Pages hosting not independently verified |
| REST | Local HTTP server | LOCAL_PASS | `npm run api`, `npm run check` | 0-infinity | No public host |
| MCP | Local line-delimited JSON-RPC | LOCAL_PASS | `npm run mcp`, `docs/MCP.md` | 0-infinity | No public host |
| SDK docs | TypeScript client and consumer fixture | CONSUMER_PASS | `src/product/sdk.ts`, `examples/consumer`; clean `npm ci` + `npm run smoke` passed | 0-infinity | Hosted SDK target unavailable |
| Binance Skills | Adapter and evidence | BLOCKED_EXTERNAL | `docs/development/evidence/ZO-BIN-MB8-binance-skills-live.json` | 0-infinity | Binance eligibility restriction |
| Agentic MCP | Authorization boundary | AUTH_BLOCKED_EXTERNAL | `docs/development/evidence/ZO-BIN-MB8-binance-agentic-mcp-read.json` | 0-infinity | Official OAuth/client registration block |
| SHADOW | Deterministic replay | SHADOW_PASS | `npm run demo`, M-B7 evidence | 0-infinity | None |
| PAPER | Deterministic simulation | PAPER_MARKET_PASS | `ZO-BIN-MB8-paper-market-input.json`, `ZO-BIN-MB8-paper-market-session.json`; native bookTicker input, top-of-book model, simulated FILLED and edge-collapse refusal | 0-infinity | No synchronized depth/private account claim |
| TESTNET | Binance USDⓈ-M adapter | BLOCKED_EXTERNAL | `ZO-BIN-MB8-binance-testnet.json` | 0-infinity | Dedicated credentials unavailable |
| README | Product explanation and runbook | PASS | `README.md` | 0-infinity | Keep claims current |
| Security | Hostile-boundary tests and scans | LOCAL_PASS | `npm test`, `npm run secret-scan` | 0-infinity | External deployment security unproven |
| Clean clone | `npm ci` and full gates | PENDING | Release evidence to be recorded | 0-infinity | Must run from fresh clone |
| Cold review | Local cold REST/MCP/SDK smoke | LOCAL_PASS | Fresh process/client receipts recorded in release review | Reviewer | Public Web/REST/MCP unavailable |

## Prepared X submission

> 0-infinity puts evidence and bounded authority between an agent's opinion and a Binance trade. Advocate, Opposer, Market Analyst, and Council produce a verifiable ReasoningReceipt; deterministic gates can refuse an approved thesis when execution edge collapses. Try the local Web UI, REST, MCP, and TypeScript SDK in the public repository: https://github.com/etvjay/0-infinity

## Evidence ceiling

The current release proves local deterministic runtime behavior, SHADOW replay, PAPER simulation, bounded public Binance market-read evidence, and fail-closed adapter boundaries. It does not prove hosted availability, authenticated Agentic MCP, authenticated Binance account state, Futures Testnet execution, profitability, production durability, or live financial authority.

Mainnet financial write: `NOT_AUTHORIZED`.
