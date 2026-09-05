# 0-infinity Interfaces

```ts
function compileMandate(workflow, thesis, policy, anchor, now?): ExecutionMandate;

function evaluateMandate(workflow, mandate, market, account, policy, now?): ExecutionIntent | ExecutionRefusal;

interface MandateStore {
  issue(mandate: ExecutionMandate): Promise<void>;
  getActive(key: AuthorityKey): ExecutionMandate | null;
  supersede(oldMandateId: string, replacement: ExecutionMandate): Promise<void>;
  consumeForSubmission(mandateId: string, clientOrderId: string): Promise<void>;
}

interface MarketStateAdapter {
  connect(): Promise<void>;
  close(): Promise<void>;
  snapshot(symbol: string): StateEnvelope<LiveMarketState> | null;
  onUpdate(handler: (state: StateEnvelope<LiveMarketState>) => void): () => void;
}

interface AccountStateAdapter {
  connect(): Promise<void>;
  close(): Promise<void>;
  snapshot(): StateEnvelope<LiveAccountState> | null;
}

interface OrderWriter {
  submit(intent: ExecutionIntent): Promise<OrderSubmissionResult>;
  cancel(request: CancelIntent): Promise<CancelResult>;
  reconcile(clientOrderId: string): Promise<OrderReceipt>;
}
```

`evaluateMandate()` is deterministic and performs no model/network I/O.
