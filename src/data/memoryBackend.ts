import { SCHEMA_VERSION, type Backend, type ConflictRow, type EntityRow, type OutboxRow, type StorageTx } from './backend';

/**
 * In-memory tables with an optional durable store behind them (IndexedDB on the web — see idb.ts).
 *
 * Reads are served from memory. Every transaction records the keys it changed and, on commit, hands that
 * change list to `Persistence.commit()` which must apply it atomically (one IndexedDB transaction). If persisting
 * fails, the in-memory changes are rolled back and the error propagates — memory and disk never disagree.
 */
export type TableName = 'entities' | 'outbox' | 'conflicts' | 'kv';
export type Change = { table: TableName; key: string; value?: unknown };
export type Snapshot = { entities: [string, EntityRow][]; outbox: [string, OutboxRow][]; conflicts: [string, ConflictRow & { n: number }][]; kv: [string, string][] };

export interface Persistence {
  load(): Promise<Snapshot>;
  commit(changes: Change[]): Promise<void>;
  /** Notify when ANOTHER tab/window committed changes. */
  subscribe?(onExternalChange: () => void): () => void;
  /** Tell other tabs this one committed. */
  announce?(): void;
}

type Tables = { entities: Map<string, EntityRow>; outbox: Map<string, OutboxRow>; conflicts: Map<string, ConflictRow & { n: number }>; kv: Map<string, string> };
const ek = (kind: string, id: string) => `${kind}\u0000${id}`;

export class MemoryBackend implements Backend {
  persistent: boolean;
  private t: Tables = emptyTables();
  private nextConflict = 1;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly store: Persistence | null = null) { this.persistent = store !== null; }

  async init(): Promise<void> {
    if (this.store) await this.reload();
    if (!this.t.kv.has('schema_version')) await this.kvSet('schema_version', SCHEMA_VERSION);
    this.unsubscribe?.();
    this.unsubscribe = this.store?.subscribe?.(() => { void this.enqueue(async () => { await this.reload(); }).then(() => this.listeners.forEach((l) => l())); }) ?? null;
  }

  onExternalChange(cb: () => void): () => void { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }

  /** Replace memory with what is on disk (used at start-up and when another tab wrote). */
  private async reload(): Promise<void> {
    if (!this.store) return;
    const snap = await this.store.load();
    this.t = {
      entities: new Map(snap.entities), outbox: new Map(snap.outbox), conflicts: new Map(snap.conflicts), kv: new Map(snap.kv),
    };
    this.nextConflict = Math.max(0, ...[...this.t.conflicts.values()].map((c) => c.n)) + 1;
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.tail.then(job, job);
    this.tail = next.then(() => undefined, () => undefined);
    return next;
  }

  /* ---- transactions ---- */

  async transaction<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const changes = new Map<string, Change>();
      const undo: (() => void)[] = [];
      const savedNext = this.nextConflict;
      const rollback = () => { for (let i = undo.length - 1; i >= 0; i--) (undo[i] as () => void)(); this.nextConflict = savedNext; };
      const ops = this.ops(changes, undo);
      let out: T;
      try { out = await fn(ops); } catch (e) { rollback(); throw e; }
      if (changes.size > 0 && this.store) {
        try { await this.store.commit([...changes.values()]); } catch (e) { rollback(); throw e; }
        this.store.announce?.();
      }
      return out;
    });
  }

  /** Mutation primitives that log an inverse (for rollback) and the change (for persistence). */
  private ops(changes: Map<string, Change>, undo: (() => void)[]): StorageTx {
    const t = this.t;
    const put = <V>(table: TableName, map: Map<string, V>, key: string, value: V) => {
      const had = map.has(key); const prev = map.get(key);
      map.set(key, value);
      changes.set(`${table}\u0001${key}`, { table, key, value });
      undo.push(() => { if (had) map.set(key, prev as V); else map.delete(key); });
    };
    const del = <V>(table: TableName, map: Map<string, V>, key: string) => {
      if (!map.has(key)) return;
      const prev = map.get(key) as V;
      map.delete(key);
      changes.set(`${table}\u0001${key}`, { table, key });
      undo.push(() => { map.set(key, prev); });
    };
    return {
      getEntity: async (kind, id) => t.entities.get(ek(kind, id)),
      listEntities: async (kind, includeDeleted) => [...t.entities.values()].filter((e) => e.kind === kind && (includeDeleted || e.deletedAt === null)).map((e) => e.json),
      listEntitiesBetween: async (kind, from, to) =>
        [...t.entities.values()].filter((e) => e.kind === kind && e.deletedAt === null && e.date !== null && e.date >= from && e.date <= to).map((e) => e.json),
      putEntity: async (row) => { put('entities', t.entities, ek(row.kind, row.id), row); },
      purgeEntitiesByUpdatedAt: async (kind, at) => {
        const hit = [...t.entities.entries()].filter(([, e]) => e.kind === kind && e.updatedAt === at);
        for (const [k] of hit) del('entities', t.entities, k);
        return hit.length;
      },
      clearEntities: async () => { for (const k of [...t.entities.keys()]) del('entities', t.entities, k); },

      getOutboxByEntity: async (kind, entityId) => t.outbox.get(ek(kind, entityId)),
      upsertOutbox: async (row) => {
        const cur = t.outbox.get(ek(row.kind, row.entityId));
        const next: OutboxRow = cur
          ? { ...cur, op: row.op, payload: row.payload, attempts: 0, lastError: null, nextAttemptAt: 0, status: 'pending' }
          : { ...row, attempts: 0, lastError: null, nextAttemptAt: 0, status: 'pending' };
        put('outbox', t.outbox, ek(row.kind, row.entityId), next);
      },
      listOutbox: async () => [...t.outbox.values()].sort((a, b) => a.createdAt - b.createdAt),
      deleteOutboxByEntity: async (kind, entityId) => { del('outbox', t.outbox, ek(kind, entityId)); },
      deleteOutboxIfUnchanged: async (id, createdAt, payload) => {
        for (const [k, o] of t.outbox) if (o.id === id && o.createdAt === createdAt && o.payload === payload) del('outbox', t.outbox, k);
      },
      updateOutboxFailure: async (id, payload, f) => {
        for (const [k, o] of t.outbox) if (o.id === id && o.payload === payload) put('outbox', t.outbox, k, { ...o, ...f });
      },
      resetFailedOutbox: async () => {
        for (const [k, o] of t.outbox) if (o.status === 'failed') put('outbox', t.outbox, k, { ...o, status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null });
      },
      clearOutbox: async () => { for (const k of [...t.outbox.keys()]) del('outbox', t.outbox, k); },

      addConflict: async (c, keepNewest) => {
        const n = this.nextConflict++;
        put('conflicts', t.conflicts, String(n).padStart(12, '0'), { ...c, n });
        const keys = [...t.conflicts.keys()].sort();
        for (const k of keys.slice(0, Math.max(0, keys.length - keepNewest))) del('conflicts', t.conflicts, k);
      },
      listConflicts: async (limit) => [...t.conflicts.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, limit)
        .map(([, c]) => ({ kind: c.kind, entityId: c.entityId, at: c.at, winner: c.winner, loser: c.loser })),
      clearConflicts: async () => { for (const k of [...t.conflicts.keys()]) del('conflicts', t.conflicts, k); },

      kvGet: async (key) => t.kv.get(key) ?? null,
      kvSet: async (key, value) => { put('kv', t.kv, key, value); },
      kvDelete: async (key) => { del('kv', t.kv, key); },
      kvClear: async (keep) => { for (const k of [...t.kv.keys()]) if (k !== 'schema_version' && !keep.includes(k)) del('kv', t.kv, k); },
    };
  }

  /* ---- autocommit wrappers: each call is its own transaction (reads take the same queue so they never see a half-done one) ---- */
  private one<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T> { return this.transaction(fn); }

  getEntity: StorageTx['getEntity'] = (...a) => this.one((t) => t.getEntity(...a));
  listEntities: StorageTx['listEntities'] = (...a) => this.one((t) => t.listEntities(...a));
  listEntitiesBetween: StorageTx['listEntitiesBetween'] = (...a) => this.one((t) => t.listEntitiesBetween(...a));
  putEntity: StorageTx['putEntity'] = (...a) => this.one((t) => t.putEntity(...a));
  purgeEntitiesByUpdatedAt: StorageTx['purgeEntitiesByUpdatedAt'] = (...a) => this.one((t) => t.purgeEntitiesByUpdatedAt(...a));
  clearEntities: StorageTx['clearEntities'] = () => this.one((t) => t.clearEntities());
  getOutboxByEntity: StorageTx['getOutboxByEntity'] = (...a) => this.one((t) => t.getOutboxByEntity(...a));
  upsertOutbox: StorageTx['upsertOutbox'] = (...a) => this.one((t) => t.upsertOutbox(...a));
  listOutbox: StorageTx['listOutbox'] = () => this.one((t) => t.listOutbox());
  deleteOutboxByEntity: StorageTx['deleteOutboxByEntity'] = (...a) => this.one((t) => t.deleteOutboxByEntity(...a));
  deleteOutboxIfUnchanged: StorageTx['deleteOutboxIfUnchanged'] = (...a) => this.one((t) => t.deleteOutboxIfUnchanged(...a));
  updateOutboxFailure: StorageTx['updateOutboxFailure'] = (...a) => this.one((t) => t.updateOutboxFailure(...a));
  resetFailedOutbox: StorageTx['resetFailedOutbox'] = () => this.one((t) => t.resetFailedOutbox());
  clearOutbox: StorageTx['clearOutbox'] = () => this.one((t) => t.clearOutbox());
  addConflict: StorageTx['addConflict'] = (...a) => this.one((t) => t.addConflict(...a));
  listConflicts: StorageTx['listConflicts'] = (...a) => this.one((t) => t.listConflicts(...a));
  clearConflicts: StorageTx['clearConflicts'] = () => this.one((t) => t.clearConflicts());
  kvGet: StorageTx['kvGet'] = (...a) => this.one((t) => t.kvGet(...a));
  kvSet: StorageTx['kvSet'] = (...a) => this.one((t) => t.kvSet(...a));
  kvDelete: StorageTx['kvDelete'] = (...a) => this.one((t) => t.kvDelete(...a));
  kvClear: StorageTx['kvClear'] = (...a) => this.one((t) => t.kvClear(...a));
}

function emptyTables(): Tables { return { entities: new Map(), outbox: new Map(), conflicts: new Map(), kv: new Map() }; }
