# Evidence directory

This directory contains immutable-style receipts from local tests, hosted probes, and external-boundary experiments. Receipts preserve the endpoint, status, and limitations observed when they were collected; they are not automatically current deployment instructions.

## Current front door

Current user and judge instructions use:

`https://zero-infinity-projection-store.microcosm.workers.dev`

Northflank is a private upstream behind the Cloudflare Worker. It is not a client endpoint.

## Historical endpoint policy

Some older receipts contain `https://http--zero-infinity-runtime--tw56snbf4tjj.code.run`. That URL is retained only to preserve historical evidence and is superseded for current use. The affected hosted receipt is explicitly marked `historical: true`; the example transcript is likewise labeled historical. Do not copy that URL into new user, judge, SDK, REST, or MCP instructions.

Evidence does not upgrade claims beyond what it directly proves. In particular, hosted probes do not prove authenticated Binance access, production durability, profitability, or live financial authority.