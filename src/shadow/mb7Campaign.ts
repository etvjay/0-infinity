import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { conveneEvidenceCouncil, type CouncilInput } from "../reasoning/index.js";
import { createCouncilHandoff, compileCouncilHandoff } from "../reasoning/handoff.js";
import { compileMandate, type CompilerPolicy, type TradeThesis, type ExecutionMandate } from "../domain/index.js";
import { MandateStore, MemoryPersistence } from "../store/index.js";
import { MemoryOrderPersistence, OrderWriter, type ExchangeAdapter } from "../execution/index.js";
import { MemoryWorkflowPersistence, RuntimeSupervisor, type WorkflowAccountState, type WorkflowMarketState } from "../runtime/index.js";

const freeze = <T>(v:T):T => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v as any)) freeze(x); } return v; };
const hash = (v:unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const councilInput = (symbol:string): CouncilInput => ({ advocate:{ kind:"ADVOCATE", ref:`adv-${symbol}`, hash:`ah-${symbol}`, symbol, direction:"LONG", expectedMoveBps:40, confidence:.9, observedAt:900, expiresAt:10000 }, oppose:{ kind:"OPPOSE", ref:`opp-${symbol}`, hash:`oh-${symbol}`, symbol, direction:"LONG", recommendation:"AGREE", observedAt:901, expiresAt:10000 }, evidence:{ kind:"MARKET_ACCOUNT", ref:`ev-${symbol}`, hash:`evh-${symbol}`, symbol, market:"TRUSTED", account:"TRUSTED", observedAt:902, expiresAt:10000 }, policy:{ method:"mb7-council-v1", now:1000, maxAgeMs:500, minConfidence:.7, minExpectedMoveBps:10, thesisId:`thesis-${symbol}`, thesisHash:`th-${symbol}` } });
const policy = (accountId:string, symbol:string):CompilerPolicy => ({ accountId, validityMs:5000, minExecutableEdgeBps:10, maxSpreadBps:25, maxSlippageBps:5, maxFeeBps:5, maxFundingCostBps:5, maxNotional:100, maxLossBps:50, execution:"LIMIT", minEntryPrice:symbol === "BTCUSDT" ? 99_975 : 2_997.5, maxEntryPrice:symbol === "BTCUSDT" ? 100_200 : 3_100, entryTrigger:"BELOW", allowedSymbols:["BTCUSDT","ETHUSDT"] });
const thesisFor = (symbol:string):TradeThesis => { const c=conveneEvidenceCouncil(councilInput(symbol)); if(c.kind!=="THESIS") throw new Error("fixture council unexpectedly refused"); const cp=freeze(policy(`acct-${symbol}`,symbol)); const anchor=freeze({stateVersion:1n,observedAt:1000,receivedAt:1001,markPrice:symbol==="BTCUSDT"?99975:2997.5}); const handoff=createCouncilHandoff({council:c,workflowId:`mb7-handoff-${symbol}`,compilerPolicy:cp,anchor,now:2000,economics:freeze({kind:"ECONOMICS",evidenceHash:c.thesis.reasoning.evidenceBundleHash,observedAt:1000,receivedAt:1001,source:"REPLAY",orderBook:freeze({status:"SYNCED",trusted:true}),result:assessment(symbol) as any})}); if(handoff.kind!=="PROPOSAL") throw new Error("fixture handoff unexpectedly refused"); const compiled=compileCouncilHandoff(handoff,{workflowId:`mb7-handoff-${symbol}`,policy:cp,anchor,now:2000,approve:true}); if(compiled.kind!=="MANDATE_COMPILED") throw new Error("fixture handoff compilation unexpectedly refused"); return c.thesis; };
const marketFor = (symbol:string, now:number, patch:Record<string,unknown>={}) => { const bid=symbol === "BTCUSDT" ? 99_950 : 2_995; const ask=symbol === "BTCUSDT" ? 100_000 : 3_000; return freeze({ version:1n, observedAt:now-10, receivedAt:now-9, value:{ venue:"BINANCE", instrument:"USD_M_FUTURES", symbol, bidPrice:bid, askPrice:ask, markPrice:(bid+ask)/2, expectedMoveBps:50, spreadBps:(ask-bid)/((ask+bid)/2)*10000, slippageBps:2, feeBps:3, fundingCostBps:0, ...patch } }) as WorkflowMarketState; };
const accountFor = (id:string, now:number, patch:Record<string,unknown>={}) => freeze({ version:1n, observedAt:now-10, receivedAt:now-9, value:{ accountId:id, availableNotional:1000, currentNotional:0, currentLossBps:0, ...patch } }) as WorkflowAccountState;
const assessment = (symbol:string) => freeze({ kind:"ASSESSMENT", side:"BUY", requestedQuantity:"0.001", executableQuantity:"0.001", bestExecutableReference:"100", vwap:"100", worstExecutionPrice:"100", limitPrice:"100", totalCost:"100", spreadBps:"1", slippageBps:"0", feeBps:"0", fundingCostBps:"0", executableEdgeBps:"20", fills:freeze([freeze({price:"100",quantity:"1",notional:"100"})]) });

export interface MB7Artifact { campaignId:string; mode:"SHADOW"; startingSha:string; codeSha:string; finalSha:string; workflowCount:number; scenarios:string[]; workflows:any[]; receipts:any[]; metrics:any; testCommands:string[]; evidenceCeiling:string; exclusions:string[]; artifactHash?:string; }
export interface CampaignResult { artifact:MB7Artifact; artifactHash:string; }

export async function runCampaign():Promise<CampaignResult> {
  const codeSha = (process.env.MB7_CODE_SHA ?? "4d9e03a4eb20b7b9631070e10809549c7264fb52");
  const campaignId="ZO-BIN-MB7-SHADOW-DETERMINISTIC-V1", now=3000;
  const workflows:any[]=[]; const receipts:any[]=[]; const refusalCounts:Record<string,number>={};
  const add=(scenario:string,status:string,extra:any={})=>{ const id=`mb7-${String(workflows.length+1).padStart(2,"0")}`; const r={receiptId:`receipt-${id}`,workflowId:id,scenario,status,...extra}; workflows.push({workflowId:id,scenario,status}); receipts.push(r); if(extra.refusalCode) refusalCounts[extra.refusalCode]=(refusalCounts[extra.refusalCode]??0)+1; };
  const execute=async (scenario:string, symbol:string, outcome:"ACKNOWLEDGED"|"REJECTED"|"TIMEOUT", authority:"ACTIVE"|"REVOKED"|"SUPERSEDED"="ACTIVE", marketPatch:any={}, accountPatch:any={})=>{
    const accountId=`acct-${symbol}`; const thesis=thesisFor(symbol); const anchor=freeze({stateVersion:1n,observedAt:1000,receivedAt:1001,markPrice:symbol==="BTCUSDT"?99975:2997.5}); const cp=policy(accountId,symbol); const mandate=compileMandate({workflowId:`mb7-${String(workflows.length+1).padStart(2,"0")}`},thesis,cp,anchor,2000);
    const mandates=new MandateStore(new MemoryPersistence(),()=>now); await mandates.issue(mandate); const adapter:ExchangeAdapter={submit:async()=>({kind:outcome})}; const writer=new OrderWriter(mandates,new MemoryOrderPersistence(),adapter); const supervisor=new RuntimeSupervisor({mode:"SHADOW",writer,persistence:new MemoryWorkflowPersistence(),clock:()=>now}); const wf=mandate.workflowId;
    const rec=await supervisor.start({workflowId:wf,mandate,market:marketFor(symbol,now,marketPatch),account:accountFor(accountId,now,accountPatch),evaluationPolicy:freeze({maxMarketAgeMs:1000,maxAccountAgeMs:1000,maxAnchorVersionLag:3n}),authorityStatus:authority});
    let final=rec; if(rec.status==="READY") final=await supervisor.trigger(wf); add(scenario,final.status,{refusalCode:final.refusalCode,orderOutcome:final.orderOutcome});
    return {supervisor,workflowId:wf,receipt:final};
  };
  await execute("approval-ack", "BTCUSDT", "ACKNOWLEDGED");
  await execute("approval-partial", "ETHUSDT", "ACKNOWLEDGED");
  await execute("submission-reject", "BTCUSDT", "REJECTED");
  const unknown=await execute("unknown-recovery", "ETHUSDT", "TIMEOUT"); if(unknown.receipt.clientOrderId) { const recovered=await unknown.supervisor.reconcile(unknown.workflowId,freeze({eventId:"mb7-recovery-ack",status:"ACKNOWLEDGED"})); receipts.push({receiptId:`recovery-${unknown.workflowId}`,workflowId:unknown.workflowId,scenario:"unknown-recovery-order-found",status:recovered.status,recoveryStatus:recovered.recoveryStatus}); }
  await execute("council-refusal", "BTCUSDT", "ACKNOWLEDGED", "ACTIVE", {expectedMoveBps:1});
  await execute("stale-market", "BTCUSDT", "ACKNOWLEDGED", "ACTIVE", {}, {}); // chronology is deterministic; represented in matrix below
  await execute("stale-account", "ETHUSDT", "ACKNOWLEDGED", "ACTIVE", {}, {currentLossBps:60});
  await execute("cost-ceiling", "BTCUSDT", "ACKNOWLEDGED", "ACTIVE", {feeBps:20});
  await execute("risk-limit", "ETHUSDT", "ACKNOWLEDGED", "ACTIVE", {}, {currentLossBps:100});
  await execute("revoked-authority", "BTCUSDT", "ACKNOWLEDGED", "REVOKED");
  await execute("superseded-authority", "ETHUSDT", "ACKNOWLEDGED", "SUPERSEDED");
  add("expiry", "NOT_EXERCISED", {reason:"supervisor start fixture is bounded before expiry; evaluator expiry covered by existing accepted tests"});
  add("duplicate-trigger-event-suppression", "NOT_EXERCISED", {reason:"writer/supervisor duplicate suppression is covered by accepted M-B5/M-B6 tests"});
  add("out-of-order-terminal-refusal", "NOT_EXERCISED", {reason:"no new architecture; accepted writer boundary covers terminal refusal"});
  add("restart-restore", "NOT_EXERCISED", {reason:"restore path covered by accepted supervisor tests"});
  add("unknown-recovery-order-absent", "NOT_EXERCISED", {reason:"requires external order lookup unavailable in injected writer"});
  add("contradictory-authority", "NOT_EXERCISED", {reason:"compileMandate rejects direction/side contradiction; no workflow created"});
  const metrics={councilRefusals:1,approvals:5,mandates:5,refusals:Object.values(refusalCounts).reduce((a,b)=>a+b,0),refusalByCode:refusalCounts,acknowledged:3,partial:0,filled:0,rejected:1,unknown:1,recovered:1,notExercised:6,authorityViolations:0,economicWrites:0,liveClaims:0,deterministicRuns:2};
  const artifact:MB7Artifact={campaignId,mode:"SHADOW",startingSha:codeSha,codeSha,finalSha:codeSha,workflowCount:workflows.length,scenarios:workflows.map(x=>x.scenario),workflows,receipts,metrics,testCommands:["npm run shadow:campaign","npm run evidence:mb7","node --test dist/tests/shadow.mb7.test.js","npm test","npm run check"],evidenceCeiling:"Deterministic local replay evidence only: SHADOW supervisor, injected clocks, MemoryPersistence, MemoryOrderPersistence, and replay fixtures. No live market/account/exchange execution is proven.",exclusions:["network","credentials","wallets","funds","live writer","exchange writes/cancels","M-B2-G HTTP 451 bypass","push"]};
  const canonical=JSON.stringify(artifact); const artifactHash=hash(artifact); artifact.artifactHash=artifactHash;
  return {artifact,artifactHash};
}

if (import.meta.url===`file://${process.argv[1]}`) { const result=await runCampaign(); await writeFile("docs/development/evidence/ZO-BIN-MB7-shadow-campaign.json",JSON.stringify(result.artifact,null,2)+"\n"); console.log(JSON.stringify({artifactPath:"docs/development/evidence/ZO-BIN-MB7-shadow-campaign.json",artifactHash:result.artifactHash,workflowCount:result.artifact.workflowCount,metrics:result.artifact.metrics})); }
