import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUsdMFuturesAccountState } from "../src/account/index.js";

const accountUpdate = (overrides: Record<string, unknown> = {}) => ({
  e: "ACCOUNT_UPDATE", E: 1_700_000_001_000, T: 1_700_000_000_999,
  productFamily: "USD_M_FUTURES_UM",
  a: {
    m: "ORDER",
    B: [{ a: "USDT", wb: "1000.00", cw: "900.00", bc: "0.00" }],
    P: [{ s: "BTCUSDT", pa: "0.010", ep: "50000.00", cr: "0.00", up: "12.50", mt: "cross", iw: "0.00", ps: "LONG" }],
  },
  u: "9223372036854775807",
  ...overrides,
});

test("normalizes USD-M balances and positions into frozen read-only state", () => {
  const state = normalizeUsdMFuturesAccountState(accountUpdate(), 1_700_000_001_001);
  assert.deepEqual(state, {
    version: 9223372036854775807n, venue: "BINANCE", instrument: "USD_M_FUTURES", productFamily: "USD_M_FUTURES_UM",
    observedAt: 1_700_000_000_999, receivedAt: 1_700_000_001_001,
    balances: [{ asset: "USDT", walletBalance: "1000", crossWalletBalance: "900", balanceChange: "0" }],
    positions: [{ symbol: "BTCUSDT", positionAmount: "0.01", entryPrice: "50000", realizedPnl: "0", unrealizedPnl: "12.5", marginType: "cross", isolatedWallet: "0", positionSide: "LONG" }],
    source: { productFamily: "USD_M_FUTURES_UM", event: "ACCOUNT_UPDATE" },
  });
  assert.equal(Object.isFrozen(state), true); assert.equal(Object.isFrozen(state.balances), true); assert.equal(Object.isFrozen(state.positions[0]), true);
});

test("rejects wrong family, wrong event, and malformed account payloads", () => {
  assert.throws(() => normalizeUsdMFuturesAccountState(accountUpdate({ productFamily: "COIN_M_FUTURES_CM" }), 1_700_000_001_001), /product family/i);
  assert.throws(() => normalizeUsdMFuturesAccountState(accountUpdate({ e: "ACCOUNT_CONFIG_UPDATE" }), 1_700_000_001_001), /event|ACCOUNT_UPDATE/i);
  assert.throws(() => normalizeUsdMFuturesAccountState(accountUpdate({ a: { B: [], P: [{ s: "SOLUSDT", pa: "1", ep: "1", cr: "0", up: "0", mt: "cross", iw: "0", ps: "LONG" }] } }), 1_700_000_001_001), /symbol/i);
  assert.throws(() => normalizeUsdMFuturesAccountState(accountUpdate({ a: { B: [{ a: "USDT", wb: "NaN", cw: "1", bc: "0" }], P: [] } }), 1_700_000_001_001), /walletBalance|wb/i);
  assert.throws(() => normalizeUsdMFuturesAccountState(accountUpdate({ extra: true }), 1_700_000_001_001), /unsupported|extra|field/i);
  assert.throws(() => normalizeUsdMFuturesAccountState(accountUpdate({ a: { ...accountUpdate().a as object, extra: true } }), 1_700_000_001_001), /unsupported|extra|field/i);
  assert.throws(() => normalizeUsdMFuturesAccountState(accountUpdate({ a: { ...accountUpdate().a as object, B: [{ a: "USDT", wb: "1", cw: "1", bc: "0", extra: true }], P: [] } }), 1_700_000_001_001), /unsupported|extra|field/i);
  assert.throws(() => normalizeUsdMFuturesAccountState(accountUpdate({ a: { ...accountUpdate().a as object, B: [], P: [{ s: "BTCUSDT", pa: "0", ep: "0", cr: "0", up: "0", mt: "cross", iw: "0", ps: "BOTH", extra: true }] } }), 1_700_000_001_001), /unsupported|extra|field/i);
});

test("rejects malformed numbers, timestamps, and non-exact versions", () => {
  for (const u of ["01", "1.2", -1, 1.5, true]) assert.throws(() => normalizeUsdMFuturesAccountState(accountUpdate({ u }), 1_700_000_001_001), /version|u/i);
  assert.throws(() => normalizeUsdMFuturesAccountState(accountUpdate({ E: 1_700_000_001_002 }), 1_700_000_001_001), /E|future/i);
  assert.throws(() => normalizeUsdMFuturesAccountState(accountUpdate({ T: 1_700_000_001_001, E: 1_700_000_001_000 }), 1_700_000_001_001), /chronology/i);
  assert.throws(() => normalizeUsdMFuturesAccountState(JSON.stringify(accountUpdate()).replace('"u":"9223372036854775807"', '"u":1e3'), 1_700_000_001_001), /u|version/i);
  const raw = JSON.stringify(accountUpdate());
  assert.throws(() => normalizeUsdMFuturesAccountState(raw.replace('"u":"9223372036854775807"', '"u":"1","u":"2"'), 1_700_000_001_001), /u|duplicate|ambiguous/i);
});

test("accepts JSON text without losing a huge version and does not mutate input", () => {
  const raw = JSON.stringify({ ...accountUpdate(), a: { ...accountUpdate().a as object, m: 'nested {"u": "not-the-version"}' } });
  const state = normalizeUsdMFuturesAccountState(raw, 1_700_000_001_001);
  assert.equal(state.version, 9223372036854775807n);
  assert.equal("a" in state, false); assert.equal("u" in state, false);
});

test("rejects inherited required fields and inherited unsupported fields at every schema boundary", () => {
  const valid = accountUpdate();
  const topRequired = ["u", "productFamily", "e", "E", "T", "a"] as const;
  for (const field of topRequired) {
    const own = { ...valid } as Record<string, unknown>;
    const inherited = Object.create({ [field]: own[field] }) as Record<string, unknown>;
    delete own[field];
    Object.assign(inherited, own);
    assert.throws(() => normalizeUsdMFuturesAccountState(inherited, 1_700_000_001_001), new RegExp(field === "productFamily" ? "product|family" : field));
  }

  const account = valid.a as Record<string, unknown>;
  for (const field of ["B", "P"] as const) {
    const inherited = Object.create({ [field]: account[field] }) as Record<string, unknown>;
    Object.assign(inherited, account); delete inherited[field];
    assert.throws(() => normalizeUsdMFuturesAccountState({ ...valid, a: inherited }, 1_700_000_001_001), new RegExp(field));
  }

  for (const [collection, fields] of [["B", ["a", "wb", "cw", "bc"]], ["P", ["s", "pa", "ep", "cr", "up", "mt", "iw", "ps"]]] as const) {
    const item = (account[collection] as unknown[])[0] as Record<string, unknown>;
    for (const field of fields) {
      const inherited = Object.create({ [field]: item[field] }) as Record<string, unknown>;
      Object.assign(inherited, item); delete inherited[field];
      const nextAccount = { ...account, [collection]: [inherited] };
      assert.throws(() => normalizeUsdMFuturesAccountState({ ...valid, a: nextAccount }, 1_700_000_001_001), new RegExp(field));
    }
  }

  const inheritedTop = Object.assign(Object.create({ inheritedTop: true }), valid);
  const inheritedAccount = Object.assign(Object.create({ inheritedAccount: true }), account);
  const inheritedBalance = Object.assign(Object.create({ inheritedBalance: true }), (account.B as unknown[])[0]);
  const inheritedPosition = Object.assign(Object.create({ inheritedPosition: true }), (account.P as unknown[])[0]);
  const cases: Array<[string, Record<string, unknown>]> = [["top-level", inheritedTop], ["account", inheritedAccount], ["balance", inheritedBalance], ["position", inheritedPosition]];
  for (const [boundary, value] of cases) {
    const payload = boundary === "top-level" ? value : { ...valid, a: boundary === "account" ? value : { ...account, [boundary === "balance" ? "B" : "P"]: [value] } };
    assert.throws(() => normalizeUsdMFuturesAccountState(payload, 1_700_000_001_001), /unsupported|inherited/i);
  }
});
