# Cloudflare D1 projection store

This isolated Worker is the durable store for the product projection only. It exposes no financial, execution, order, or wallet routes.

The Worker is also the hosted REST/MCP front door. It forwards only the existing read/reasoning workflow routes to `UPSTREAM_URL`; it has no execution, order, wallet, or financial route. Successful upstream responses are persisted to D1 before the response is returned. If Northflank is unavailable, `GET /v1/workflows/:id`, `/receipt`, and `/thesis` are served from the last validated D1 projection. D1 authentication is used only inside the Worker and is never forwarded upstream or required from front-door callers.

## Contract

- `GET /v1/projections/snapshot` loads `{ revision, snapshot, provenance }`.
- `PUT /v1/projections/snapshot` saves `{ version: 1, expectedRevision, snapshot, provenance }`.
- Every request requires `Authorization: Bearer $PROJECTION_STORE_AUTH_TOKEN`.
- `snapshot.version` is `1`; workflow IDs must match their map keys and workflow fields are strictly checked.
- `provenance` is required and must be `{source: "zero-infinity", schema: "product-projection", schemaVersion: 1, generatedAt, workflows}`. Its workflow set and stack name/version must exactly match the snapshot.
- Saves use an optimistic revision fence. The D1 `UPDATE ... WHERE revision = ?` is submitted through D1 `batch()`, which is atomic. A stale writer receives `409` and must reload, reconcile, then retry explicitly.

The existing Node/Northflank product persistence is unchanged and is not D1-backed by this directory. There is intentionally no application adapter yet: the current `ProductProjectionPersistence` interface is synchronous, while Worker calls are asynchronous. Wiring it without changing the service lifecycle would risk fire-and-forget durability.

## Deploy

From the repository root, after setting the secret without printing it:

```sh
cd cloudflare/projection-store
npx wrangler secret put PROJECTION_STORE_AUTH_TOKEN
npx wrangler d1 migrations apply zero-infinity-projections --remote --config wrangler.toml
npx wrangler deploy --config wrangler.toml
```

The configured front door is `https://zero-infinity-projection-store.microcosm.workers.dev`. The upstream URL is in `wrangler.toml` as `UPSTREAM_URL`; change it there and redeploy if Northflank is replaced. The deployment step requires the operator to set `PROJECTION_STORE_AUTH_TOKEN` in the Cloudflare account; it is intentionally not present in this repository. Do not send that token to clients or Northflank.

`PROJECTION_STORE_AUTH_TOKEN` is required. The D1 binding is `DB`, configured in `wrangler.toml`. No token or secret belongs in git.

## Redacted smoke test

```sh
BASE_URL='https://<worker-host>' TOKEN='<redacted>' node - <<'NODE'
const body = {
  version: 1, expectedRevision: 0,
  snapshot: { version: 1, workflows: {} },
  provenance: { source: 'zero-infinity', schema: 'product-projection', schemaVersion: 1, generatedAt: Date.now(), workflows: {} }
};
const h = { authorization: `Bearer ${process.env.TOKEN}`, 'content-type': 'application/json' };
const put = await fetch(`${process.env.BASE_URL}/v1/projections/snapshot`, { method: 'PUT', headers: h, body: JSON.stringify(body) });
console.log('PUT', put.status, await put.text());
const get = await fetch(`${process.env.BASE_URL}/v1/projections/snapshot`, { headers: { authorization: `Bearer ${process.env.TOKEN}` } });
console.log('GET', get.status, (await get.json()).revision);
NODE
```
