import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync, mkdirSync, openSync, fsyncSync, closeSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExecutionMandate } from "../domain/index.js";
import { MANDATE_STATES, type MandateState } from "../runtime/mandateState.js";

export interface AuthorityKey {
  readonly venue: ExecutionMandate["venue"];
  readonly instrument: ExecutionMandate["instrument"];
  readonly accountId: string;
  readonly symbol: string;
  readonly side: ExecutionMandate["side"];
}
function bad(message: string): never { throw new TypeError(`invalid persisted mandate: ${message}`); }
function object(value: unknown, name: string): asserts value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) bad(`${name} must be an object`); }
function str(value: unknown, name: string): asserts value is string { if (typeof value !== "string" || value.trim() === "") bad(`${name} must be a non-empty string`); }
function finite(value: unknown, name: string, nonNegative = false): asserts value is number { if (typeof value !== "number" || !Number.isFinite(value) || (nonNegative && value < 0)) bad(`${name} must be finite${nonNegative ? " and non-negative" : ""}`); }
function clone<T>(value: T): T { return structuredClone(value); }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
const STATES = new Set<string>(MANDATE_STATES);
const CLIENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function validateAuthorityKey(input: unknown): asserts input is AuthorityKey {
  object(input, "AuthorityKey");
  if (input.venue !== "BINANCE" || (input.instrument !== "SPOT" && input.instrument !== "USD_M_FUTURES") || (input.side !== "BUY" && input.side !== "SELL")) bad("AuthorityKey enum");
  str(input.accountId, "AuthorityKey.accountId"); str(input.symbol, "AuthorityKey.symbol");
}
export function authorityKey(mandate: ExecutionMandate): AuthorityKey { return { venue: mandate.venue, instrument: mandate.instrument, accountId: mandate.accountId, symbol: mandate.symbol, side: mandate.side }; }
/** Collision-safe canonical identity. This is local X2 storage encoding, not a wire format. */
function scopeOf(key: AuthorityKey): string { validateAuthorityKey(key); return JSON.stringify([key.venue, key.instrument, key.accountId, key.symbol, key.side]); }

export type AuthorityStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED" | "CONSUMED";
export interface PersistedMandateRecord { readonly mandate: ExecutionMandate; readonly state: MandateState; readonly scope: string; readonly clientOrderId?: string; readonly consumedAt?: number; readonly status?: AuthorityStatus; readonly revoked?: boolean; }
export interface PersistedSnapshot { readonly records: readonly PersistedMandateRecord[]; }
export interface PersistenceAdapter { load(): PersistedSnapshot; save(snapshot: PersistedSnapshot): Promise<void>; transact(mutator: (snapshot: PersistedSnapshot) => PersistedSnapshot | Promise<PersistedSnapshot>): Promise<PersistedSnapshot>; }

export function validateMandate(m: unknown): asserts m is ExecutionMandate {
  object(m, "mandate"); const mandate = m as unknown as ExecutionMandate;
  for (const name of ["mandateId", "workflowId", "thesisId", "method", "advocateRef", "opposeRef", "marketAnalysisRef", "evidenceBundleHash", "councilDecisionHash", "symbol", "accountId"]) str(m[name], name);
  if (m.venue !== "BINANCE" || (m.instrument !== "SPOT" && m.instrument !== "USD_M_FUTURES") || (m.side !== "BUY" && m.side !== "SELL")) bad("unsupported authority enum");
  finite(mandate.expiresAt, "expiresAt", true); object(m.validity, "validity"); finite(mandate.validity.issuedAt, "validity.issuedAt", true);
  if (mandate.expiresAt <= mandate.validity.issuedAt) bad("expiry chronology");
  if (m.version !== 1 || m.maxUses !== 1) bad("unsupported mandate version");
  object(m.anchor, "anchor"); if (typeof m.anchor.stateVersion !== "bigint" || m.anchor.stateVersion < 0n) bad("anchor.stateVersion must be non-negative bigint");
  for (const name of ["observedAt", "receivedAt", "markPrice"] as const) finite(mandate.anchor[name], `anchor.${name}`, true);
  if (mandate.anchor.markPrice <= 0 || mandate.anchor.receivedAt < mandate.anchor.observedAt) bad("anchor chronology/value");
  object(m.entry, "entry"); object(m.economics, "economics"); object(m.risk, "risk"); object(m.invalidation, "invalidation"); object(m.execution, "execution"); object(m.provenance, "provenance");
  for (const name of ["minPrice", "maxPrice", "maxSpreadBps", "maxSlippageBps"] as const) finite(mandate.entry[name], `entry.${name}`, true);
  if (mandate.entry.minPrice <= 0 || mandate.entry.maxPrice < mandate.entry.minPrice || (mandate.entry.trigger !== "ABOVE" && mandate.entry.trigger !== "BELOW")) bad("entry bounds");
  for (const name of ["minExecutableEdgeBps", "maxFeeBps", "maxFundingCostBps", "maxNotional"] as const) finite(m.economics[name], `economics.${name}`, true);
  finite(m.risk.maxLossBps, "risk.maxLossBps", true); if (mandate.economics.maxNotional <= 0 || (mandate.execution.method !== "LIMIT" && mandate.execution.method !== "MARKET")) bad("economics/execution");
  if (m.invalidation.direction !== "LONG" && m.invalidation.direction !== "SHORT") bad("direction"); finite(m.invalidation.thesisExpiry, "invalidation.thesisExpiry", true);
  if (m.invalidation.thesisExpiry < mandate.expiresAt || m.invalidation.thesisExpiry < mandate.validity.issuedAt) bad("invalidation expiry is incoherent");
  if (m.thesisHash !== undefined && (typeof m.thesisHash !== "string" || m.thesisHash.trim() === "")) bad("thesisHash type");
  if (m.provenance.thesisHash !== undefined && (typeof m.provenance.thesisHash !== "string" || m.provenance.thesisHash.trim() === "")) bad("provenance.thesisHash type");
  if (m.provenance.thesisHash !== m.thesisHash) bad("thesisHash provenance mismatch");
  for (const name of ["thesisId", "method", "advocateRef", "opposeRef", "marketAnalysisRef", "evidenceBundleHash", "councilDecisionHash"] as const) { str(m.provenance[name], `provenance.${name}`); if (m.provenance[name] !== m[name]) bad(`provenance.${name} mismatch`); }
  if ((m.invalidation.direction === "LONG" ? "BUY" : "SELL") !== m.side) bad("direction/side contradiction");
}
function validateSnapshot(input: unknown): PersistedSnapshot {
  object(input, "snapshot"); if (!Array.isArray(input.records)) bad("records must be an array");
  const ids = new Set<string>(), scopes = new Set<string>(), clientIds = new Set<string>(); const records: PersistedMandateRecord[] = [];
  for (const raw of input.records) {
    object(raw, "record"); validateMandate(raw.mandate); const record = raw as unknown as PersistedMandateRecord; if (typeof raw.state !== "string" || !STATES.has(raw.state)) bad("runtime state");
    const expected = scopeOf(authorityKey(record.mandate)); if (record.scope !== expected) bad("forged scope");
    if (ids.has(record.mandate.mandateId)) bad("duplicate mandate id"); ids.add(record.mandate.mandateId);
    const suppliedStatus = record.status;
    if (suppliedStatus !== undefined && !["ACTIVE", "SUPERSEDED", "REVOKED", "CONSUMED"].includes(suppliedStatus)) bad("authority status");
    if (record.revoked !== undefined && (typeof record.revoked !== "boolean" || !record.revoked || record.state !== "ARMED")) bad("revoked marker/state combination");
    if (record.consumedAt !== undefined) finite(record.consumedAt, "consumedAt", true);
    if (record.state === "ARMED" && !record.revoked) { if (scopes.has(expected)) bad("duplicate active scope"); scopes.add(expected); }
    if (record.state === "SUBMITTING" && (record.clientOrderId === undefined || typeof record.clientOrderId !== "string" || !CLIENT_ID.test(record.clientOrderId))) bad("SUBMITTING requires valid clientOrderId");
    if (record.clientOrderId !== undefined) { if (typeof record.clientOrderId !== "string" || !CLIENT_ID.test(record.clientOrderId)) bad("clientOrderId"); if (clientIds.has(record.clientOrderId)) bad("duplicate clientOrderId"); clientIds.add(record.clientOrderId); if (record.state !== "SUBMITTING") bad("clientOrderId on non-submitting record"); }
    const status: AuthorityStatus | undefined = record.revoked ? "REVOKED" : record.state === "SUBMITTING" ? "CONSUMED" : record.state === "SUPERSEDED" ? "SUPERSEDED" : record.state === "ARMED" ? "ACTIVE" : undefined;
    if (suppliedStatus !== undefined && suppliedStatus !== status) bad("authority status/runtime state contradiction");
    if (status !== "CONSUMED" && record.consumedAt !== undefined) bad("consumedAt on non-consumed record");
    if (status === "CONSUMED" && record.consumedAt === undefined) bad("CONSUMED requires consumedAt");
    if (status === "REVOKED" && !record.revoked) bad("REVOKED requires revoked marker");
    records.push(deepFreeze(clone({ ...record, ...(status === undefined ? {} : { status }) })));
  }
  return { records };
}
function expire(snapshot: PersistedSnapshot, now: number): { snapshot: PersistedSnapshot; changed: boolean; ids: string[] } { const ids: string[] = []; const records = snapshot.records.map((r) => r.state === "ARMED" && !r.revoked && now >= r.mandate.expiresAt ? (ids.push(r.mandate.mandateId), { ...r, state: "EXPIRED" as const, status: undefined }) : r); return { snapshot: { records }, changed: ids.length > 0, ids }; }

export class MemoryPersistence implements PersistenceAdapter {
  private value: PersistedSnapshot; private tail: Promise<void> = Promise.resolve(); private fail = false;
  constructor(initial: PersistedSnapshot = { records: [] }) { this.value = clone(initial); }
  load(): PersistedSnapshot { return clone(this.value); }
  async save(snapshot: PersistedSnapshot): Promise<void> { if (this.fail) { this.fail = false; throw new Error("persistence failure before durable commit"); } this.value = clone(snapshot); }
  failNextSave(): void { this.fail = true; }
  snapshot(): PersistedSnapshot { return clone(this.value); }
  transact(mutator: (snapshot: PersistedSnapshot) => PersistedSnapshot | Promise<PersistedSnapshot>): Promise<PersistedSnapshot> { const run = this.tail.then(async () => { const next = validateSnapshot(await mutator(validateSnapshot(this.value))); await this.save(next); return clone(next); }); this.tail = run.then(() => undefined, () => undefined); return run; }
}

export interface JsonFilePersistenceOptions { readonly lockTimeoutMs?: number; readonly maxWaitMs?: number; /** Retained only to prove no orphan callback is invoked. */ readonly beforeOrphanStat?: () => void; /** Test-only race injection. */ readonly beforeReleaseRename?: () => void; }
type LockLease = { readonly token: string; readonly dev: number; readonly ino: number };
const localLockOwners = new Map<string, LockLease>();
type LockOwner = { readonly token?: unknown; readonly status?: unknown };
export type StoreErrorCode = "RECOVERY_BLOCKED" | "LOCK_CONTENTION" | "NOT_FOUND" | "INVALID_TRANSITION";
export class StoreError extends Error { readonly name = "StoreError"; constructor(readonly code: StoreErrorCode, message: string = code) { super(`${code}: ${message}`); } }
function atomicWriteLockOwner(path: string, owner: LockOwner): void {
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(owner), "utf8"); const fd = openSync(temp, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); } renameSync(temp, path);
}
export class JsonFilePersistence implements PersistenceAdapter {
  private tail: Promise<void> = Promise.resolve(); private readonly maxWaitMs: number; private readonly beforeReleaseRename?: () => void; private lease?: LockLease;
  constructor(private readonly path: string, options: JsonFilePersistenceOptions = {}) { this.maxWaitMs = options.maxWaitMs ?? 10_000; this.beforeReleaseRename = options.beforeReleaseRename; }
  load(): PersistedSnapshot { try { const text = readFileSync(this.path, "utf8"); return JSON.parse(text, (_key, value: unknown) => typeof value === "string" && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value) as PersistedSnapshot; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: [] }; throw error; } }
  /** Local development backend only: temp-file fsync before replace; no crash recovery is claimed. */
  async save(snapshot: PersistedSnapshot): Promise<void> { mkdirSync(dirname(this.path), { recursive: true }); const temp = `${this.path}.${process.pid}.${randomUUID()}.tmp`; const text = JSON.stringify(snapshot, (_key, value: unknown) => typeof value === "bigint" ? `${value}n` : value); writeFileSync(temp, text, "utf8"); const fd = openSync(temp, "r"); try { fsyncSync(fd); } finally { closeSync(fd); } renameSync(temp, this.path); }
  private release(lock: string, lease: LockLease): () => void {
    return () => {
      if (localLockOwners.get(lock) !== lease) return;
      try {
        const current = statSync(lock); if (current.dev !== lease.dev || current.ino !== lease.ino) return;
        const owner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8")) as LockOwner; if (owner.token !== lease.token || owner.status !== "ACTIVE") return;
        this.beforeReleaseRename?.();
        const stillOwned = statSync(lock); if (stillOwned.dev !== lease.dev || stillOwned.ino !== lease.ino) return;
        const stillOwner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8")) as LockOwner; if (stillOwner.token !== lease.token || stillOwner.status !== "ACTIVE") return;
        atomicWriteLockOwner(join(lock, "owner.json"), { ...stillOwner, status: "RELEASED" });
      } catch { /* ownership loss is fail-closed; never destructively recover */ }
    };
  }
  private async lock(): Promise<() => void> {
    const lock = `${this.path}.lock`; mkdirSync(dirname(this.path), { recursive: true }); const started = Date.now();
    for (;;) {
      const token = randomUUID();
      try {
        mkdirSync(lock); atomicWriteLockOwner(join(lock, "owner.json"), { token, status: "ACTIVE" });
        const identity = statSync(lock); const lease: LockLease = { token, dev: identity.dev, ino: identity.ino }; this.lease = lease; localLockOwners.set(lock, lease);
        return this.release(lock, lease);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let active = false;
        try {
          const owner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8")) as LockOwner;
          if (this.lease && owner.token === this.lease.token && owner.status === "RELEASED") {
            const identity = statSync(lock);
            if (identity.dev !== this.lease.dev || identity.ino !== this.lease.ino) throw new StoreError("RECOVERY_BLOCKED", "released lock directory identity changed");
            atomicWriteLockOwner(join(lock, "owner.json"), { ...owner, status: "ACTIVE" }); return this.release(lock, this.lease);
          }
          else active = owner.status === "ACTIVE" && typeof owner.token === "string" && owner.token.length > 0;
        }
        catch { throw new StoreError("RECOVERY_BLOCKED", "lock ownership is ambiguous"); }
        if (!active) throw new StoreError("RECOVERY_BLOCKED", "lock ownership is not positively recoverable");
        if (Date.now() - started >= this.maxWaitMs) throw new StoreError("LOCK_CONTENTION", "active persistence lock timed out");
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }
  }
  transact(mutator: (snapshot: PersistedSnapshot) => PersistedSnapshot | Promise<PersistedSnapshot>): Promise<PersistedSnapshot> { const run = this.tail.then(async () => { const unlock = await this.lock(); try { const current = validateSnapshot(this.load()); const next = validateSnapshot(await mutator(current)); await this.save(next); return clone(next); } finally { unlock(); } }); this.tail = run.then(() => undefined, () => undefined); return run; }
}

export class MandateStore {
  private records!: PersistedMandateRecord[]; private tail: Promise<void> = Promise.resolve(); private readonly failedRetirements = new Set<string>();
  constructor(private readonly persistence: PersistenceAdapter, private readonly now: () => number = () => Date.now()) { const loaded = validateSnapshot(persistence.load()); this.refresh(loaded); }
  private refresh(input: PersistedSnapshot): PersistedSnapshot { const retired = expire(validateSnapshot(input), this.now()); this.records = retired.snapshot.records.map((r) => deepFreeze(clone(r))) as PersistedMandateRecord[]; if (retired.changed) void this.retire(retired.snapshot, retired.ids); return retired.snapshot; }
  private async retire(snapshot: PersistedSnapshot, ids: string[]): Promise<void> { for (const id of ids) this.failedRetirements.add(id); try { await this.persistence.transact((current) => expire(current, this.now()).snapshot); } catch { /* local X2 reads remain fail closed after a failed durable retirement */ } }
  issue(mandate: ExecutionMandate): Promise<void> { validateMandate(mandate); const copy = clone(mandate); return this.serial(async () => { const next = await this.persistence.transact((current) => { const s = expire(current, this.now()).snapshot; if (s.records.some((r) => r.mandate.mandateId === copy.mandateId)) throw new Error("mandate is historical and cannot be reissued"); const scope = scopeOf(authorityKey(copy)); if (s.records.some((r) => r.scope === scope && r.state === "ARMED" && !r.revoked)) throw new Error("active mandate already exists for scope"); return { records: [...s.records, { mandate: copy, state: "ARMED", status: "ACTIVE", scope }] }; }); this.records = next.records as PersistedMandateRecord[]; }); }
  getActive(key: AuthorityKey): ExecutionMandate | null { validateAuthorityKey(key); const current = validateSnapshot(this.persistence.load()); const s = this.refresh(current); const scope = scopeOf(key); const active = s.records.find((r) => !this.failedRetirements.has(r.mandate.mandateId) && r.scope === scope && r.state === "ARMED" && r.status === "ACTIVE" && !r.revoked); return active ? deepFreeze(clone(active.mandate)) : null; }
  supersede(oldMandateId: string, replacement: ExecutionMandate): Promise<void> { validateMandate(replacement); const copy = clone(replacement); return this.serial(async () => { const next = await this.persistence.transact((current) => { const s = expire(current, this.now()).snapshot; const old = s.records.find((r) => r.mandate.mandateId === oldMandateId); if (!old) throw new Error("mandate not found"); if (old.revoked) throw new Error("cannot supersede REVOKED mandate"); if (old.state !== "ARMED") throw new Error(`cannot supersede ${old.state} mandate`); if (old.scope !== scopeOf(authorityKey(copy))) throw new Error("replacement scope differs"); if (s.records.some((r) => r.mandate.mandateId === copy.mandateId)) throw new Error("replacement mandate is historical"); return { records: [...s.records.map((r) => r.mandate.mandateId === oldMandateId ? { ...r, state: "SUPERSEDED" as const, status: "SUPERSEDED" as const } : r), { mandate: copy, state: "ARMED", status: "ACTIVE", scope: old.scope }] }; }); this.records = next.records as PersistedMandateRecord[]; }); }
  consumeForSubmission(mandateId: string, clientOrderId: string): Promise<void> { if (!CLIENT_ID.test(clientOrderId)) return Promise.reject(new Error("clientOrderId is invalid")); return this.serial(async () => { const next = await this.persistence.transact((current) => { const s = expire(current, this.now()).snapshot; const record = s.records.find((r) => r.mandate.mandateId === mandateId); if (!record) throw new Error("mandate not found"); if (record.revoked) throw new Error("cannot consume REVOKED mandate"); if (record.clientOrderId !== undefined) { if (record.clientOrderId === clientOrderId && record.state === "SUBMITTING") return s; throw new Error("conflicting clientOrderId or mandate already consumed"); } if (s.records.some((r) => r.clientOrderId === clientOrderId)) throw new Error("clientOrderId collision"); if (record.state !== "ARMED") throw new Error(`cannot consume ${record.state} mandate`); return { records: s.records.map((r) => r.mandate.mandateId === mandateId ? { ...r, state: "SUBMITTING" as const, status: "CONSUMED" as const, clientOrderId, consumedAt: this.now() } : r) }; }); this.records = next.records as PersistedMandateRecord[]; }); }
  revoke(mandateId: string): Promise<void> { return this.serial(async () => { const next = await this.persistence.transact((current) => { const s = expire(current, this.now()).snapshot; const record = s.records.find((r) => r.mandate.mandateId === mandateId); if (!record) throw new StoreError("NOT_FOUND", "mandate not found"); if (record.revoked) return s; if (record.state !== "ARMED") throw new StoreError("INVALID_TRANSITION", `cannot revoke ${record.state} mandate`); return { records: s.records.map((r) => r.mandate.mandateId === mandateId ? { ...r, revoked: true, status: "REVOKED" as const } : r) }; }); this.records = next.records as PersistedMandateRecord[]; }); }
  history(): readonly PersistedMandateRecord[] { return this.refresh(validateSnapshot(this.persistence.load())).records.map((record) => deepFreeze(clone(record))); }
  private serial<T>(operation: () => Promise<T>): Promise<T> { const result = this.tail.then(operation); this.tail = result.then(() => undefined, () => undefined); return result; }
}
export type { MandateState } from "../runtime/mandateState.js";
