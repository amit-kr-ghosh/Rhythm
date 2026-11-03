import type { EntityKind } from './types';

/* ---------------- Outbox (offline change queue) ---------------- */

export type OutboxStatus = 'pending' | 'failed';
export type OutboxOp = {
  id: string;
  kind: EntityKind;
  entityId: string;
  op: 'upsert' | 'delete';
  payload: Record<string, unknown> | null;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: number;
  status: OutboxStatus;
};

/** One pending op per entity: a newer edit replaces an older unsent one (the latest payload carries every field). */
export function coalesce(queue: OutboxOp[], incoming: OutboxOp): OutboxOp[] {
  const rest = queue.filter((o) => !(o.kind === incoming.kind && o.entityId === incoming.entityId));
  return [...rest, { ...incoming, createdAt: queue.find((o) => o.kind === incoming.kind && o.entityId === incoming.entityId)?.createdAt ?? incoming.createdAt }];
}

export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 30 * 60_000;
export const MAX_AUTO_ATTEMPTS = 8;

/** Exponential backoff with an optional jitter in [0,1). */
export function backoffMs(attempts: number, jitter = 0): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (1 + 0.25 * jitter));
}

export type FailureClass = 'retry' | 'permanent';
/** Network problems, 408/425/429 and 5xx are retried; other 4xx (validation, RLS, auth) are permanent and surfaced to the user. */
export function classifyFailure(err: { status?: number; code?: string; message?: string } | null | undefined): FailureClass {
  if (!err) return 'retry';
  const st = err.status;
  if (typeof st === 'number') {
    if (st === 408 || st === 425 || st === 429 || st >= 500) return 'retry';
    if (st === 401) return 'retry'; // session may refresh; the engine re-auths and retries
    return 'permanent';
  }
  if (typeof err.code === 'string' && /^(PGRST30|08|53|57)/.test(err.code)) return 'retry';
  if (typeof err.code === 'string' && /^(23|42|22)/.test(err.code)) return 'permanent'; // constraint, RLS/permission, data errors
  const m = (err.message ?? '').toLowerCase();
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout') || m.includes('offline')) return 'retry';
  return 'retry';
}

export function markFailure(op: OutboxOp, err: { status?: number; code?: string; message?: string }, now: number, jitter = 0): OutboxOp {
  const attempts = op.attempts + 1;
  const cls = classifyFailure(err);
  const exhausted = attempts >= MAX_AUTO_ATTEMPTS;
  return {
    ...op, attempts, lastError: err.message ?? String(err.code ?? 'error'),
    status: cls === 'permanent' || exhausted ? 'failed' : 'pending',
    nextAttemptAt: now + backoffMs(attempts, jitter),
  };
}

export const dueOps = (queue: OutboxOp[], now: number, limit = 50): OutboxOp[] =>
  queue.filter((o) => o.status === 'pending' && o.nextAttemptAt <= now).sort((a, b) => a.createdAt - b.createdAt).slice(0, limit);

/** Operations are replayed in an order that respects foreign keys: parents before children on upsert. */
const KIND_ORDER: EntityKind[] = ['subjects', 'plans', 'templates', 'exceptions', 'goals', 'tasks', 'habits', 'sessions', 'logs', 'habitRecords', 'savedQuotes', 'affirmations', 'preferences', 'notificationSettings'];
export function orderForPush(ops: OutboxOp[]): OutboxOp[] {
  const rank = (k: EntityKind) => KIND_ORDER.indexOf(k);
  return [...ops].sort((a, b) => (a.op === b.op ? rank(a.kind) - rank(b.kind) : a.op === 'delete' ? 1 : -1) || a.createdAt - b.createdAt);
}

/* ---------------- Foreign-key dependencies ---------------- */

export type ParentRef = {
  /** Field on the child entity (camelCase). */
  field: string;
  /** Kind of the parent row it points at. */
  kind: EntityKind;
  /** True when the cloud column is nullable (the server uses `on delete set null`), so a dangling id may be cleared. */
  nullable: boolean;
  /** Referenced id. */
  id: string;
};

/**
 * Cloud foreign keys (see supabase/migrations/0001_schema.sql). Every child row must reach the server AFTER the rows
 * it points at, otherwise Postgres rejects it with 23503 "violates foreign key constraint".
 */
const FK_FIELDS: Partial<Record<EntityKind, { field: string; kind: EntityKind; nullable: boolean }[]>> = {
  templates: [{ field: 'planId', kind: 'plans', nullable: true }, { field: 'subjectId', kind: 'subjects', nullable: true }],
  exceptions: [{ field: 'templateId', kind: 'templates', nullable: false }, { field: 'subjectId', kind: 'subjects', nullable: true }],
  goals: [{ field: 'subjectId', kind: 'subjects', nullable: true }],
  tasks: [{ field: 'subjectId', kind: 'subjects', nullable: true }, { field: 'goalId', kind: 'goals', nullable: true }],
  sessions: [{ field: 'subjectId', kind: 'subjects', nullable: true }, { field: 'taskId', kind: 'tasks', nullable: true }],
  habitRecords: [{ field: 'habitId', kind: 'habits', nullable: false }],
};

/** The parent rows an entity points at (only set, non-empty references). */
export function parentRefs(kind: EntityKind, entity: Record<string, unknown> | null | undefined): ParentRef[] {
  const out: ParentRef[] = [];
  for (const f of FK_FIELDS[kind] ?? []) {
    const v = entity?.[f.field];
    if (typeof v === 'string' && v) out.push({ ...f, id: v });
  }
  return out;
}

/** Postgres foreign_key_violation. */
export const isForeignKeyError = (err: { code?: string; message?: string } | null | undefined): boolean =>
  err?.code === '23503' || /violates foreign key constraint/i.test(err?.message ?? '');

/* ---------------- Conflict resolution ---------------- */

export type Versioned = { id: string; updatedAt: string; deletedAt: string | null };
export type Resolution<T extends Versioned> = {
  winner: T; takeRemote: boolean;
  /** The losing version — kept in the local conflict log so nothing is silently discarded. */
  loser: T | null;
};

/**
 * Last-writer-wins on `updatedAt`. Ties favour the local copy (the user's device is the author of record).
 * A tombstone is just a version with deletedAt set, so "edit after delete" resurrects and "delete after edit" deletes.
 */
export function resolveConflict<T extends Versioned>(local: T, remote: T): Resolution<T> {
  const l = Date.parse(local.updatedAt), r = Date.parse(remote.updatedAt);
  if (r > l) return { winner: remote, takeRemote: true, loser: sameContent(local, remote) ? null : local };
  return { winner: local, takeRemote: false, loser: sameContent(local, remote) ? null : remote };
}
const sameContent = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

export type MergeOutcome<T extends Versioned> =
  | { action: 'insert'; value: T; conflict: null }
  | { action: 'replace'; value: T; conflict: { winner: T; loser: T } | null }
  | { action: 'keep-local'; value: T; conflict: { winner: T; loser: T } | null }
  | { action: 'noop'; value: T; conflict: null };

/**
 * Merge one remote row into local state.
 * - Unknown locally → insert.
 * - Local has an unsent change → conflict rules decide; the local change is kept unless remote is strictly newer.
 * - No unsent change → remote wins when it is at least as new.
 */
export function mergeRemote<T extends Versioned>(local: T | undefined, remote: T, hasPendingLocalOp: boolean): MergeOutcome<T> {
  if (!local) return { action: 'insert', value: remote, conflict: null };
  if (hasPendingLocalOp) {
    const res = resolveConflict(local, remote);
    if (res.takeRemote) return { action: 'replace', value: remote, conflict: res.loser ? { winner: remote, loser: local } : null };
    return { action: 'keep-local', value: local, conflict: res.loser ? { winner: local, loser: remote } : null };
  }
  if (Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt)) return sameContent(local, remote) ? { action: 'noop', value: local, conflict: null } : { action: 'replace', value: remote, conflict: null };
  return { action: 'keep-local', value: local, conflict: null };
}

/* ---------------- Cloud row mapping ---------------- */

export const CLOUD_TABLE: Record<EntityKind, string> = {
  subjects: 'subjects', plans: 'timetable_templates', templates: 'activity_templates', exceptions: 'schedule_exceptions',
  logs: 'activity_logs', sessions: 'study_sessions', tasks: 'tasks', goals: 'goals', habits: 'habits',
  habitRecords: 'habit_records', savedQuotes: 'saved_quotes', affirmations: 'affirmations',
  preferences: 'user_preferences', notificationSettings: 'notification_settings',
};
/** Single-row-per-user tables use user_id as the primary key instead of an id column. */
export const SINGLETON_KINDS: EntityKind[] = ['preferences', 'notificationSettings'];

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export function toCloudRow(kind: EntityKind, entity: Record<string, unknown>, userId: string): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entity)) {
    if (k === 'id' && SINGLETON_KINDS.includes(kind)) continue;
    row[snake(k)] = v === undefined ? null : v;
  }
  row.user_id = userId;
  return row;
}

export function fromCloudRow<T>(kind: EntityKind, row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'user_id') continue;
    out[camel(k)] = v;
  }
  if (SINGLETON_KINDS.includes(kind)) out.id = kind;
  return out as T;
}

export const cloudConflictTarget = (kind: EntityKind): string => (SINGLETON_KINDS.includes(kind) ? 'user_id' : 'user_id,id');
export const columnNames = (entityKeys: string[], kind: EntityKind): string[] =>
  [...entityKeys.filter((k) => !(k === 'id' && SINGLETON_KINDS.includes(kind))).map(snake), 'user_id'];
