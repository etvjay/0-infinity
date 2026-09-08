# 0-infinity Demo Video Script

Target duration: 60–90 seconds. Every shown state must come from the current static UI or an independently verified no-write response. No live exchange success is shown. The existing 125-second console recording is historical and should not be presented as the current public UI.

1. **0–08s — LANDING**
   - Show `0-infinity` and: `A control layer between trading agents and execution.`
   - Caption: `Agents propose trades. 0-infinity checks evidence before execution.`

2. **08–18s — ARCHITECTURE**
   - Show the single vertical path: Agent / Trader → Opportunity → Evidence + Opposition → Council → Reasoning Receipt → Execution Mandate → Market Revalidation → TRADE / REFUSE.
   - Caption: `Evidence, opposition, Council, short-lived authority, then market revalidation.`

3. **18–28s — CONCRETE REFUSAL**
   - Show the edge-collapse example: expected move `+31 bps`, spread `-5`, slippage `-11`, fees `-4`, funding `-2`, executable edge `+9`, required `12`.
   - Caption: `The Council can approve while execution still refuses a collapsed edge.`

4. **28–48s — TRY**
   - Select `BTCUSDT`, `LONG`, and `SHADOW` or `PAPER`.
   - Run the configured no-write REST workflow.
   - Show the linear sequence: Advocate, Opposer, Market Analyst, Council, Reasoning Receipt, Execution Mandate, Execution Check.
   - Show the actual returned outcome and economics. Never replace the response with fixture data.

5. **48–60s — RECEIPT CONTROLS**
   - Open only `View reasoning receipt`, `View mandate`, or `View raw JSON`.
   - Keep private chain-of-thought out of the recording.

6. **60–78s — INTEGRATE**
   - Show the MCP, REST, and SDK tabs with their actual implemented names and runtime-configurable endpoint.
   - Caption: `Agents connect through the existing MCP, REST, and SDK surfaces.`

7. **78–90s — PROOF / CLOSE**
   - Show `SHADOW_PASS`, `PAPER_MARKET_PASS`, `LIVE_READ_PASS`, `TESTNET CREDENTIAL_REQUIRED`, `AUTH_BLOCKED_EXTERNAL`, and `LIVE NOT_AUTHORIZED`.
   - End card: `0-infinity — evidence before action.`

Before recording, run `npm run web:check`, `npm test`, `npm run demo`, `npm run readiness:validate`, and `npm run secret-scan`. Record only states reproduced by those checks or by the verified no-write API response.
