import test from "node:test";
import assert from "node:assert/strict";
import { createReasoningReceipt, verifyReasoningReceipt, reasoningReceiptMarkdown, type ReasoningReceipt } from "../src/reasoning/receipt.js";

test("reasoning receipt has stable canonical serialization and SHA-256", () => {
  const receipt = createReasoningReceipt({ decision: "APPROVE", evidenceRefs: ["a-ref", "o-ref"], supportingRefs: ["a-ref"], opposingRefs: ["o-ref"], claims: [{ id: "edge", text: "edge clears floor", refs: ["a-ref"] }], assumptions: ["public replay is bounded"], unresolved: ["account read unavailable"], invalidation: ["stale evidence", "edge collapse"] });
  assert.equal(verifyReasoningReceipt(receipt), receipt.canonicalSha256);
  assert.equal(receipt.canonicalSha256, verifyReasoningReceipt(receipt));
  assert.match(reasoningReceiptMarkdown(receipt), /APPROVE/);
  assert.equal(Object.isFrozen(receipt), true);
});

test("reasoning receipt rejects dangling refs, contradiction, and mutation", () => {
  assert.throws(() => createReasoningReceipt({ decision: "APPROVE", evidenceRefs: ["a"], supportingRefs: ["missing"], opposingRefs: [], claims: [], assumptions: [], unresolved: [], invalidation: [] }));
  assert.throws(() => createReasoningReceipt({ decision: "REFUSE", evidenceRefs: ["a"], supportingRefs: ["a"], opposingRefs: ["a"], claims: [], assumptions: [], unresolved: [], invalidation: [] }));
  const receipt = createReasoningReceipt({ decision: "REFUSE", evidenceRefs: ["a"], supportingRefs: [], opposingRefs: ["a"], claims: [], assumptions: [], unresolved: ["threshold"], invalidation: ["freshness"] });
  assert.equal(verifyReasoningReceipt({ ...receipt, canonicalSha256: "0".repeat(64) }), false);
});
