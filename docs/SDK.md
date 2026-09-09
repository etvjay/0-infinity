# SDK

The package export `0-infinity/sdk` provides `ZeroInfinityClient`, a thin TypeScript client over an injected `fetch` implementation. It never stores credentials or adds authority. The client covers workflow creation/submission, workflow/receipt/thesis reads, SHADOW, PAPER_LIVE, capabilities, and readiness; use the `/mcp` HTTP surface separately for JSON-RPC MCP calls.

```ts
import { ZeroInfinityClient } from "0-infinity/sdk";

const client = new ZeroInfinityClient(fetch, "https://http--zero-infinity-runtime--tw56snbf4tjj.code.run");
const readiness = await client.readiness();
const result = await client.runShadowWorkflow({ symbol: "BTCUSDT" });
```

`serviceFetch` is available for local/in-process tests. The SDK has no authenticated exchange consumer or live-write method; hosted calls are bounded SHADOW/PAPER/read-only calls.
