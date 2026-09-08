import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { compileMandate, type TradeThesis, type CompilerPolicy } from "../src/domain/index.js";
import { MandateStore, MemoryPersistence } from "../src/store/index.js";
import { MemoryOrderPersistence, OrderWriter, type ExchangeAdapter } from "../src/execution/index.js";
import { RuntimeSupervisor, MemoryWorkflowPersistence, WORKFLOW_PERSISTENCE_CAS_CAPABILITY, createMandateRuntime, type WorkflowMarketState, type WorkflowAccountState } from "../src/runtime/index.js";

const thesis: TradeThesis = { thesisId: "t", venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", direction: "LONG", horizonMs: 60_000, confidence: .9, expectedMove: { bps: 50, lowerBps: 20, upperBps: 80 }, reasoning: { method: "council", advocateRef: "a", opposeRef: "o", marketAnalysisRef: "m", evidenceBundleHash: "e", councilDecisionHash: "c", reasoningReceiptHash: "r" }, createdAt: 1_000, expiresAt: 61_000 };
const policy: CompilerPolicy = { accountId: "acct", validityMs: 30_000, minExecutableEdgeBps: 10, maxSpreadBps: 6, maxSlippageBps: 5, maxFeeBps: 5, maxFundingCostBps: 5, maxNotional: 1_000, maxLossBps: 100, execution: "LIMIT", minEntryPrice: 99_975, maxEntryPrice: 101_000, entryTrigger: "BELOW" };
const mandate = compileMandate({ workflowId: "wf" }, thesis, policy, { stateVersion: 1n, observedAt: 1_000, receivedAt: 1_001, markPrice: 99_975 }, 2_000);
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as object as Record<string, unknown>)) deepFreeze(child); } return value; }
const market: WorkflowMarketState = deepFreeze({ version: 1n, observedAt: 2_500, receivedAt: 2_501, value: { venue: "BINANCE", instrument: "SPOT", symbol: "BTCUSDT", bidPrice: 99_950, askPrice: 100_000, markPrice: 99_975, expectedMoveBps: 50, spreadBps: (50 / 99975) * 10000, slippageBps: 2, feeBps: 3, fundingCostBps: 0 } });
const account: WorkflowAccountState = deepFreeze({ version: 1n, observedAt: 2_500, receivedAt: 2_501, value: { accountId: "acct", availableNotional: 2_000, currentNotional: 0, currentLossBps: 0 } });
const evalPolicy = deepFreeze({ maxMarketAgeMs: 1_000, maxAccountAgeMs: 1_000, maxAnchorVersionLag: 3n });
function setup(adapter: ExchangeAdapter = { submit: async () => ({ kind: "ACKNOWLEDGED" }) }) {
  const mandates = new MandateStore(new MemoryPersistence(), () => 2_600);
  const persistence = new MemoryOrderPersistence();
  const writer = new OrderWriter(mandates, persistence, adapter);
  return { mandates, persistence, writer, supervisor: new RuntimeSupervisor({ mode: "LOCAL_REPLAY", writer, persistence: new MemoryWorkflowPersistence(), clock: () => 2_600 }) };
}

test("valid local replay trigger reaches an immutable receipt once", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  const first = await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  const second = await x.supervisor.trigger("wf");
  assert.equal(first.workflowId, "wf"); assert.equal(second.orderOutcome, "ACKNOWLEDGED"); assert.equal(second.runtime.state, "ACKNOWLEDGED");
  assert.equal(Object.isFrozen(second), true); assert.equal((await x.supervisor.trigger("wf")).version, second.version);
});

test("arms then composes a versioned market observation through deterministic evaluation and writer", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  const input = { workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" as const };
  const armed = await (x.supervisor as any).arm(input);
  assert.equal(armed.status, "READY");
  const newerMarket = deepFreeze({ ...market, version: 2n, observedAt: 2_550, receivedAt: 2_551 });
  const result = await (x.supervisor as any).observeMarket("wf", newerMarket);
  assert.equal(result.status, "ACKNOWLEDGED");
  assert.equal(result.orderOutcome, "ACKNOWLEDGED");
  assert.equal(result.runtime.state, "ACKNOWLEDGED");
});


test("rejects a lower market version before CAS save or writer submission", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  const initialMarket = deepFreeze({ ...market, version: 3n });
  const input = { workflowId: "wf", mandate, market: initialMarket, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" as const };
  await (x.supervisor as any).arm(input);
  const lower = deepFreeze({ ...market, version: 2n, observedAt: 2_550, receivedAt: 2_551 });
  await assert.rejects(() => (x.supervisor as any).observeMarket("wf", lower), /version|stale|binding/i);
  const stored = ((x.supervisor as any).persistence as MemoryWorkflowPersistence).load("wf")!;
  assert.equal(stored.market.version, 3n);
});


test("unknown recovery reconciles and never retries", async () => {
  let calls = 0; const x = setup({ submit: async () => { calls++; return { kind: "TIMEOUT" }; } }); await x.mandates.issue(mandate);
  await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  const unknown = await x.supervisor.trigger("wf"); assert.equal(unknown.orderOutcome, "UNKNOWN"); assert.equal(calls, 1);
  const recovered = await x.supervisor.reconcile("wf", Object.freeze({ eventId: "ack", status: "ACKNOWLEDGED" }));
  assert.equal(recovered.orderOutcome, "ACKNOWLEDGED"); assert.equal(calls, 1);
});

test("credentials cannot elevate explicit mode and stale state refuses", async () => {
  process.env.BINANCE_API_KEY = "must-not-be-read";
  const x = setup(); await x.mandates.issue(mandate);
  const receipt = await x.supervisor.start({ workflowId: "wf", mandate, market: deepFreeze({ ...market, observedAt: 1_000, receivedAt: 1_001 }), account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  assert.equal(receipt.status, "REFUSED"); assert.equal(receipt.orderOutcome, undefined);
});

test("malformed first start is rejected without poisoning a later valid start", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  await assert.rejects(() => x.supervisor.start({ workflowId: "wf", mandate: { ...mandate, mandateId: "forged" }, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" }));
  const receipt = await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  assert.equal(receipt.workflowId, "wf");
});

test("reconciled cancellation and rejection keep receipt status coherent with runtime", async () => {
  const cancelled = setup({ submit: async () => ({ kind: "ACKNOWLEDGED" }) }); await cancelled.mandates.issue(mandate);
  await cancelled.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  const ack = await cancelled.supervisor.trigger("wf");
  const c = await cancelled.supervisor.reconcile("wf", Object.freeze({ eventId: "cancel", status: "CANCELLED" }));
  assert.equal(c.status, "CANCELLED"); assert.equal(c.runtime.state, "CANCELLED"); assert.equal(ack.orderOutcome, "ACKNOWLEDGED");
  const rejected = setup({ submit: async () => ({ kind: "REJECTED" }) }); await rejected.mandates.issue(mandate);
  const r = await rejected.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  assert.equal(r.status, "FAILED"); assert.equal(r.runtime.state, "FAILED"); assert.equal(r.orderOutcome, "REJECTED");
});

test("unknown recovery records order outcome without advancing M-B1 runtime", async () => {
  const x = setup({ submit: async () => ({ kind: "TIMEOUT" }) }); await x.mandates.issue(mandate);
  await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  await x.supervisor.trigger("wf");
  const recovered = await x.supervisor.reconcile("wf", Object.freeze({ eventId: "ack", status: "ACKNOWLEDGED" }));
  assert.equal(recovered.status, "UNKNOWN"); assert.equal(recovered.runtime.state, "UNKNOWN"); assert.equal(recovered.orderOutcome, "ACKNOWLEDGED"); assert.equal(recovered.recoveryStatus, "RECONCILED");
});

test("concurrent workflow operations serialize without lost versions", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  const input = { workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" as const };
  const [a, b] = await Promise.all([x.supervisor.start(input), x.supervisor.start(input)]);
  assert.equal(a.version, b.version); assert.equal((await x.supervisor.restore("wf")).version, b.version);
});

test("restore rejects a forged frozen record with incoherent runtime", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  const persistence = (x.supervisor as any).persistence as MemoryWorkflowPersistence;
  const original = persistence.load("wf")!;
  await persistence.save(Object.freeze({ ...original, runtime: Object.freeze({ ...original.runtime, state: "FILLED" }) }));
  await assert.rejects(() => x.supervisor.restore("wf"), /RECOVERY_BLOCKED/);
});

test("restore rejects a READY workflow at the exact mandate expiry boundary", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  const persistence = (x.supervisor as any).persistence as MemoryWorkflowPersistence;
  await persistence.save(Object.freeze({
    kind: "WORKFLOW_RECEIPT", workflowId: "wf", mandateId: mandate.mandateId, version: 0,
    status: "READY", runtime: createMandateRuntime({ expiresAt: mandate.expiresAt }), authorityStatus: "ACTIVE",
    mandate: structuredClone(mandate), market, account, evaluationPolicy: evalPolicy,
  }));
  const expiredSupervisor = new RuntimeSupervisor({ mode: "LOCAL_REPLAY", writer: x.writer, persistence, clock: () => mandate.expiresAt });
  await assert.rejects(() => expiredSupervisor.restore("wf"), /RECOVERY_BLOCKED/);
});


test("start blocks any existing forged, mutable, or structurally hostile record", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  const original = ((x.supervisor as any).persistence as MemoryWorkflowPersistence).load("wf")!;
  for (const forge of [
    () => Object.freeze({ ...original, hidden: true }),
    () => { const r = { ...original }; Object.defineProperty(r, "hidden", { value: true }); return Object.freeze(r); },
    () => { const r = { ...original }; Object.defineProperty(r, "status", { get: () => original.status }); return Object.freeze(r); },
    () => Object.freeze(Object.assign(Object.create({ hidden: true }), original)),
    () => { const r = { ...original }; (r as any).runtime = { ...original.runtime }; return Object.freeze(r); },
  ]) {
    const hostile = forge();
    const persistence = { load: () => hostile, save: async () => {}, compareAndSave: async () => {}, [WORKFLOW_PERSISTENCE_CAS_CAPABILITY]: true };
    const supervisor = new RuntimeSupervisor({ mode: "LOCAL_REPLAY", writer: x.writer, persistence, clock: () => 2_600 });
    await assert.rejects(() => supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" }), /RECOVERY_BLOCKED/);
  }
});

test("workflow validation rejects symbols, accessors, custom prototypes, and mutable nested values", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  const cases = [
    () => { const r = { ...mandate }; Object.defineProperty(r, "hidden", { value: 1 }); return Object.freeze(r); },
    () => { const r = { ...mandate }; Object.defineProperty(r, "symbolic", { value: 1, enumerable: false }); Object.defineProperty(r, Symbol("x"), { value: 1 }); return Object.freeze(r); },
    () => { const r = { ...mandate }; Object.defineProperty(r, "symbol", { get: () => mandate.symbol }); return Object.freeze(r); },
    () => Object.freeze(Object.assign(Object.create({ workflowId: mandate.workflowId }), mandate)),
    () => ({ ...mandate }),
  ];
  for (const make of cases) {
    const bad = make();
    await assert.rejects(() => x.supervisor.start({ workflowId: "wf", mandate: bad as any, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" }));
  }
});

test("serial cleanup removes each completed workflow tail token", async () => {
  const x = setup();
  for (let i = 0; i < 25; i++) await assert.rejects(() => x.supervisor.trigger(`missing-${i}`), /RECOVERY_BLOCKED/);
  assert.equal((x.supervisor as any).tails.size, 0);
});

test("custom persistence must explicitly implement compare-and-save CAS", () => {
  const x = setup();
  assert.throws(() => new RuntimeSupervisor({ mode: "LOCAL_REPLAY", writer: x.writer, persistence: { load: () => undefined, save: async () => {} }, clock: () => 2_600 } as any), /CAS/);
});

test("silently ignoring compare-and-save is rejected by the capability contract", () => {
  const x = setup();
  const persistence = { load: () => undefined, save: async () => {}, compareAndSave: async () => {} };
  assert.throws(() => new RuntimeSupervisor({ mode: "LOCAL_REPLAY", writer: x.writer, persistence, clock: () => 2_600 } as any), /CAS/);
  const supported = { ...persistence, [WORKFLOW_PERSISTENCE_CAS_CAPABILITY]: true };
  assert.doesNotThrow(() => new RuntimeSupervisor({ mode: "LOCAL_REPLAY", writer: x.writer, persistence: supported, clock: () => 2_600 } as any));
});

test("unknown receipts reject invalid outcomes and incoherent optional fields", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  const original = ((x.supervisor as any).persistence as MemoryWorkflowPersistence).load("wf")!;
  const bad = [
    { orderOutcome: "EVIL", clientOrderId: "mb5-" + "a".repeat(48) },
    { orderOutcome: "UNKNOWN", clientOrderId: "evil" },
    { orderOutcome: "UNKNOWN", clientOrderId: "mb5-" + "a".repeat(48), refusalCode: "bad" },
    { recoveryStatus: "RECONCILED" },
  ];
  for (const fields of bad) {
    const persistence = { load: () => Object.freeze({ ...original, status: "UNKNOWN", runtime: Object.freeze({ ...original.runtime, state: "UNKNOWN" }), ...fields }), save: async () => {}, compareAndSave: async () => {}, [WORKFLOW_PERSISTENCE_CAS_CAPABILITY]: true } as any;
    const supervisor = new RuntimeSupervisor({ mode: "LOCAL_REPLAY", writer: x.writer, persistence, clock: () => 2_600 });
    await assert.rejects(() => supervisor.restore("wf"), /RECOVERY_BLOCKED/);
  }
});

test("persistence boundary rejects impossible market envelopes", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  const impossible = deepFreeze({ ...market, value: { ...market.value, bidPrice: 100, askPrice: 99, markPrice: 110 } });
  await assert.rejects(() => x.supervisor.start({ workflowId: "wf", mandate, market: impossible, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" }), /invalid workflow binding/);
});

test("fresh process rejects Object and Array pollution before supervisor import", () => {
  const moduleUrl = new URL("../src/evaluator/index.js", import.meta.url).href;
  const script = `
    Object.defineProperty(Object.prototype, "evil", { value: true, configurable: true });
    Object.defineProperty(Array.prototype, "evil", { value: true, configurable: true });
    const { isCanonicalFrozenObject, isCanonicalFrozenArray } = await import(${JSON.stringify(moduleUrl)});
    if (isCanonicalFrozenObject(Object.freeze({ ok: 1 }), ["ok"]) || isCanonicalFrozenArray(Object.freeze([1]))) process.exit(1);
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: process.cwd() });
});

test("fresh evaluator rejects replacement of well-known Symbol.iterator identity", () => {
  const moduleUrl = new URL("../src/evaluator/index.js", import.meta.url).href;
  const script = `
    const { isCanonicalFrozenArray } = await import(${JSON.stringify(moduleUrl)});
    const prior = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
    delete Array.prototype[Symbol.iterator];
    Object.defineProperty(Array.prototype, Symbol("Symbol.iterator"), prior);
    if (isCanonicalFrozenArray(Object.freeze([1]))) process.exit(1);
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: process.cwd() });
});

test("restore rejects forged refusal codes", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  await x.supervisor.start({ workflowId: "wf", mandate, market: deepFreeze({ ...market, observedAt: 1_000, receivedAt: 1_001 }), account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  const original = ((x.supervisor as any).persistence as MemoryWorkflowPersistence).load("wf")!;
  const persistence = { load: () => Object.freeze({ ...original, status: "REFUSED", refusalCode: "FORGED" }), save: async () => {}, compareAndSave: async () => {}, [WORKFLOW_PERSISTENCE_CAS_CAPABILITY]: true } as any;
  const supervisor = new RuntimeSupervisor({ mode: "LOCAL_REPLAY", writer: x.writer, persistence, clock: () => 2_600 });
  await assert.rejects(() => supervisor.restore("wf"), /RECOVERY_BLOCKED/);
});

test("restore rejects workflow receipt with mismatched writer-owned order lineage", async () => {
  const x = setup(); await x.mandates.issue(mandate);
  await x.supervisor.start({ workflowId: "wf", mandate, market, account, evaluationPolicy: evalPolicy, authorityStatus: "ACTIVE" });
  const receipt = await x.supervisor.trigger("wf");
  const original = ((x.supervisor as any).persistence as MemoryWorkflowPersistence).load("wf")!;
  const forged = Object.freeze({ ...original, orderOutcome: "FILLED", clientOrderId: receipt.clientOrderId });
  const persistence = { load: () => forged, save: async () => {}, compareAndSave: async () => {}, [WORKFLOW_PERSISTENCE_CAS_CAPABILITY]: true } as any;
  const supervisor = new RuntimeSupervisor({ mode: "LOCAL_REPLAY", writer: x.writer, persistence, clock: () => 2_600 });
  await assert.rejects(() => supervisor.restore("wf"), /RECOVERY_BLOCKED/);
});
