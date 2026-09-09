# Submission copy and evidence boundary

## Judge-facing copy

**0-infinity is a control layer between trading agents and execution.** Agents can propose trades. 0-infinity checks evidence, forces opposition, runs a Council, issues short-lived authority, and re-checks market conditions before anything can execute.

The public experience is hosted at `https://etvjay.github.io/0-infinity/` and has four routes: the landing page, `/app/demo/`, `/app/try/`, and `/app/integrate/`. The UI is intentionally not a trading dashboard.

## Evidence ceiling

Verified locally and through the hosted runtime:

- deterministic reasoning, receipt/provenance structure, and no-write SHADOW/PAPER behavior;
- hosted REST, network MCP, and SDK consumer flows;
- hosted health/readiness and hosted SHADOW/PAPER no-write results;
- Binance public market input for bounded PAPER evidence.

Not proven and not claimed:

- authenticated Binance Agentic MCP, currently `AUTH_BLOCKED_EXTERNAL`;
- Binance Futures Testnet, currently `CREDENTIAL_REQUIRED`;
- LIVE/mainnet authority or financial writes, currently locked;
- profitability, HFT, production latency, or durable static Web hosting.

## Current demo sequence

1. Open the landing page and show the plain explanation and one vertical architecture diagram.
2. Open `/app/try/`, confirm `BTCUSDT`, `LONG`, and `SHADOW` or `PAPER`.
3. Run the existing no-write REST workflow.
4. Show the single linear result sequence: Advocate, Opposer, Market Analyst, Council, Reasoning Receipt, Execution Mandate, Execution Check.
5. Show the actual returned economics and canonical outcome. If the edge collapses, show `REFUSED` and `EDGE_COLLAPSED`; do not substitute a fabricated result.
6. Open only the reasoning receipt, mandate status, or raw JSON controls.
7. Open `/app/integrate/` and show the actual MCP, REST, and SDK examples.
8. Close with the bounded evidence states: SHADOW/PAPER pass, Binance public market read pass, Testnet credential requirement, Agentic MCP authentication block, and LIVE not authorized.

The current video script is `docs/submission/VIDEO_SCRIPT.md`. Existing binary media created for the former console is retained as historical media until a fresh capture of the simplified UI is produced; it must not be presented as a current UI capture.
