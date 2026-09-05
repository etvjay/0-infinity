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
