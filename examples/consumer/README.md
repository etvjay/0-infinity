# SDK consumer fixture

This is a clean consumer-shaped project. From the repository root:

```bash
npm run build
cd examples/consumer
npm install --ignore-scripts
npm run smoke
```

Set `ZERO_INFINITY_BASE_URL` to a deployed REST base URL when one exists. Without it, the fixture targets the local REST server at `http://127.0.0.1:8787`.

The smoke test creates a workflow, submits the opportunity, and reads the canonical ReasoningReceipt through `ZeroInfinityClient`. It does not create exchange authority or perform a financial write.
