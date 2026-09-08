import test from "node:test";
import assert from "node:assert/strict";
import { OpenAICompatibleModelAdapter, createOpenAICompatibleAdapterFromEnv } from "../src/product/adapters.js";
import type { RoleInvocation } from "../src/product/types.js";

const input: RoleInvocation = { workflowId: "wf-1", invocationId: "wf-1:ADVOCATE", role: "ADVOCATE", opportunity: { symbol: "BTCUSDT" }, timeoutMs: 100 };
const artifact = { workflowId: "wf-1", invocationId: "wf-1:ADVOCATE", role: "ADVOCATE", kind: "ADVOCATE", payload: { kind: "ADVOCATE", ref: "r", hash: "h", symbol: "BTCUSDT", direction: "LONG", expectedMoveBps: 40, confidence: .8, observedAt: 1, expiresAt: 1000 } };

const env = { ZI_REASONING_OPENAI_BASE_URL: "https://provider.example/v1", ZI_REASONING_OPENAI_MODEL: "reasoner-1", ZI_REASONING_OPENAI_API_KEY: "secret" };

test("OpenAI-compatible adapter accepts an injected transport and preserves binding metadata", async () => {
  const adapter = new OpenAICompatibleModelAdapter("openai-compatible-reasoning-v1", async (actual) => {
    assert.equal(actual.workflowId, input.workflowId);
    assert.equal(actual.role, input.role);
    assert.equal(actual.opportunity.symbol, "BTCUSDT");
    return artifact;
  }, () => 2);
  const result = await adapter.invoke(input);
  assert.equal(result.independence, "external");
  assert.equal(result.role, "ADVOCATE");
  assert.equal(result.workflowId, "wf-1");
  assert.equal(result.payload.symbol, "BTCUSDT");
});

test("provider factory is absent for missing or malformed server configuration", () => {
  assert.equal(createOpenAICompatibleAdapterFromEnv({}), undefined);
  assert.equal(createOpenAICompatibleAdapterFromEnv({ ...env, ZI_REASONING_OPENAI_BASE_URL: "not-a-url" }), undefined);
  assert.equal(createOpenAICompatibleAdapterFromEnv({ ...env, ZI_REASONING_OPENAI_MODEL: " " }), undefined);
  assert.equal(createOpenAICompatibleAdapterFromEnv({ ...env, ZI_REASONING_OPENAI_API_KEY: " " }), undefined);
});

test("provider factory accepts only injected transport for configured tests", async () => {
  let calls = 0;
  const adapter = createOpenAICompatibleAdapterFromEnv(env, async () => { calls += 1; return artifact; });
  assert.ok(adapter);
  const result = await adapter.invoke(input);
  assert.equal(result.independence, "external");
  assert.equal(calls, 1);
});

test("default service configuration does not create or call a provider", async () => {
  const adapter = createOpenAICompatibleAdapterFromEnv({});
  assert.equal(adapter, undefined);
});

test("provider rejects council invocations rather than widening the LLM boundary", async () => {
  const adapter = new OpenAICompatibleModelAdapter("openai-compatible-reasoning-v1", async () => artifact);
  await assert.rejects(() => adapter.invoke({ ...input, role: "COUNCIL", invocationId: "wf-1:COUNCIL" }), /pre-Council roles/);
});
