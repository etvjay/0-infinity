import { serialize } from "node:v8";
import test from "node:test";
import assert from "node:assert/strict";
import { OrderWriter, MemoryOrderPersistence, type ExchangeAdapter, type ExecutionIntent, type FillEvent } from "../src/execution/index.js";

const intent = Object.freeze({ kind: "EXECUTION_INTENT", mandateId: "m-1", workflowId: "w-1", symbol: "BTCUSDT", side: "BUY", method: "LIMIT", price: 100, quantity: 2, notional: 200, executableEdgeBps: 10, marketStateVersion: 1n, accountStateVersion: 1n } as ExecutionIntent & { quantity: number });
function store() { return { consumeForSubmission: async () => undefined } as any; }
function adapter(result: any = { kind: "ACKNOWLEDGED" }): ExchangeAdapter { return { submit: async () => result, cancel: async () => undefined }; }
function event(value: FillEvent): FillEvent { return Object.freeze(value); }

test("RED: deterministic client id and acknowledged receipt are bounded and immutable", async () => {
  const writer = new OrderWriter(store(), new MemoryOrderPersistence(), adapter());
  const receipt = await writer.submit(intent, 3);
  assert.equal(receipt.outcome, "ACKNOWLEDGED");
  assert.equal(receipt.clientOrderId, OrderWriter.clientOrderId(intent, 3));
  assert.equal(receipt.quantity, 2);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.intent), true);
});

test("RED: timeout after adapter call is UNKNOWN and cannot be retried", async () => {
  let calls = 0;
  const writer = new OrderWriter(store(), new MemoryOrderPersistence(), { submit: async () => { calls++; return { kind: "TIMEOUT" }; }, cancel: async () => undefined });
  const first = await writer.submit(intent, 1);
  assert.equal(first.outcome, "UNKNOWN");
  await assert.rejects(() => writer.submit(intent, 1));
  assert.equal(calls, 1);
});

test("RED: fills are monotonic, duplicate events do not double count", async () => {
  const writer = new OrderWriter(store(), new MemoryOrderPersistence(), adapter());
  const receipt = await writer.submit(intent, 1);
  const one = await writer.reconcile(receipt.clientOrderId, event({ eventId: "e1", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 101 }));
  const duplicate = await writer.reconcile(receipt.clientOrderId, event({ eventId: "e1", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 101 }));
  const two = await writer.reconcile(receipt.clientOrderId, event({ eventId: "e2", status: "FILLED", fillQuantity: 2, fillPrice: 103 }));
  assert.equal(one.outcome, "PARTIALLY_FILLED"); assert.equal(one.filledQuantity, 1);
  assert.equal(duplicate.filledQuantity, 1); assert.equal(two.outcome, "FILLED"); assert.equal(two.filledQuantity, 2); assert.equal(two.averagePrice, 102);
});

test("rejects frozen custom-prototype, hidden, symbol, accessor, and inherited intent fields", async () => {
  const writer = new OrderWriter(store(), new MemoryOrderPersistence(), adapter());
  const inherited = Object.create({ accountId: "acct" }); Object.assign(inherited, intent); Object.freeze(inherited);
  await assert.rejects(() => writer.submit(inherited, 1), /invalid/);
  const hidden = { ...intent }; Object.defineProperty(hidden, "accountId", { value: "acct", enumerable: false }); Object.freeze(hidden);
  await assert.rejects(() => writer.submit(hidden as any, 1), /invalid/);
  const accessor = { ...intent }; Object.defineProperty(accessor, "accountId", { get: () => "acct", enumerable: true }); Object.freeze(accessor);
  await assert.rejects(() => writer.submit(accessor as any, 1), /invalid/);
  const symbolKey = { ...intent, [Symbol("audit")]: true }; Object.freeze(symbolKey);
  await assert.rejects(() => writer.submit(symbolKey as any, 1), /invalid/);
});

test("same clientOrderId refuses any complete intent mismatch and receipt binds audit fields", async () => {
  const persistence = new MemoryOrderPersistence();
  const writer = new OrderWriter(store(), persistence, adapter());
  const first = await writer.submit(Object.freeze({ ...intent, accountId: "acct", method: "LIMIT" }), 4);
  assert.equal(first.accountId, "acct"); assert.equal(first.method, "LIMIT"); assert.equal(first.attempt, 4);
  assert.equal(first.notional, 200); assert.equal(first.executableEdgeBps, 10); assert.deepEqual(first.fillEventIds, []);
  for (const change of [{ method: "MARKET" }, { notional: 201 }, { executableEdgeBps: 11 }, { marketStateVersion: 2n }, { accountStateVersion: 2n }, { accountId: "other" }, { quantity: 1 }]) {
    await assert.rejects(() => writer.submit(Object.freeze({ ...intent, accountId: "acct", ...change } as any), 4), /conflicting/);
  }
});

test("reconciliation treats fill quantities as cumulative and rejects mutable or malformed events", async () => {
  const writer = new OrderWriter(store(), new MemoryOrderPersistence(), adapter());
  const receipt = await writer.submit(intent, 5);
  await assert.rejects(() => writer.reconcile(receipt.clientOrderId, { eventId: "mutable", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 100 }), /invalid/);
  const later = await writer.reconcile(receipt.clientOrderId, event({ eventId: "later", status: "FILLED", fillQuantity: 2, fillPrice: 103 }));
  const older = await writer.reconcile(receipt.clientOrderId, event({ eventId: "older", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 101 }));
  assert.equal(later.filledQuantity, 2); assert.equal(later.averagePrice, 103);
  assert.equal(older.filledQuantity, 2); assert.equal(older.averagePrice, 103); assert.deepEqual(older.fillEventIds, ["later", "older"]);
});

test("rejects custom-prototype, hidden, symbol, and accessor reconciliation events", async () => {
  const writer = new OrderWriter(store(), new MemoryOrderPersistence(), adapter());
  const receipt = await writer.submit(intent, 6);
  const inherited = Object.create({ fillPrice: 101 }); Object.assign(inherited, { eventId: "inherited", status: "PARTIALLY_FILLED", fillQuantity: 1 }); Object.freeze(inherited);
  await assert.rejects(() => writer.reconcile(receipt.clientOrderId, inherited), /invalid/);
  const hidden = { eventId: "hidden", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 101 }; Object.defineProperty(hidden, "fillPrice", { value: 101, enumerable: false }); Object.freeze(hidden);
  await assert.rejects(() => writer.reconcile(receipt.clientOrderId, hidden as any), /invalid/);
  const accessor = { eventId: "accessor", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 101 }; Object.defineProperty(accessor, "fillPrice", { get: () => 101, enumerable: true }); Object.freeze(accessor);
  await assert.rejects(() => writer.reconcile(receipt.clientOrderId, accessor as any), /invalid/);
  const symbol = Object.freeze({ eventId: "symbol", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 101, [Symbol("extra")]: true });
  await assert.rejects(() => writer.reconcile(receipt.clientOrderId, symbol), /invalid/);
});

test("FILLED requires a cumulative fill quantity that reaches the requested quantity", async () => {
  const writer = new OrderWriter(store(), new MemoryOrderPersistence(), adapter());
  const receipt = await writer.submit(intent, 7);
  await assert.rejects(() => writer.reconcile(receipt.clientOrderId, event({ eventId: "missing-filled", status: "FILLED", fillPrice: 101 })), /invalid/);
  await assert.rejects(() => writer.reconcile(receipt.clientOrderId, event({ eventId: "short-filled", status: "FILLED", fillQuantity: 1, fillPrice: 101 })), /invalid/);
});

test("REJECTED submission refuses later fills without mutating its receipt", async () => {
  const persistence = new MemoryOrderPersistence();
  const writer = new OrderWriter(store(), persistence, adapter({ kind: "REJECTED", message: "not allowed" }));
  const receipt = await writer.submit(intent, 10);
  const before = persistence.replay()[0];
  assert.equal(receipt.outcome, "REJECTED");
  await assert.rejects(() => writer.reconcile(receipt.clientOrderId, event({ eventId: "rejected-late-fill", status: "FILLED", fillQuantity: 2, fillPrice: 101 })), /terminal submission outcome/);
  assert.deepEqual(persistence.replay()[0], before);
  assert.deepEqual(await writer.submit(intent, 10), before);
});

test("FAILED submission refuses later fills without mutating its receipt", async () => {
  const persistence = new MemoryOrderPersistence();
  const writer = new OrderWriter(store(), persistence, adapter({ kind: "FAILED", message: "exchange error" }));
  const receipt = await writer.submit(intent, 11);
  const before = persistence.replay()[0];
  assert.equal(receipt.outcome, "FAILED");
  await assert.rejects(() => writer.reconcile(receipt.clientOrderId, event({ eventId: "failed-late-fill", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 101 })), /terminal submission outcome/);
  assert.deepEqual(persistence.replay()[0], before);
  assert.deepEqual(await writer.submit(intent, 11), before);
});

test("REJECTED and FAILED submissions refuse cancellation before adapter invocation without mutating receipt or persistence", async () => {
  for (const [attempt, result] of [[12, { kind: "REJECTED", message: "not allowed" }], [13, { kind: "FAILED", message: "exchange error" }] ] as const) {
    const persistence = new MemoryOrderPersistence();
    let cancelCalls = 0;
    const writer = new OrderWriter(store(), persistence, {
      submit: async () => result,
      cancel: async () => { cancelCalls++; },
    });
    const receipt = await writer.submit(intent, attempt);
    const before = persistence.replay()[0];
    const receiptBytes = structuredClone(receipt);
    const beforeBytes = structuredClone(before);
    await assert.rejects(() => writer.cancel(receipt.clientOrderId), /terminal submission outcome cannot be cancelled/);
    assert.deepEqual(receipt, receiptBytes);
    assert.deepEqual(serialize(receipt), serialize(receiptBytes));
    assert.deepEqual(persistence.replay()[0], beforeBytes);
    assert.deepEqual(serialize(persistence.replay()[0]), serialize(beforeBytes));
    assert.equal(receipt.cancelState, "NONE");
    assert.equal(persistence.replay()[0].cancelState, "NONE");
    assert.equal(cancelCalls, 0);
  }
});

test("cancel durably records a request before the adapter and UNKNOWN after an uncertain call", async () => {
  const persistence = new MemoryOrderPersistence();
  let seen: any;
  const writer = new OrderWriter(store(), persistence, {
    submit: async () => ({ kind: "ACKNOWLEDGED" }),
    cancel: async () => { seen = persistence.replay()[0]; throw new Error("lost cancel response"); },
  });
  const receipt = await writer.submit(intent, 8);
  const unknown = await writer.cancel(receipt.clientOrderId);
  assert.equal(seen.cancelState, "REQUESTED");
  assert.equal(unknown.outcome, "UNKNOWN");
  assert.equal(unknown.cancelState, "UNKNOWN");
  assert.equal(persistence.replay()[0].cancelState, "UNKNOWN");
  await assert.rejects(() => writer.cancel(receipt.clientOrderId), /unknown cancellation cannot be retried/);
  await assert.rejects(() => writer.reconcile(receipt.clientOrderId, event({ eventId: "uncertain-filled", status: "FILLED", fillQuantity: 2, fillPrice: 101 })), /uncertain cancellation/);
  const unknownReplay = persistence.replay()[0];
  assert.equal(unknownReplay.outcome, "UNKNOWN");
  assert.equal(unknownReplay.cancelState, "UNKNOWN");
  assert.equal(unknownReplay.filledQuantity, 0);
  assert.deepEqual(unknownReplay.fillEventIds, []);

  const cancelledPersistence = new MemoryOrderPersistence();
  const cancelledWriter = new OrderWriter(store(), cancelledPersistence, adapter());
  const cancellable = await cancelledWriter.submit(intent, 9);
  const cancelled = await cancelledWriter.cancel(cancellable.clientOrderId);
  await assert.rejects(() => cancelledWriter.reconcile(cancellable.clientOrderId, event({ eventId: "late-filled", status: "FILLED", fillQuantity: 2, fillPrice: 101 })), /terminal cancellation/);
  const cancelledReplay = cancelledPersistence.replay()[0];
  assert.equal(cancelled.outcome, "CANCELLED");
  assert.equal(cancelledReplay.outcome, "CANCELLED");
  assert.equal(cancelledReplay.cancelState, "CANCELLED");
  assert.equal(cancelledReplay.filledQuantity, 0);
  assert.deepEqual(cancelledReplay.fillEventIds, []);
});

test("cancel refuses a persisted record without deterministic writer ownership", async () => {
  const forged = {
    clientOrderId: "forged-id", mandateId: "m-1", workflowId: "w-1", symbol: "BTCUSDT", side: "BUY", method: "LIMIT",
    attempt: 0, notional: 200, executableEdgeBps: 10, marketStateVersion: 1n, accountStateVersion: 1n,
    quantity: 2, price: 100, outcome: "ACKNOWLEDGED", filledQuantity: 0, acceptanceProvenance: "ACKNOWLEDGED",
    fillEventIds: [], intent, events: [], filledNotional: 0, cancelState: "NONE",
  };
  const persistence = { load: () => forged, save: async () => undefined } as any;
  const writer = new OrderWriter(store(), persistence, adapter());
  await assert.rejects(() => writer.cancel("forged-id"), /writer-owned/);
});

test("all writer operations reject forged persisted receipts before side effects", async () => {
  const seed = new MemoryOrderPersistence();
  const seedWriter = new OrderWriter(store(), seed, adapter());
  const receipt = await seedWriter.submit(intent, 14);
  const persisted = seed.replay()[0];
  const mutations = [
    (value: any) => ({ ...value, outcome: "NOT_AN_OUTCOME" }),
    (value: any) => ({ ...value, quantity: 0 }),
    (value: any) => ({ ...value, filledQuantity: 3 }),
    (value: any) => ({ ...value, acceptanceProvenance: "FORGED" }),
    (value: any) => ({ ...value, cancelState: "CANCELLED" }),
    (value: any) => ({ ...value, unsupported: true }),
    (value: any) => { const forged = { ...value }; Object.defineProperty(forged, "unsupported", { value: true, enumerable: false }); return Object.freeze(forged); },
    (value: any) => { const forged = { ...value }; Object.defineProperty(forged, "outcome", { get: () => "ACKNOWLEDGED", enumerable: true }); return Object.freeze(forged); },
    (value: any) => Object.freeze({ ...value, [Symbol("unsupported")]: true }),
    (value: any) => Object.freeze(Object.create({ unsupported: true, ...value })),
  ];
  for (const mutate of mutations) {
    const forged = mutate(persisted);
    let cancelCalls = 0;
    const persistence = { load: () => forged, save: async () => undefined } as any;
    const writer = new OrderWriter(store(), persistence, { submit: async () => ({ kind: "ACKNOWLEDGED" }), cancel: async () => { cancelCalls++; } });
    await assert.rejects(() => writer.submit(intent, 14), /persisted receipt|invalid|conflicting/);
    await assert.rejects(() => writer.cancel(receipt.clientOrderId), /persisted receipt|invalid|writer-owned/);
    await assert.rejects(() => writer.reconcile(receipt.clientOrderId, event({ eventId: "forged-receipt-fill", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 101 })), /persisted receipt|invalid|writer-owned/);
    assert.equal(cancelCalls, 0);
  }
});

test("PARTIALLY_FILLED events require positive cumulative quantity and valid fill price", async () => {
  const writer = new OrderWriter(store(), new MemoryOrderPersistence(), adapter());
  const receipt = await writer.submit(intent, 15);
  for (const invalid of [
    { eventId: "partial-missing-quantity", status: "PARTIALLY_FILLED", fillPrice: 101 },
    { eventId: "partial-zero-quantity", status: "PARTIALLY_FILLED", fillQuantity: 0, fillPrice: 101 },
    { eventId: "partial-missing-price", status: "PARTIALLY_FILLED", fillQuantity: 1 },
    { eventId: "partial-zero-price", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 0 },
  ]) await assert.rejects(() => writer.reconcile(receipt.clientOrderId, event(invalid as FillEvent)), /invalid reconciliation event/);
  const valid = await writer.reconcile(receipt.clientOrderId, event({ eventId: "partial-valid", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 101 }));
  assert.equal(valid.outcome, "PARTIALLY_FILLED");
  assert.equal(valid.filledQuantity, 1);
});

test("persisted receipts bind quantity and enforce status provenance and fill arithmetic", async () => {
  const seed = new MemoryOrderPersistence();
  const writer = new OrderWriter(store(), seed, adapter());
  const receipt = await writer.submit(intent, 16);
  const base = seed.replay()[0];
  const mutations = [
    { ...base, quantity: 1 },
    { ...base, outcome: "ACKNOWLEDGED", acceptanceProvenance: "TIMEOUT" },
    { ...base, outcome: "ACKNOWLEDGED", filledQuantity: 1, averagePrice: 100, filledNotional: 100 },
    { ...base, outcome: "FILLED", filledQuantity: 2, averagePrice: 100, filledNotional: 200, acceptanceProvenance: "TIMEOUT" },
    { ...base, outcome: "UNKNOWN", acceptanceProvenance: "TIMEOUT", filledQuantity: 1, averagePrice: 100, filledNotional: 100 },
    { ...base, outcome: "CANCELLED", cancelState: "CANCELLED", filledQuantity: 1, averagePrice: 100, filledNotional: 100 },
    { ...base, outcome: "PARTIALLY_FILLED", filledQuantity: 1, averagePrice: 100, filledNotional: 99 },
  ];
  for (const forged of mutations) {
    const persistence = { load: () => Object.freeze(structuredClone(forged)), save: async () => undefined } as any;
    const forgedWriter = new OrderWriter(store(), persistence, adapter());
    await assert.rejects(() => forgedWriter.submit(intent, 16), /persisted receipt|invalid|conflicting/);
    await assert.rejects(() => forgedWriter.cancel(receipt.clientOrderId), /persisted receipt|writer-owned/);
    await assert.rejects(() => forgedWriter.reconcile(receipt.clientOrderId, event({ eventId: "coherence", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 100 })), /persisted receipt|writer-owned/);
  }
});

test("canonical frozen receipt arrays reject Array.prototype pollution", async () => {
  const persistence = new MemoryOrderPersistence();
  const writer = new OrderWriter(store(), persistence, adapter());
  const receipt = await writer.submit(intent, 17);
  const persisted = persistence.replay()[0];
  try {
    Object.defineProperty(Array.prototype, "pollutedReceiptKey", { value: true, configurable: true });
    const polluted = { ...persisted, fillEventIds: Object.freeze([]), events: Object.freeze([]) };
    const poisoned = { load: () => Object.freeze(polluted), save: async () => undefined } as any;
    const poisonedWriter = new OrderWriter(store(), poisoned, adapter());
    await assert.rejects(() => poisonedWriter.submit(intent, 17), /persisted receipt/);
  } finally { delete (Array.prototype as any).pollutedReceiptKey; }
});

test("adapter results are validated before a bogus result can be persisted", async () => {
  const persistence = new MemoryOrderPersistence();
  const writer = new OrderWriter(store(), persistence, { submit: async () => ({ kind: "BOGUS" } as any) });
  await assert.rejects(() => writer.submit(intent, 18), /adapter result/);
  assert.equal(persistence.replay()[0].outcome, "UNKNOWN");
});

test("partially filled orders cannot become invalid positive-fill cancellations", async () => {
  const writer = new OrderWriter(store(), new MemoryOrderPersistence(), adapter());
  const receipt = await writer.submit(intent, 19);
  await writer.reconcile(receipt.clientOrderId, event({ eventId: "partial-before-cancel", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 101 }));
  await assert.rejects(() => writer.cancel(receipt.clientOrderId), /filled order cannot be cancelled/);
});
