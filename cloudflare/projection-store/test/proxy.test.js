import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const token = "proxy-store-token";
function workflow(status = "CREATED") {
  return { workflowId: "wf-proxy", stackName: "stack", stackVersion: "v1", createdAt: 10, status, opportunity: { symbol: "BTCUSDT" }, composition: [], ...(status === "COMPLETE" ? { thesis: { thesisId: "wf-proxy" }, receipt: { workflowId: "wf-proxy" } } : {}) };
}
function db() {
  let row = { revision: 0, snapshot_json: JSON.stringify({ version: 1, workflows: {} }), provenance_json: JSON.stringify({ source: "zero-infinity", schema: "product-projection", schemaVersion: 1, generatedAt: 0, workflows: {} }) };
  return {
    prepare(sql) { return { bind(...args) { return { async first() { return sql.includes("FROM projection_snapshots") ? { ...row } : null; }, async run() { if (sql.startsWith("UPDATE")) { if (args[4] !== row.revision) return { meta: { changes: 0 } }; row = { revision: args[0], snapshot_json: args[1], provenance_json: args[2] }; } return { meta: { changes: 1 } }; } }; } }; },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
}
function request(method, path, body) { return new Request(`https://front-door.test${path}`, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); }

test("proxy persists a successful workflow response before returning it", async () => {
  const original = globalThis.fetch;
  const upstream = workflow();
  const store = db();
  let forwardedAuthorization;
  globalThis.fetch = async (_url, options) => { forwardedAuthorization = options.headers.get("authorization"); return new Response(JSON.stringify(upstream), { status: 201, headers: { "content-type": "application/json" } }); };
  try {
    const env = { PROJECTION_STORE_AUTH_TOKEN: token, UPSTREAM_URL: "https://northflank.example", DB: store };
    const response = await worker.fetch(request("POST", "/v1/workflows", { symbol: "BTCUSDT" }), env);
    assert.equal(response.status, 201);
    assert.equal(forwardedAuthorization, null);
    const loaded = await worker.fetch(new Request("https://store.test/v1/projections/snapshot", { headers: { authorization: `Bearer ${token}` } }), env);
    assert.equal(loaded.status, 200);
    assert.deepEqual((await loaded.json()).snapshot.workflows["wf-proxy"], upstream);
  } finally { globalThis.fetch = original; }
});

test("proxy forwards empty POSTs without manufacturing a content type", async () => {
  const original = globalThis.fetch;
  let forwardedBody;
  globalThis.fetch = async (_url, options) => { forwardedBody = options.body; return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }); };
  try {
    const response = await worker.fetch(request("POST", "/v1/workflows/wf-proxy/submit"), { PROJECTION_STORE_AUTH_TOKEN: token, UPSTREAM_URL: "https://northflank.example", DB: db() });
    assert.equal(response.status, 200);
    assert.equal(forwardedBody, undefined);
  } finally { globalThis.fetch = original; }
});

test("proxy recovers workflow reads from D1 when upstream is unavailable", async () => {
  const store = db();
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("upstream down"); };
  try {
    const snapshot = { version: 1, workflows: { "wf-proxy": workflow() } };
    const provenance = { source: "zero-infinity", schema: "product-projection", schemaVersion: 1, generatedAt: 10, workflows: { "wf-proxy": { stackName: "stack", stackVersion: "v1" } } };
    await worker.fetch(new Request("https://store.test/v1/projections/snapshot", { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ version: 1, expectedRevision: 0, snapshot, provenance }) }), { PROJECTION_STORE_AUTH_TOKEN: token, DB: store });
    const response = await worker.fetch(request("GET", "/v1/workflows/wf-proxy"), { PROJECTION_STORE_AUTH_TOKEN: token, UPSTREAM_URL: "https://northflank.example", DB: store });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), workflow());
  } finally { globalThis.fetch = original; }
});

test("proxy does not proxy execution routes or expose the D1 token", async () => {
  const original = globalThis.fetch; let called = false;
  globalThis.fetch = async () => { called = true; return new Response("should not proxy", { status: 200 }); };
  try {
    const response = await worker.fetch(new Request("https://front-door.test/v1/execute", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" }), { PROJECTION_STORE_AUTH_TOKEN: token, UPSTREAM_URL: "https://northflank.example", DB: db() });
    assert.equal(response.status, 404);
    assert.equal(called, false);
  } finally { globalThis.fetch = original; }
});
