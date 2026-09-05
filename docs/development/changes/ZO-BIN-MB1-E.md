# ZO-BIN-MB1-E — Adversarial Test Harness

Branch target: `agent/mb1-adversarial-tests`.

Independently mutate every hard invariant: expiry, symbol swap, widened authority, stale state, spread/slippage/funding + epsilon, edge below floor, double consume, superseded trigger, crash/reload, client identity replay, NaN/infinite economics.

Tester may not repair production code and self-certify.
