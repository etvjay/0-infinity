import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

test("local adapter example proves valid roles and fail-closed cases", async () => {
  const { stdout } = await run(process.execPath, ["examples/role-adapters/run.mjs"]);
  const result = JSON.parse(stdout);
  assert.equal(result.credentials, false);
  assert.equal(result.network, "127.0.0.1 loopback only");
  assert.equal(result.transcript.length, 10);
  for (const transport of ["HTTP loopback", "MCP loopback line"]) {
    const accepted = result.transcript.filter((entry) => entry.transport === transport && entry.status === "accepted");
    assert.deepEqual(accepted.map((entry) => entry.role), ["ADVOCATE", "OPPOSER", "MARKET_ANALYST"]);
    assert.ok(accepted.every((entry) => entry.symbol === "BTCUSDT" && entry.independence === "external"));
  }
  const refused = result.transcript.filter((entry) => entry.status === "refused");
  assert.equal(refused.length, 4);
  assert.ok(refused.every((entry) => entry.failClosed === true));
  assert.match(result.evidenceCeiling, /not hosted\/provider\/market evidence/);
});
