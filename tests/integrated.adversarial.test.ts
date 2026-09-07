import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { compileMandate, type CompilerPolicy, type TradeThesis, type AnchorState, type ExecutionMandate } from "../src/domain/index.js";
import { createMandateRuntime, transition } from "../src/runtime/mandateRuntime.js";
import { MandateStore, JsonFilePersistence, MemoryPersistence, authorityKey, StoreError } from "../src/store/index.js";
import { evaluateMandate, type EvaluationPolicy, type LiveAccountState, type LiveMarketState, type StateEnvelope } from "../src/evaluator/index.js";

const thesis: TradeThesis = { thesisId: "e-thesis", thesisHash: "e-hash", venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", direction: "LONG", horizonMs: 60_000, confidence: .8, expectedMove: { bps: 50, lowerBps: 20, upperBps: 80 }, reasoning: { method: "council", advocateRef: "a", opposeRef: "o", marketAnalysisRef: "m", evidenceBundleHash: "e", councilDecisionHash: "c" }, createdAt: 1_000, expiresAt: 61_000 };
const compilerPolicy: CompilerPolicy = { accountId: "e-account", validityMs: 30_000, minExecutableEdgeBps: 10, maxSpreadBps: 6, maxSlippageBps: 5, maxFeeBps: 5, maxFundingCostBps: 5, maxNotional: 1_000, maxLossBps: 100, execution: "LIMIT", minEntryPrice: 99_975, maxEntryPrice: 101_000, entryTrigger: "BELOW" };
const anchor: AnchorState = { stateVersion: 7n, observedAt: 1_000, receivedAt: 1_001, markPrice: 100_000 };
const policy: EvaluationPolicy = { maxMarketAgeMs: 1_000, maxAccountAgeMs: 1_000, maxAnchorVersionLag: 3n };
const spread = (bid: number, ask: number) => (ask - bid) / ((ask + bid) / 2) * 10_000;
const mandate = (id = "e-mandate", overrides: Partial<CompilerPolicy> = {}, thesisOverrides: Partial<TradeThesis> = {}): ExecutionMandate => {
  const m = compileMandate({ workflowId: `e-workflow-${id}` }, { ...thesis, ...thesisOverrides }, { ...compilerPolicy, ...overrides }, anchor, 2_000);
  return m;
};
const baseMarket = (m: ExecutionMandate = mandate()): StateEnvelope<LiveMarketState> => ({ version: 7n, observedAt: 2_500, receivedAt: 2_501, value: { venue: m.venue, instrument: m.instrument, symbol: m.symbol, bidPrice: 99_950, askPrice: 100_000, markPrice: 99_975, expectedMoveBps: 50, spreadBps: spread(99_950, 100_000), slippageBps: 2, feeBps: 3, fundingCostBps: 0 } });
const account: StateEnvelope<LiveAccountState> = { version: 4n, observedAt: 2_500, receivedAt: 2_501, value: { accountId: "e-account", availableNotional: 2_000, currentNotional: 0, currentLossBps: 0 } };
const evaluate = (m = mandate(), overrides: { workflow?: unknown; market?: unknown; account?: unknown; policy?: unknown; runtime?: unknown; now?: number } = {}) => evaluateMandate((overrides.workflow ?? { workflowId: m.workflowId, authorityStatus: "ACTIVE" }) as any, m, (overrides.runtime ?? createMandateRuntime({ expiresAt: m.expiresAt })) as any, (overrides.market ?? baseMarket(m)) as any, (overrides.account ?? account) as any, (overrides.policy ?? policy) as any, overrides.now ?? 2_600);

function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
function altered<T>(value: T, change: (copy: any) => void): T { const copy = structuredClone(value); change(copy); return deepFreeze(copy); }

function refusal(result: ReturnType<typeof evaluate>, code: string): void { assert.equal(result.kind, "EXECUTION_REFUSAL"); if (result.kind === "EXECUTION_REFUSAL") assert.equal(result.code, code); }

 test("integrated expiry is strict at the boundary and never rearms", async () => {
  let now = 2_001; const p = new MemoryPersistence(); const s = new MandateStore(p, () => now); const m = mandate(); await s.issue(m);
  now = m.expiresAt; assert.notEqual(s.getActive(authorityKey(m)), null); now++;
  assert.equal(s.getActive(authorityKey(m)), null); await new Promise<void>((r) => setImmediate(r)); assert.equal(p.snapshot().records[0].state, "EXPIRED");
  await assert.rejects(() => s.issue(m), /historical/); await assert.rejects(() => s.consumeForSubmission(m.mandateId, "e-rearm"), /EXPIRED/);
 });

test("integrated binding swaps fail closed across all authority dimensions", () => {
  const m = mandate(); const fields: Array<[string, unknown]> = [["symbol", "ETHUSDT"], ["account", altered(account, (x) => { x.value.accountId = "other"; })], ["venue", "OTHER"], ["instrument", "USD_M_FUTURES"], ["side", "SELL"], ["workflow", altered({ workflowId: "other", authorityStatus: "ACTIVE" }, () => {})]];
  for (const [name, value] of fields) {
    if (name === "workflow") refusal(evaluate(m, { workflow: value }), "INVALID_BINDING");
    else if (name === "account") refusal(evaluate(m, { account: value }), "STATE_BINDING");
    else refusal(evaluate(altered(m, (x) => { x[name] = value; }), { market: baseMarket(m) }), name === "symbol" || name === "instrument" ? "STATE_BINDING" : "INVALID_BINDING");
  }
  refusal(evaluate(m, { workflow: { workflowId: m.workflowId, thesisId: "other", mandateId: m.mandateId, authorityStatus: "ACTIVE" } }), "INVALID_BINDING");
  for (const authorityStatus of [undefined, "SUPERSEDED", "REVOKED", "CONSUMED"] as const) refusal(evaluate(m, { workflow: { workflowId: m.workflowId, authorityStatus } }), "AUTHORITY_STATUS");
});

test("malformed, mutable, frozen, and non-finite mandate/economic/state inputs refuse deterministically", () => {
  const m = mandate();
  const cases: unknown[] = [altered(m, (x) => { x.entry = undefined; }), altered(m, (x) => { x.economics.maxNotional = -1; }), altered(m, (x) => { x.risk.maxLossBps = Number.NaN; }), altered(m, (x) => { x.anchor.receivedAt = Number.POSITIVE_INFINITY; }), altered(m, (x) => { x.economics.maxFeeBps = Number.NaN; })];
  for (const bad of cases) { const result = evaluate(bad as ExecutionMandate); refusal(result, "INVALID_BINDING"); assert.equal(Object.isFrozen(result), true); assert.deepEqual(result, evaluate(bad as ExecutionMandate)); }
  for (const [field, value] of [["maxMarketAgeMs", Number.NaN], ["maxAccountAgeMs", Number.POSITIVE_INFINITY], ["maxAnchorVersionLag", -1n]] as const) refusal(evaluate(m, { policy: { ...policy, [field]: value } }), "INVALID_BINDING");
  for (const field of ["bidPrice", "askPrice", "markPrice", "expectedMoveBps", "slippageBps", "feeBps", "fundingCostBps"] as const) refusal(evaluate(m, { market: { ...baseMarket(m), value: { ...baseMarket(m).value, [field]: Number.NaN } } }), "STATE_BINDING");
});

test("freshness, same-stream ordering, and independent market/account counters obey exact boundaries", () => {
  const m = mandate(); const ageBoundary = 1_600;
  for (const observedAt of [ageBoundary - 1, ageBoundary, ageBoundary + 1]) refusalOrIntent(evaluate(m, { market: altered(baseMarket(m), (x) => { x.observedAt = observedAt; x.receivedAt = 2_500; }) }), observedAt < ageBoundary ? "MARKET_STATE_STALE" : "EXECUTION_INTENT");
  for (const receivedAt of [ageBoundary - 1, ageBoundary, ageBoundary + 1]) refusalOrIntent(evaluate(m, { market: altered(baseMarket(m), (x) => { x.observedAt = ageBoundary; x.receivedAt = receivedAt; }) }), receivedAt < ageBoundary ? "MARKET_STATE_STALE" : "EXECUTION_INTENT");
  for (const observedAt of [ageBoundary - 1, ageBoundary, ageBoundary + 1]) refusalOrIntent(evaluate(m, { account: altered(account, (x) => { x.observedAt = observedAt; x.receivedAt = 2_500; }) }), observedAt < ageBoundary ? "ACCOUNT_STATE_STALE" : "EXECUTION_INTENT");
  for (const receivedAt of [ageBoundary - 1, ageBoundary, ageBoundary + 1]) refusalOrIntent(evaluate(m, { account: altered(account, (x) => { x.observedAt = ageBoundary; x.receivedAt = receivedAt; }) }), receivedAt < ageBoundary ? "ACCOUNT_STATE_STALE" : "EXECUTION_INTENT");
  refusal(evaluate(m, { market: { ...baseMarket(m), version: 6n } }), "STATE_VERSION_STALE");
  refusal(evaluate(m, { market: { ...baseMarket(m), version: 11n } }), "STATE_VERSION_STALE");
  assert.equal(evaluate(m, { account: { ...account, version: 10n ** 30n } }).kind, "EXECUTION_INTENT");
  assert.equal(evaluate(m, { market: { ...baseMarket(m), version: 10n ** 30n + 7n }, policy: { ...policy, maxAnchorVersionLag: 10n ** 30n } }).kind, "EXECUTION_INTENT");
  refusal(evaluate(m, { market: { ...baseMarket(m), observedAt: 2_601, receivedAt: 2_602 }, now: 2_600 }), "MARKET_STATE_STALE");
  refusal(evaluate(m, { account: { ...account, observedAt: 2_601, receivedAt: 2_602 }, now: 2_600 }), "ACCOUNT_STATE_STALE");
});
function refusalOrIntent(result: ReturnType<typeof evaluate>, expected: string): void { if (expected === "EXECUTION_INTENT") assert.equal(result.kind, expected); else refusal(result, expected); }

test("midpoint spread, BUY/SELL symmetry, independent costs, edge floor, risk and exposure are bounded", () => {
  const midpointSpread = spread(100_000, 100_050); const market = altered(baseMarket(), (x) => { x.value.bidPrice = 100_000; x.value.askPrice = 100_050; x.value.markPrice = 100_000; x.value.spreadBps = midpointSpread; });
  refusal(evaluate(mandate("spread-below", { maxSpreadBps: midpointSpread - 0.001, minEntryPrice: 100_000 }), { market }), "COST_CEILING");
  for (const maxSpreadBps of [midpointSpread, midpointSpread + 0.001]) assert.equal(evaluate(mandate(`spread-${maxSpreadBps}`, { maxSpreadBps, minEntryPrice: 100_000 }), { market, policy: { ...policy, maxAnchorVersionLag: 3n } }).kind, "EXECUTION_INTENT");
  refusal(evaluate(mandate("spread-inconsistent", { maxSpreadBps: midpointSpread + 1, minEntryPrice: 100_000 }), { market: altered(market, (x) => { x.value.spreadBps = midpointSpread + 1; }) }), "STATE_BINDING");
  const sell = mandate("sell", { entryTrigger: "ABOVE", maxEntryPrice: 100_050, minEntryPrice: 99_000, maxSpreadBps: market.value.spreadBps }, { thesisId: "sell-thesis", direction: "SHORT", side: "SELL" });
  const sellMarket = { ...market, value: { ...market.value, symbol: sell.symbol, markPrice: 100_050 } }; assert.equal(evaluate(sell, { market: sellMarket }).kind, "EXECUTION_INTENT");
  for (const [field, value] of [["slippageBps", 6], ["feeBps", 6], ["fundingCostBps", 6]] as const) refusal(evaluate(mandate(), { market: { ...baseMarket(), value: { ...baseMarket().value, [field]: value } } }), "COST_CEILING");
  refusal(evaluate(mandate(), { market: { ...baseMarket(), value: { ...baseMarket().value, expectedMoveBps: 10 } } }), "EXECUTABLE_EDGE_TOO_LOW");
  refusal(evaluate(mandate(), { account: { ...account, value: { ...account.value, currentLossBps: 101 } } }), "RISK_LIMIT");
  refusal(evaluate(mandate(), { account: { ...account, value: { ...account.value, availableNotional: 999 } } }), "EXPOSURE_LIMIT");
});

test("store consumes once, permits exact same-client idempotency, and serializes conflicting operations", async () => {
  const p = new MemoryPersistence(); const a = new MandateStore(p, () => 2_001); const b = new MandateStore(p, () => 2_001); const m = mandate(); await a.issue(m);
  await a.consumeForSubmission(m.mandateId, "same-client"); await a.consumeForSubmission(m.mandateId, "same-client"); await assert.rejects(() => b.consumeForSubmission(m.mandateId, "other-client"), /conflicting|consumed/);
  const n = mandate("concurrent"); await a.issue(n); const results = await Promise.allSettled([a.consumeForSubmission(n.mandateId, "c1"), b.consumeForSubmission(n.mandateId, "c2")]); assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
});

test("supersede/revoke/consume serialization refuses historical terminal authority", async () => {
  const p = new MemoryPersistence(); const s = new MandateStore(p, () => 2_001); const old = mandate("old"); const replacement = mandate("replacement"); await s.issue(old); await s.supersede(old.mandateId, replacement);
  await assert.rejects(() => s.consumeForSubmission(old.mandateId, "old-client"), /SUPERSEDED/); await assert.rejects(() => s.revoke(old.mandateId), /SUPERSEDED/); await assert.rejects(() => s.supersede(old.mandateId, mandate("again")), /SUPERSEDED/);
  await s.revoke(replacement.mandateId); await assert.rejects(() => s.consumeForSubmission(replacement.mandateId, "revoked"), /REVOKED/);
});

test("JSON persistence fails closed on ambiguous/orphan locks, bounds contention, and protects replacement locks", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mb1-e-lock-")); const path = join(directory, "state.json"); const lock = `${path}.lock`;
  try {
    mkdirSync(lock); const owner = JSON.stringify({ pid: 999, acquiredAt: 1 }); writeFileSync(join(lock, "owner.json"), owner);
    const result = await Promise.allSettled([new JsonFilePersistence(path, { maxWaitMs: 20 }).transact((s) => s), new JsonFilePersistence(path, { maxWaitMs: 20 }).transact((s) => s)]);
    assert.equal(result.filter((x) => x.status === "rejected" && x.reason instanceof StoreError && x.reason.code === "RECOVERY_BLOCKED").length, 2); assert.equal(readFileSync(join(lock, "owner.json"), "utf8"), owner);
    rmSync(lock, { recursive: true });
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; }); const first = new JsonFilePersistence(path, { maxWaitMs: 25 }).transact(async (s) => { await held; return s; });
    while (!existsSync(join(lock, "owner.json"))) await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(() => new JsonFilePersistence(path, { maxWaitMs: 25 }).transact((s) => s), (error: unknown) => error instanceof StoreError && error.code === "LOCK_CONTENTION"); release(); await first;
    rmSync(lock, { recursive: true }); let replaced = false; const protectedPersistence = new JsonFilePersistence(path, { maxWaitMs: 25, beforeReleaseRename: () => { if (replaced) return; replaced = true; const moved = `${lock}.old`; renameSync(lock, moved); mkdirSync(lock); writeFileSync(join(lock, "owner.json"), JSON.stringify({ token: "replacement", status: "ACTIVE" })); } }); await protectedPersistence.transact((s) => s); assert.equal(JSON.parse(readFileSync(join(lock, "owner.json"), "utf8")).status, "ACTIVE");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("subprocess failure retains active lock fail-closed; durable reload remains separate", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mb1-e-crash-")); const path = join(directory, "state.json"); const afterPath = join(directory, "after.json"); const modulePath = join(process.cwd(), "dist/src/store/index.js");
  try {
    const before = spawnSync(process.execPath, ["--input-type=module", "-e", `import {mkdirSync,writeFileSync} from 'node:fs'; const lock=${JSON.stringify(`${path}.lock`)}; mkdirSync(lock); writeFileSync(lock+'/owner.json', JSON.stringify({token:'crashed-child',status:'ACTIVE'})); process.exit(17);`], { encoding: "utf8" });
    assert.equal(before.status, 17); assert.equal(existsSync(`${path}.lock/owner.json`), true); await assert.rejects(() => new JsonFilePersistence(path, { maxWaitMs: 20 }).transact((s) => s), (error: unknown) => error instanceof StoreError && error.code === "LOCK_CONTENTION");
    const after = spawnSync(process.execPath, ["--input-type=module", "-e", `import {JsonFilePersistence} from ${JSON.stringify(modulePath)}; const p=new JsonFilePersistence(${JSON.stringify(afterPath)}); await p.transact(s=>({records:[]}));`], { encoding: "utf8" });
    assert.equal(after.status, 0, after.stderr); assert.deepEqual(new JsonFilePersistence(afterPath).load(), { records: [] });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("UNKNOWN is terminal and deterministic refusal/intent outputs are frozen", () => {
  let runtime = createMandateRuntime({ expiresAt: mandate().expiresAt }); for (const type of ["TRIGGER", "VALIDATE", "SUBMIT", "SUBMIT_UNKNOWN"] as const) { const r = transition(runtime, { type }, { at: 2_001 }); assert.equal(r.ok, true); if (r.ok) runtime = r.machine; }
  const blocked = transition(runtime, { type: "TRIGGER" }, { at: 2_002 }); assert.equal(blocked.ok, false); if (!blocked.ok) assert.equal(blocked.rejection.code, "TERMINAL_NO_OUTGOING");
  const terminal = runtime; refusal(evaluate(mandate(), { runtime: terminal }), "RUNTIME_NOT_EXECUTABLE");
  const first = evaluate(); const second = evaluate(); assert.deepEqual(first, second); assert.equal(Object.isFrozen(first), true); assert.equal(Object.isFrozen(second), true);
});
