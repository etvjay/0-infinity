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

## Evidence boundary

The rehearsal output is **INJECTED_LOCAL** evidence. It is not evidence that an OpenAI-compatible provider was reachable or that a live model generated the artifacts. No provider credentials are present or requested in this environment, so live provider evidence is **BLOCKED_EXTERNAL**. The existing environment factory remains fail-closed when provider configuration is absent or malformed.

This rehearsal does not touch Testnet/LIVE, financial writes, frontend code, or authority semantics.
