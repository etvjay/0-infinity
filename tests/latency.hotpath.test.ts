import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HotPathLatencyTrace, ReasoningLatencyTrace, opportunityDedupKey, structuralOpportunityPrefilter, validateReasoningProfileConfig } from "../src/latency/index.js";

test("latency traces derive separate reasoning and hot-path clocks", () => {
  const reasoning = new ReasoningLatencyTrace({ advocateStartedAt: 0, advocateCompletedAt: 10, opposerStartedAt: 10, opposerCompletedAt: 20, marketAnalystStartedAt: 20, marketAnalystCompletedAt: 30, councilStartedAt: 30, councilCompletedAt: 50, receiptAt: 55, mandateArmedAt: 60 });
  assert.deepEqual(reasoning.metrics(), { advocateMs: 10, opposerMs: 10, marketAnalystMs: 10, councilMs: 20, reasoningMs: 50, councilToMandateMs: 10 });
  const hot = new HotPathLatencyTrace({ marketReceivedAt: 100, triggerEvaluatedAt: 102, economicsEvaluatedAt: 105, evaluateMandateAt: 107, intentAt: 108, writerPreIoAt: 109, outboundAt: 110, ackAt: 120 });
  assert.equal(hot.metrics().triggerToDecisionMs, 6);
  assert.equal(hot.metrics().outboundToAckMs, 10);
  assert.ok(Object.isFrozen(hot) && Object.isFrozen(reasoning));
});

test("latency traces reject invalid chronology and timestamps", () => {
  assert.throws(() => new ReasoningLatencyTrace({ advocateStartedAt: 2, advocateCompletedAt: 1, opposerStartedAt: 2, opposerCompletedAt: 2, marketAnalystStartedAt: 2, marketAnalystCompletedAt: 2, councilStartedAt: 2, councilCompletedAt: 2, receiptAt: 2, mandateArmedAt: 2 }), /must not precede/);
  assert.throws(() => new HotPathLatencyTrace({ marketReceivedAt: 0, triggerEvaluatedAt: -1, economicsEvaluatedAt: 1, evaluateMandateAt: 1, intentAt: 1, writerPreIoAt: 1, outboundAt: 1, ackAt: 1 }), /finite non-negative/);
});

test("FAST profile retains every mandatory role and structural dedup is bounded", () => {
  const profile = validateReasoningProfileConfig({ profile: "FAST", roleTimeoutMs: 1000, researchBudget: 1, toolBudget: 1, councilModelIdentifier: "council-local-v1", mandatoryRoles: ["ADVOCATE", "OPPOSER", "MARKET_ANALYST", "COUNCIL"] });
  assert.deepEqual(profile.mandatoryRoles, ["ADVOCATE", "OPPOSER", "MARKET_ANALYST", "COUNCIL"]);
  assert.throws(() => validateReasoningProfileConfig({ ...profile, mandatoryRoles: ["ADVOCATE", "MARKET_ANALYST", "COUNCIL"] } as never), /mandatory/);
  const opportunity = { venue: "BINANCE", instrument: "USD_M_FUTURES", symbol: "BTCUSDT", direction: "LONG" } as const;
  assert.equal(structuralOpportunityPrefilter(opportunity), true);
  assert.equal(opportunityDedupKey(opportunity), "BINANCE:USD_M_FUTURES:BTCUSDT:LONG:");
  assert.equal(structuralOpportunityPrefilter({ symbol: "BTCUSDT" }), false);
});

test("canonical hot closure has no reasoning or network dependencies", () => {
  const source = ["src/runtime/supervisor.ts", "src/evaluator/index.ts", "src/execution/index.ts", "src/store/index.ts", "src/domain/index.ts"].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /(?:RoleAdapter|ReasoningRuntime|Council|OpenAI|MCP|fetch)/);
  assert.equal((source.match(/from ["'][^"']+["']/g) ?? []).some((line) => /reasoning|product|http|mcp/i.test(line)), false);
});
