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
  const keys = ["workflowId", "stackName", "stackVersion", "createdAt", "status", "opportunity", "composition", "reasoningProfile", "reasoningBudget", "reasoningTiming", "thesis", "receipt", "mandate", "execution", "error"];
  if (!exact(value, keys) || value.workflowId !== id || !text(value.workflowId) || !text(value.stackName) || !text(value.stackVersion) || !finite(value.createdAt) || value.createdAt < 0 || !STATUSES.has(value.status) || !isRecord(value.opportunity) || !Array.isArray(value.composition) || !jsonTree(value)) fail(`invalid workflow ${id}`);
  if (value.reasoningProfile !== undefined && !["FAST", "STANDARD", "DEEP"].includes(value.reasoningProfile)) fail(`invalid reasoning profile ${id}`);
  if (value.reasoningBudget !== undefined) { const b = value.reasoningBudget; if (!isRecord(b) || !["FAST", "STANDARD", "DEEP"].includes(b.profile) || !finite(b.roleTimeoutMs) || !finite(b.councilTimeoutMs) || !finite(b.workflowDeadlineMs) || b.roleTimeoutMs <= 0 || b.councilTimeoutMs <= 0 || b.workflowDeadlineMs <= 0 || (b.maxEvidenceAgeMs !== undefined && (!finite(b.maxEvidenceAgeMs) || b.maxEvidenceAgeMs < 0)) || (value.reasoningProfile !== undefined && value.reasoningProfile !== b.profile)) fail(`invalid reasoning budget ${id}`); }
  if (value.reasoningTiming !== undefined && !isRecord(value.reasoningTiming)) fail(`invalid reasoning timing ${id}`);
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
  for (const id of ids) { const p = value.workflows[id]; const w = snapshot.workflows[id]; if (!exact(p, ["stackName", "stackVersion"]) || p.stackName !== w.stackName || p.stackVersion !== w.stackVersion) fail(`provenance mismatch for ${id}`); }
  return value;
}
function authorized(request, env) {
  const supplied = request.headers.get("authorization") || "";
  const expected = `Bearer ${env.PROJECTION_STORE_AUTH_TOKEN || ""}`;
  if (!env.PROJECTION_STORE_AUTH_TOKEN || supplied.length !== expected.length) return false;
  let different = 0; for (let i = 0; i < supplied.length; i++) different |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  return different === 0;
}
const allowedOrigin = (origin) => {
  if (!origin) return undefined;
  if (origin === "https://etvjay.github.io") return origin;
  try { const parsed = new URL(origin); if ((parsed.protocol === "http:" || parsed.protocol === "https:") && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) return origin; } catch { /* reject malformed origins */ }
  return undefined;
};
const response = (body, status = 200, origin) => {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (origin) { headers["access-control-allow-origin"] = origin; headers.vary = "Origin"; }
  return new Response(JSON.stringify(body), { status, headers });
};
function cors(request) {
  const origin = allowedOrigin(request.headers.get("origin"));
  if (request.method !== "OPTIONS") return { origin, proceed: true };
  if (!origin) return { origin: undefined, proceed: false, result: response({ error: "CORS_ORIGIN_NOT_ALLOWED" }, 403) };
  const result = new Response(null, { status: 204, headers: { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, PUT, OPTIONS", "access-control-allow-headers": "content-type, accept, authorization", "access-control-max-age": "600", vary: "Origin" } });
  return { origin, proceed: false, result };
}
async function readRow(db) {
  const row = await db.prepare("SELECT revision, snapshot_json, provenance_json FROM projection_snapshots WHERE id = 'current'").bind().first();
  if (!row || !Number.isInteger(row.revision) || row.revision < 0) throw new Error("projection row unavailable");
  const snapshot = JSON.parse(row.snapshot_json); const provenance = JSON.parse(row.provenance_json);
  validateSnapshot(snapshot); validateProvenance(provenance, snapshot); return { revision: row.revision, snapshot, provenance };
}
const proxyPathAllowed = (method, path) => method === "GET" || method === "POST" ? path === "/health" || path === "/capabilities" || path === "/readiness" || path === "/mcp" || path === "/v1/reasoning-stacks" || path === "/v1/advisory" || path === "/v1/shadow" || path === "/v1/paper-live" || path === "/v1/workflows" || /^\/v1\/workflows\/[^/]+(?:\/(?:submit|receipt|thesis|mandate))?$/.test(path) : false;
function projectionCandidates(value, found = new Map()) {
  if (!value || typeof value !== "object") return found;
  if (isRecord(value) && text(value.workflowId) && text(value.stackName) && text(value.stackVersion) && STATUSES.has(value.status)) found.set(value.workflowId, value);
  if (Array.isArray(value)) for (const child of value) projectionCandidates(child, found);
  else if (isRecord(value)) for (const child of Object.values(value)) projectionCandidates(child, found);
  return found;
}
async function persistCandidates(db, candidates) {
  if (!candidates.size) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await readRow(db); const workflows = { ...current.snapshot.workflows };
    for (const [id, workflow] of candidates) workflows[id] = workflow;
    const snapshot = { version: 1, workflows };
    const provenance = { source: SOURCE, schema: SCHEMA, schemaVersion: 1, generatedAt: Date.now(), workflows: Object.fromEntries(Object.entries(workflows).map(([id, w]) => [id, { stackName: w.stackName, stackVersion: w.stackVersion }])) };
    validateSnapshot(snapshot); validateProvenance(provenance, snapshot);
    const result = await db.batch([db.prepare("UPDATE projection_snapshots SET revision = ?, snapshot_json = ?, provenance_json = ?, updated_at = ? WHERE id = 'current' AND revision = ?").bind(current.revision + 1, JSON.stringify(snapshot), JSON.stringify(provenance), Date.now(), current.revision)]);
    if (result[0]?.meta?.changes === 1) return;
  }
  throw new Error("projection revision conflict");
}
function recoveredRead(row, pathname, origin) {
  const match = pathname.match(/^\/v1\/workflows\/([^/]+)(?:\/(receipt|thesis|mandate))?$/); if (!match) return null;
  const workflow = row.snapshot.workflows[match[1]]; if (!workflow) return response({ error: "NOT_FOUND" }, 404, origin);
  const value = match[2] === "receipt" ? workflow.receipt : match[2] === "thesis" ? workflow.thesis : match[2] === "mandate" ? workflow.mandate : workflow;
  return value === undefined ? response({ error: "NOT_FOUND" }, 404, origin) : response(value, 200, origin);
}
async function proxy(request, env, url, origin) {
  if (!env.UPSTREAM_URL) return response({ error: "proxy not configured" }, 503, origin);
  const target = new URL(url.pathname + url.search, env.UPSTREAM_URL).toString();
  let upstream;
  try {
    const headers = new Headers();
    for (const name of ["content-type", "accept"]) { const value = request.headers.get(name); if (value) headers.set(name, value); }
    const requestBody = request.method === "GET" ? undefined : await request.text();
    upstream = await fetch(target, { method: request.method, headers, ...(requestBody ? { body: requestBody } : {}) });
  } catch {
    if (request.method === "GET") { try { const recovered = recoveredRead(await readRow(env.DB), url.pathname, origin); if (recovered) return recovered; } catch { /* unavailable */ } }
    return response({ error: "upstream unavailable" }, 502, origin);
  }
  const body = await upstream.text();
  if (!upstream.ok && request.method === "GET") {
    try { const recovered = recoveredRead(await readRow(env.DB), url.pathname, origin); if (recovered && recovered.status === 200) return recovered; } catch { /* unavailable */ }
  }
  if (upstream.ok) { try { await persistCandidates(env.DB, projectionCandidates(JSON.parse(body))); } catch { return response({ error: "projection persistence failed" }, 503, origin); } }
  const headers = { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-store" };
  if (origin) { headers["access-control-allow-origin"] = origin; headers.vary = "Origin"; }
  return new Response(body, { status: upstream.status, headers });
}
export default {
  async fetch(request, env) {
    const corsResult = cors(request);
    if (!corsResult.proceed) return corsResult.result;
    const origin = corsResult.origin;
    const url = new URL(request.url);
    if (url.pathname !== SNAPSHOT_PATH && proxyPathAllowed(request.method, url.pathname)) return proxy(request, env, url, origin);
    if (!authorized(request, env)) return response({ error: "unauthorized" }, 401, origin);
    if (url.pathname !== SNAPSHOT_PATH) return response({ error: "not found" }, 404, origin);
    if (request.method === "GET") { try { return response(await readRow(env.DB), 200, origin); } catch { return response({ error: "projection unavailable" }, 500, origin); } }
    if (request.method !== "PUT") return response({ error: "method not allowed" }, 405, origin);
    try {
      const body = await request.json();
      if (!exact(body, ["version", "expectedRevision", "snapshot", "provenance"]) || body.version !== 1 || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) fail("invalid save envelope");
      validateSnapshot(body.snapshot); validateProvenance(body.provenance, body.snapshot); const current = await readRow(env.DB);
      if (current.revision !== body.expectedRevision) return response({ error: "revision conflict", revision: current.revision }, 409);
      const result = await env.DB.batch([env.DB.prepare("UPDATE projection_snapshots SET revision = ?, snapshot_json = ?, provenance_json = ?, updated_at = ? WHERE id = 'current' AND revision = ?").bind(current.revision + 1, JSON.stringify(body.snapshot), JSON.stringify(body.provenance), Date.now(), current.revision)]);
      if (!result[0]?.meta || result[0].meta.changes !== 1) return response({ error: "revision conflict" }, 409);
      return response({ revision: current.revision + 1 });
    } catch (error) { return response({ error: error instanceof Error && /^(invalid|provenance|incomplete|unexpected)/.test(error.message) ? error.message : "invalid request" }, 400); }
  },
};
export { validateProvenance, validateSnapshot };
