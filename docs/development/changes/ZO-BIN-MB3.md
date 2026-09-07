# ZO-BIN-MB3 — Deterministic Execution Economics

## status

`IMPLEMENTED / LOCAL_PASS`

## baseline and scope

- baseline: `f8efb643f06196ceb241af706130613ededabe39`
- depends_on: `M-B1` economics convention and `M-B2-B` immutable `UsdMFuturesOrderBookView`
- scope: pure, read-only execution economics over a deeply immutable trusted order-book view; exact decimal-string/rational arithmetic; BUY ask-walk and SELL descending-bid-walk; explicit fee and assessed funding; explicit partial-fill policy; bounded policy checks; typed refusal/assessment results
- evidence ceiling: `LOCAL_PASS` only

## implementation

- `src/economics/index.ts` exports `assessExecutionEconomics`, explicit input/policy/funding/fee types, typed refusal codes, and deeply frozen deterministic results.
- The module does not compile, validate, consume, or mutate mandates and has no order/exchange submission path.
- Canonical metrics are quote `totalCost`, VWAP, midpoint-relative spread, best-reference-relative adverse slippage, explicit fee/funding bps, and `expectedMove - spread - slippage - fee - funding` executable edge.
- Visible depth is never extrapolated; insufficient depth rejects under `REJECT` and returns bounded actual depth under `ALLOW`.

## TDD and verification receipts

- RED: initial focused economics suite failed before implementation (`tsc: Cannot find module ../src/economics/index.js`); the Array.prototype pollution regression failed before canonical prototype inspection (`ASSESSMENT` instead of `REFUSAL`).
- GREEN: focused `node --test dist/tests/economics.test.js` — `12/12 PASS`.
- full suite: `npm test` — `370/370 PASS`.
- typecheck: `npm run check` — PASS.
- build: `npm run build` — PASS.
- diff check: `git diff --check` — PASS.
- review status: `LOCAL_PASS`; no live or external evidence claimed.

## exclusions and unresolved external evidence

No network, credentials, MCP, exchange read/write, mandate authority operation, order submission, cancellation, or live execution was attempted. This local slice does not prove exchange connectivity, live depth freshness, venue fee schedules, funding truth, production decimal precision requirements, or production authorization integration. M-B2-G remains `BLOCKED_EXTERNAL` and is not retried or bypassed.
