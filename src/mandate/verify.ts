import { validMandate } from "../evaluator/index.js";
import type { ExecutionMandate } from "../domain/index.js";

export interface MandateVerificationOptions {
  readonly workflowId?: string;
  readonly thesisId?: string;
  readonly reasoningReceiptHash?: string;
  readonly now?: number;
}
export interface MandateVerification {
  readonly valid: boolean;
  readonly assurance: "canonical-integrity-and-binding" | "invalid";
  readonly checks: Readonly<{ integrity: boolean; workflowBinding: boolean; provenance: boolean; expiry: boolean; bounds: boolean }>;
  readonly reason?: string;
}
function freezeDeep<T>(value: T, seen = new Set<object>()): T { if (value && typeof value === "object" && !seen.has(value as object)) { seen.add(value as object); Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child, seen); } return value; }
function normalize(value: unknown): ExecutionMandate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("mandate object required");
  const copy = structuredClone(value) as Record<string, any>;
  const stateVersion = copy.anchor.stateVersion;
  if (typeof stateVersion === "string" && /^\d+n$/.test(stateVersion)) copy.anchor.stateVersion = BigInt(stateVersion.slice(0, -1));
  else if (typeof stateVersion !== "bigint") throw new TypeError("mandate anchor stateVersion must be bigint or serialized bigint");
  return freezeDeep(copy) as ExecutionMandate;
}
export function verifyMandate(value: unknown, expected: MandateVerificationOptions = {}): MandateVerification {
  try {
    const mandate = normalize(value);
    const integrity = validMandate(mandate);
    const workflowBinding = integrity && (expected.workflowId === undefined || mandate.workflowId === expected.workflowId) && (expected.thesisId === undefined || mandate.thesisId === expected.thesisId);
    const provenance = integrity && mandate.provenance.thesisId === mandate.thesisId && mandate.provenance.thesisHash === mandate.thesisHash && mandate.provenance.advocateRef === mandate.advocateRef && mandate.provenance.opposeRef === mandate.opposeRef && mandate.provenance.marketAnalysisRef === mandate.marketAnalysisRef && mandate.provenance.evidenceBundleHash === mandate.evidenceBundleHash && mandate.provenance.councilDecisionHash === mandate.councilDecisionHash && mandate.provenance.reasoningReceiptHash === mandate.reasoningReceiptHash && (expected.reasoningReceiptHash === undefined || mandate.reasoningReceiptHash === expected.reasoningReceiptHash);
    const expiry = integrity && (expected.now === undefined || (expected.now >= mandate.validity.issuedAt && expected.now < mandate.expiresAt));
    const bounds = integrity && mandate.entry.minPrice <= mandate.entry.maxPrice && mandate.economics.maxNotional > 0 && mandate.maxUses === 1;
    const valid = Boolean(integrity && workflowBinding && provenance && expiry && bounds);
    return { valid, assurance: valid ? "canonical-integrity-and-binding" : "invalid", checks: { integrity, workflowBinding, provenance, expiry, bounds }, ...(valid ? {} : { reason: "mandate failed canonical integrity, binding, expiry, provenance, or bounds verification" }) };
  } catch (error) {
    return { valid: false, assurance: "invalid", checks: { integrity: false, workflowBinding: false, provenance: false, expiry: false, bounds: false }, reason: error instanceof Error ? error.message : "mandate verification failed" };
  }
}
export function serializeMandate(mandate: ExecutionMandate): string { const result = verifyMandate(mandate, { workflowId: mandate.workflowId, thesisId: mandate.thesisId }); if (!result.valid) throw new TypeError("cannot serialize an invalid mandate"); return JSON.stringify(mandate, (_key, value) => typeof value === "bigint" ? `${value}n` : value); }
export function parseMandate(serialized: string): ExecutionMandate { if (typeof serialized !== "string") throw new TypeError("serialized mandate must be a string"); const mandate = normalize(JSON.parse(serialized)); const result = verifyMandate(mandate, { workflowId: mandate.workflowId, thesisId: mandate.thesisId }); if (!result.valid) throw new TypeError(result.reason ?? "invalid mandate"); return mandate; }
export function verifySerializedMandate(serialized: string, expected: MandateVerificationOptions = {}): MandateVerification { try { return verifyMandate(parseMandate(serialized), expected); } catch (error) { return { valid: false, assurance: "invalid", checks: { integrity: false, workflowBinding: false, provenance: false, expiry: false, bounds: false }, reason: error instanceof Error ? error.message : "serialized mandate verification failed" }; } }
