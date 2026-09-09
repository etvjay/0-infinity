const SNAPSHOT_PATH = "/v1/projections/snapshot";
const SOURCE = "zero-infinity";
const SCHEMA = "product-projection";
const STATUSES = new Set(["CREATED", "COMPLETE", "REASONING_INCOMPLETE", "REFUSE"]);
const EXECUTION_STATUSES = new Set(["READY", "TRIGGERED", "VALIDATING", "SUBMITTING", "ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED", "REFUSED", "REJECTED", "FAILED", "UNKNOWN", "CANCELLED"]);

const isRecord = (x) => x !== null && typeof x === "object" && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const exact = (x, keys) => isRecord(x) && Object.keys(x).every((k) => keys.includes(k));
const text = (x) => typeof x === "string" && x.length > 0 && x.length <= 512;
const finite = (x) => typeof x === "number" && Number.isFinite(x);
const jsonTree = (x, seen = new Set()) => {
  if (x === null || typeof x !== "object") return true;
  if (seen.has(x)) return false;
  seen.add(x);
  return (Array.isArray(x) ? x.every((v) => jsonTree(v, seen)) : exact(x, Object.keys(x)) && Object.values(x).every((v) => jsonTree(v, seen)));
};
const fail = (message) => { throw new Error(message); };

function validateWorkflow(value, id) {
  const keys = ["workflowId", "stackName", "stackVersion", "createdAt", "status", "opportunity", "composition", "thesis", "receipt", "execution", "error"];
  if (!exact(value, keys) || value.workflowId !== id || !text(value.workflowId) || !text(value.stackName) || !text(value.stackVersion) || !finite(value.createdAt) || value.createdAt < 0 || !STATUSES.has(value.status) || !isRecord(value.opportunity) || !Array.isArray(value.composition) || !jsonTree(value)) fail(`invalid workflow ${id}`);
  if (value.status === "COMPLETE" && (!isRecord(value.thesis) || !isRecord(value.receipt))) fail(`incomplete workflow ${id}`);
  if (value.status !== "COMPLETE" && (value.thesis !== undefined || value.receipt !== undefined)) fail(`unexpected completion fields in ${id}`);
  if (value.execution !== undefined && (!isRecord(value.execution) || value.execution.workflowId !== id || !text(value.execution.mandateId) || !isRecord(value.execution.runtime) || !EXECUTION_STATUSES.has(value.execution.status))) fail(`invalid execution projection ${id}`);
  if (value.error !== undefined && !text(value.error)) fail(`invalid workflow error ${id}`);
}

function validateSnapshot(value) {
  if (!exact(value, ["version", "workflows"]) || value.version !== 1 || !isRecord(value.workflows) || !jsonTree(value)) fail("invalid snapshot schema");
  for (const [id, workflow] of Object.entries(value.workflows)) validateWorkflow(workflow, id);
  return value;
}

function validateProvenance(value, snapshot) {
  if (!exact(value, ["source", "schema", "schemaVersion", "generatedAt", "workflows"]) || value.source !== SOURCE || value.schema !== SCHEMA || value.schemaVersion !== 1 || !finite(value.generatedAt) || value.generatedAt < 0 || !isRecord(value.workflows)) fail("invalid provenance");
  const ids = Object.keys(snapshot.workflows).sort();
  const provenanceIds = Object.keys(value.workflows).sort();
  if (ids.length !== provenanceIds.length || ids.some((id, i) => id !== provenanceIds[i])) fail("provenance workflow set mismatch");
  for (const id of ids) {
    const p = value.workflows[id];
    const w = snapshot.workflows[id];
    if (!exact(p, ["stackName", "stackVersion"]) || p.stackName !== w.stackName || p.stackVersion !== w.stackVersion) fail(`provenance mismatch for ${id}`);
  }
  return value;
}

function authorized(request, env) {
  const supplied = request.headers.get("authorization") || "";
  const expected = `Bearer ${env.PROJECTION_STORE_AUTH_TOKEN || ""}`;
  if (!env.PROJECTION_STORE_AUTH_TOKEN || supplied.length !== expected.length) return false;
  let different = 0;
  for (let i = 0; i < supplied.length; i++) different |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  return different === 0;
}
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function readRow(db) {
  const row = await db.prepare("SELECT revision, snapshot_json, provenance_json FROM projection_snapshots WHERE id = 'current'").bind().first();
  if (!row || !Number.isInteger(row.revision) || row.revision < 0) throw new Error("projection row unavailable");
  const snapshot = JSON.parse(row.snapshot_json);
  const provenance = JSON.parse(row.provenance_json);
  validateSnapshot(snapshot); validateProvenance(provenance, snapshot);
  return { revision: row.revision, snapshot, provenance };
}

export default {
  async fetch(request, env) {
    if (!authorized(request, env)) return response({ error: "unauthorized" }, 401);
    const url = new URL(request.url);
    if (url.pathname !== SNAPSHOT_PATH) return response({ error: "not found" }, 404);
    if (request.method === "GET") {
      try { return response(await readRow(env.DB)); } catch { return response({ error: "projection unavailable" }, 500); }
    }
    if (request.method !== "PUT") return response({ error: "method not allowed" }, 405);
    try {
      const body = await request.json();
      if (!exact(body, ["version", "expectedRevision", "snapshot", "provenance"]) || body.version !== 1 || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) fail("invalid save envelope");
      validateSnapshot(body.snapshot); validateProvenance(body.provenance, body.snapshot);
      const current = await readRow(env.DB);
      if (current.revision !== body.expectedRevision) return response({ error: "revision conflict", revision: current.revision }, 409);
      const nextRevision = current.revision + 1;
      const result = await env.DB.batch([env.DB.prepare("UPDATE projection_snapshots SET revision = ?, snapshot_json = ?, provenance_json = ?, updated_at = ? WHERE id = 'current' AND revision = ?").bind(nextRevision, JSON.stringify(body.snapshot), JSON.stringify(body.provenance), Date.now(), current.revision)]);
      if (!result[0]?.meta || result[0].meta.changes !== 1) return response({ error: "revision conflict" }, 409);
      return response({ revision: nextRevision });
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof Error) return response({ error: error.message.startsWith("invalid") || error.message.startsWith("provenance") || error.message.startsWith("incomplete") || error.message.startsWith("unexpected") ? error.message : "invalid request" }, 400);
      return response({ error: "invalid request" }, 400);
    }
  },
};

export { validateProvenance, validateSnapshot };
