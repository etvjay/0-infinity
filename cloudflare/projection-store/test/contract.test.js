import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const token = "test-token";
const env = { PROJECTION_STORE_AUTH_TOKEN: token, DB: fakeDb() };

function request(method, path, body, authorization = `Bearer ${token}`) {
  return new Request(`https://projection-store.test${path}`, {
    method,
    headers: { authorization, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function snapshot() {
  return {
    version: 1,
    workflows: {
      "wf-1": {
        workflowId: "wf-1", stackName: "stack", stackVersion: "v1", createdAt: 10,
        status: "CREATED", opportunity: { symbol: "BTCUSDT" }, composition: [],
      },
    },
  };
}
function provenance() {
  return {
    source: "zero-infinity", schema: "product-projection", schemaVersion: 1,
    generatedAt: 20, workflows: { "wf-1": { stackName: "stack", stackVersion: "v1" } },
  };
}

function fakeDb() {
  let row = { revision: 0, snapshot_json: JSON.stringify({ version: 1, workflows: {} }), provenance_json: JSON.stringify({ source: "zero-infinity", schema: "product-projection", schemaVersion: 1, generatedAt: 0, workflows: {} }) };
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() { return sql.includes("FROM projection_snapshots") ? { ...row } : null; },
            async run() {
              if (sql.startsWith("UPDATE")) {
                if (args[4] !== row.revision) return { meta: { changes: 0 } };
                row = { revision: args[0], snapshot_json: args[1], provenance_json: args[2] };
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
}

test("loads the singleton snapshot only with bearer authentication", async () => {
  const response = await worker.fetch(request("GET", "/v1/projections/snapshot"), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 0);
  assert.equal((await worker.fetch(request("GET", "/v1/projections/snapshot", undefined, "Bearer wrong"), env)).status, 401);
});

test("saves a validated snapshot with an atomic revision fence", async () => {
  const body = { version: 1, expectedRevision: 0, snapshot: snapshot(), provenance: provenance() };
  const response = await worker.fetch(request("PUT", "/v1/projections/snapshot", body), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 1);
  const loaded = await worker.fetch(request("GET", "/v1/projections/snapshot"), env);
  assert.equal(loaded.status, 200);
  assert.deepEqual(await loaded.json(), { revision: 1, snapshot: body.snapshot, provenance: body.provenance });
});

test("rejects workflow provenance drift and stale revisions", async () => {
  const drift = { version: 1, expectedRevision: 1, snapshot: snapshot(), provenance: { ...provenance(), workflows: { "wf-1": { stackName: "other", stackVersion: "v1" } } } };
  assert.equal((await worker.fetch(request("PUT", "/v1/projections/snapshot", drift), env)).status, 400);
  const stale = { version: 1, expectedRevision: 0, snapshot: snapshot(), provenance: provenance() };
  assert.equal((await worker.fetch(request("PUT", "/v1/projections/snapshot", stale), env)).status, 409);
});

test("does not expose execution or financial routes", async () => {
  assert.equal((await worker.fetch(request("POST", "/v1/execute"), env)).status, 404);
  assert.equal((await worker.fetch(request("GET", "/v1/projections/snapshot/execute"), env)).status, 404);
});
