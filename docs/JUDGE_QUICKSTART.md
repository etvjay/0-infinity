# Judge quickstart

This is the shortest reproducible path through the current public product. It uses the Cloudflare front door and performs no financial write.

## 1. Verify the hosted front door

```bash
BASE='https://zero-infinity-projection-store.microcosm.workers.dev'
curl -fsS "$BASE/health" | jq -c '{ok,version}'
curl -fsS "$BASE/readiness" | jq -c '{ready,mode,liveWrites,hostedEvidence}'
curl -fsS "$BASE/capabilities" | jq -c '{modes,writes,authority}'
```

Expected output shape from the current probe:

```text
{"ok":true,"version":"v1"}
{"ready":true,"mode":"bounded-local","liveWrites":false,"hostedEvidence":false}
{"modes":["SHADOW","PAPER_LIVE"],"writes":[],"authority":false}
```

These outputs establish a reachable bounded runtime, not production durability or exchange authority.

## 2. Run a bounded PAPER capability check

```bash
curl -fsS -X POST "$BASE/v1/paper-live" \
  -H 'content-type: application/json' \
  -d '{"symbol":"BTCUSDT","side":"LONG"}' \
  | jq -c '{mode,noWrite,status,error,paperReceipt}'
```

Expected output for this minimal request:

```text
{"mode":"PAPER_LIVE","noWrite":true,"status":"REFUSED","error":null,"paperReceipt":null}
```

`REFUSED` is expected: the minimal request does not include the canonical market/account/policy handoff. The service must not fabricate a mandate or receipt.

## 3. Run the agent-facing example

```bash
ZERO_INFINITY_MCP="$BASE/mcp" \
  node examples/mcp-agent/run-paper-workflow.mjs
```

The example performs `get_capabilities`, `get_readiness`, `run_paper_live`, and bounded artifact reads. Workflow IDs are generated at runtime and therefore vary. The result must remain no-write; a refusal is valid when the hosted runtime lacks the required canonical state.

## 4. Verify the repository locally

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run quickstart
npm run judge:local
```

`quickstart` runs the deterministic demo and readiness validation. `judge:local` runs type-checking, the full test suite, the web contract check, readiness validation, and the repository secret scan. In the current checkout, the full suite reports `1..540`, `# pass 540`; readiness reports `{"valid":true,...,"liveWriteStatus":"DISABLED"}`; and secret scan reports `{"valid":true,...,"valuesPrinted":false}`.

For a single hosted smoke command, also run:

```bash
npm run smoke:hosted
```

Expected final lines (workflow IDs are not involved and therefore stable in shape):

```text
{"base":"https://zero-infinity-projection-store.microcosm.workers.dev","health":{"ok":true,"version":"v1"},"capabilities":{"modes":["SHADOW","PAPER_LIVE"],"writes":[],"authority":false},"readiness":{"ready":true,"mode":"bounded-local","liveWrites":false}}
{"base":"https://zero-infinity-projection-store.microcosm.workers.dev","sdk":{"readiness":true,"paperStatus":"REFUSED","code":"CAPABILITY_DENIED"},"mcp":{"jsonrpc":"2.0","authority":false,"writes":[]}}
```

For the SDK consumer fixture:

```bash
npm run build
(cd examples/consumer && npm install --ignore-scripts && npm run smoke)
```

Expected result: a JSON line containing `"status":"COMPLETE"` and matching `workflowId`/`receiptWorkflowId`. This is a local consumer smoke test, not an authenticated exchange test.

## Evidence and non-claims

Current receipts are indexed in [`INDEX.md`](INDEX.md) and [`development/EVIDENCE_LEDGER.md`](development/EVIDENCE_LEDGER.md). The repository does not claim authenticated Agentic MCP, authenticated Binance Futures Testnet lifecycle, LIVE authority, profitability, HFT performance, or production durability. Older `code.run` URLs remain only in explicitly historical receipts/transcripts.
