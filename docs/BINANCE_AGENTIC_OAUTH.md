# Binance Agentic MCP OAuth bridge

The public client metadata document is:

```text
https://etvjay.github.io/0-infinity/.well-known/binance-oauth-client.json
```

It declares the fixed redirect:

```text
http://127.0.0.1:8765/callback
```

## Run on AWS: manual mode (no tunnel)

```bash
npm run binance:oauth -- --probe
```

The AWS terminal prints an authorization URL. Open it on the laptop. When the browser redirects to the loopback URL, copy the complete address-bar URL and paste it into the AWS terminal. The PKCE verifier remains in memory on AWS; the token is exchanged and probed in memory. The token is not printed or stored.

## Run on AWS: listener mode with laptop forwarding

On the laptop, first establish the tunnel:

```bash
ssh -N -T \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -L 8765:127.0.0.1:8765 \
  <aws-user>@<aws-host>
```

In a second AWS terminal:

```bash
npm run binance:oauth -- --listen --probe
```

Then open the printed URL on the laptop. Binance redirects to `127.0.0.1:8765`; SSH forwards that callback to the AWS listener.

## Safety boundary

- No API key or client secret is used by this OAuth flow.
- OAuth tokens are held in memory only.
- Tokens are not printed, committed, or written to disk.
- `--probe` performs Agentic MCP initialization only; it does not trade, transfer, or withdraw.
- `BINANCE_OAUTH_CLIENT_ID` and `BINANCE_OAUTH_REDIRECT_URI` may override defaults, but the redirect URI must match the public metadata document.
