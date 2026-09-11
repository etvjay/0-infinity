# Binance Futures Testnet direct runner

The direct runner is credential-reference-only. It never accepts credentials in a mandate, workflow, CLI argument, or public API payload.

## Required server environment

```text
BINANCE_TESTNET_API_KEY=[server-side reference]
BINANCE_TESTNET_API_SECRET=[server-side reference]
BINANCE_TESTNET_MANDATE_FILE=/protected/path/mandate.json
BINANCE_TESTNET_EXPECTED_MOVE_BPS=<bounded current thesis input>
BINANCE_TESTNET_SLIPPAGE_BPS=<bounded policy input>
BINANCE_TESTNET_FEE_BPS=<bounded venue/account policy input>
```

The values above are placeholders. Do not commit or print credential values.

## Run

```bash
npm run testnet:direct
```

The runner:

1. verifies the serialized mandate;
2. performs the Binance Futures Testnet account-read gate;
3. reads exchange metadata;
4. reads book/mark/funding and account state;
5. runs the canonical evaluator and `RuntimeSupervisor(BINANCE_TESTNET)`;
6. submits through `OrderWriter` and `BinanceTestnetAdapter`;
7. cancels an acknowledged bounded order;
8. returns the canonical cancellation receipt.

Without all required configuration it exits with `BLOCKED_EXTERNAL` before network access. `LIVE_CONFIRMED` is not supported by this runner.

Authenticated proof still requires a dedicated Binance Futures Testnet account and approved server-side credential installation. No production endpoint is accepted.
