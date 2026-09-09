import { createHash } from "node:crypto";

export type ReasoningDecision = "APPROVE" | "REFUSE";
export type CouncilDirection = "LONG" | "SHORT";
export interface EvidenceReference {
  readonly ref: string; readonly hash: string; readonly workflowId: string;
  readonly venue: string; readonly product: string; readonly symbol: string;
}
export interface ReasoningReceiptInput {
  readonly receiptVersion: "ZO-BIN-REASONING-RECEIPT-V2";
  readonly workflowId: string; readonly createdAt: number;
  readonly opportunity: { readonly venue: string; readonly product: string; readonly symbol: string };
  readonly evidence: { readonly evidenceBundleHash: string; readonly supporting: readonly EvidenceReference[]; readonly opposing: readonly EvidenceReference[] };
  readonly analyses: { readonly advocate: string; readonly oppose: string; readonly market: string };
  readonly council: { readonly decision: ReasoningDecision; readonly direction: CouncilDirection; readonly confidence: number; readonly expectedMoveBps: number; readonly horizonMs: number; readonly strongestSupport: string; readonly strongestOpposition: string; readonly invalidation: readonly string[]; readonly unresolved: readonly string[]; readonly provenance?: { readonly adapter: string; readonly provider?: string; readonly model?: string } };
  readonly rationale: { readonly method: string; readonly claims: readonly { readonly claimId: string; readonly statement: string; readonly supportedBy: readonly string[]; readonly opposedBy: readonly string[]; readonly assumptions: readonly string[] }[] };
  readonly output: { readonly councilDecisionHash: string; readonly tradeThesisHash?: string };
}
export interface ReasoningReceipt extends ReasoningReceiptInput { readonly canonicalSha256: string; }
export interface EvidenceContextRegistry {
  readonly workflowId: string; readonly venue: string; readonly product: string; readonly symbol: string;
  readonly evidenceBundleHash: string; readonly references: readonly EvidenceReference[];
  readonly analyses: { readonly advocate: string; readonly oppose: string; readonly market: string };
}
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const canonical = (v: unknown): string => v === undefined ? "undefined" : v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : isObject(v) ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : "null";
const freeze = <T>(v: T, seen = new Set<object>()): T => { if (v && typeof v === "object" && !seen.has(v as object)) { seen.add(v as object); Object.freeze(v); for (const c of Object.values(v as Record<string, unknown>)) freeze(c, seen); } return v; };
const ownExact = (v: unknown, keys: readonly string[], required: readonly string[] = keys): v is Record<string, unknown> => isObject(v) && Reflect.ownKeys(v).length <= keys.length && Reflect.ownKeys(v).every(k => typeof k === "string" && keys.includes(k)) && required.every(k => Object.prototype.hasOwnProperty.call(v, k)) && Object.keys(v).every(k => Object.getOwnPropertyDescriptor(v, k)?.enumerable === true && "value" in Object.getOwnPropertyDescriptor(v, k)!);
const refKeys = ["ref", "hash", "workflowId", "venue", "product", "symbol"] as const;
const validRef = (v: unknown): v is EvidenceReference => ownExact(v, refKeys) && refKeys.every(k => text(v[k]));
const descriptorMatches = (actual: PropertyDescriptor | undefined, expected: PropertyDescriptor): boolean => {
  if (!actual || Object.keys(actual).length !== Object.keys(expected).length) return false;
  for (const key of Object.keys(expected) as (keyof PropertyDescriptor)[]) if (actual[key] !== expected[key]) return false;
  return true;
};
const arrayPrototypeDescriptors = Object.getOwnPropertyDescriptors(Array.prototype) as unknown as Record<PropertyKey, PropertyDescriptor>;
const canonicalArrayPrototype = (): boolean => {
  const keys = Reflect.ownKeys(Array.prototype);
  const expectedKeys = Reflect.ownKeys(arrayPrototypeDescriptors);
  if (keys.length !== expectedKeys.length || !keys.every((key) => expectedKeys.includes(key))) return false;
  return keys.every((key) => {
    const actual = Object.getOwnPropertyDescriptor(Array.prototype, key);
    const expected = arrayPrototypeDescriptors[key];
    if (!actual || !expected) return false;
    if (actual.enumerable !== expected.enumerable || actual.configurable !== expected.configurable || actual.writable !== expected.writable) return false;
    if ("value" in expected) return "value" in actual && actual.value === expected.value;
    return "get" in actual && actual.get === expected.get && actual.set === expected.set;
  });
};
const canonicalArray = (v: unknown, allowFrozen = false): v is readonly unknown[] => {
  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || !canonicalArrayPrototype()) return false;
  const keys = Reflect.ownKeys(v);
  const length = v.length;
  if (keys.length !== length + 1 || !keys.includes("length")) return false;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(v, "length");
  const lengthWritable = lengthDescriptor?.writable === true || (allowFrozen && lengthDescriptor?.writable === false && Object.isFrozen(v));
  if (!lengthDescriptor || !descriptorMatches(lengthDescriptor, { value: length, writable: lengthDescriptor.writable, enumerable: false, configurable: false }) || !lengthWritable) return false;
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(v, String(i));
    const immutable = allowFrozen && Object.isFrozen(v) && descriptor?.writable === false && descriptor?.configurable === false;
    if (!descriptor || !descriptorMatches(descriptor, { value: descriptor.value, writable: descriptor.writable, enumerable: true, configurable: descriptor.configurable }) || !(descriptor.writable === true && descriptor.configurable === true || immutable)) return false;
  }
  return true;
};
const strings = (v: unknown, allowFrozen = false): v is readonly string[] => canonicalArray(v, allowFrozen) && new Set(v).size === v.length && v.every(text);
const validInput = (v: unknown, allowFrozenArrays = false): v is ReasoningReceiptInput => {
  if (!ownExact(v, ["receiptVersion","workflowId","createdAt","opportunity","evidence","analyses","council","rationale","output"])) return false;
  const x = v as unknown as ReasoningReceiptInput, o = x.opportunity, e = x.evidence, a = x.analyses, c = x.council, r = x.rationale, out = x.output;
  if (x.receiptVersion !== "ZO-BIN-REASONING-RECEIPT-V2" || !text(x.workflowId) || !finite(x.createdAt) || x.createdAt < 0 || !ownExact(o,["venue","product","symbol"]) || ![o.venue,o.product,o.symbol].every(text)) return false;
  if (!ownExact(e,["evidenceBundleHash","supporting","opposing"]) || !text(e.evidenceBundleHash) || !canonicalArray(e.supporting, allowFrozenArrays) || !canonicalArray(e.opposing, allowFrozenArrays) || [...e.supporting,...e.opposing].every(validRef) === false) return false;
  const refs = [...e.supporting,...e.opposing]; if (new Set(refs.map(z=>z.ref)).size !== refs.length || refs.some(z=>z.workflowId!==x.workflowId||z.venue!==o.venue||z.product!==o.product||z.symbol!==o.symbol)) return false;
  if (!ownExact(a,["advocate","oppose","market"]) || ![a.advocate,a.oppose,a.market].every(text)) return false;
  if (!ownExact(c,["decision","direction","confidence","expectedMoveBps","horizonMs","strongestSupport","strongestOpposition","invalidation","unresolved","provenance"],["decision","direction","confidence","expectedMoveBps","horizonMs","strongestSupport","strongestOpposition","invalidation","unresolved"]) || c.provenance!==undefined && (!ownExact(c.provenance,["adapter","provider","model"],["adapter"])||!text(c.provenance.adapter)||(c.provenance.provider!==undefined&&!text(c.provenance.provider))||(c.provenance.model!==undefined&&!text(c.provenance.model))) || !["APPROVE","REFUSE"].includes(c.decision) || !["LONG","SHORT"].includes(c.direction) || !finite(c.confidence)||c.confidence<0||c.confidence>1||!finite(c.expectedMoveBps)||!finite(c.horizonMs)||c.horizonMs<=0||![c.strongestSupport,c.strongestOpposition].every(text)||!strings(c.invalidation, allowFrozenArrays)||!strings(c.unresolved, allowFrozenArrays)) return false;
  if (c.decision === "APPROVE" && (e.opposing.length===0 || c.invalidation.length===0)) return false;
  if (!ownExact(r,["method","claims"]) || !text(r.method) || !canonicalArray(r.claims, allowFrozenArrays) || r.claims.some(cl=>!ownExact(cl,["claimId","statement","supportedBy","opposedBy","assumptions"])||![cl.claimId,cl.statement].every(text)||!strings(cl.supportedBy, allowFrozenArrays)||!strings(cl.opposedBy, allowFrozenArrays)||!strings(cl.assumptions, allowFrozenArrays)||[...cl.supportedBy,...cl.opposedBy].some(id=>!refs.some(z=>z.ref===id)))) return false;
  if (new Set(r.claims.map(cl=>cl.claimId)).size!==r.claims.length || !isObject(out) || !((ownExact(out,["councilDecisionHash"]) || ownExact(out,["councilDecisionHash","tradeThesisHash"])) && text(out.councilDecisionHash) && (!Object.prototype.hasOwnProperty.call(out,"tradeThesisHash") || text(out.tradeThesisHash)))) return false;
  return true;
};
export function canonicalReasoningJson(value: ReasoningReceiptInput): string { if (!validInput(value)) throw new TypeError("reasoning receipt is malformed"); return canonical(value); }
const canonicalPrototypes = (value: unknown, seen = new Set<object>()): boolean => {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  if (Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype)) return false;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !canonicalPrototypes(descriptor.value, seen)) return false;
  }
  return true;
};
export function createReasoningReceipt(input: ReasoningReceiptInput): ReasoningReceipt { if (!canonicalPrototypes(input) || !validInput(input)) throw new TypeError("reasoning receipt is malformed"); const cloned = structuredClone(input); const json=canonicalReasoningJson(cloned); return freeze({...cloned,canonicalSha256:createHash("sha256").update(json).digest("hex")}); }
export function verifyReasoningReceipt(value: unknown, registry?: EvidenceContextRegistry): string | false {
  try { if (!ownExact(value,["receiptVersion","workflowId","createdAt","opportunity","evidence","analyses","council","rationale","output","canonicalSha256"])) return false; const x=value as unknown as ReasoningReceipt; if (!/^[0-9a-f]{64}$/.test(x.canonicalSha256)||!validInput(Object.fromEntries(Object.entries(x).filter(([k])=>k!=="canonicalSha256")), true)) return false; if (registry) { if (registry.workflowId!==x.workflowId||registry.venue!==x.opportunity.venue||registry.product!==x.opportunity.product||registry.symbol!==x.opportunity.symbol||registry.evidenceBundleHash!==x.evidence.evidenceBundleHash||canonical(registry.analyses)!==canonical(x.analyses)) return false; const known=new Map(registry.references.map(r=>[r.ref,r])); for(const ref of [...x.evidence.supporting,...x.evidence.opposing]) { const k=known.get(ref.ref); if(!k||canonical(k)!==canonical(ref)) return false; } for (const ref of [x.council.strongestSupport, x.council.strongestOpposition]) if (!known.has(ref)) return false; } return createHash("sha256").update(canonical(Object.fromEntries(Object.entries(x).filter(([k])=>k!=="canonicalSha256")))).digest("hex")===x.canonicalSha256?x.canonicalSha256:false; } catch { return false; }
}
export function reasoningReceiptMarkdown(receipt: ReasoningReceipt): string { if(!verifyReasoningReceipt(receipt)) throw new TypeError("cannot project unverifiable receipt"); return [`# Reasoning receipt: ${receipt.council.decision}`,`- Version: ${receipt.receiptVersion}`,`- SHA-256: \`${receipt.canonicalSha256}\``,`- Workflow: ${receipt.workflowId}`,`- Opportunity: ${receipt.opportunity.venue}/${receipt.opportunity.product}/${receipt.opportunity.symbol}`,`- Evidence bundle: ${receipt.evidence.evidenceBundleHash}`,"","## Claims",...receipt.rationale.claims.map(c=>`- **${c.claimId}**: ${c.statement}`)].join("\n"); }
