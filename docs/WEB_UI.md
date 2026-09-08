# Web UI

The `web/` directory is a dependency-free static public surface with four clearly separated views:

- **LANDING** — what 0-infinity is and why an agent uses it;
- **TRY** — the primary no-write SHADOW/PAPER workflow demo;
- **INTEGRATE** — truthful MCP, REST, and SDK entry points;
- **PROOF** — a compact list of bounded evidence states.

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

The form supports `BTCUSDT`, `LONG`, `SHADOW`, and `PAPER`. TESTNET is displayed as `Credentials required` and disabled. LIVE is displayed as `NOT AUTHORIZED` and is never selectable.

SHADOW and PAPER call the existing REST endpoints with `credentials: omit`. Results expose the bounded workflow sequence, actual outcome, economics when returned, reasoning receipt, raw JSON, and a visibly unauthorized mandate control. No credential fields or financial-write controls exist.

The UI does not infer live or testnet state from a failed request. No private chain-of-thought is displayed.

## Integration surface

The tabs show the implemented MCP tool names, the existing REST route sequence, and the `ZeroInfinityClient` SDK methods. Endpoint values are runtime configuration, not invented fixed infrastructure.

The page distinguishes local/static presentation, hosted REST/MCP/SDK evidence, Binance public market evidence, unauthenticated Agentic MCP, credential-gated Testnet, and locked LIVE authority. See `docs/MCP.md` and `docs/DEPLOYMENT.md` for the current evidence boundary.
