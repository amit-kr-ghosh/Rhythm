import { formatDuration } from './time';
import type { Goal, Habit, HabitRecord, StudySession, Subject, Task } from './types';

/** RFC-4180 CSV. Cells that start with = + - @ are prefixed with a quote to neutralise spreadsheet formula injection. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: { key: keyof T & string; header: string }[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(','));
  return [head, ...body].join('\r\n') + '\r\n';
}

export function sessionsToCsv(sessions: StudySession[], subjects: Subject[]): string {
  const name = (id: string | null) => subjects.find((s) => s.id === id)?.name ?? '';
  const rows = sessions.filter((s) => !s.deletedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map((s) => ({
    id: s.id, date: s.date, subject: name(s.subjectId), started_at: s.startedAt, ended_at: s.endedAt,
    focus_minutes: Math.round((s.focusSec / 60) * 100) / 100, focus_hms: formatDuration(s.focusSec / 60),
    elapsed_minutes: Math.round((s.elapsedSec / 60) * 100) / 100, break_minutes: Math.round((s.breakSec / 60) * 100) / 100,
    mode: s.mode, status: s.status, source: s.source, note: s.note, reflection: s.reflection,
  }));
  return toCsv(rows, [
    { key: 'id', header: 'id' }, { key: 'date', header: 'date' }, { key: 'subject', header: 'subject' },
    { key: 'started_at', header: 'started_at' }, { key: 'ended_at', header: 'ended_at' },
    { key: 'focus_minutes', header: 'focus_minutes' }, { key: 'elapsed_minutes', header: 'elapsed_minutes' },
    { key: 'break_minutes', header: 'break_minutes' }, { key: 'mode', header: 'mode' }, { key: 'status', header: 'status' },
    { key: 'source', header: 'source' }, { key: 'note', header: 'note' }, { key: 'reflection', header: 'reflection' },
  ]);
}

export function dailyTotalsToCsv(days: { date: string; min: number }[]): string {
  return toCsv(days.map((d) => ({ date: d.date, focus_minutes: d.min })), [{ key: 'date', header: 'date' }, { key: 'focus_minutes', header: 'focus_minutes' }]);
}

export type ExportBundle = {
  app: 'Rhythm'; version: 1; exportedAt: string;
  subjects: Subject[]; sessions: StudySession[]; tasks: Task[]; goals: Goal[]; habits: Habit[]; habitRecords: HabitRecord[];
  dailyFocusMinutes: { date: string; min: number }[];
};

export function toJsonExport(b: Omit<ExportBundle, 'app' | 'version'>): string {
  const live = <T extends { deletedAt: string | null }>(l: T[]) => l.filter((x) => !x.deletedAt);
  const out: ExportBundle = {
    app: 'Rhythm', version: 1, exportedAt: b.exportedAt,
    subjects: live(b.subjects), sessions: live(b.sessions), tasks: live(b.tasks), goals: live(b.goals),
    habits: live(b.habits), habitRecords: live(b.habitRecords), dailyFocusMinutes: b.dailyFocusMinutes,
  };
  return JSON.stringify(out, null, 2);
}
