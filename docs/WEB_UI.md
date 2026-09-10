# Web UI

The `web/` directory is a dependency-free static public surface with four clearly separated routes/views:

- **Landing** (`/`) — what 0-infinity is and why an agent uses it;
- **Demo** (`/app/demo/`) — one canonical read-only five-stage story: Opportunity, Challenge, Judgment, Authority, Reality;
- **Try** (`/app/try/`) — the same five-stage runtime with Advisory, SHADOW, and bounded PAPER modes;
- **Integrate** (`/app/integrate/`) — task-driven paths to use 0-infinity, bring intelligence, receive/verify a mandate, and connect execution.

It is not a trading dashboard. It does not expose Markets, Portfolio, Analytics, Bots, Strategies, Activity, Settings, or Readiness navigation.

## Local use

```bash
npm run api                 # REST at http://127.0.0.1:8787
python3 -m http.server 4173 --directory web
```

The page uses a runtime-configurable API base:

```js
window.__ZERO_INFINITY_CONFIG__ = { apiBase: 'http://127.0.0.1:8787' };
```

The default is local `http://127.0.0.1:8787`. A hosted deployment may set the same value before loading `app.js`; the public page does not hard-code a hosted backend dependency.

## Try surface

The form supports `BTCUSDT`, `LONG`, `ADVISORY`, `SHADOW`, and `PAPER`. Advisory returns `MANDATE_ISSUED` with `noWrite: true`; it does not invoke a venue connector. TESTNET is displayed as `Credentials required` and disabled. LIVE is displayed as `NOT AUTHORIZED` and is never selectable.

All three modes render the same five questions: what was submitted, what the system found, what the Council decided, what authority exists, and what happened. SHADOW calls the existing REST endpoint with `credentials: omit`. PAPER is exposed as a bounded capability check and returns `REFUSED/CAPABILITY_DENIED` for the current minimal form because no canonical market/account/policy state is supplied; it does not create a PaperReceipt. Results expose the bounded workflow sequence and returned reasoning artifacts. No credential fields or financial-write controls exist.

The UI does not infer live or testnet state from a failed request. No private chain-of-thought is displayed.

## Integration surface

The tabs show the implemented MCP tool names, the existing REST route sequence, and the `ZeroInfinityClient` SDK methods. Endpoint values are runtime configuration, not invented fixed infrastructure.

The page distinguishes local/static presentation, hosted REST/MCP/SDK evidence, Binance public market evidence, unauthenticated Agentic MCP, credential-gated Testnet, and locked LIVE authority. See `docs/MCP.md` and `docs/DEPLOYMENT.md` for the current evidence boundary.
