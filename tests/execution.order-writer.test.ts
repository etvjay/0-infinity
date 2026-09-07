import test from "node:test";
import assert from "node:assert/strict";
import { OrderWriter, MemoryOrderPersistence, type ExchangeAdapter, type ExecutionIntent, type OrderReceipt } from "../src/execution/index.js";

const intent = Object.freeze({ kind: "EXECUTION_INTENT", mandateId: "m-1", workflowId: "w-1", symbol: "BTCUSDT", side: "BUY", method: "LIMIT", price: 100, quantity: 2, notional: 200, executableEdgeBps: 10, marketStateVersion: 1n, accountStateVersion: 1n } as ExecutionIntent & { quantity: number });
function store() { return { consumeForSubmission: async () => undefined } as any; }
function adapter(result: any = { kind: "ACKNOWLEDGED" }): ExchangeAdapter { return { submit: async () => result, cancel: async () => undefined }; }

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
  const one = await writer.reconcile(receipt.clientOrderId, { eventId: "e1", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 101 });
  const duplicate = await writer.reconcile(receipt.clientOrderId, { eventId: "e1", status: "PARTIALLY_FILLED", fillQuantity: 1, fillPrice: 101 });
  const two = await writer.reconcile(receipt.clientOrderId, { eventId: "e2", status: "FILLED", fillQuantity: 1, fillPrice: 103 });
  assert.equal(one.outcome, "PARTIALLY_FILLED"); assert.equal(one.filledQuantity, 1);
  assert.equal(duplicate.filledQuantity, 1); assert.equal(two.outcome, "FILLED"); assert.equal(two.filledQuantity, 2); assert.equal(two.averagePrice, 102);
});
