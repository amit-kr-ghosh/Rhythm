/**
 * Study tracking for the tracked subjects (DSA, AI/ML, RBI Preparation, Communication).
 *
 * The principle: the TIMETABLE says when you plan to study; the TIMER (or a manual entry) records how long you actually
 * studied. Everything here is computed from recorded sessions only — never from scheduled blocks and never from a
 * manual status. A manual status override is stored as an activity log with a reserved key and affects the label only.
 */
import { deterministicUuid } from './ids';
import { isValidSession, targetsOn } from './progress';
import { dateRange } from './time';
import type { ActivityLog, DateKey, Preferences, StudySession, Subject } from './types';

export type StudyStatus = 'not_done' | 'half' | 'done';
export const STATUS_LABEL: Record<StudyStatus, string> = { not_done: 'Not done', half: 'Half done', done: 'Done' };

/** Not done: 0–49%. Half done: 50–99%. Done: 100% or more (computed on exact seconds, so 49.9% is still Not done). */
export function statusFromPct(pct: number): StudyStatus {
  return pct >= 100 ? 'done' : pct >= 50 ? 'half' : 'not_done';
}

/** Tracked = active subjects that have a daily target. Sorted by the user's priority order. */
export function trackedSubjects(subjects: Subject[]): Subject[] {
  return subjects.filter((s) => !s.deletedAt && !s.archived && (s.dailyTargetMin ?? 0) > 0).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Subjects the user can record time against: every live, non-archived subject (with or without a daily target). */
export function selectableSubjects(subjects: Subject[]): Subject[] {
  return subjects.filter((s) => !s.deletedAt && !s.archived).sort((a, b) => a.sortOrder - b.sortOrder);
}

type TargetPrefs = Pick<Preferences, 'dailyStudyTargetMin' | 'weeklyStudyTargetMin' | 'targetHistory'>;

/** The daily target (minutes) that applied to a subject on a date — history-aware so changing a target never rewrites the past. */
export function subjectTargetMin(subject: Subject, date: DateKey, prefs: TargetPrefs): number {
  const t = targetsOn(prefs.targetHistory, date, { dailyMin: prefs.dailyStudyTargetMin, weeklyMin: prefs.weeklyStudyTargetMin });
  const hist = t.subjects[subject.id];
  const v = hist ? hist.daily : subject.dailyTargetMin;
  return v && v > 0 ? v : 0;
}

/* ---------------- manual status override (label only, never minutes) ---------------- */

export const overrideKey = (subjectId: string, date: DateKey) => `study-status:${subjectId}:${date}`;
export const isOverrideKey = (key: string) => key.startsWith('study-status:');
export const overrideLogId = (subjectId: string, date: DateKey) => deterministicUuid(`log:${overrideKey(subjectId, date)}`);
const LOG_OF: Record<StudyStatus, ActivityLog['status']> = { done: 'done', half: 'partial', not_done: 'skipped' };
const STATUS_OF: Partial<Record<ActivityLog['status'], StudyStatus>> = { done: 'done', partial: 'half', skipped: 'not_done' };
export const overrideLogStatus = (s: StudyStatus): ActivityLog['status'] => LOG_OF[s];

export function overrideFor(logs: ActivityLog[], subjectId: string, date: DateKey): StudyStatus | null {
  const l = logs.find((x) => !x.deletedAt && x.occurrenceKey === overrideKey(subjectId, date));
  return l ? STATUS_OF[l.status] ?? null : null;
}

/* ---------------- one day ---------------- */

export type SessionLine = { id: string; startedAt: string; endedAt: string; focusSec: number; source: StudySession['source']; occurrenceKey: string | null };
export type SubjectDay = {
  subjectId: string; name: string; color: string; date: DateKey;
  targetSec: number; actualSec: number; remainingSec: number; pct: number; /* exact, may exceed 100 */
  computedStatus: StudyStatus; status: StudyStatus; manual: boolean;
  sessionCount: number; sessions: SessionLine[];
};

const byStart = (a: { startedAt: string }, b: { startedAt: string }) => a.startedAt.localeCompare(b.startedAt);

export function subjectDay(date: DateKey, subject: Subject, sessions: StudySession[], prefs: TargetPrefs, logs: ActivityLog[] = []): SubjectDay {
  const mine = sessions.filter((s) => isValidSession(s) && s.date === date && s.subjectId === subject.id).sort(byStart);
  const actualSec = mine.reduce((a, s) => a + s.focusSec, 0);
  const targetSec = subjectTargetMin(subject, date, prefs) * 60;
  const pct = targetSec > 0 ? (actualSec / targetSec) * 100 : 0;
  const computedStatus = statusFromPct(pct);
  const override = overrideFor(logs, subject.id, date);
  return {
    subjectId: subject.id, name: subject.name, color: subject.color, date, targetSec, actualSec,
    remainingSec: Math.max(0, targetSec - actualSec), pct, computedStatus, status: override ?? computedStatus, manual: override !== null,
    sessionCount: mine.length,
    sessions: mine.map((s) => ({ id: s.id, startedAt: s.startedAt, endedAt: s.endedAt, focusSec: s.focusSec, source: s.source, occurrenceKey: s.occurrenceKey })),
  };
}

export type DayTotals = { actualSec: number; targetSec: number; remainingSec: number; pct: number; status: StudyStatus };
export function totalsOf(rows: { actualSec: number; targetSec: number }[]): DayTotals {
  const actualSec = rows.reduce((a, r) => a + r.actualSec, 0), targetSec = rows.reduce((a, r) => a + r.targetSec, 0);
  const pct = targetSec > 0 ? (actualSec / targetSec) * 100 : 0;
  return { actualSec, targetSec, remainingSec: Math.max(0, targetSec - actualSec), pct, status: statusFromPct(pct) };
}

export function studyDay(date: DateKey, subjects: Subject[], sessions: StudySession[], prefs: TargetPrefs, logs: ActivityLog[] = []): { rows: SubjectDay[]; total: DayTotals } {
  const rows = trackedSubjects(subjects).map((s) => subjectDay(date, s, sessions, prefs, logs));
  return { rows, total: totalsOf(rows) };
}

/* ---------------- ranges (week / month / custom) ---------------- */

export type SubjectRange = { subjectId: string; name: string; color: string; actualSec: number; targetSec: number; pct: number; status: StudyStatus; activeDays: number };
export type DayPoint = { date: DateKey; actualSec: number; targetSec: number; pct: number | null };
export type RangeSummary = { from: DateKey; to: DateKey; days: number; subjects: SubjectRange[]; total: DayTotals; daily: DayPoint[]; sessionCount: number };

/**
 * Actual vs target over a range. Days after `today` are not counted (their targets can't have been missed yet) and
 * show as gaps in the daily series. Only recorded sessions contribute actual time.
 */
export function rangeSummary(from: DateKey, to: DateKey, today: DateKey, subjects: Subject[], sessions: StudySession[], prefs: TargetPrefs): RangeSummary {
  const tracked = trackedSubjects(subjects);
  const dates = dateRange(from, to);
  const past = dates.filter((d) => d <= today);
  const acc = new Map(tracked.map((s) => [s.id, { actual: 0, target: 0, days: 0 }]));
  const daily: DayPoint[] = dates.map((date) => {
    if (date > today) return { date, actualSec: 0, targetSec: 0, pct: null };
    let a = 0, tg = 0;
    for (const s of tracked) {
      const d = subjectDay(date, s, sessions, prefs);
      const x = acc.get(s.id)!;
      x.actual += d.actualSec; x.target += d.targetSec; if (d.actualSec > 0) x.days += 1;
      a += d.actualSec; tg += d.targetSec;
    }
    return { date, actualSec: a, targetSec: tg, pct: tg > 0 ? (a / tg) * 100 : null };
  });
  const rows: SubjectRange[] = tracked.map((s) => {
    const x = acc.get(s.id)!;
    const pct = x.target > 0 ? (x.actual / x.target) * 100 : 0;
    return { subjectId: s.id, name: s.name, color: s.color, actualSec: x.actual, targetSec: x.target, pct, status: statusFromPct(pct), activeDays: x.days };
  });
  const ids = new Set(tracked.map((s) => s.id));
  const sessionCount = sessions.filter((s) => isValidSession(s) && s.date >= from && s.date <= to && s.date <= today && s.subjectId !== null && ids.has(s.subjectId)).length;
  return { from, to, days: past.length, subjects: rows, total: totalsOf(rows), daily, sessionCount };
}

/** Formats seconds as "1h 05m 09s" / "5m 09s" / "42s" — exact time, not rounded to minutes. */
export function formatExact(sec: number): string {
  const t = Math.max(0, Math.round(sec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}h ${p(m)}m ${p(s)}s` : m > 0 ? `${m}m ${p(s)}s` : `${s}s`;
}
/** Compact "3h 20m" form for rings and tables (rounds to the minute). */
export function formatCompact(sec: number): string {
  const t = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(t / 60), m = t % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
