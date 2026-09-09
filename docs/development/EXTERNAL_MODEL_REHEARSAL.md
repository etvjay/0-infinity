# External-model local rehearsal

This rehearsal proves the replaceable intelligence seam without contacting a provider:

```bash
npm run rehearsal:external-model
```

The test injects a provider-shaped transport into `OpenAICompatibleModelAdapter`. It returns canonical `ADVOCATE`, `OPPOSE`, and `MARKET_ACCOUNT` artifacts for a fixed `BTCUSDT` opportunity. The service registers those adapters for the three pre-Council roles and binds `COUNCIL` to `BuiltinWorkerAdapter`.

Assertions cover:

- the injected transport is called exactly for the three worker roles;
- the returned evidence is bound to workflow, invocation, role, kind, and symbol;
- the workflow reaches a deterministic local Council result;
- the workflow composition marks worker evidence `external` and Council `builtin`;
- no Council invocation is sent to the external transport;
- readiness remains `hostedEvidence: false` and `liveWrites: false`.

## Local Ollama provider probe

A local Ollama instance was available at `http://127.0.0.1:11434/v1` with installed `llama3.2:1b` and `qwen2.5-7b-4k:latest` models. A direct OpenAI-compatible chat request returned HTTP 200 from Ollama after the model was warm.

The full 0-infinity provider-backed rehearsal was then attempted with `llama3.2:1b` through the existing service boundary. The service selected the external adapter for `ADVOCATE`, `OPPOSER`, and `MARKET_ANALYST`, kept `COUNCIL` on `builtin-worker-v1`, and returned `HTTP 200` with `mode: SHADOW`, `noWrite: true`, and `status: REASONING_INCOMPLETE` because the provider did not complete a valid bounded artifact flow within the existing five-second adapter timeout.

This proves local provider reachability plus fail-closed behavior. It does not establish a provider-backed completed Council decision. No timeout was relaxed and no authority boundary was widened.

## Evidence boundary

The injected rehearsal remains **INJECTED_LOCAL** evidence. The Ollama probe adds **LOCAL_PROVIDER_REACHABLE / PROVIDER_FLOW_REFUSED** evidence, not a completed provider-backed decision. Cloud provider credentials are not present or requested in this environment. The environment factory remains fail-closed when provider configuration is absent or malformed.

This rehearsal does not touch Testnet/LIVE, financial writes, frontend code, or authority semantics.
