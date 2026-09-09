# 0-infinity Submission Checklist

Status is evidence-bounded. `HOSTED_PASS`, `TESTNET_PASS`, and account-bound social actions require external receipts; local tests do not upgrade those states.

| Requirement | Artifact / command | Status | Evidence / link | Owner | Blocker |
|---|---|---|---|---|---|
| Follow @Binance | Account action | USER_ACTION_REQUIRED | Not verifiable from repository | User | Logged-in Binance account required |
| Repost announcement | Account action | USER_ACTION_REQUIRED | Not verifiable from repository | User | Logged-in X account required |
| X submission | Prepared copy below | PREPARED | `docs/submission/X_SUBMISSION.md` | 0-infinity | User must post |
| Demo video | Submission media | LOCAL_ARTIFACT | `docs/submission/media/final/0-infinity-mechanism-led-candidate.mp4` — 1920×1080, 136.858s, embedded narration; reproducible with `render_mechanism_film.py` | 0-infinity | Upload destination still required |
| GitHub | `https://github.com/etvjay/0-infinity` | PASS | Public repository; final candidate SHA is pushed only after final review | 0-infinity | Verify origin/main after push |
| Survey | Prepared answers | USER_INPUT_REQUIRED | `docs/submission/SURVEY_ANSWERS.md` | User | Account-specific fields |
| Hosted Web | GitHub Pages workflow | HOSTED_PASS | `https://etvjay.github.io/0-infinity/`; landing, `/app/demo/`, `/app/try/`, and `/app/integrate/` returned HTTP 200 | 0-infinity | Static UI only; REST/MCP hosted separately |
| REST | Hosted Northflank runtime + local HTTP server | HOSTED_PASS | `https://http--zero-infinity-runtime--tw56snbf4tjj.code.run`; health, readiness, workflow, receipt, thesis, SHADOW, and PAPER_LIVE cold-tested at deployed SHA `e1f9d2fd3764eb63aefca7b75815ed2d8280c1ce` | 0-infinity | No production durability claim |
| MCP | Hosted HTTP JSON-RPC + local stdio | HOSTED_PASS | Same public URL; capabilities and full bounded cold sequence verified; `authority=false` | 0-infinity | No live-write tools |
| SDK docs | TypeScript client and hosted consumer fixture | HOSTED_PASS | `src/product/sdk.ts`, `examples/consumer`; hosted workflow/receipt smoke passed | 0-infinity | No authenticated exchange claim |
| Binance Skills | Adapter and evidence | BLOCKED_EXTERNAL | `docs/development/evidence/ZO-BIN-MB8-binance-skills-live.json` | 0-infinity | Binance eligibility restriction |
| Agentic MCP | Authorization boundary | AUTH_BLOCKED_EXTERNAL | `docs/development/evidence/ZO-BIN-MB8-binance-agentic-mcp-read.json` | 0-infinity | Official OAuth/client registration block |
| SHADOW | Deterministic replay | SHADOW_PASS | `npm run demo`, M-B7 evidence | 0-infinity | None |
| PAPER | Deterministic simulation | PAPER_MARKET_PASS | `ZO-BIN-MB8-paper-market-input.json`, `ZO-BIN-MB8-paper-market-session.json`; native bookTicker input, top-of-book model, simulated FILLED and edge-collapse refusal | 0-infinity | No synchronized depth/private account claim |
| TESTNET | Binance USDⓈ-M adapter | BLOCKED_EXTERNAL | `ZO-BIN-MB8-binance-testnet.json` | 0-infinity | Dedicated credentials unavailable |
| README | Product explanation and runbook | PASS | `README.md` | 0-infinity | Keep claims current |
| Security | Hostile-boundary tests and scans | LOCAL_PASS | `npm test`, `npm run secret-scan` | 0-infinity | External deployment security unproven |
| Clean clone | `npm ci` and full gates | PASS | Fresh clone at `c0917a2`: npm ci, check, 521/521 tests, build, demo, evidence validation, web check, consumer npm ci | 0-infinity | None |
| Cold review | Hosted REST/MCP/SDK cold clients | HOSTED_PASS | Public runtime health/readiness, hosted workflow/receipt/thesis, SHADOW/PAPER, MCP sequence, and SDK consumer verified; runtime reports `version: v1`, but no deployed commit SHA is claimed | Reviewer | Static Web hosting and REST/MCP are separate deployments |

## Prepared X submission

> 0-infinity puts evidence and bounded authority between an agent's opinion and a Binance trade. Advocate, Opposer, Market Analyst, and Council produce a verifiable ReasoningReceipt; deterministic gates can refuse an approved thesis when execution edge collapses. Try the local Web UI, REST, MCP, and TypeScript SDK in the public repository: https://github.com/etvjay/0-infinity

## Evidence ceiling

The current release proves local deterministic runtime behavior, SHADOW replay, PAPER simulation, bounded public Binance market-read evidence, and fail-closed adapter boundaries. It does not prove hosted availability, authenticated Agentic MCP, authenticated Binance account state, Futures Testnet execution, profitability, production durability, or live financial authority.

Mainnet financial write: `NOT_AUTHORIZED`.
