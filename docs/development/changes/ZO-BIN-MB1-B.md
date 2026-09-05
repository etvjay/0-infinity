# ZO-BIN-MB1-B — Mandate Store + Supersession

Branch target: `agent/mb1-store`.

Implement durable mandate storage, atomic active selection, supersession, and consume-before-submission semantics. Old mandates remain historical but non-active. Restart/reload must not re-arm consumed authority.
