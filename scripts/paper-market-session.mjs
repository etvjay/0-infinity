import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { ZeroInfinityService } from "../dist/src/product/service.js";
import { compileMandate } from "../dist/src/domain/index.js";
import { createMandateRuntime } from "../dist/src/runtime/mandateRuntime.js";
import { evaluateMandate } from "../dist/src/evaluator/index.js";
import { PaperOrderWriter } from "../dist/src/product/paper.js";

const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};
const canonical = (value) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? `${item}n` : item);
const sha = (value) => `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
const evidence = JSON.parse(await readFile(".local/evidence/ZO-BIN-MB8-paper-market-input.json", "utf8"));
const observation = evidence.observations.at(-1);
const n = observation.normalized;
const receivedAt = observation.receivedAt;
const midpoint = (n.bidPrice + n.askPrice) / 2;
const spreadBps = (n.askPrice - n.bidPrice) / midpoint * 10_000;
const accountId = "paper-market-account";
const service = new ZeroInfinityService({ clock: () => receivedAt, idFactory: () => "wf-paper-market" });
const workflow = service.createWorkflow({ symbol: "BTCUSDT", venue: "BINANCE", product: "USD_M_FUTURES" });
await service.submitOpportunity(workflow.workflowId);
const thesis = service.getTradeThesis(workflow.workflowId);
const reasoningReceipt = service.getReasoningReceipt(workflow.workflowId);
const policy = {
  accountId, validityMs: 60_000, minExecutableEdgeBps: 10, maxSpreadBps: Math.max(25, spreadBps),
  maxSlippageBps: 5, maxFeeBps: 5, maxFundingCostBps: 5, maxNotional: 100,
  maxLossBps: 100, execution: "LIMIT", minEntryPrice: (midpoint + n.askPrice) / 2,
  maxEntryPrice: n.askPrice * 1.001, entryTrigger: "BELOW", allowedSymbols: ["BTCUSDT", "ETHUSDT"],
};
const anchor = { stateVersion: BigInt(n.updateVersion), observedAt: n.eventTime, receivedAt, markPrice: midpoint };
const mandate = compileMandate({ workflowId: workflow.workflowId }, thesis, policy, anchor, receivedAt);
const market = freeze({ version: BigInt(n.updateVersion), observedAt: n.eventTime, receivedAt, value: {
  venue: "BINANCE", instrument: "USD_M_FUTURES", symbol: "BTCUSDT", bidPrice: n.bidPrice,
  askPrice: n.askPrice, markPrice: midpoint, expectedMoveBps: 40, spreadBps,
  slippageBps: 2, feeBps: 3, fundingCostBps: 0,
} });
const account = freeze({ version: 1n, observedAt: receivedAt, receivedAt, value: {
  accountId, availableNotional: 100_000, currentNotional: 0, currentLossBps: 0,
} });
const evalPolicy = freeze({ maxMarketAgeMs: 30_000, maxAccountAgeMs: 30_000, maxAnchorVersionLag: 0n });
const runtime = createMandateRuntime({ expiresAt: mandate.expiresAt });
const workflowBinding = { workflowId: workflow.workflowId, mandateId: mandate.mandateId, authorityStatus: "ACTIVE" };
const assessment = evaluateMandate(workflowBinding, mandate, runtime, market, account, evalPolicy, receivedAt);
let paperReceipt;
if (assessment.kind === "EXECUTION_INTENT") {
  const paper = new PaperOrderWriter(accountId, 100_000, { status: "FILLED", version: "paper-top-of-book-v1", price: n.askPrice });
  paperReceipt = await paper.submit(assessment);
}
const refusalMandate = compileMandate({ workflowId: "wf-paper-market-refusal" }, thesis, { ...policy, minExecutableEdgeBps: 50 }, anchor, receivedAt);
const refusal = evaluateMandate({ workflowId: "wf-paper-market-refusal", mandateId: refusalMandate.mandateId, authorityStatus: "ACTIVE" }, refusalMandate, createMandateRuntime({ expiresAt: refusalMandate.expiresAt }), market, account, evalPolicy, receivedAt);
const artifact = {
  schema: "ZO-BIN-MB8-PAPER-MARKET-SESSION-V2", status: "PAPER_MARKET_PASS",
  source: evidence.source, sourceSession: { observationCount: evidence.observationCount, selectedUpdateVersion: n.updateVersion, eventTime: n.eventTime, receivedAt },
  classification: "LIVE MARKET INPUT / TOP-OF-BOOK PAPER MODEL / SIMULATED EXECUTION",
  workflowId: workflow.workflowId, reasoningReceiptHash: sha(reasoningReceipt), thesisHash: sha(thesis), mandateHash: sha(mandate),
  marketVersion: n.updateVersion, evaluationCount: 2,
  successfulPath: { assessment, paperReceipt: paperReceipt ?? null, account: paperReceipt?.accountTransition ?? null },
  refusalPath: { code: refusal.kind === "EXECUTION_REFUSAL" ? refusal.code : "UNEXPECTED_INTENT", result: refusal },
  paperModel: { version: "paper-top-of-book-v1", depth: "not synchronized", fills: "simulated at selected top-of-book ask", funding: "not modeled", liveWrites: false },
  evidenceCeiling: "Bounded native public market observations plus deterministic local PAPER simulation. No synchronized depth, private account truth, exchange write, profitability, or production readiness claim.",
};
await mkdir(".local/evidence", { recursive: true });
await writeFile(".local/evidence/ZO-BIN-MB8-paper-market-session.json", JSON.stringify(artifact, (_, item) => typeof item === "bigint" ? `${item}n` : item, 2) + "\n");
console.log(JSON.stringify({ status: artifact.status, workflowId: artifact.workflowId, assessment: assessment.kind, paperOutcome: paperReceipt?.outcome ?? null, refusal: artifact.refusalPath.code, reasoningReceiptHash: artifact.reasoningReceiptHash, thesisHash: artifact.thesisHash, mandateHash: artifact.mandateHash }));
