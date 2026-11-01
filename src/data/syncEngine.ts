import {
  CLOUD_TABLE, SINGLETON_KINDS, cloudConflictTarget, dueOps, fromCloudRow, markFailure, orderForPush, toCloudRow,
  type OutboxOp,
} from '../domain/sync';
import { ENTITY_KINDS, type EntityKind, type EntityMap } from '../domain/types';
import type { Repo } from './repo';

export type CloudError = { status?: number; code?: string; message?: string };

/** What the sync engine needs from the cloud. Implemented over supabase-js in services/cloud.ts; faked in tests. */
export interface CloudClient {
  userId(): string | null;
  /**
   * Idempotent upsert keyed by (user_id, id) — or user_id for singleton tables. Throws a CloudError.
   * Resolves with the `id`s the server actually applied (rows its stale-write guard ignored are absent; for
   * singleton tables resolve with ['applied'] or []). Resolving void means "unknown — assume applied".
   */
  upsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<string[] | void>;
  /** Rows whose server_updated_at >= cursor, oldest first. Throws a CloudError. */
  fetchChanged(table: string, cursor: string | null, limit: number): Promise<Record<string, unknown>[]>;
  /** Try to refresh an expired session. Resolves true when a new session is available. */
  refreshSession?(): Promise<boolean>;
}

export type SyncState = 'signed_out' | 'idle' | 'syncing' | 'offline' | 'error';
export type SyncStatus = {
  state: SyncState; pending: number; failed: number; lastSyncAt: number | null; lastError: string | null;
};

export type SyncDeps = {
  now?: () => number;
  random?: () => number;
  isOnline?: () => boolean | Promise<boolean>;
  /** Called after remote data changed local rows, with the kinds that changed. */
  onRemoteChange?: (kinds: EntityKind[]) => void;
  onStatus?: (s: SyncStatus) => void;
};

const BATCH = 100;
const PAGE = 500;
const TS_FIELD = /At$/;
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T/;

/** Postgres returns "2026-10-28T11:00:00+00:00"; the app stores "…Z" with milliseconds. Normalise so equal rows compare equal. */
export function normalizeRemote<T>(entity: T): T {
  const out: Record<string, unknown> = { ...(entity as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && TS_FIELD.test(k) && ISO_LIKE.test(v)) out[k] = new Date(v).toISOString();
  }
  return out as T;
}

export class SyncEngine {
  private running: Promise<SyncStatus> | null = null;
  private rerun = false;
  private status: SyncStatus = { state: 'signed_out', pending: 0, failed: 0, lastSyncAt: null, lastError: null };
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly repo: Repo, private readonly cloud: CloudClient, private readonly deps: SyncDeps = {}) {
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
  }

  getStatus(): SyncStatus { return this.status; }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    this.deps.onStatus?.(this.status);
  }

  async refreshCounts(): Promise<SyncStatus> {
    const c = await this.repo.outboxCounts();
    const signedIn = this.cloud.userId() !== null;
    this.setStatus({
      ...c,
      state: !signedIn ? 'signed_out' : this.status.state === 'syncing' ? 'syncing' : c.failed > 0 ? 'error' : this.status.state === 'offline' ? 'offline' : 'idle',
    });
    return this.status;
  }

  /**
   * Link this device's data to an account. First connection uploads all local data. Connecting a DIFFERENT account
   * than the one this device last synced with never discards anything silently: the caller must choose.
   */
  async connect(userId: string, decision?: 'merge' | 'replace'): Promise<'connected' | 'needs_decision'> {
    const prev = await this.repo.kvGet('cloudUserId');
    if (prev === userId) return 'connected';
    if (prev !== null && !decision) {
      const counts = await this.repo.outboxCounts();
      const hasLocal = (await this.repo.all('sessions')).length > 0 || counts.pending + counts.failed > 0;
      if (hasLocal) return 'needs_decision';
    }
    if (decision === 'replace') {
      const counts = await this.repo.outboxCounts();
      if (counts.pending + counts.failed > 0) throw new Error('Unsynced changes exist. Sync them or export your data before replacing.');
      await this.repo.wipe(['theme']);
    }
    for (const k of ENTITY_KINDS) await this.repo.kvDelete(`cursor:${k}`);
    await this.repo.kvSet('cloudUserId', userId);
    if (decision !== 'replace') await this.repo.enqueueAll();
    return 'connected';
  }

  /** Push queued changes, then pull remote changes. Safe to call at any time; overlapping calls are coalesced. */
  syncNow(): Promise<SyncStatus> {
    if (this.running) { this.rerun = true; return this.running; }
    const run = (async () => {
      try {
        let out = await this.cycle();
        while (this.rerun) { this.rerun = false; out = await this.cycle(); }
        return out;
      } finally { this.running = null; }
    })();
    this.running = run;
    return run;
  }

  private async cycle(): Promise<SyncStatus> {
    const uid = this.cloud.userId();
    if (!uid) { await this.refreshCounts(); return this.status; }
    if (this.deps.isOnline && !(await this.deps.isOnline())) {
      const c = await this.repo.outboxCounts();
      this.setStatus({ ...c, state: 'offline' });
      return this.status;
    }
    this.setStatus({ state: 'syncing' });
    try {
      const pushOk = await this.push(uid);
      if (pushOk) await this.pull();
      const c = await this.repo.outboxCounts();
      this.setStatus({
        ...c,
        state: !pushOk ? 'offline' : c.failed > 0 ? 'error' : 'idle',
        lastSyncAt: pushOk ? this.now() : this.status.lastSyncAt,
        lastError: c.failed > 0 ? this.status.lastError : null,
      });
    } catch (e) {
      const c = await this.repo.outboxCounts();
      this.setStatus({ ...c, state: 'error', lastError: errMessage(e) });
    }
    return this.status;
  }

  /** Returns false if the network/server is unreachable (remaining ops stay queued untouched). */
  private async push(uid: string): Promise<boolean> {
    const queue = await this.repo.outbox();
    const due = orderForPush(dueOps(queue, this.now(), 1000));
    let i = 0;
    while (i < due.length) {
      const first = due[i] as OutboxOp;
      const group: OutboxOp[] = [];
      while (i < due.length && group.length < BATCH && (due[i] as OutboxOp).kind === first.kind) group.push(due[i++] as OutboxOp);
      const reachable = await this.pushGroup(uid, first.kind, group);
      if (!reachable) return false;
    }
    return true;
  }

  private async pushGroup(uid: string, kind: EntityKind, ops: OutboxOp[]): Promise<boolean> {
    const table = CLOUD_TABLE[kind];
    const target = cloudConflictTarget(kind);
    const rows = ops.map((o) => toCloudRow(kind, (o.payload ?? {}) as Record<string, unknown>, uid));
    try {
      const applied = await this.sendWithAuthRetry(table, rows, target);
      for (const o of ops) {
        // The server ignores writes older than what it holds. Keep our version in the conflict log so the user's
        // edit is never silently discarded (the next pull then brings the newer remote version in).
        const ignored = Array.isArray(applied) && (isSingleton(kind) ? applied.length === 0 : !applied.includes(o.entityId));
        if (ignored) await this.repo.logConflict(kind, o.entityId, new Date(this.now()).toISOString(), { note: 'A newer version already existed on the server' }, o.payload);
        await this.repo.completeOp(o);
      }
      return true;
    } catch (e) {
      const err = toCloudError(e);
      if (isNetworkError(err)) { this.setStatus({ lastError: err.message ?? 'Network unavailable' }); return false; }
      if (ops.length > 1) {
        // One bad row must not block its neighbours: isolate by retrying individually.
        let reachable = true;
        for (const o of ops) { if (reachable) reachable = await this.pushGroup(uid, kind, [o]); }
        return reachable;
      }
      const op = ops[0] as OutboxOp;
      const failed = markFailure(op, err, this.now(), this.random());
      await this.repo.saveOpFailure(failed);
      this.setStatus({ lastError: failed.lastError });
      return err.status === undefined || err.status < 500 ? true : false;
    }
  }

  private async sendWithAuthRetry(table: string, rows: Record<string, unknown>[], target: string): Promise<string[] | void> {
    try { return await this.cloud.upsert(table, rows, target); }
    catch (e) {
      if (toCloudError(e).status === 401 && this.cloud.refreshSession && (await this.cloud.refreshSession())) {
        return this.cloud.upsert(table, rows, target);
      }
      throw e;
    }
  }

  private async pull(): Promise<void> {
    const changed = new Set<EntityKind>();
    const order: EntityKind[] = ['subjects', 'plans', 'templates', 'exceptions', 'goals', 'tasks', 'habits', 'sessions', 'logs', 'habitRecords', 'savedQuotes', 'affirmations', 'preferences', 'notificationSettings'];
    for (const kind of order) {
      let cursor = await this.repo.kvGet(`cursor:${kind}`);
      for (;;) {
        const page = await this.cloud.fetchChanged(CLOUD_TABLE[kind], cursor, PAGE);
        let maxTs = cursor;
        for (const raw of page) {
          const serverTs = raw.server_updated_at as string | undefined;
          const { serverUpdatedAt: _drop, ...rest } = fromCloudRow<Record<string, unknown>>(kind, raw);
          void _drop;
          const entity = normalizeRemote(rest) as unknown as EntityMap[typeof kind];
          const outcome = await this.repo.applyRemote(kind, entity, new Date(this.now()).toISOString());
          if (outcome.action === 'insert' || outcome.action === 'replace') changed.add(kind);
          if (serverTs && (!maxTs || Date.parse(serverTs) > Date.parse(maxTs) || serverTs > maxTs)) maxTs = serverTs;
        }
        const advanced = maxTs !== cursor;
        if (maxTs) await this.repo.kvSet(`cursor:${kind}`, maxTs);
        cursor = maxTs;
        if (page.length < PAGE || !advanced) break;
      }
    }
    if (changed.size > 0) this.deps.onRemoteChange?.([...changed]);
  }

  /** Give failed operations another chance (user pressed "Retry"). */
  async retryFailed(): Promise<SyncStatus> {
    await this.repo.retryFailed();
    return this.syncNow();
  }
}

export function toCloudError(e: unknown): CloudError {
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    return { status: typeof o.status === 'number' ? o.status : undefined, code: typeof o.code === 'string' ? o.code : undefined, message: typeof o.message === 'string' ? o.message : String(e) };
  }
  return { message: String(e) };
}

/** No HTTP status and a network-ish message → we never reached the server. */
export function isNetworkError(err: CloudError): boolean {
  if (err.status !== undefined) return false;
  if (err.code && /^(23|42|22|PGRST)/.test(err.code)) return false;
  const m = (err.message ?? '').toLowerCase();
  return m.includes('network') || m.includes('fetch') || m.includes('timeout') || m.includes('offline') || m.includes('failed to') || err.code === undefined;
}

const errMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const isSingleton = (k: EntityKind): boolean => SINGLETON_KINDS.includes(k);
