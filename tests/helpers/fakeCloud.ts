import type { CloudClient, CloudError } from '../../src/data/syncEngine';

type Row = Record<string, unknown>;

/** Composite (user_id, <col>) foreign keys from supabase/migrations/0001_schema.sql: child table → [column, parent table]. */
const FKS: Record<string, [string, string][]> = {
  activity_templates: [['plan_id', 'timetable_templates'], ['subject_id', 'subjects']],
  schedule_exceptions: [['template_id', 'activity_templates'], ['subject_id', 'subjects']],
  goals: [['subject_id', 'subjects']],
  tasks: [['subject_id', 'subjects'], ['goal_id', 'goals']],
  study_sessions: [['subject_id', 'subjects'], ['task_id', 'tasks']],
  habit_records: [['habit_id', 'habits']],
};

/** In-memory stand-in for Supabase that reproduces the server rules the migrations enforce:
 *  composite (user_id,id) keys, stale-write guard on updated_at, server-assigned server_updated_at. */
export class FakeCloud {
  tables = new Map<string, Map<string, Row>>();
  clock = Date.parse('2026-10-28T06:00:00.000Z');
  offline = false;
  signedIn: string | null = 'user-1';
  rejectIds = new Set<string>();
  server5xx = false;
  /** Reject rows whose parent row is missing, exactly like Postgres (23503). Off by default so older tests are unaffected. */
  enforceForeignKeys = false;
  expireTokenOnce = false;
  upsertCalls = 0;
  onUpsert: ((table: string, rows: Row[]) => void) | null = null;

  client(): CloudClient {
    return {
      userId: () => this.signedIn,
      upsert: async (table, rows, onConflict) => this.upsert(table, rows, onConflict),
      fetchChanged: async (table, cursor, limit) => this.fetchChanged(table, cursor, limit),
      refreshSession: async () => { this.expireTokenOnce = false; return true; },
    };
  }

  private fail(e: CloudError): never { throw e; }

  private async upsert(table: string, rows: Row[], onConflict: string): Promise<string[]> {
    const applied: string[] = [];
    this.upsertCalls++;
    if (this.offline) this.fail({ message: 'Network request failed' });
    if (this.server5xx) this.fail({ status: 503, message: 'service unavailable' });
    if (this.expireTokenOnce) this.fail({ status: 401, message: 'JWT expired' });
    this.onUpsert?.(table, rows);
    const t = this.tables.get(table) ?? new Map<string, Row>();
    this.tables.set(table, t);
    for (const r of rows) {
      if (this.rejectIds.has(String(r.id))) this.fail({ status: 400, code: '23514', message: 'check constraint violated' });
    }
    if (this.enforceForeignKeys) {
      for (const r of rows) {
        for (const [col, parent] of FKS[table] ?? []) {
          const ref = r[col];
          if (ref !== null && ref !== undefined && !this.tables.get(parent)?.has(`${r.user_id}/${ref}`)) {
            this.fail({ status: 409, code: '23503', message: `insert or update on table "${table}" violates foreign key constraint "${table}_${col}_fk"` });
          }
        }
      }
    }
    for (const r of rows) {
      const key = onConflict === 'user_id' ? String(r.user_id) : `${r.user_id}/${r.id}`;
      const cur = t.get(key);
      if (cur && Date.parse(String(r.updated_at)) < Date.parse(String(cur.updated_at))) continue; // stale write ignored
      this.clock += 1;
      applied.push(onConflict === 'user_id' ? 'applied' : String(r.id));
      t.set(key, { ...r, server_updated_at: new Date(this.clock).toISOString().replace('Z', '+00:00') });
    }
    return applied;
  }

  private async fetchChanged(table: string, cursor: string | null, limit: number): Promise<Row[]> {
    if (this.offline) this.fail({ message: 'Network request failed' });
    const t = this.tables.get(table);
    if (!t) return [];
    const rows = [...t.values()]
      .filter((r) => r.user_id === this.signedIn)
      .filter((r) => !cursor || Date.parse(String(r.server_updated_at)) >= Date.parse(cursor))
      .sort((a, b) => Date.parse(String(a.server_updated_at)) - Date.parse(String(b.server_updated_at)));
    // Postgres returns timestamptz with +00:00 and no milliseconds guarantee: mimic that for timestamps.
    return rows.slice(0, limit).map((r) => {
      const o: Row = { ...r };
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (/_at$/.test(k) && k !== 'server_updated_at' && typeof v === 'string' && v.endsWith('Z')) o[k] = v.replace('Z', '+00:00');
      }
      return o;
    });
  }

  rows(table: string): Row[] { return [...(this.tables.get(table)?.values() ?? [])]; }
}
