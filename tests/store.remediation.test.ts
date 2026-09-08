import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, utimesSync, readFileSync, existsSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileMandate, type AnchorState, type CompilerPolicy, type TradeThesis, type ExecutionMandate } from "../src/domain/index.js";
import { MandateStore, JsonFilePersistence, MemoryPersistence, StoreError, authorityKey, type AuthorityKey, type PersistedSnapshot } from "../src/store/index.js";

const thesis: TradeThesis = { thesisId: "thesis-r", venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", direction: "LONG", horizonMs: 60_000, confidence: .8, expectedMove: { bps: 50, lowerBps: 20, upperBps: 80 }, reasoning: { method: "council", advocateRef: "a", opposeRef: "o", marketAnalysisRef: "m", evidenceBundleHash: "e", councilDecisionHash: "c", reasoningReceiptHash: "r" }, createdAt: 1_000, expiresAt: 61_000 };
const policy: CompilerPolicy = { accountId: "acct-r", validityMs: 30_000, minExecutableEdgeBps: 10, maxSpreadBps: 5, maxSlippageBps: 5, maxFeeBps: 5, maxFundingCostBps: 5, maxNotional: 1_000, maxLossBps: 100, execution: "LIMIT", minEntryPrice: 99_000, maxEntryPrice: 101_000, entryTrigger: "BELOW" };
const anchor: AnchorState = { stateVersion: 7n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 };
const mandate = (id = "r-1"): ExecutionMandate => ({ ...compileMandate({ workflowId: "wf-r" }, thesis, policy, anchor, 2_000), mandateId: id });
const key = (m: ExecutionMandate): AuthorityKey => ({ venue: m.venue, instrument: m.instrument, accountId: m.accountId, symbol: m.symbol, side: m.side });

test("two stores sharing memory boundary serialize issue and consume without lost updates", async () => {
  const p = new MemoryPersistence(); const a = new MandateStore(p, () => 2_001); const b = new MandateStore(p, () => 2_001);
  const m = mandate(); await a.issue(m);
  const results = await Promise.allSettled([a.consumeForSubmission(m.mandateId, "client-a"), b.consumeForSubmission(m.mandateId, "client-b")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(p.snapshot().records[0].state, "SUBMITTING");
});

test("mandate is copied and validated before queued work", async () => {
  const p = new MemoryPersistence(); const store = new MandateStore(p, () => 2_001); const m = mandate();
  const pending = store.issue(m); (m as { symbol: string }).symbol = "ETHUSDT";
  await pending; assert.equal(store.history()[0].mandate.symbol, "BTCUSDT");
});

test("expired armed authority is durably retired by recovery and reads", async () => {
  let now = 2_001; const p = new MemoryPersistence(); const store = new MandateStore(p, () => now); const m = mandate(); await store.issue(m);
  now = 70_000; assert.equal(store.getActive(key(m)), null); await new Promise((resolve) => setImmediate(resolve)); assert.equal(p.snapshot().records[0].state, "EXPIRED");
  assert.equal(new MandateStore(p, () => now).history()[0].state, "EXPIRED");
});

test("store retires an armed mandate at the exact expiry instant", async () => {
  const p = new MemoryPersistence(); const m = mandate(); const store = new MandateStore(p, () => 2_001);
  await store.issue(m);
  const atExpiry = new MandateStore(p, () => m.expiresAt);
  assert.equal(atExpiry.getActive(key(m)), null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(p.snapshot().records[0].state, "EXPIRED");
});


test("revocation is persisted and remains fail closed after recovery", async () => {
  const p = new MemoryPersistence(); const store = new MandateStore(p, () => 2_001); const m = mandate(); await store.issue(m); await store.revoke(m.mandateId);
  assert.equal(p.snapshot().records[0].revoked, true); assert.equal(store.getActive(key(m)), null);
  const recovered = new MandateStore(p, () => 2_001); assert.equal(recovered.getActive(key(m)), null); await assert.rejects(() => recovered.consumeForSubmission(m.mandateId, "client-r"), /REVOKED/);
});

test("malformed snapshots are rejected before authority becomes active", () => {
  const m = mandate(); const cases: PersistedSnapshot[] = [
    { records: [{ mandate: m, state: "ARMED", scope: "forged" }] },
    { records: [{ mandate: m, state: "NOT_A_STATE" as never, scope: "[\"BINANCE\",\"SPOT\",\"acct-r\",\"BTCUSDT\",\"BUY\"]" }] },
    { records: [{ mandate: m, state: "ARMED", scope: "[\"BINANCE\",\"SPOT\",\"acct-r\",\"BTCUSDT\",\"BUY\"]" }, { mandate: m, state: "EXPIRED", scope: "[\"BINANCE\",\"SPOT\",\"acct-r\",\"BTCUSDT\",\"BUY\"]" }] },
  ];
  for (const snapshot of cases) assert.throws(() => new MandateStore(new MemoryPersistence(snapshot), () => 2_001), /invalid|duplicate|scope/i);
});

test("client order identities are bounded, structured, and globally collision checked", async () => {
  const p = new MemoryPersistence(); const store = new MandateStore(p, () => 2_001); const m = mandate(); await store.issue(m);
  await assert.rejects(() => store.consumeForSubmission(m.mandateId, " bad id "), /clientOrderId/);
  await assert.rejects(() => store.consumeForSubmission(m.mandateId, "x".repeat(129)), /clientOrderId/);
});

test("concurrent file writers fail closed at the shared store boundary", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mb1-race-")); const path = join(directory, "authority.json");
  try { const p1 = new JsonFilePersistence(path); const p2 = new JsonFilePersistence(path); const a = new MandateStore(p1, () => 2_001); const b = new MandateStore(p2, () => 2_001);
    const results = await Promise.allSettled([a.issue(mandate("r-a")), b.issue({ ...mandate("r-b"), accountId: "acct-other" })]); assert.equal(results.filter((r) => r.status === "fulfilled").length, 1); assert.equal(results.filter((r) => r.status === "rejected" && r.reason?.code === "RECOVERY_BLOCKED").length, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("invalid mandate records cannot be loaded", () => {
  const m = mandate(); const bad = { ...m, expiresAt: -1 } as ExecutionMandate;
  assert.throws(() => new MandateStore(new MemoryPersistence({ records: [{ mandate: bad, state: "ARMED", scope: "[\"BINANCE\",\"SPOT\",\"acct-r\",\"BTCUSDT\",\"BUY\"]" }] }), () => 2_001), /mandate/i);
});

test("reads refresh shared persistence after revoke and supersede", async () => {
  const p = new MemoryPersistence(); const a = new MandateStore(p, () => 2_001); const b = new MandateStore(p, () => 2_001); const m = mandate();
  await a.issue(m); assert.equal(b.getActive(key(m))?.mandateId, m.mandateId); await a.revoke(m.mandateId);
  assert.equal(b.getActive(key(m)), null); assert.equal(b.history()[0].revoked, true);
  const p2 = new MemoryPersistence(); const c = new MandateStore(p2, () => 2_001); const d = new MandateStore(p2, () => 2_001); const replacement = { ...mandate("replacement"), workflowId: "wf-replacement" };
  await c.issue(m); await c.supersede(m.mandateId, replacement); assert.equal(d.getActive(key(m))?.mandateId, replacement.mandateId); assert.equal(d.history().find((r) => r.mandate.mandateId === m.mandateId)?.state, "SUPERSEDED");
});

test("snapshot validation closes remaining persisted invariants", () => {
  const m = mandate(); const scope = JSON.stringify([m.venue, m.instrument, m.accountId, m.symbol, m.side]);
  const snapshot = (changes: { mandate?: Record<string, unknown>; state?: string; record?: object }): PersistedSnapshot => ({ records: [{ mandate: { ...m, ...changes.mandate }, state: (changes.state ?? "ARMED") as never, scope, ...(changes.record ?? {}) }] });
  assert.throws(() => new MandateStore(new MemoryPersistence(snapshot({ state: "SUBMITTING" })), () => 2_001), /clientOrderId/);
  assert.throws(() => new MandateStore(new MemoryPersistence(snapshot({ mandate: { economics: { ...m.economics, maxFeeBps: -1 } } })), () => 2_001), /non-negative/);
  assert.throws(() => new MandateStore(new MemoryPersistence(snapshot({ mandate: { invalidation: { ...m.invalidation, thesisExpiry: m.expiresAt - 1 } } })), () => 2_001), /expiry/);
  assert.throws(() => new MandateStore(new MemoryPersistence(snapshot({ mandate: { thesisHash: 7, provenance: { ...m.provenance, thesisHash: 7 } } })), () => 2_001), /thesisHash/);
  assert.throws(() => new MandateStore(new MemoryPersistence(snapshot({ state: "FILLED", record: { revoked: true } })), () => 2_001), /revoked/);
});

test("canonical scope encoding and authority key validation prevent collisions", () => {
  const m = mandate(); const a = authorityKey(m); const b = { ...a, accountId: `${a.accountId}|BTCUSDT`, symbol: "BUY" };
  assert.notEqual(JSON.stringify([a.venue, a.instrument, a.accountId, a.symbol, a.side]), JSON.stringify([b.venue, b.instrument, b.accountId, b.symbol, b.side]));
  assert.throws(() => new MandateStore(new MemoryPersistence(), () => 2_001).getActive({ ...a, accountId: "" }), /AuthorityKey/);
});

test("expired read remains fail closed when retirement persistence fails", async () => {
  let now = 2_001; const p = new MemoryPersistence(); const store = new MandateStore(p, () => now); const m = mandate(); await store.issue(m); now = 70_000; p.failNextSave();
  assert.equal(store.getActive(key(m)), null); await new Promise((resolve) => setImmediate(resolve)); assert.equal(store.getActive(key(m)), null); assert.equal(p.snapshot().records[0].state, "ARMED");
});

test("normal release publishes a RELEASED owner marker without removing the lock", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mb1-release-marker-")); const path = join(directory, "authority.json"); const lock = `${path}.lock`;
  try {
    const p = new JsonFilePersistence(path); let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const transaction = p.transact(async (snapshot) => { await held; return snapshot; });
    while (!existsSync(join(lock, "owner.json"))) await new Promise((resolve) => setImmediate(resolve));
    release(); await transaction;
    const owner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8")) as { status?: string; token?: string };
    assert.equal(owner.status, "RELEASED"); assert.equal(typeof owner.token, "string"); assert.equal(existsSync(lock), true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("orphaned local X2 lock is never reclaimed", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mb1-lock-")); const path = join(directory, "authority.json"); const lock = `${path}.lock`;
  try { mkdirSync(lock); const owner = JSON.stringify({ pid: 999, acquiredAt: 1 }); writeFileSync(join(lock, "owner.json"), owner); const old = new Date(Date.now() - 10_000); utimesSync(lock, old, old);
    await assert.rejects(new JsonFilePersistence(path, { lockTimeoutMs: 20, maxWaitMs: 100 }).transact((s) => s), (error: unknown) => error instanceof StoreError && error.code === "RECOVERY_BLOCKED"); assert.equal(readFileSync(join(lock, "owner.json"), "utf8"), owner); assert.equal(existsSync(lock), true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("orphan inspection never invokes a destructive recovery callback", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mb1-orphan-race-")); const path = join(directory, "authority.json"); const lock = `${path}.lock`; let inspected = false;
  try {
    mkdirSync(lock); const owner = JSON.stringify({ pid: 999, acquiredAt: 1 }); writeFileSync(join(lock, "owner.json"), owner); const old = new Date(Date.now() - 10_000); utimesSync(lock, old, old);
    const p = new JsonFilePersistence(path, { lockTimeoutMs: 20, maxWaitMs: 100, beforeOrphanStat: () => { inspected = true; } }); await assert.rejects(p.transact((s) => s), (error: unknown) => error instanceof StoreError && error.code === "RECOVERY_BLOCKED"); assert.equal(inspected, false); assert.equal(existsSync(lock), true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("live local X2 owner is never reclaimed after the lock timeout", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mb1-live-lock-")); const path = join(directory, "authority.json");
  try {
    const first = new JsonFilePersistence(path, { lockTimeoutMs: 20, maxWaitMs: 500 });
    const second = new JsonFilePersistence(path, { lockTimeoutMs: 20, maxWaitMs: 500 });
    let entered = false; let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const firstTransaction = first.transact(async (snapshot) => { await held; return snapshot; });
    while (!existsSync(join(path + ".lock", "owner.json"))) await new Promise((resolve) => setImmediate(resolve));
    const secondTransaction = second.transact((snapshot) => { entered = true; return snapshot; });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(entered, false);
    release(); await firstTransaction; await assert.rejects(secondTransaction, (error: unknown) => error instanceof StoreError && error.code === "RECOVERY_BLOCKED");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("concurrent ambiguous waiters remain blocked", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mb1-orphan-waiters-")); const path = join(directory, "authority.json"); const lock = `${path}.lock`;
  try {
    mkdirSync(lock); const owner = JSON.stringify({ pid: 999, token: "orphan", acquiredAt: 1 }); writeFileSync(join(lock, "owner.json"), owner); const old = new Date(Date.now() - 10_000); utimesSync(lock, old, old);
    const options = { lockTimeoutMs: 10, maxWaitMs: 200 }; const results = await Promise.allSettled([new JsonFilePersistence(path, options).transact((s) => s), new JsonFilePersistence(path, options).transact((s) => s)]);
    assert.equal(results.filter((r) => r.status === "rejected" && r.reason?.code === "RECOVERY_BLOCKED").length, 2); assert.equal(readFileSync(join(lock, "owner.json"), "utf8"), owner);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("live owner timeout is bounded and fails without reclaiming", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mb1-lock-timeout-")); const path = join(directory, "authority.json");
  try {
    const first = new JsonFilePersistence(path, { maxWaitMs: 40 }); let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const owner = first.transact(async (s) => { await held; return s; });
    while (!existsSync(join(path + ".lock", "owner.json"))) await new Promise((resolve) => setImmediate(resolve));
    const started = Date.now(); await assert.rejects(new JsonFilePersistence(path, { lockTimeoutMs: 1, maxWaitMs: 40 }).transact((s) => s), (error: unknown) => error instanceof StoreError && error.code === "LOCK_CONTENTION");
    assert.ok(Date.now() - started < 250); release(); await owner;
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("an old owner release cannot remove a successor lock", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mb1-owner-release-")); const path = join(directory, "authority.json"); const lock = `${path}.lock`;
  try {
    let replaceWithSuccessor!: () => void;
    const persistence = new JsonFilePersistence(path, { maxWaitMs: 500, beforeReleaseRename: () => replaceWithSuccessor() });
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    const transaction = persistence.transact(async (snapshot) => { await held; return snapshot; });
    while (!existsSync(join(lock, "owner.json"))) await new Promise((resolve) => setImmediate(resolve));
    const owner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8")) as { pid: number; token: string };
    const successor = `${lock}.successor`;
    replaceWithSuccessor = () => {
      renameSync(lock, successor);
      mkdirSync(lock);
      writeFileSync(join(lock, "owner.json"), JSON.stringify(owner));
    };
    release(); await transaction;
    assert.equal(readFileSync(join(lock, "owner.json"), "utf8"), JSON.stringify(owner));
    rmSync(successor, { recursive: true, force: true });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("released marker cannot be adopted after its directory is replaced", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mb1-reacquire-")); const path = join(directory, "authority.json"); const lock = `${path}.lock`;
  try {
    const persistence = new JsonFilePersistence(path);
    await persistence.transact((snapshot) => snapshot);
    const owner = readFileSync(join(lock, "owner.json"), "utf8"); const successor = `${lock}.successor`;
    renameSync(lock, successor); mkdirSync(lock); writeFileSync(join(lock, "owner.json"), owner);
    await assert.rejects(persistence.transact((snapshot) => snapshot), (error: unknown) => error instanceof StoreError && error.code === "RECOVERY_BLOCKED");
    assert.equal(readFileSync(join(lock, "owner.json"), "utf8"), owner);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("persisted authority status cannot contradict runtime, revocation, or consumption identity", () => {
  const m = mandate(); const scope = JSON.stringify([m.venue, m.instrument, m.accountId, m.symbol, m.side]);
  const invalid = [
    { state: "ARMED", status: "REVOKED" },
    { state: "SUBMITTING", status: "ACTIVE", clientOrderId: "client" },
    { state: "SUPERSEDED", status: "ACTIVE" },
    { state: "ARMED", status: "ACTIVE", revoked: true },
    { state: "ARMED", status: "CONSUMED", consumedAt: 2_001 },
  ];
  for (const record of invalid) assert.throws(() => new MandateStore(new MemoryPersistence({ records: [{ mandate: m, scope, ...record } as never] }), () => 2_001), /invalid persisted mandate|status|revoked|consumed/i);
});

test("revoke rejects terminal, historical, consumed, and expired mandates without mutation", async () => {
  let now = 2_001; const p = new MemoryPersistence(); const store = new MandateStore(p, () => now);
  const m = mandate(); await store.issue(m); await store.consumeForSubmission(m.mandateId, "client");
  await assert.rejects(() => store.revoke(m.mandateId), /cannot revoke SUBMITTING/); assert.equal(p.snapshot().records[0].revoked, undefined);
  const expiredPersistence = new MemoryPersistence(); const expiredStore = new MandateStore(expiredPersistence, () => now); const expired = mandate("expired"); await expiredStore.issue(expired); now = 70_000;
  assert.equal(expiredStore.getActive(key(expired)), null); await assert.rejects(() => expiredStore.revoke(expired.mandateId), /cannot revoke EXPIRED/); assert.equal(expiredPersistence.snapshot().records[0].state, "EXPIRED");
  const supersededPersistence = new MemoryPersistence(); const supersededStore = new MandateStore(supersededPersistence, () => 2_001); const old = mandate("old"); await supersededStore.issue(old); await supersededStore.supersede(old.mandateId, { ...mandate("new"), workflowId: "new-workflow" });
  await assert.rejects(() => supersededStore.revoke(old.mandateId), /cannot revoke SUPERSEDED/); assert.equal(supersededPersistence.snapshot().records[0].revoked, undefined);
  const terminalScope = JSON.stringify([m.venue, m.instrument, m.accountId, m.symbol, m.side]);
  const terminalPersistence = new MemoryPersistence({ records: [{ mandate: mandate("filled"), state: "FILLED", scope: terminalScope }] }); const terminalStore = new MandateStore(terminalPersistence, () => 2_001);
  await assert.rejects(() => terminalStore.revoke("filled"), /cannot revoke FILLED/); assert.equal(terminalPersistence.snapshot().records[0].revoked, undefined);
});
