const base = (process.env.ZERO_INFINITY_FRONT_DOOR ?? "https://zero-infinity-projection-store.microcosm.workers.dev").replace(/\/$/, "");

async function get(path) {
  const response = await fetch(`${base}${path}`, { headers: { accept: "application/json" } });
  let body;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  if (!body || typeof body !== "object") throw new Error(`${path}: expected JSON object`);
  return body;
}

const health = await get("/health");
const capabilities = await get("/capabilities");
const readiness = await get("/readiness");
if (health.ok !== true && !["ok", "healthy"].includes(health.status)) throw new Error("front door health response is not healthy");
if (capabilities.authority !== false || !Array.isArray(capabilities.writes) || capabilities.writes.length !== 0) throw new Error("front door reports write authority");
if (readiness.ready !== true || readiness.liveWrites !== false) throw new Error("front door is not ready for read-only use");
console.log(JSON.stringify({ base, health: { ok: health.ok, version: health.version }, capabilities: { modes: capabilities.modes, writes: capabilities.writes, authority: capabilities.authority }, readiness: { ready: readiness.ready, mode: readiness.mode, liveWrites: readiness.liveWrites } }));
