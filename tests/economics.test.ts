import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import type { UsdMFuturesOrderBookView } from "../src/market/index.js";
import { assessExecutionEconomics, type ExecutionEconomicsInput, type EconomicPolicy } from "../src/economics/index.js";

const policy: EconomicPolicy = Object.freeze({
  maxAuthorizedQuantity: "10", maxNotional: "100000", minPrice: "1", maxPrice: "100000",
  maxSpreadBps: "300", maxSlippageBps: "200", maxFeeBps: "20", maxFundingCostBps: "20", minExecutableEdgeBps: "0",
});
const book = (asks: [string, string][], bids: [string, string][]): UsdMFuturesOrderBookView => Object.freeze({
  version: 1, symbol: "BTCUSDT", status: "SYNCED", lastUpdateId: 1n,
  asks: Object.freeze(asks.map(([price, quantity]) => Object.freeze({ price, quantity }))),
  bids: Object.freeze(bids.map(([price, quantity]) => Object.freeze({ price, quantity }))),
  bestAsk: asks[0] && Object.freeze({ price: asks[0][0], quantity: asks[0][1] }),
  bestBid: bids[0] && Object.freeze({ price: bids[0][0], quantity: bids[0][1] }),
});
const input = (side: "BUY" | "SELL", requestedQuantity = "3"): ExecutionEconomicsInput => ({
  book: book([["101", "2"], ["103", "4"]], [["99", "2"], ["97", "4"]]), side,
  requestedQuantity, expectedMoveBps: "500", fee: { bps: "5" },
  funding: { status: "ASSESSED", costBps: "2", horizon: "8h" }, policy, partialFill: "REJECT",
});

test("BUY walks asks and computes exact VWAP and edge", () => {
  const result = assessExecutionEconomics(input("BUY", "3"));
  assert.equal(result.kind, "ASSESSMENT");
  if (result.kind !== "ASSESSMENT") return;
  assert.equal(result.bestExecutableReference, "101");
  assert.equal(result.vwap, "101.666666666666666666");
  assert.equal(result.executableQuantity, "3");
  assert.equal(result.totalCost, "305");
  assert.equal(result.spreadBps, "200");
  assert.equal(result.slippageBps, "66.0066006600660066");
  assert.equal(result.executableEdgeBps, "226.993399339933993399");
});

test("SELL walks bids descending and computes side-specific slippage", () => {
  const result = assessExecutionEconomics(input("SELL", "3"));
  assert.equal(result.kind, "ASSESSMENT");
  if (result.kind !== "ASSESSMENT") return;
  assert.equal(result.bestExecutableReference, "99");
  assert.equal(result.vwap, "98.333333333333333333");
  assert.equal(result.totalCost, "295");
  assert.equal(result.slippageBps, "67.340067340067340067");
});

test("ordering/permutation does not change the canonical walk", () => {
  const ordered = assessExecutionEconomics(input("BUY"));
  const permuted = assessExecutionEconomics({ ...input("BUY"), book: book([["103", "4"], ["101", "2"]], [["97", "4"], ["99", "2"]]) });
  assert.deepEqual(permuted, ordered);
});

test("refuses insufficient depth unless partial fill is explicitly allowed", () => {
  const rejected = assessExecutionEconomics({ ...input("BUY", "7"), partialFill: "REJECT" });
  assert.equal(rejected.kind, "REFUSAL");
  if (rejected.kind === "REFUSAL") assert.equal(rejected.code, "INSUFFICIENT_DEPTH");
  const partial = assessExecutionEconomics({ ...input("BUY", "7"), partialFill: "ALLOW" });
  assert.equal(partial.kind, "ASSESSMENT");
  if (partial.kind === "ASSESSMENT") assert.equal(partial.executableQuantity, "6");
});

test("refuses absent funding and malformed/untrusted books", () => {
  const noFunding = assessExecutionEconomics({ ...input("BUY"), funding: { status: "UNASSESSED", reason: "missing" } });
  assert.equal(noFunding.kind, "REFUSAL");
  if (noFunding.kind === "REFUSAL") assert.equal(noFunding.code, "FUNDING_NOT_ASSESSED");
  const crossed = assessExecutionEconomics({ ...input("BUY"), book: book([["99", "2"]], [["101", "2"]]) });
  assert.equal(crossed.kind, "REFUSAL");
  if (crossed.kind === "REFUSAL") assert.equal(crossed.code, "CROSSED_BOOK");
  const empty = assessExecutionEconomics({ ...input("BUY"), book: book([], [["99", "2"]]) });
  assert.equal(empty.kind, "REFUSAL");
  if (empty.kind === "REFUSAL") assert.equal(empty.code, "EMPTY_SIDE");
  const syncing = assessExecutionEconomics({ ...input("BUY"), book: Object.freeze({ ...book([["101", "2"]], [["99", "2"]]), status: "SYNCING" }) });
  assert.equal(syncing.kind, "REFUSAL");
  if (syncing.kind === "REFUSAL") assert.equal(syncing.code, "BOOK_NOT_SYNCED");
});

test("enforces quantity, price, cost, fee, funding and malformed decimal bounds", () => {
  for (const variant of [
    { ...input("BUY", "11"), expected: "UNAUTHORIZED_QUANTITY" },
    { ...input("BUY"), policy: { ...policy, maxPrice: "100" }, expected: "PRICE_OUT_OF_BOUNDS" },
    { ...input("BUY"), policy: { ...policy, maxNotional: "1" }, expected: "NOTIONAL_LIMIT" },
    { ...input("BUY"), fee: { bps: "21" }, expected: "COST_LIMIT" },
    { ...input("BUY"), funding: { status: "ASSESSED", costBps: "21", horizon: "8h" }, expected: "COST_LIMIT" },
    { ...input("BUY"), requestedQuantity: "0", expected: "MALFORMED_INPUT" },
    { ...input("BUY"), requestedQuantity: "1e3", expected: "MALFORMED_INPUT" },
  ]) {
    const { expected, ...candidate } = variant;
    const result = assessExecutionEconomics(candidate as ExecutionEconomicsInput);
    assert.equal(result.kind, "REFUSAL");
    if (result.kind === "REFUSAL") assert.equal(result.code, expected);
  }
});

test("assessment is deeply immutable, deterministic, and handles large decimals", () => {
  const largeBook = book([["100000000000000000000000000001", "2"]], [["99999999999999999999999999999", "2"]]);
  const large = assessExecutionEconomics({ ...input("BUY"), book: largeBook, requestedQuantity: "2", policy: { ...policy, maxPrice: "100000000000000000000000000002", maxNotional: "1000000000000000000000000000000" } });
  assert.equal(large.kind, "ASSESSMENT");
  const a = assessExecutionEconomics(input("BUY"));
  const b = assessExecutionEconomics(input("BUY"));
  assert.deepEqual(a, b);
  assert.equal(Object.isFrozen(a), true);
  if (a.kind === "ASSESSMENT") {
    assert.equal(Object.isFrozen(a.fills), true);
    assert.throws(() => (a as { vwap: string }).vwap = "0", TypeError);
  }
});

test("duplicate-price levels are permutation invariant and aggregate quantities", () => {
  const first = assessExecutionEconomics({ ...input("BUY", "3"), book: book([["101", "1"], ["101.00", "2"], ["103", "4"]], [["99", "2"], ["97", "4"]]) });
  const second = assessExecutionEconomics({ ...input("BUY", "3"), book: book([["103", "4"], ["101.00", "2"], ["101", "1"]], [["97", "4"], ["99", "2"]]) });
  assert.deepEqual(second, first);
  assert.equal(first.kind, "ASSESSMENT");
  if (first.kind === "ASSESSMENT") assert.deepEqual(first.fills, [{ price: "101", quantity: "3", notional: "303" }]);
});

test("rejects inherited structural fields on frozen levels and frozen books", () => {
  const inheritedLevel = Object.freeze(Object.create({ price: "101", quantity: "2" }));
  const levelBook = Object.freeze({ ...book([], [["99", "2"]]), asks: Object.freeze([inheritedLevel]) });
  const levelResult = assessExecutionEconomics({ ...input("BUY"), book: levelBook as UsdMFuturesOrderBookView });
  assert.equal(levelResult.kind, "REFUSAL");
  if (levelResult.kind === "REFUSAL") assert.equal(levelResult.code, "MALFORMED_INPUT");

  const inheritedBook = Object.create({ status: "SYNCED" });
  Object.assign(inheritedBook, book([["101", "2"]], [["99", "2"]]));
  delete inheritedBook.status;
  Object.freeze(inheritedBook);
  const bookResult = assessExecutionEconomics({ ...input("BUY"), book: inheritedBook as UsdMFuturesOrderBookView });
  assert.equal(bookResult.kind, "REFUSAL");
  if (bookResult.kind === "REFUSAL") assert.equal(bookResult.code, "MALFORMED_INPUT");
});

test("fresh process rejects Array.prototype pollution before economics import", () => {
  const moduleUrl = new URL("../src/economics/index.js", import.meta.url).href;
  const script = `
    Object.defineProperty(Array.prototype, "preImportPollution", { value: true, enumerable: false, configurable: true });
    const { assessExecutionEconomics } = await import(${JSON.stringify(moduleUrl)});
    const frozen = (value) => Object.freeze(value);
    const book = frozen({ version: 1, symbol: "BTCUSDT", status: "SYNCED", lastUpdateId: 1n,
      asks: frozen([frozen({ price: "101", quantity: "2" })]),
      bids: frozen([frozen({ price: "99", quantity: "2" })]),
      bestAsk: frozen({ price: "101", quantity: "2" }), bestBid: frozen({ price: "99", quantity: "2" }) });
    const result = assessExecutionEconomics({ book, side: "BUY", requestedQuantity: "1", expectedMoveBps: "500",
      fee: frozen({ bps: "5" }), funding: frozen({ status: "ASSESSED", costBps: "2", horizon: "8h" }),
      policy: frozen({ maxAuthorizedQuantity: "10", maxNotional: "100000", minPrice: "1", maxPrice: "100000",
        maxSpreadBps: "300", maxSlippageBps: "200", maxFeeBps: "20", maxFundingCostBps: "20", minExecutableEdgeBps: "0" }),
      partialFill: "REJECT" });
    if (result.kind !== "REFUSAL" || result.code !== "MALFORMED_INPUT") process.exit(1);
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: process.cwd() });
});

test("rejects Array.prototype pollution and restores the shared prototype", () => {
  const pollutionCases: [string | symbol, PropertyDescriptor][] = [
    ["enumerablePollution", { value: true, enumerable: true, configurable: true }],
    ["hiddenPollution", { value: true, enumerable: false, configurable: true }],
    [Symbol("symbolPollution"), { value: true, enumerable: false, configurable: true }],
  ];
  for (const [key, descriptor] of pollutionCases) {
    const prior = Object.getOwnPropertyDescriptor(Array.prototype, key);
    try {
      Object.defineProperty(Array.prototype, key, descriptor);
      const result = assessExecutionEconomics(input("BUY"));
      assert.equal(result.kind, "REFUSAL");
      if (result.kind === "REFUSAL") assert.equal(result.code, "MALFORMED_INPUT");
    } finally {
      if (prior) Object.defineProperty(Array.prototype, key, prior);
      else delete Array.prototype[key as keyof unknown[]];
    }
  }
  assert.equal(assessExecutionEconomics(input("BUY")).kind, "ASSESSMENT");
});

test("rejects hidden unsupported keys on nested book containers and quotes", () => {
  const base = input("BUY");
  const hostile = (value: object, location: "own" | "inherited", key: string | symbol, enumerable: boolean) => {
    const target = Array.isArray(value) ? [...value] : {};
    if (location === "inherited") Object.setPrototypeOf(target, Object.create(Object.getPrototypeOf(target)));
    Object.assign(target, value);
    Object.defineProperty(location === "inherited" ? Object.getPrototypeOf(target) : target, key, { value: true, enumerable });
    return Object.freeze(target);
  };
  const cases: ExecutionEconomicsInput[] = [];
  for (const location of ["own", "inherited"] as const) for (const key of ["unsupported", Symbol("unsupported")] as const) for (const enumerable of [false, true]) {
    const bids = hostile(base.book.bids, location, key, enumerable);
    const asks = hostile(base.book.asks, location, key, enumerable);
    cases.push({ ...base, book: Object.freeze({ ...base.book, bids }) as UsdMFuturesOrderBookView });
    cases.push({ ...base, book: Object.freeze({ ...base.book, asks }) as UsdMFuturesOrderBookView });
    cases.push({ ...base, book: Object.freeze({ ...base.book, bestBid: hostile(base.book.bestBid!, location, key, enumerable) }) as UsdMFuturesOrderBookView });
    cases.push({ ...base, book: Object.freeze({ ...base.book, bestAsk: hostile(base.book.bestAsk!, location, key, enumerable) }) as UsdMFuturesOrderBookView });
  }
  for (const candidate of cases) {
    const result = assessExecutionEconomics(candidate);
    assert.equal(result.kind, "REFUSAL");
    if (result.kind === "REFUSAL") assert.equal(result.code, "MALFORMED_INPUT");
  }
});

test("rejects inherited fields at every economics input boundary", () => {
  const base = input("BUY");
  const without = (value: Record<string, unknown>, key: string, prototype: Record<string, unknown>) =>
    Object.freeze(Object.assign(Object.create(prototype), Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))));
  const cases: ExecutionEconomicsInput[] = [
    without(base as unknown as Record<string, unknown>, "side", { side: "BUY" }) as unknown as ExecutionEconomicsInput,
    { ...base, policy: without(policy as unknown as Record<string, unknown>, "maxNotional", { maxNotional: "100000" }) as EconomicPolicy },
    { ...base, fee: without(base.fee as unknown as Record<string, unknown>, "bps", { bps: "5" }) as ExecutionEconomicsInput["fee"] },
    { ...base, funding: without(base.funding as unknown as Record<string, unknown>, "status", { status: "ASSESSED" }) as ExecutionEconomicsInput["funding"] },
    { ...base, funding: without(base.funding as unknown as Record<string, unknown>, "costBps", { costBps: "2" }) as ExecutionEconomicsInput["funding"] },
    { ...base, funding: without(base.funding as unknown as Record<string, unknown>, "horizon", { horizon: "8h" }) as ExecutionEconomicsInput["funding"] },
  ];
  for (const candidate of cases) {
    const result = assessExecutionEconomics(candidate);
    assert.equal(result.kind, "REFUSAL");
    if (result.kind === "REFUSAL") assert.equal(result.code, "MALFORMED_INPUT");
  }
  const symbol = Symbol("unsupported");
  const hostile = (value: object, inherited: boolean, symbolKey: boolean) => {
    const target = inherited ? Object.create({}) : {};
    Object.assign(target, value);
    const key: string | symbol = symbolKey ? symbol : "unsupported";
    Object.defineProperty(inherited ? Object.getPrototypeOf(target) : target, key, { value: true, enumerable: false });
    return Object.freeze(target);
  };
  const hostileCases: ExecutionEconomicsInput[] = [];
  for (const inherited of [false, true]) for (const symbolKey of [false, true]) {
    hostileCases.push(hostile(base, inherited, symbolKey) as ExecutionEconomicsInput);
    hostileCases.push({ ...base, fee: hostile(base.fee, inherited, symbolKey) as ExecutionEconomicsInput["fee"] });
    hostileCases.push({ ...base, policy: hostile(policy, inherited, symbolKey) as EconomicPolicy });
    hostileCases.push({ ...base, funding: hostile(base.funding, inherited, symbolKey) as ExecutionEconomicsInput["funding"] });
    hostileCases.push({ ...base, book: hostile(base.book, inherited, symbolKey) as UsdMFuturesOrderBookView });
    const hostileLevel = hostile({ price: "101", quantity: "2" }, inherited, symbolKey);
    hostileCases.push({ ...base, book: Object.freeze({ ...base.book, asks: Object.freeze([hostileLevel]) }) as UsdMFuturesOrderBookView });
  }
  for (const candidate of hostileCases) {
    const result = assessExecutionEconomics(candidate);
    assert.equal(result.kind, "REFUSAL");
    if (result.kind === "REFUSAL") assert.equal(result.code, "MALFORMED_INPUT");
  }
});

test("rejects sparse and non-canonical frozen fills arrays", () => {
  const base = input("BUY");
  const level = Object.freeze({ price: "101", quantity: "2" });
  const sparse = new Array(2);
  sparse[0] = level;
  const hiddenIndex = [level];
  Object.defineProperty(hiddenIndex, "0", { value: level, enumerable: false, writable: false, configurable: false });
  const accessorIndex = [level];
  Object.defineProperty(accessorIndex, "0", { get: () => level, enumerable: true, configurable: false });
  for (const asks of [sparse, Object.freeze(hiddenIndex), Object.freeze(accessorIndex)]) {
    const result = assessExecutionEconomics({ ...base, book: Object.freeze({ ...base.book, asks: Object.freeze(asks) }) as UsdMFuturesOrderBookView });
    assert.equal(result.kind, "REFUSAL");
    if (result.kind === "REFUSAL") assert.equal(result.code, "MALFORMED_INPUT");
  }
});

test("assessment fills are a dense frozen canonical array of frozen canonical objects", () => {
  const result = assessExecutionEconomics(input("BUY"));
  assert.equal(result.kind, "ASSESSMENT");
  if (result.kind !== "ASSESSMENT") return;
  assert.equal(Object.getPrototypeOf(result.fills), Array.prototype);
  assert.equal(Object.isFrozen(result.fills), true);
  assert.deepEqual(Reflect.ownKeys(result.fills), ["0", "1", "length"]);
  for (const fill of result.fills) {
    assert.equal(Object.isFrozen(fill), true);
    assert.deepEqual(Reflect.ownKeys(fill), ["price", "quantity", "notional"]);
    for (const key of ["price", "quantity", "notional"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(fill, key);
      assert.equal(descriptor?.enumerable, true);
      assert.equal(descriptor?.get, undefined);
      assert.equal(descriptor?.set, undefined);
    }
  }
});
