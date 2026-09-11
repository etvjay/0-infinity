import type { MandateStore } from "../store/index.js";
import type { ExecutionMandate } from "../domain/index.js";
import type { EvaluationPolicy, EvaluationWorkflow } from "../evaluator/index.js";
import type { ExchangeAdapter } from "../execution/index.js";
import { MemoryOrderPersistence, OrderWriter, type FillEvent, type OrderPersistence } from "../execution/index.js";
import { MemoryWorkflowPersistence, RuntimeSupervisor, type WorkflowAccountState, type WorkflowMarketState, type WorkflowReceipt, type WorkflowPersistence } from "../runtime/index.js";
import { BinanceTestnetAdapter, normalizeExchangeInfo, type AccountEvidence, type ExchangeInfoMetadata } from "./index.js";

export interface TestnetStateSource {
  readonly market: (symbol: string) => Promise<WorkflowMarketState>;
  readonly account: () => Promise<WorkflowAccountState>;
  readonly exchangeInfo: () => Promise<unknown>;
}

export interface BinanceTestnetRunInput {
  readonly workflowId: string;
  readonly mandate: ExecutionMandate;
  readonly evaluationPolicy: EvaluationPolicy;
  readonly authorityStatus: EvaluationWorkflow["authorityStatus"];
  readonly adapter: BinanceTestnetAdapter;
  readonly state: TestnetStateSource;
  readonly mandates: MandateStore;
  readonly persistence?: WorkflowPersistence;
  readonly orderPersistence?: OrderPersistence;
  readonly clock: () => number;
}

export type BinanceTestnetRunResult =
  | Readonly<{ kind: "BINANCE_TESTNET_RUN"; status: "BLOCKED_EXTERNAL"; account: AccountEvidence; blocker: string; noWrite: true }>
  | Readonly<{ kind: "BINANCE_TESTNET_RUN"; status: "READY" | "COMPLETE"; account: AccountEvidence; exchangeInfo: ExchangeInfoMetadata; receipt: WorkflowReceipt; cancel: () => Promise<WorkflowReceipt>; reconcile: (event: FillEvent) => Promise<WorkflowReceipt>; restore: () => Promise<WorkflowReceipt>; noWrite: false }>;

function blocked(account: AccountEvidence, blocker: string): BinanceTestnetRunResult {
  return Object.freeze({ kind: "BINANCE_TESTNET_RUN", status: "BLOCKED_EXTERNAL" as const, account, blocker, noWrite: true as const });
}

function assertSymbol(metadata: ExchangeInfoMetadata, symbol: string): void {
  const entry = metadata.symbols.find((item) => item.symbol === symbol);
  if (!entry) throw new Error(`BINANCE_TESTNET symbol ${symbol} is outside the bounded exchange metadata`);
  if (entry.status !== "TRADING") throw new Error(`BINANCE_TESTNET symbol ${symbol} is not TRADING`);
}

/** Canonical credential-gated Binance Futures Testnet coordinator. */
export async function runBinanceTestnet(input: BinanceTestnetRunInput): Promise<BinanceTestnetRunResult> {
  if (input.adapter.mode !== "BINANCE_TESTNET") throw new TypeError("BINANCE_TESTNET adapter is required");
  const account = await input.adapter.accountRead();
  if (account.status !== "READY") return blocked(account, account.blocker ?? "Binance Testnet account read is unavailable");

  let exchangeInfo: ExchangeInfoMetadata;
  try {
    exchangeInfo = normalizeExchangeInfo(await input.state.exchangeInfo());
    assertSymbol(exchangeInfo, input.mandate.symbol);
  } catch (error) {
    return blocked(account, error instanceof Error ? error.message : String(error));
  }

  const market = await input.state.market(input.mandate.symbol);
  const accountState = await input.state.account();
  const persistence = input.persistence ?? new MemoryWorkflowPersistence();
  const writer = new OrderWriter(input.mandates, input.orderPersistence ?? new MemoryOrderPersistence(), input.adapter as ExchangeAdapter);
  const supervisor = new RuntimeSupervisor({ mode: "BINANCE_TESTNET", writer, persistence, clock: input.clock });
  const receipt = await supervisor.start({ workflowId: input.workflowId, mandate: input.mandate, market, account: accountState, evaluationPolicy: input.evaluationPolicy, authorityStatus: input.authorityStatus });
  return Object.freeze({ kind: "BINANCE_TESTNET_RUN", status: receipt.status === "READY" ? "READY" : "COMPLETE", account, exchangeInfo, receipt, cancel: () => supervisor.cancel(input.workflowId), reconcile: (event: FillEvent) => supervisor.reconcile(input.workflowId, event), restore: () => supervisor.restore(input.workflowId), noWrite: false as const });
}
