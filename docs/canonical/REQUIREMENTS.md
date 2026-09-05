# 0-infinity Requirements

Target: Binance Agent OS Mini Hackathon Track A.

Product requirements:

- model response never directly becomes exchange order;
- accepted thesis is revalidated against fresh state;
- expected move is distinct from executable edge;
- refusal is structured and first-class;
- every execution/refusal is traceable workflow → thesis → council → mandate → state versions → assessment → intent/receipt.

Architecture requirements:

- reasoning workers have no exchange write authority;
- hot path performs no LLM call;
- one writer owns order submit/cancel authority;
- mandates are immutable and single-use in MVP;
- local market/account state is versioned and freshness-bounded;
- ambiguous submission is reconciled before retry.

Do not claim alpha, HFT performance, exactly-once execution, production safety or live success without evidence.
