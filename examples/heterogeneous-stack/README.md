# Heterogeneous BYO stack

This runnable consumer proves a real local heterogeneous stack without editing 0-infinity source:

```text
Advocate       → OpenAI-compatible Ollama model (or HTTP worker in packed consumer proof)
Opposer        → separate HTTP worker process
Market Analyst → separate MCP worker process
Council        → separate HTTP Council worker
```

Run from the repository root:

```bash
npm run build
node examples/heterogeneous-stack/run.mjs
```

The two worker processes listen only on loopback and return the canonical RoleArtifact envelope. The Ollama call crosses the OpenAI-compatible network boundary. The example is local evidence, not hosted-provider or exchange evidence. It performs no financial write.
