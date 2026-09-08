import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import type { MB7Artifact } from "./mb7Campaign.js";

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const scenarios = ["approval-ack", "approval-partial", "approval-fill", "submission-reject", "unknown-recovery", "council-refusal", "stale-market", "stale-account", "cost-ceiling", "risk-limit", "revoked-authority", "superseded-authority", "expiry", "duplicate-trigger-event-suppression", "duplicate-order-events", "out-of-order-terminal-refusal", "restart-restore", "unknown-recovery-order-absent", "contradictory-authority", "symbol-isolation"] as const;
const invariantKeys = ["duplicateEconomicConsequences", "illegalStateRegressions", "contradictoryExecutionsPermitted", "crossSymbolContamination", "blindRetryCount", "newAuthorityAfterAmbiguousConsequence"] as const;
const topKeys = ["campaignId", "mode", "startingSha", "runnerImplementationSha", "validatorImplementationSha", "finalSha", "workflowCount", "scenarios", "workflows", "receipts", "metrics", "deterministicReplayDigest", "testCommands", "evidenceCeiling", "exclusions", "artifactPayloadSha256"];
const workflowKeys = ["workflowId", "scenario", "status", "provenance"];
const receiptKeys = ["receiptId", "workflowId", "scenario", "status", "provenance", "orderOutcome", "recoveryStatus", "refusalCode", "refusalMessage", "versionBefore", "versionAfter", "unchanged", "prevented", "restoredVersion", "symbols", "distinct", "recoveryError"];
const provenanceKeys = ["stage", "source", "lineage"];
const errorKeys = ["code", "message"];
const metricKeys = ["councilRefusals", "approvals", "mandates", "refusals", "refusalByCode", "acknowledged", "partial", "filled", "rejected", "unknown", "recovered", "notExercised", ...invariantKeys, "authorityViolations", "economicWrites", "liveClaims", "deterministicRuns"];
const objectPrototypeKeys = ["__defineGetter__", "__defineSetter__", "constructor", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"];
const arrayPrototypeKeys = ["length", "constructor", "at", "concat", "copyWithin", "fill", "find", "findIndex", "findLast", "findLastIndex", "lastIndexOf", "pop", "push", "reverse", "shift", "unshift", "slice", "sort", "splice", "includes", "indexOf", "join", "keys", "entries", "values", "forEach", "filter", "flat", "flatMap", "map", "every", "some", "reduce", "reduceRight", "toReversed", "toSorted", "toSpliced", "with", "toString", "toLocaleString"];

function cleanPrototype(proto: object, expected: string[]): boolean {
  const actual = Object.getOwnPropertyNames(proto).sort(), wanted = [...expected].sort();
  if (actual.join("\0") !== wanted.join("\0")) return false;
  const symbols = Object.getOwnPropertySymbols(proto).map(String).sort();
  if (proto === Array.prototype) return JSON.stringify(symbols) === JSON.stringify(["Symbol(Symbol.iterator)", "Symbol(Symbol.unscopables)"]);
  return symbols.length === 0;
}
function fail(): false { return false; }
function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype || !cleanPrototype(Object.prototype, objectPrototypeKeys)) return false;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(k => typeof k !== "string" || !keys.includes(k))) return false;
  return keys.every(k => { const d = Object.getOwnPropertyDescriptor(value, k); return !!d && d.enumerable && "value" in d; });
}
function allowedObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype || !cleanPrototype(Object.prototype, objectPrototypeKeys)) return false;
  return Reflect.ownKeys(value).every(k => typeof k === "string" && keys.includes(k) && !!Object.getOwnPropertyDescriptor(value, k)?.enumerable && "value" in Object.getOwnPropertyDescriptor(value, k)!);
}
function exactArray(value: unknown, length: number): value is unknown[] {
  const protoOk = Object.getPrototypeOf(value) === Array.prototype, protoClean = cleanPrototype(Array.prototype, arrayPrototypeKeys); if (!Array.isArray(value) || !protoOk || !protoClean || value.length !== length) return false;
  const own = Reflect.ownKeys(value), lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (own.length !== length + 1 || !own.includes("length") || !lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable || lengthDescriptor.configurable || !lengthDescriptor.writable || own.some(k => k !== "length" && (typeof k !== "string" || !/^\d+$/.test(k)))) return false;
  return Array.from({ length }, (_, i) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    return !!descriptor && "value" in descriptor && descriptor.get === undefined && descriptor.set === undefined && descriptor.enumerable === true && descriptor.writable === true && descriptor.configurable === true;
  }).every(Boolean);
}
function finiteInt(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value); }
function validSha(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{40}$/.test(value); }

const statusByScenario: Record<string, string> = { "approval-ack": "ACKNOWLEDGED", "approval-partial": "PARTIALLY_FILLED", "approval-fill": "FILLED", "submission-reject": "FAILED", "unknown-recovery": "UNKNOWN", "council-refusal": "REFUSED", "stale-market": "REFUSED", "stale-account": "REFUSED", "cost-ceiling": "REFUSED", "risk-limit": "REFUSED", "revoked-authority": "REFUSED", "superseded-authority": "REFUSED", expiry: "EXPIRED", "duplicate-trigger-event-suppression": "ACKNOWLEDGED", "duplicate-order-events": "FILLED", "out-of-order-terminal-refusal": "REFUSED", "restart-restore": "ACKNOWLEDGED", "unknown-recovery-order-absent": "RECOVERY_BLOCKED", "contradictory-authority": "REFUSED", "symbol-isolation": "ACKNOWLEDGED" };
const refusalByScenario: Record<string, string | undefined> = { "council-refusal": "THRESHOLD_NOT_MET", "stale-market": "MARKET_STATE_STALE", "stale-account": "ACCOUNT_STATE_STALE", "cost-ceiling": "COST_CEILING", "risk-limit": "RISK_LIMIT", "revoked-authority": "AUTHORITY_STATUS", "superseded-authority": "AUTHORITY_STATUS", expiry: "MANDATE_EXPIRED" };
const receiptSemantics: Record<string, Record<string, unknown>> = {
  "approval-ack": { orderOutcome: "ACKNOWLEDGED" }, "approval-partial": { orderOutcome: "PARTIALLY_FILLED" }, "approval-fill": { orderOutcome: "FILLED" },
  "submission-reject": { orderOutcome: "REJECTED" }, "unknown-recovery": { orderOutcome: "ACKNOWLEDGED", recoveryStatus: "RECONCILED" },
  "council-refusal": { refusalCode: "THRESHOLD_NOT_MET", refusalMessage: "council thresholds are not met" }, "stale-market": { refusalCode: "MARKET_STATE_STALE" }, "stale-account": { refusalCode: "ACCOUNT_STATE_STALE" }, "cost-ceiling": { refusalCode: "COST_CEILING" }, "risk-limit": { refusalCode: "RISK_LIMIT" }, "revoked-authority": { refusalCode: "AUTHORITY_STATUS" }, "superseded-authority": { refusalCode: "AUTHORITY_STATUS" }, expiry: { refusalCode: "MANDATE_EXPIRED" },
  "duplicate-trigger-event-suppression": { versionBefore: 1, versionAfter: 1, unchanged: true }, "duplicate-order-events": { unchanged: true }, "out-of-order-terminal-refusal": { prevented: true }, "restart-restore": { restoredVersion: 1 },
  "unknown-recovery-order-absent": { recoveryStatus: "RECOVERY_BLOCKED", recoveryError: { code: "RECOVERY_BLOCKED", message: "workflow is not persisted" } }, "contradictory-authority": { prevented: true }, "symbol-isolation": { symbols: ["run-isolation-btc-BTCUSDT:thesis-BTCUSDT:1", "run-isolation-eth-ETHUSDT:thesis-ETHUSDT:1"], distinct: true }
};
const runnerSha=()=>execFileSync("git",["log","-1","--format=%H","--","src/shadow/mb7Campaign.ts"],{encoding:"utf8"}).trim();
const validatorSha=()=>execFileSync("git",["log","-1","--format=%H","--","src/shadow/mb7Evidence.ts"],{encoding:"utf8"}).trim();

export function validateEvidence(value: unknown): boolean {
  try {
    if (!exactObject(value, topKeys)) return fail();
    const a = value as unknown as MB7Artifact;
    if (a.campaignId !== "ZO-BIN-MB7-SHADOW-DETERMINISTIC-V1" || a.mode !== "SHADOW" || ![a.startingSha, a.runnerImplementationSha, a.validatorImplementationSha, a.finalSha].every(validSha) || a.startingSha !== a.runnerImplementationSha || a.finalSha !== a.runnerImplementationSha || a.runnerImplementationSha !== runnerSha() || a.validatorImplementationSha !== validatorSha()) return fail();
    if (!finiteInt(a.workflowCount) || a.workflowCount !== scenarios.length || !exactArray(a.scenarios, scenarios.length) || JSON.stringify(a.scenarios) !== JSON.stringify(scenarios) || !exactArray(a.workflows, scenarios.length) || !exactArray(a.receipts, scenarios.length) || !exactArray(a.testCommands, 5) || !exactArray(a.exclusions, 8)) return fail();
    const workflows = a.workflows as any[], receipts = a.receipts as any[];
    const ids = new Set<string>();
    for (const w of workflows) {
      if (!exactObject(w, workflowKeys) || typeof w.workflowId !== "string" || ids.has(w.workflowId) || !scenarios.includes(w.scenario as any) || w.status !== statusByScenario[w.scenario as string] || !exactObject(w.provenance, provenanceKeys) || w.provenance.source !== "M-B7 deterministic fixture" || !exactArray(w.provenance.lineage, 5) || w.provenance.lineage.join(",") !== "council,thesis,mandate,supervisor,order-receipt") return fail();
      ids.add(w.workflowId);
    }
    if (new Set(workflows.map(w => w.scenario)).size !== scenarios.length) return fail();
    const rids = new Set<string>();
    for (const r of receipts) {
      const w = workflows.find(x => x.workflowId === r.workflowId);
      const expected = receiptSemantics[r.scenario as string];
      const semanticKeys = ["orderOutcome", "recoveryStatus", "refusalCode", "refusalMessage", "versionBefore", "versionAfter", "unchanged", "prevented", "restoredVersion", "symbols", "distinct", "recoveryError"];
      if (!allowedObject(r, receiptKeys) || typeof r.receiptId !== "string" || rids.has(r.receiptId) || !w || r.scenario !== w.scenario || r.status !== w.status || !exactObject(r.provenance, provenanceKeys) || JSON.stringify(r.provenance) !== JSON.stringify(w.provenance) || !expected || semanticKeys.some(k => JSON.stringify(r[k]) !== JSON.stringify(expected[k])) ) return fail();
      if (r.scenario === "council-refusal" && r.provenance.stage !== "council") return false;
      if (r.scenario === "unknown-recovery-order-absent" && (!exactObject(r.recoveryError, errorKeys))) return false;
      rids.add(r.receiptId);
    }
    if (new Set(receipts.map(r => r.scenario)).size !== scenarios.length || !exactObject(a.metrics, metricKeys)) return fail();
    const m: any = a.metrics;
    for (const k of metricKeys) if (k !== "refusalByCode" && !finiteInt(m[k])) return fail();
    if (!exactObject(m.refusalByCode, Object.keys(m.refusalByCode).sort())) return fail();
    for (const v of Object.values(m.refusalByCode)) if (!finiteInt(v)) return fail();
    for (const k of invariantKeys) if (m[k] !== 0) return fail();
    const count = (s: string) => workflows.filter(w => w.status === s).length;
    const expected: Record<string, number> = { councilRefusals: 1, approvals: count("ACKNOWLEDGED") + count("PARTIALLY_FILLED") + count("FILLED"), mandates: 19, refusals: count("REFUSED"), acknowledged: count("ACKNOWLEDGED"), partial: count("PARTIALLY_FILLED"), filled: count("FILLED"), rejected: 1, unknown: 1, recovered: 1, notExercised: 0, authorityViolations: 0, economicWrites: 0, liveClaims: 0, deterministicRuns: 2 };
    for (const [k, v] of Object.entries(expected)) if (m[k] !== v) return fail();
    const refusalCounts: Record<string, number> = {}; for (const r of receipts) if (r.refusalCode) refusalCounts[r.refusalCode] = (refusalCounts[r.refusalCode] ?? 0) + 1;
    if (JSON.stringify(m.refusalByCode) !== JSON.stringify(refusalCounts) || a.deterministicReplayDigest !== sha({ workflows, receipts, metrics: m })) return fail();
    const payload = { ...a }; delete payload.artifactPayloadSha256;
    return a.artifactPayloadSha256 === sha(payload) ? true : fail();
  } catch { return false; }
}

if (import.meta.url === `file://${process.argv[1]}`) { const path = process.argv[2] ?? "docs/development/evidence/ZO-BIN-MB7-shadow-campaign.json"; const a = JSON.parse(await readFile(path, "utf8")); if (!validateEvidence(a)) { console.error("M-B7 evidence validation failed"); process.exit(1); } console.log(JSON.stringify({ valid: true, artifactPayloadSha256: a.artifactPayloadSha256, workflowCount: a.workflowCount, runnerImplementationSha: a.runnerImplementationSha, validatorImplementationSha: a.validatorImplementationSha, metrics: a.metrics })); }
