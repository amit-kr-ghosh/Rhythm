/**
 * Storage abstraction used by the Repo. Two real implementations exist:
 *   - SqliteBackend  (sqliteBackend.ts): expo-sqlite on Android / iOS (also Node's SQLite in tests)
 *   - MemoryBackend  (memoryBackend.ts) + IndexedDB persistence (idb.ts): the web build
 * Both implement identical semantics, which tests/backend-parity.test.ts asserts.
 */
import type { EntityKind } from '../domain/types';

export type EntityRow = { kind: EntityKind; id: string; date: string | null; updatedAt: string; deletedAt: string | null; json: string };

export type OutboxRow = {
  id: string; kind: EntityKind; entityId: string; op: string; payload: string | null; createdAt: number;
  attempts: number; lastError: string | null; nextAttemptAt: number; status: string;
};

export type ConflictRow = { kind: string; entityId: string; at: string; winner: string; loser: string };

/** Operations available both inside and outside a transaction. */
export interface StorageTx {
  getEntity(kind: EntityKind, id: string): Promise<EntityRow | undefined>;
  listEntities(kind: EntityKind, includeDeleted: boolean): Promise<string[]>;
  listEntitiesBetween(kind: EntityKind, from: string, to: string): Promise<string[]>;
  putEntity(row: EntityRow): Promise<void>;
  /** Deletes every row of `kind` whose updatedAt equals `updatedAt`; resolves with how many were removed. */
  purgeEntitiesByUpdatedAt(kind: EntityKind, updatedAt: string): Promise<number>;
  clearEntities(): Promise<void>;

  getOutboxByEntity(kind: EntityKind, entityId: string): Promise<OutboxRow | undefined>;
  /** Insert, or — when (kind, entityId) exists — replace op/payload and reset retry state, keeping the original id/createdAt. */
  upsertOutbox(row: OutboxRow): Promise<void>;
  listOutbox(): Promise<OutboxRow[]>;
  deleteOutboxByEntity(kind: EntityKind, entityId: string): Promise<void>;
  /** Delete only if id, createdAt and payload still match (the entity wasn't edited while in flight). */
  deleteOutboxIfUnchanged(id: string, createdAt: number, payload: string | null): Promise<void>;
  updateOutboxFailure(id: string, payload: string | null, f: { attempts: number; lastError: string | null; nextAttemptAt: number; status: string }): Promise<void>;
  resetFailedOutbox(): Promise<void>;
  clearOutbox(): Promise<void>;

  addConflict(row: ConflictRow, keepNewest: number): Promise<void>;
  listConflicts(limit: number): Promise<ConflictRow[]>;
  clearConflicts(): Promise<void>;

  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string): Promise<void>;
  kvDelete(key: string): Promise<void>;
  /** Delete every key except `schema_version` and those listed in `keep`. */
  kvClear(keep: string[]): Promise<void>;
}

export interface Backend extends StorageTx {
  init(): Promise<void>;
  /** Atomic: all writes commit together or none do. */
  transaction<T>(fn: (tx: StorageTx) => Promise<T>): Promise<T>;
  /** False when data lives only in memory (e.g. the browser blocked IndexedDB). */
  readonly persistent: boolean;
  /** Web only: called when another tab changed the database. Returns an unsubscribe function. */
  onExternalChange?(cb: () => void): () => void;
}

export const SCHEMA_VERSION = '1';
