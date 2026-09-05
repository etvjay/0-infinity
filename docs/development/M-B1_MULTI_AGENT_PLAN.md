# M-B1 Multi-Agent Plan — Mandate Kernel

Dependency graph:

```text
A Domain + compileMandate ─┬→ D evaluateMandate
                           ├→ B MandateStore
                           └→ C State Machine
B + C + D ─────────────────→ E adversarial/integration tests
```

Parallel group 1: A, B, C.
Parallel group 2: D after A interface freeze; E after A-D integration.

Global gates: `npm run check`, `npm test`, plus negative tests for expiry, supersession, consumption, stale state, drift, costs, exposure, wrong binding, crash/ambiguous submission.

Evidence ceiling: `LOCAL_PASS`.
