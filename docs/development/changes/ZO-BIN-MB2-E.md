# ZO-BIN-MB2-E — Bounded Public USDⓈ-M Live-Read Probe

## status

`LIVE_READ_PASS` (bounded public market read only)

## scope and evidence ceiling

- product family: `USD_M_FUTURES_UM`
- endpoint: `wss://fstream.binance.com/ws`
- stream: `btcusdt@bookTicker`
- credentials/private data: none
- exchange writes: none; no orders, cancels, transfers, withdrawals, or account methods
- source changes: none
- evidence ceiling: `LIVE_READ_PASS` for one bounded public WebSocket market-stream probe; this does not establish account connectivity, order-book snapshot/reconciliation, reconnect behavior, execution, production readiness, or profitability

## receipt

- exact receipt: `docs/development/evidence/ZO-BIN-MB2-E-public-live-read.json`
- probe command: `python3 /tmp/binance_probe.py > /tmp/ZO-BIN-MB2-E-public-live-read.json`
- artifact copy: `cp /tmp/ZO-BIN-MB2-E-public-live-read.json docs/development/evidence/ZO-BIN-MB2-E-public-live-read.json`
- validator command: `node /tmp/validate_binance.mjs`
- regression command: `npm test`

## observed

- UTC probe interval: `2026-09-07T08:23:54.857868Z` through `2026-09-07T08:23:55.655348Z`
- TLS/WebSocket handshake: `HTTP/1.1 101 Switching Protocols`; `Sec-WebSocket-Accept` verified
- subscription request: `{"method":"SUBSCRIBE","params":["btcusdt@bookTicker"],"id":1}`
- subscription ACK: `{"result":null,"id":1}`
- first valid event raw text: `{"e":"bookTicker","u":11495293530344,"s":"BTCUSDT","ps":"BTCUSDT","b":"79426.90","B":"6.302","a":"79427.00","A":"7.831","T":1788769435498,"E":1788769435498,"st":1}`
- observed event fields: `e=bookTicker`, `s=BTCUSDT`, `ps=BTCUSDT`, `st=1`, `u=11495293530344`, bid `79426.90 x 6.302`, ask `79427.00 x 7.831`
- existing validator: `UsdMFuturesMarketState.ingest` returned `PASS`, preserving update version `11495293530344`
- unsubscribe request: `{"method":"UNSUBSCRIBE","params":["btcusdt@bookTicker"],"id":2}`
- unsubscribe ACK: `{"result":null,"id":2}`
- client closed the TLS socket after the unsubscribe ACK; no server close frame was observed before client close

## verification

- `npm run build`: `PASS`
- existing full suite: `342/342 PASS`
- `git diff --check`: `PASS`

## limitations and non-claims

This is direct public WebSocket evidence, not an implementation-integration or production-readiness approval. The injected lifecycle remains locally tested; this probe did not alter source or claim that the injected transport itself is wired to a real socket. No REST snapshot, depth stream, account/user-data stream, private authentication, or exchange write was exercised. M-B2 overall promotion and Ground Truth were not updated.
