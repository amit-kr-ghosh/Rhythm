import type { EntityKind } from '../domain/types';
import type { SqlDriver, SqlRunner } from './driver';
import { SCHEMA_VERSION, type Backend, type ConflictRow, type EntityRow, type OutboxRow, type StorageTx } from './backend';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entities (
  kind       TEXT NOT NULL,
  id         TEXT NOT NULL,
  date       TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  json       TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS entities_kind_date ON entities (kind, date);
CREATE INDEX IF NOT EXISTS entities_kind_deleted ON entities (kind, deleted_at);
CREATE TABLE IF NOT EXISTS outbox (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  op              TEXT NOT NULL,
  payload         TEXT,
  created_at      INTEGER NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
);
CREATE UNIQUE INDEX IF NOT EXISTS outbox_entity ON outbox (kind, entity_id);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conflicts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  kind      TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  at        TEXT NOT NULL,
  winner    TEXT NOT NULL,
  loser     TEXT NOT NULL
);
`;

type RawOut = {
  id: string; kind: string; entity_id: string; op: string; payload: string | null; created_at: number;
  attempts: number; last_error: string | null; next_attempt_at: number; status: string;
};
type RawEntity = { kind: string; id: string; date: string | null; updated_at: string; deleted_at: string | null; json: string };

const toOut = (r: RawOut): OutboxRow => ({
  id: r.id, kind: r.kind as EntityKind, entityId: r.entity_id, op: r.op, payload: r.payload, createdAt: r.created_at,
  attempts: r.attempts, lastError: r.last_error, nextAttemptAt: r.next_attempt_at, status: r.status,
});

/** All StorageTx operations expressed as SQL over a runner (the driver itself, or a transaction handle). */
function sqlOps(db: SqlRunner): StorageTx {
  return {
    async getEntity(kind, id) {
      const r = (await db.all<RawEntity>('SELECT kind, id, date, updated_at, deleted_at, json FROM entities WHERE kind = ? AND id = ?', [kind, id]))[0];
      return r ? ({ kind: r.kind, id: r.id, date: r.date, updatedAt: r.updated_at, deletedAt: r.deleted_at, json: r.json } as EntityRow) : undefined;
    },
    async listEntities(kind, includeDeleted) {
      const sql = includeDeleted ? 'SELECT json FROM entities WHERE kind = ?' : 'SELECT json FROM entities WHERE kind = ? AND deleted_at IS NULL';
      return (await db.all<{ json: string }>(sql, [kind])).map((r) => r.json);
    },
    async listEntitiesBetween(kind, from, to) {
      return (await db.all<{ json: string }>(
        'SELECT json FROM entities WHERE kind = ? AND deleted_at IS NULL AND date >= ? AND date <= ?', [kind, from, to])).map((r) => r.json);
    },
    async putEntity(e) {
      await db.run(
        `INSERT INTO entities (kind, id, date, updated_at, deleted_at, json) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (kind, id) DO UPDATE SET date = excluded.date, updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at, json = excluded.json`,
        [e.kind, e.id, e.date, e.updatedAt, e.deletedAt, e.json]);
    },
    async purgeEntitiesByUpdatedAt(kind, updatedAt) {
      const n = (await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM entities WHERE kind = ? AND updated_at = ?', [kind, updatedAt]))[0]?.n ?? 0;
      await db.run('DELETE FROM entities WHERE kind = ? AND updated_at = ?', [kind, updatedAt]);
      return n;
    },
    async clearEntities() { await db.run('DELETE FROM entities'); },

    async getOutboxByEntity(kind, entityId) {
      const r = (await db.all<RawOut>('SELECT * FROM outbox WHERE kind = ? AND entity_id = ?', [kind, entityId]))[0];
      return r ? toOut(r) : undefined;
    },
    async upsertOutbox(o) {
      await db.run(
        `INSERT INTO outbox (id, kind, entity_id, op, payload, created_at, attempts, last_error, next_attempt_at, status)
         VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 0, 'pending')
         ON CONFLICT (kind, entity_id) DO UPDATE SET op = excluded.op, payload = excluded.payload, attempts = 0,
           last_error = NULL, next_attempt_at = 0, status = 'pending'`,
        [o.id, o.kind, o.entityId, o.op, o.payload, o.createdAt]);
    },
    async listOutbox() { return (await db.all<RawOut>('SELECT * FROM outbox ORDER BY created_at ASC')).map(toOut); },
    async deleteOutboxByEntity(kind, entityId) { await db.run('DELETE FROM outbox WHERE kind = ? AND entity_id = ?', [kind, entityId]); },
    async deleteOutboxIfUnchanged(id, createdAt, payload) {
      await db.run('DELETE FROM outbox WHERE id = ? AND created_at = ? AND payload IS ?', [id, createdAt, payload]);
    },
    async updateOutboxFailure(id, payload, f) {
      await db.run('UPDATE outbox SET attempts = ?, last_error = ?, next_attempt_at = ?, status = ? WHERE id = ? AND payload IS ?',
        [f.attempts, f.lastError, f.nextAttemptAt, f.status, id, payload]);
    },
    async resetFailedOutbox() {
      await db.run(`UPDATE outbox SET status = 'pending', attempts = 0, next_attempt_at = 0, last_error = NULL WHERE status = 'failed'`);
    },
    async clearOutbox() { await db.run('DELETE FROM outbox'); },

    async addConflict(c: ConflictRow, keepNewest) {
      await db.run('INSERT INTO conflicts (kind, entity_id, at, winner, loser) VALUES (?, ?, ?, ?, ?)', [c.kind, c.entityId, c.at, c.winner, c.loser]);
      await db.run('DELETE FROM conflicts WHERE id NOT IN (SELECT id FROM conflicts ORDER BY id DESC LIMIT ?)', [keepNewest]);
    },
    async listConflicts(limit) {
      const rows = await db.all<{ kind: string; entity_id: string; at: string; winner: string; loser: string }>(
        'SELECT kind, entity_id, at, winner, loser FROM conflicts ORDER BY id DESC LIMIT ?', [limit]);
      return rows.map((r) => ({ kind: r.kind, entityId: r.entity_id, at: r.at, winner: r.winner, loser: r.loser }));
    },
    async clearConflicts() { await db.run('DELETE FROM conflicts'); },

    async kvGet(key) { return (await db.all<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]))[0]?.value ?? null; },
    async kvSet(key, value) { await db.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value]); },
    async kvDelete(key) { await db.run('DELETE FROM kv WHERE key = ?', [key]); },
    async kvClear(keep) {
      if (keep.length === 0) await db.run(`DELETE FROM kv WHERE key != 'schema_version'`);
      else await db.run(`DELETE FROM kv WHERE key != 'schema_version' AND key NOT IN (${keep.map(() => '?').join(',')})`, keep);
    },
  };
}

export class SqliteBackend implements Backend {
  readonly persistent = true;
  private readonly ops: StorageTx;
  constructor(private readonly db: SqlDriver) { this.ops = sqlOps(db); }

  async init(): Promise<void> {
    await this.db.exec(SCHEMA);
    await this.db.run(`INSERT OR IGNORE INTO kv (key, value) VALUES ('schema_version', ?)`, [SCHEMA_VERSION]);
  }
  transaction<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T> { return this.db.transaction((runner) => fn(sqlOps(runner))); }

  getEntity: StorageTx['getEntity'] = (...a) => this.ops.getEntity(...a);
  listEntities: StorageTx['listEntities'] = (...a) => this.ops.listEntities(...a);
  listEntitiesBetween: StorageTx['listEntitiesBetween'] = (...a) => this.ops.listEntitiesBetween(...a);
  putEntity: StorageTx['putEntity'] = (...a) => this.ops.putEntity(...a);
  purgeEntitiesByUpdatedAt: StorageTx['purgeEntitiesByUpdatedAt'] = (...a) => this.transaction((t) => t.purgeEntitiesByUpdatedAt(...a));
  clearEntities: StorageTx['clearEntities'] = () => this.ops.clearEntities();
  getOutboxByEntity: StorageTx['getOutboxByEntity'] = (...a) => this.ops.getOutboxByEntity(...a);
  upsertOutbox: StorageTx['upsertOutbox'] = (...a) => this.ops.upsertOutbox(...a);
  listOutbox: StorageTx['listOutbox'] = () => this.ops.listOutbox();
  deleteOutboxByEntity: StorageTx['deleteOutboxByEntity'] = (...a) => this.ops.deleteOutboxByEntity(...a);
  deleteOutboxIfUnchanged: StorageTx['deleteOutboxIfUnchanged'] = (...a) => this.ops.deleteOutboxIfUnchanged(...a);
  updateOutboxFailure: StorageTx['updateOutboxFailure'] = (...a) => this.ops.updateOutboxFailure(...a);
  resetFailedOutbox: StorageTx['resetFailedOutbox'] = () => this.ops.resetFailedOutbox();
  clearOutbox: StorageTx['clearOutbox'] = () => this.ops.clearOutbox();
  addConflict: StorageTx['addConflict'] = (...a) => this.transaction((t) => t.addConflict(...a));
  listConflicts: StorageTx['listConflicts'] = (...a) => this.ops.listConflicts(...a);
  clearConflicts: StorageTx['clearConflicts'] = () => this.ops.clearConflicts();
  kvGet: StorageTx['kvGet'] = (...a) => this.ops.kvGet(...a);
  kvSet: StorageTx['kvSet'] = (...a) => this.ops.kvSet(...a);
  kvDelete: StorageTx['kvDelete'] = (...a) => this.ops.kvDelete(...a);
  kvClear: StorageTx['kvClear'] = (...a) => this.ops.kvClear(...a);
}
