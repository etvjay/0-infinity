import { createHash } from "node:crypto";

export type ReasoningDecision = "APPROVE" | "REFUSE";
export interface ReasoningClaim { readonly id: string; readonly text: string; readonly refs: readonly string[]; }
export interface ReasoningReceiptInput { readonly decision: ReasoningDecision; readonly evidenceRefs: readonly string[]; readonly supportingRefs: readonly string[]; readonly opposingRefs: readonly string[]; readonly claims: readonly ReasoningClaim[]; readonly assumptions: readonly string[]; readonly unresolved: readonly string[]; readonly invalidation: readonly string[]; }
export interface ReasoningReceipt extends ReasoningReceiptInput { readonly schema: "ZO-BIN-REASONING-RECEIPT-V1"; readonly canonicalSha256: string; }
const freeze = <T>(v: T): T => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const child of Object.values(v as Record<string, unknown>)) freeze(child); } return v; };
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const canonical = (v: unknown): string => v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}` : "null";
const digest = (v: unknown): string => createHash("sha256").update(canonical(v)).digest("hex");
const asStrings = (v: unknown): v is readonly string[] => Array.isArray(v) && v.length === new Set(v).size && v.every(text);
const ownExact = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k) && Object.getOwnPropertyDescriptor(v, k)?.enumerable === true && "value" in Object.getOwnPropertyDescriptor(v, k)!);
const INPUT_KEYS = ["decision", "evidenceRefs", "supportingRefs", "opposingRefs", "claims", "assumptions", "unresolved", "invalidation"] as const;
function validateInput(value: unknown): value is ReasoningReceiptInput {
  if (!ownExact(value, INPUT_KEYS)) return false; const x = value as unknown as ReasoningReceiptInput;
  if (x.decision !== "APPROVE" && x.decision !== "REFUSE") return false;
  if (![x.evidenceRefs, x.supportingRefs, x.opposingRefs, x.assumptions, x.unresolved, x.invalidation].every(asStrings)) return false;
  const refs = new Set(x.evidenceRefs); if (![...x.supportingRefs, ...x.opposingRefs].every(r => refs.has(r)) || x.supportingRefs.some(r => x.opposingRefs.includes(r))) return false;
  if (x.decision === "APPROVE" && x.opposingRefs.length === 0) return false;
  if (x.decision === "REFUSE" && x.opposingRefs.length === 0) return false;
  if (!Array.isArray(x.claims) || x.claims.some(c => !ownExact(c, ["id", "text", "refs"]) || !text(c.id) || !text(c.text) || !asStrings(c.refs) || c.refs.some(r => !refs.has(r)))) return false;
  return new Set(x.claims.map(c => c.id)).size === x.claims.length;
}
export function canonicalReasoningJson(value: ReasoningReceiptInput): string { if (!validateInput(value)) throw new TypeError("reasoning receipt is malformed or has dangling references"); return canonical(value); }
export function createReasoningReceipt(input: ReasoningReceiptInput): ReasoningReceipt {
  const json = canonicalReasoningJson(input); return freeze({ schema: "ZO-BIN-REASONING-RECEIPT-V1", ...input, canonicalSha256: createHash("sha256").update(json).digest("hex") });
}
export function verifyReasoningReceipt(value: unknown): string | false {
  try { if (!ownExact(value, ["schema", ...INPUT_KEYS, "canonicalSha256"])) return false; const x = value as unknown as ReasoningReceipt; if (x.schema !== "ZO-BIN-REASONING-RECEIPT-V1" || !/^[0-9a-f]{64}$/.test(x.canonicalSha256)) return false; const { schema: _schema, canonicalSha256: _hash, ...input } = x; if (!validateInput(input)) return false; return digest(input) === x.canonicalSha256 ? x.canonicalSha256 : false; } catch { return false; }
}
export function reasoningReceiptMarkdown(receipt: ReasoningReceipt): string { if (!verifyReasoningReceipt(receipt)) throw new TypeError("cannot project unverifiable receipt"); return [`# Reasoning receipt: ${receipt.decision}`, `- Schema: ${receipt.schema}`, `- SHA-256: \`${receipt.canonicalSha256}\``, `- Evidence: ${receipt.evidenceRefs.join(", ")}`, `- Supporting: ${receipt.supportingRefs.join(", ") || "none"}`, `- Opposing: ${receipt.opposingRefs.join(", ") || "none"}`, "", "## Claims", ...receipt.claims.map(c => `- **${c.id}**: ${c.text} (refs: ${c.refs.join(", ")})`), "", "## Assumptions", ...receipt.assumptions.map(x => `- ${x}`), "", "## Unresolved", ...receipt.unresolved.map(x => `- ${x}`), "", "## Invalidation", ...receipt.invalidation.map(x => `- ${x}`)].join("\n"); }
