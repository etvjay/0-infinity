# SDK consumer fixture

This is a clean consumer-shaped example that uses the repository build output. It
runs without installing dependencies inside `examples/consumer` and never copies
`node_modules` into the example.

From the repository root, start the local read-only REST service in one terminal:

```bash
npm ci
npm run api
```

Then, in a second terminal:

```bash
npm run build
npm --prefix examples/consumer run smoke
```

Set `ZERO_INFINITY_BASE_URL` to a local REST base such as `http://127.0.0.1:8787` when running against the local service. Without it, the fixture targets the public Cloudflare front door.

The smoke test creates a workflow, submits the opportunity, and reads the
canonical ReasoningReceipt through `ZeroInfinityClient`. It does not create
exchange authority or perform a financial write. The root command
`npm run sdk:mcp:smoke` is the credential-free hosted SDK/MCP smoke.
