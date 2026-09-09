import type { RoleArtifact } from "../product/types.js";
import type { ReasoningProfile } from "../product/reasoningBudget.js";

export interface CouncilInvocation {
  readonly workflowId: string;
  readonly invocationId: string;
  readonly reasoningStackName: string;
  readonly reasoningStackVersion: string;
  readonly profile: ReasoningProfile;
  readonly symbol: string;
  readonly evidenceBundleHash: string;
  readonly roleArtifactRefs: Readonly<{ advocate: string; oppose: string; market: string }>;
  readonly constitution: "zero-infinity-council-v1";
  readonly createdAt: number;
  readonly deadlineAt: number;
}
export interface CouncilDecisionCandidate {
  readonly workflowId: string;
  readonly invocationId: string;
  readonly decision: "APPROVE" | "REFUSE";
  readonly direction: "LONG" | "SHORT" | "NONE";
  readonly confidence: number;
  readonly expectedMoveBps: number;
  readonly horizonMs: number;
  readonly strongestSupport: string;
  readonly strongestOpposition: string;
  readonly assumptions: readonly string[];
  readonly unresolvedUncertainty: readonly string[];
  readonly invalidation: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly roleArtifactRefs: readonly string[];
  readonly provenance: Readonly<{ adapter: string; provider?: string; model?: string }>;
  readonly createdAt: number;
  readonly completedAt: number;
}
const ownExact=(v:unknown,keys:readonly string[],required=keys):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k))&&required.every(k=>Object.prototype.hasOwnProperty.call(v,k));
const strings=(v:unknown):v is readonly string[]=>Array.isArray(v)&&v.every(x=>typeof x==='string'&&x.length>0)&&Object.getPrototypeOf(v)===Array.prototype;
export function validateCouncilDecisionCandidate(value: unknown, invocation: CouncilInvocation, artifacts: Readonly<{ advocate: RoleArtifact; oppose: RoleArtifact; market: RoleArtifact }>): CouncilDecisionCandidate {
  const keys=["workflowId","invocationId","decision","direction","confidence","expectedMoveBps","horizonMs","strongestSupport","strongestOpposition","assumptions","unresolvedUncertainty","invalidation","evidenceRefs","roleArtifactRefs","provenance","createdAt","completedAt"] as const;
  if(!ownExact(value,keys)||value.workflowId!==invocation.workflowId||value.invocationId!==invocation.invocationId||!(["APPROVE","REFUSE"] as readonly unknown[]).includes(value.decision)||!(["LONG","SHORT","NONE"] as readonly unknown[]).includes(value.direction)||typeof value.confidence!=="number"||!Number.isFinite(value.confidence)||value.confidence<0||value.confidence>1||typeof value.expectedMoveBps!=="number"||!Number.isFinite(value.expectedMoveBps)||value.expectedMoveBps<0||typeof value.horizonMs!=="number"||!Number.isFinite(value.horizonMs)||value.horizonMs<=0||typeof value.strongestSupport!=="string"||typeof value.strongestOpposition!=="string"||!strings(value.assumptions)||!strings(value.unresolvedUncertainty)||!strings(value.invalidation)||!strings(value.evidenceRefs)||!strings(value.roleArtifactRefs)||!ownExact(value.provenance,["adapter","provider","model"],["adapter"])||typeof value.provenance.adapter!=="string"||value.provenance.provider!==undefined&&typeof value.provenance.provider!=="string"||value.provenance.model!==undefined&&typeof value.provenance.model!=="string"||typeof value.createdAt!=="number"||typeof value.completedAt!=="number"||value.completedAt<value.createdAt||value.createdAt<invocation.createdAt||value.completedAt>invocation.deadlineAt) throw new TypeError("council decision candidate is malformed");
  const refs=[artifacts.advocate.payload.ref,artifacts.oppose.payload.ref,artifacts.market.payload.ref]; if(value.roleArtifactRefs.length!==3||new Set(value.roleArtifactRefs).size!==3||!value.roleArtifactRefs.every(ref=>refs.includes(ref))||!value.evidenceRefs.includes(invocation.evidenceBundleHash)||value.strongestSupport!==artifacts.advocate.payload.ref||value.strongestOpposition!==artifacts.oppose.payload.ref||value.direction!=="NONE"&&value.direction!==artifacts.advocate.payload.direction) throw new TypeError("council decision candidate binding is invalid");
  return Object.freeze(structuredClone(value)) as unknown as CouncilDecisionCandidate;
}
