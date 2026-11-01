import type { DateKey, EntityKind, EntityMap } from '../domain/types';
import { ENTITY_KINDS } from '../domain/types';
import { coalesce, mergeRemote, type MergeOutcome, type OutboxOp, type Versioned } from '../domain/sync';
import { uuid } from '../domain/ids';
import { SEED_EPOCH, isUntouchedSeed } from '../domain/defaults';
import type { SqlDriver } from './driver';
import type { Backend, OutboxRow, StorageTx } from './backend';
import { SqliteBackend } from './sqliteBackend';

const rowToOp = (r: OutboxRow): OutboxOp => ({
  id: r.id, kind: r.kind, entityId: r.entityId, op: r.op as OutboxOp['op'],
  payload: r.payload ? (JSON.parse(r.payload) as Record<string, unknown>) : null,
  createdAt: r.createdAt, attempts: r.attempts, lastError: r.lastError, nextAttemptAt: r.nextAttemptAt,
  status: r.status as OutboxOp['status'],
});

/** Kinds whose rows are looked up by calendar date (indexed `date` column). */
function dateOf(kind: EntityKind, e: Record<string, unknown>): string | null {
  if (kind === 'sessions' || kind === 'logs' || kind === 'exceptions' || kind === 'habitRecords') return (e.date as string) ?? null;
  return null;
}

const isBackend = (x: SqlDriver | Backend): x is Backend => typeof (x as Backend).getEntity === 'function';

/**
 * Local persistence + the change queue. Every user-facing write goes through `put()`, which stores the entity
 * and enqueues a sync operation in ONE transaction — a crash can never leave data without its queued change.
 *
 * Works over any `Backend`: SQLite (Android/iOS, tests) or in-memory + IndexedDB (web). A raw SqlDriver is also
 * accepted and wrapped in a SqliteBackend.
 */
export class Repo {
  private readonly db: Backend;
  constructor(storage: SqlDriver | Backend, private readonly now: () => number = Date.now) {
    this.db = isBackend(storage) ? storage : new SqliteBackend(storage);
  }

  get persistent(): boolean { return this.db.persistent; }
  /** Web: another tab changed the data. */
  onExternalChange(cb: () => void): () => void { return this.db.onExternalChange?.(cb) ?? (() => undefined); }

  async init(): Promise<void> { await this.db.init(); }

  /* ---------------- entities ---------------- */

  async all<K extends EntityKind>(kind: K, opts: { includeDeleted?: boolean } = {}): Promise<EntityMap[K][]> {
    const rows = await this.db.listEntities(kind, opts.includeDeleted === true);
    return rows.map((r) => JSON.parse(r) as EntityMap[K]);
  }

  async between<K extends 'sessions' | 'logs' | 'exceptions' | 'habitRecords'>(kind: K, from: DateKey, to: DateKey): Promise<EntityMap[K][]> {
    const rows = await this.db.listEntitiesBetween(kind, from, to);
    return rows.map((r) => JSON.parse(r) as EntityMap[K]);
  }

  async get<K extends EntityKind>(kind: K, id: string): Promise<EntityMap[K] | undefined> {
    const r = await this.db.getEntity(kind, id);
    return r ? (JSON.parse(r.json) as EntityMap[K]) : undefined;
  }

  private async writeEntity<K extends EntityKind>(tx: StorageTx, kind: K, e: EntityMap[K]): Promise<void> {
    const rec = e as unknown as Record<string, unknown>;
    await tx.putEntity({ kind, id: e.id, date: dateOf(kind, rec), updatedAt: e.updatedAt, deletedAt: e.deletedAt, json: JSON.stringify(e) });
  }

  private async enqueue(tx: StorageTx, kind: EntityKind, entityId: string, payload: unknown): Promise<void> {
    const existingRow = await tx.getOutboxByEntity(kind, entityId);
    const existing = existingRow ? [rowToOp(existingRow)] : [];
    const incoming: OutboxOp = {
      id: uuid(), kind, entityId, op: 'upsert', payload: payload as Record<string, unknown>,
      createdAt: this.now(), attempts: 0, lastError: null, nextAttemptAt: 0, status: 'pending',
    };
    const merged = coalesce(existing, incoming).find((o) => o.kind === kind && o.entityId === entityId) as OutboxOp;
    // A fresh edit resets retry state: the latest payload deserves a fresh attempt.
    await tx.upsertOutbox({
      id: existingRow?.id ?? merged.id, kind, entityId, op: merged.op, payload: JSON.stringify(merged.payload),
      createdAt: merged.createdAt, attempts: 0, lastError: null, nextAttemptAt: 0, status: 'pending',
    });
  }

  /** Save one or more entities of a kind locally and queue them for sync, atomically. */
  async put<K extends EntityKind>(kind: K, entities: EntityMap[K] | EntityMap[K][], opts: { enqueue?: boolean } = {}): Promise<void> {
    const list = Array.isArray(entities) ? entities : [entities];
    if (list.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const e of list) {
        await this.writeEntity(tx, kind, e);
        if (opts.enqueue !== false) await this.enqueue(tx, kind, e.id, e);
      }
    });
  }

  /** Several kinds in one atomic unit (e.g. close an old template version and insert its replacement). */
  async putBatch(items: { [K in EntityKind]: { kind: K; entity: EntityMap[K] } }[EntityKind][]): Promise<void> {
    if (items.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const it of items) {
        await this.writeEntity(tx, it.kind, it.entity as never);
        await this.enqueue(tx, it.kind, it.entity.id, it.entity);
      }
    });
  }

  /** Soft-delete (tombstone) so the deletion itself syncs and can win/lose conflicts predictably. */
  async softDelete<K extends EntityKind>(kind: K, id: string, nowIso: string): Promise<EntityMap[K] | undefined> {
    const cur = await this.get(kind, id);
    if (!cur || cur.deletedAt) return cur;
    const dead = { ...cur, deletedAt: nowIso, updatedAt: nowIso } as EntityMap[K];
    await this.put(kind, dead);
    return dead;
  }

  /**
   * Merge a row received from the cloud. Decides via the shared conflict rules; losers are kept in the
   * conflicts log (never silently discarded). Does NOT enqueue anything.
   */
  async applyRemote<K extends EntityKind>(kind: K, remote: EntityMap[K], atIso: string): Promise<MergeOutcome<EntityMap[K] & Versioned>> {
    return this.db.transaction(async (tx) => {
      const lr = await tx.getEntity(kind, remote.id);
      const local = lr ? (JSON.parse(lr.json) as EntityMap[K]) : undefined;
      const pending = (await tx.getOutboxByEntity(kind, remote.id)) !== undefined;
      const outcome = mergeRemote(local, remote, pending) as MergeOutcome<EntityMap[K] & Versioned>;
      if (outcome.action === 'insert' || outcome.action === 'replace') await this.writeEntity(tx, kind, outcome.value);
      if (outcome.action === 'replace' || outcome.action === 'keep-local') {
        if (outcome.conflict) {
          await tx.addConflict({ kind, entityId: remote.id, at: atIso, winner: JSON.stringify(outcome.conflict.winner), loser: JSON.stringify(outcome.conflict.loser) }, 200);
        }
        // Remote replaced a locally-pending version: the queued op carries stale data, so drop it.
        if (outcome.action === 'replace') await tx.deleteOutboxByEntity(kind, remote.id);
      }
      return outcome;
    });
  }

  async logConflict(kind: EntityKind, entityId: string, atIso: string, winner: unknown, loser: unknown): Promise<void> {
    // Bounded history: keep the newest 200 entries.
    await this.db.addConflict({ kind, entityId, at: atIso, winner: JSON.stringify(winner), loser: JSON.stringify(loser) }, 200);
  }

  async conflictLog(limit = 50): Promise<{ kind: string; entityId: string; at: string; winner: unknown; loser: unknown }[]> {
    const rows = await this.db.listConflicts(limit);
    return rows.map((r) => ({ kind: r.kind, entityId: r.entityId, at: r.at, winner: JSON.parse(r.winner), loser: JSON.parse(r.loser) }));
  }

  /* ---------------- outbox ---------------- */

  async outbox(): Promise<OutboxOp[]> { return (await this.db.listOutbox()).map(rowToOp); }

  async outboxCounts(): Promise<{ pending: number; failed: number }> {
    const rows = await this.db.listOutbox();
    return { pending: rows.filter((r) => r.status === 'pending').length, failed: rows.filter((r) => r.status === 'failed').length };
  }

  /** Remove a sent op — but only if the entity wasn't edited again while it was in flight. */
  async completeOp(op: OutboxOp): Promise<void> {
    await this.db.deleteOutboxIfUnchanged(op.id, op.createdAt, JSON.stringify(op.payload));
  }

  async saveOpFailure(op: OutboxOp): Promise<void> {
    await this.db.updateOutboxFailure(op.id, JSON.stringify(op.payload), { attempts: op.attempts, lastError: op.lastError, nextAttemptAt: op.nextAttemptAt, status: op.status });
  }

  async retryFailed(): Promise<number> {
    const before = await this.outboxCounts();
    await this.db.resetFailedOutbox();
    return before.failed;
  }

  /** Queue every local row (used when an account is first connected, so existing offline data is uploaded). */
  async enqueueAll(): Promise<number> {
    let n = 0;
    await this.db.transaction(async (tx) => {
      for (const kind of ENTITY_KINDS) {
        for (const json of await tx.listEntities(kind, true)) {
          const e = JSON.parse(json) as { id: string; updatedAt: string };
          if (isUntouchedSeed(e)) continue; // untouched defaults never overwrite cloud data
          await this.enqueue(tx, kind, e.id, e);
          n++;
        }
      }
    });
    return n;
  }

  /** Remove never-edited default rows of a kind (they were never uploaded, so nothing is lost). Returns how many. */
  async purgeUntouchedSeeds(kind: EntityKind): Promise<number> { return this.db.purgeEntitiesByUpdatedAt(kind, SEED_EPOCH); }

  /* ---------------- key/value ---------------- */

  kvGet(key: string): Promise<string | null> { return this.db.kvGet(key); }
  kvSet(key: string, value: string): Promise<void> { return this.db.kvSet(key, value); }
  kvDelete(key: string): Promise<void> { return this.db.kvDelete(key); }
  async kvJson<T>(key: string): Promise<T | null> {
    const v = await this.kvGet(key);
    if (v === null) return null;
    try { return JSON.parse(v) as T; } catch { return null; }
  }

  /** Remove all user data on this device (entities, queue, cursors). Settings-level `kv` entries named in `keep` survive. */
  async wipe(keep: string[] = []): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.clearEntities();
      await tx.clearOutbox();
      await tx.clearConflicts();
      await tx.kvClear(keep);
    });
  }
}
