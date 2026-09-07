import test from "node:test";
import assert from "node:assert/strict";
import {
  MissingAccountCredentialsError,
  createAuthenticatedUsdMFuturesAccountAdapter,
  type AccountAuthConfig,
  type AuthenticatedAccountStateSource,
} from "../src/account/index.js";

const update = () => ({
  e: "ACCOUNT_UPDATE", E: 1_700_000_001_000, T: 1_700_000_000_999,
  productFamily: "USD_M_FUTURES_UM",
  a: { B: [{ a: "USDT", wb: "1000.00", cw: "900.00", bc: "0.00" }], P: [] },
  u: "7",
});

const credentials: AccountAuthConfig = { apiKey: "test-key", apiSecret: "test-secret" };

test("injectable authenticated source hands off versioned normalized account state", async () => {
  const calls: AccountAuthConfig[] = [];
  const source: AuthenticatedAccountStateSource = {
    async readAccountUpdate(auth) { calls.push(auth); return update(); },
  };
  const adapter = createAuthenticatedUsdMFuturesAccountAdapter(source, () => 1_700_000_001_001);
  const handoff = await adapter.read(credentials);
  assert.equal(handoff.version, 1);
  assert.equal(handoff.state.version, 7n);
  assert.equal(handoff.source.access, "PRIVATE");
  assert.equal(handoff.source.evidence, "BLOCKED_EXTERNAL");
  assert.equal(Object.isFrozen(handoff), true);
  assert.equal(calls.length, 1);
});

test("missing credentials fail closed before the source is invoked", async () => {
  let invoked = false;
  const source: AuthenticatedAccountStateSource = { async readAccountUpdate() { invoked = true; return update(); } };
  const adapter = createAuthenticatedUsdMFuturesAccountAdapter(source, () => 1_700_000_001_001);
  await assert.rejects(adapter.read(undefined), (error: unknown) => error instanceof MissingAccountCredentialsError);
  assert.equal(invoked, false);
});

test("inherited credentials fail closed before the source is invoked", async () => {
  let invoked = false;
  const source: AuthenticatedAccountStateSource = { async readAccountUpdate() { invoked = true; return update(); } };
  const adapter = createAuthenticatedUsdMFuturesAccountAdapter(source, () => 1_700_000_001_001);
  const inherited = Object.create({ apiKey: "inherited-key", apiSecret: "inherited-secret" }) as AccountAuthConfig;
  await assert.rejects(adapter.read(inherited), (error: unknown) => error instanceof MissingAccountCredentialsError);
  assert.equal(invoked, false);
});

test("credential boundary does not log or retain secret values", async () => {
  const secret = "do-not-leak";
  let received: AccountAuthConfig | undefined;
  const source: AuthenticatedAccountStateSource = {
    async readAccountUpdate(auth) { received = auth; return update(); },
  };
  const logs: unknown[][] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => logs.push(args);
  try {
    const adapter = createAuthenticatedUsdMFuturesAccountAdapter(source, () => 1_700_000_001_001);
    await adapter.read({ apiKey: "key", apiSecret: secret });
    assert.equal("apiSecret" in adapter, false);
    assert.equal(logs.flat().some(value => String(value).includes(secret)), false);
    assert.equal(received?.apiSecret, secret);
  } finally { console.log = original; }
});

test("deterministic replay source produces identical handoffs", async () => {
  const source: AuthenticatedAccountStateSource = { async readAccountUpdate() { return JSON.stringify(update()); } };
  const first = await createAuthenticatedUsdMFuturesAccountAdapter(source, () => 1_700_000_001_001).read(credentials);
  const second = await createAuthenticatedUsdMFuturesAccountAdapter(source, () => 1_700_000_001_001).read(credentials);
  assert.deepEqual(second, first);
});
