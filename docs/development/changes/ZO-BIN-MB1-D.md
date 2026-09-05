# ZO-BIN-MB1-D — Deterministic Mandate Evaluator

Branch target: `agent/mb1-evaluator`.

Depends on A interface freeze and C state vocabulary.

Implement pure `evaluateMandate()` returning `ExecutionIntent | ExecutionRefusal`, rejecting stale state, drift, cost ceilings, edge collapse, exposure and binding violations. No Binance/network/model call during evaluation.
