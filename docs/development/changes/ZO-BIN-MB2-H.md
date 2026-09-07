# ZO-BIN-MB2-H — Bounded Authenticated Account-State Adapter

## status

`IMPLEMENTED / LOCAL_PASS / BLOCKED_EXTERNAL`

## baseline and scope

- baseline: `e4cbd9568aa9ca1c2d7f96a9c50fc2670714d2a8`
- depends_on: `M-B2-C` local account normalization
- product family: `USD_M_FUTURES_UM`
- scope: injectable authenticated `AccountStateSource`, secret boundary, deterministic replay/mock adapter tests, fail-closed credential validation, versioned `LiveAccountState` handoff
- evidence ceiling: `LOCAL_PASS`; private live account reads remain explicitly `BLOCKED_EXTERNAL`.
- exact classification: `PRIVATE_ACCOUNT_LIVE_READ=BLOCKED_EXTERNAL`.

## implementation

- `src/account/index.ts` exports `AccountAuthConfig`, `AuthenticatedAccountStateSource`, `AccountStateAdapter`, `LiveAccountState`, `MissingAccountCredentialsError`, and `createAuthenticatedUsdMFuturesAccountAdapter`.
- The adapter accepts credentials only at `read()` call time, validates non-empty key/secret values, passes them to the injected source, and does not retain or log them. Missing or malformed credentials fail before source invocation.
- Source payloads continue through the unchanged `normalizeUsdMFuturesAccountState` function. The adapter returns a deeply frozen `LiveAccountState` with handoff version `1`; its source metadata is `PRIVATE` with evidence ceiling `BLOCKED_EXTERNAL`.
- `tests/account.adapter.test.ts` covers injected-source handoff, missing-credential refusal, no-secret-log/no-adapter-retention behavior, and deterministic JSON replay.

## TDD and verification receipts

- RED: focused inherited-credential regression failed as expected with `AssertionError: Missing expected rejection` (4 passing, 1 failing), proving prototype credentials were accepted.
- GREEN: focused account adapter run `5/5 PASS`, including inherited-credential rejection with no source invocation.
- full suite: `358/358 PASS` (`npm test`).
- typecheck: `PASS` (`npm run check`).
- build: `PASS` (`npm run build`).
- diff check: `PASS` (`git diff --check`).

## evidence ceiling and blockers

No Binance REST/WebSocket connection, listenKey, credential discovery, private account read, MCP, order, cancel, or exchange write was attempted. The injected source contract is locally exercised only; authentication signing, transport behavior, account-stream continuity, and production secret management remain unresolved and require separately authorized external evidence.
