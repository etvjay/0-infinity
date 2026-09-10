# SDK

The package export `0-infinity/sdk` provides `ZeroInfinityClient`, a thin TypeScript client over an injected `fetch` implementation. It never stores credentials or adds authority. The client covers workflow creation/submission, workflow/receipt/thesis/mandate reads, SHADOW, ADVISORY mandate issuance, the bounded PAPER_LIVE capability check, capabilities, and readiness. ADVISORY returns a portable no-write `ExecutionMandate`; it does not invoke a venue connector.

```ts
import { ZeroInfinityClient } from "0-infinity/sdk";

const client = new ZeroInfinityClient(fetch, "https://zero-infinity-projection-store.microcosm.workers.dev");
const readiness = await client.readiness();
const result = await client.runShadowWorkflow({ symbol: "BTCUSDT" });
const compilerPolicy = { accountId: "advisory-account", validityMs: 30_000, minExecutableEdgeBps: 1, maxSpreadBps: 20, maxSlippageBps: 1, maxFeeBps: 1, maxFundingCostBps: 1, maxNotional: 100, maxLossBps: 100, execution: "LIMIT", minEntryPrice: 100_000, maxEntryPrice: 100_000, entryTrigger: "BELOW" } as const;
const advisory = await client.runAdvisoryWorkflow(
  { symbol: "BTCUSDT", venue: "BINANCE", product: "USD_M_FUTURES" },
  compilerPolicy,
  { stateVersion: "1n", observedAt: Date.now(), receivedAt: Date.now(), markPrice: 100_000 },
);
```

`serviceFetch` is available for local/in-process tests. The SDK has no authenticated exchange consumer or live-write method; hosted calls remain bounded SHADOW/PAPER/ADVISORY/read-only calls and require the deployment's normal authorization for non-read routes.
