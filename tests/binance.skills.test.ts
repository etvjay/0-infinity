import test from "node:test";
import assert from "node:assert/strict";
import {
  BinanceSkillsAdapter,
  BINANCE_SKILLS_PUBLIC_READ_BLOCKED_EXTERNAL,
  type BinanceSkillOperation,
} from "../src/binance/skills.js";

const base = { symbol: "BTCUSDT", workflowId: "wf-binance-skills" } as const;
const ticker = { symbol: "BTCUSDT", price: "65000.10", bidPrice: "65000.00", askPrice: "65000.20", eventTime: 1_700_000_000_000 };

test("Skills Hub ticker output becomes immutable provenance-bearing research artifact", async () => {
  const adapter = new BinanceSkillsAdapter({ command: async () => JSON.stringify(ticker) });
  const result = await adapter.read("symbolPriceTicker", base);
  assert.equal(result.status, "READ_PASS");
  if (result.status !== "READ_PASS") return;
  assert.equal(result.artifact.provider, "BINANCE");
  assert.equal(result.artifact.surface, "SKILLS_HUB");
  assert.equal(result.artifact.operation, "symbolPriceTicker");
  assert.equal(result.artifact.sourceVersion, "2.0.0");
  assert.equal(result.artifact.workflowId, base.workflowId);
  assert.equal((result.artifact.observation as Record<string, unknown>).symbol, "BTCUSDT");
  assert.equal(Object.isFrozen(result.artifact), true);
  assert.equal(Object.isFrozen(result.artifact.observation), true);
  assert.match(result.artifact.digest, /^[0-9a-f]{64}$/);
  const ref = adapter.toEvidenceReference(result.artifact);
  assert.deepEqual(ref, { ref: result.artifact.ref, hash: result.artifact.digest, workflowId: base.workflowId, venue: "BINANCE", product: "USD_M_FUTURES", symbol: "BTCUSDT" });
});

test("read adapter rejects hostile shapes, authority fields, wrong symbols, and oversized output", async () => {
  const cases: unknown[] = [
    Object.assign(Object.create({ price: "1" }), { symbol: "BTCUSDT" }),
    { symbol: "BTCUSDT", price: NaN },
    { symbol: "ETHUSDT", price: "1" },
    { symbol: "BTCUSDT", order: "BUY" },
    { symbol: "BTCUSDT", mandate: "m" },
    { symbol: "BTCUSDT", intent: "i" },
    { symbol: "BTCUSDT", thesis: "t" },
    { symbol: "BTCUSDT", payload: "x".repeat(300_001) },
  ];
  for (const value of cases) {
    const adapter = new BinanceSkillsAdapter({ command: async () => value });
    await assert.rejects(() => adapter.read("symbolPriceTicker", base), /invalid|oversized|forbidden|symbol|nonfinite/i);
  }
  const accessor = {} as Record<string, unknown>;
  Object.defineProperty(accessor, "symbol", { enumerable: true, get: () => "BTCUSDT" });
  const adapter = new BinanceSkillsAdapter({ command: async () => accessor });
  await assert.rejects(() => adapter.read("symbolPriceTicker", base), /invalid|accessor/i);
});

test("blocked live invocation is an honest non-evidence receipt", async () => {
  const exact = "Service unavailable from a restricted location according to 'b. Eligibility' in https://www.binance.com/en/terms. Please contact customer service if you believe you received this message in error.";
  const adapter = new BinanceSkillsAdapter({ command: async () => { throw new Error(exact); } });
  const result = await adapter.read("markPrice", base);
  assert.equal(result.status, BINANCE_SKILLS_PUBLIC_READ_BLOCKED_EXTERNAL);
  if (result.status === BINANCE_SKILLS_PUBLIC_READ_BLOCKED_EXTERNAL) {
    assert.equal(result.error, exact);
    assert.equal("artifact" in result, false);
    assert.equal(result.evidence, false);
  }
});

test("role boundary permits analyst reasoning only and cannot issue authority", async () => {
  const adapter = new BinanceSkillsAdapter({ command: async () => ticker });
  for (const role of ["MARKET_ANALYST", "ADVOCATE", "OPPOSER"] as const) {
    const result = await adapter.read("symbolPriceTicker", { ...base, role });
    assert.equal(result.status, "READ_PASS");
  }
  await assert.rejects(() => adapter.read("symbolPriceTicker", { ...base, role: "COUNCIL" as never }), /role/i);
  const result = await adapter.read("symbolPriceTicker", base);
  if (result.status === "READ_PASS") {
    const input = adapter.toMarketAnalysisInput(result.artifact);
    assert.equal("mandate" in input, false);
    assert.equal("order" in input, false);
    assert.equal("intent" in input, false);
    assert.equal(input.evidenceRef, result.artifact.ref);
  }
});

test("all official operations are explicit and never auto-network", async () => {
  const operations: BinanceSkillOperation[] = ["symbolPriceTicker", "markPrice", "klines", "exchangeInfo"];
  const seen: string[] = [];
  const adapter = new BinanceSkillsAdapter({ command: async (operation: BinanceSkillOperation) => { seen.push(operation); return { symbol: "BTCUSDT", order: "BUY" }; } });
  for (const operation of operations) await assert.rejects(() => adapter.read(operation, base), /invalid|required|forbidden/i);
  assert.deepEqual(seen, operations);
});
