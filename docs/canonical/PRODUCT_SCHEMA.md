# 0-infinity Product Schema

Canonical lineage:

```text
OpportunityWorkflow
→ EvidenceBundle
→ CouncilDecision
→ TradeThesis
→ ExecutionMandate
→ MandateRuntime
→ ExecutionAssessment
→ ExecutionIntent
→ OrderReceipt
→ OutcomeRecord
```

Core target objects:

```ts
type Direction = "LONG" | "SHORT" | "FLAT";

interface TradeThesis {
  thesisId: string;
  venue: "BINANCE";
  instrument: "SPOT" | "USD_M_FUTURES";
  symbol: string;
  direction: Direction;
  horizonMs: number;
  confidence: number;
  expectedMove: { bps: number; lowerBps: number; upperBps: number };
  reasoning: {
    method: string;
    advocateRef: string;
    opposeRef: string;
    marketAnalysisRef: string;
    evidenceBundleHash: string;
    councilDecisionHash: string;
  };
  createdAt: number;
  expiresAt: number;
}
```

`ExecutionMandate` must bind provenance, account, product, symbol, side, TTL, anchor state, entry conditions, economic ceilings, risk ceilings, invalidation conditions and execution policy. MVP `maxUses = 1`.

Versioned live state:

```ts
interface StateEnvelope<T> {
  version: bigint;
  observedAt: number;
  receivedAt: number;
  value: T;
}
```

Every `ExecutionIntent` references one workflow and one mandate and records market/account state versions.
