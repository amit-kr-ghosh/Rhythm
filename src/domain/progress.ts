import { absoluteEnd, addDays, diffDays, formatDuration, weekDates } from './time';
import { daySegments } from './schedule';
import type {
  ActivityLog, DateKey, Habit, HabitRecord, Occurrence, Preferences, ProgressWeights, StudySession, Subject, TargetEntry, Task,
} from './types';
import { weekdayOf } from './time';

/**
 * ===== Calculation rules (also shown to the user in Settings → "How progress is calculated") =====
 *
 * 1. Focused time = the `focusSec` of valid study sessions (status completed/interrupted, focusSec > 0).
 *    Cancelled sessions, idle/paused time and break time never count.
 * 2. Timetable completion is weighted by duration, not by block count.
 *      credit(block)   = min(duration, max(manual log credit, minutes of sessions linked to that block))
 *      manual credit   = done → duration, partial → completedMin, skipped → 0
 *    Taking the max (not the sum) prevents double counting a linked session and a manual tick.
 * 3. Cancelled blocks, blocks removed by a "skip" exception, and (optionally) sleep are excluded entirely.
 *    A block marked "skipped" by the user stays in the plan and earns 0.
 * 4. "Progress so far" divides credit by the scheduled time that has already elapsed (plus any credit earned early),
 *    so blocks that have not started yet never lower it.
 *    "If the day ended now" divides by the whole day's scheduled time.
 * 5. Study target % = focused minutes / target minutes (can exceed 100%; rings are capped at 100%).
 * 6. Task % = tasks done / tasks due that day. Habit % = habits done / habits scheduled that day.
 * 7. Productivity score = weighted mean of the components that have data; weights are renormalised across them.
 * 8. Targets are looked up from a dated history, so changing a target never rewrites past days.
 */

export const round1 = (n: number): number => Math.round(n * 10) / 10;
export function pct(done: number, total: number): number | null {
  if (!(total > 0)) return null;
  return round1((done / total) * 100);
}
export const ringValue = (p: number | null): number => (p === null ? 0 : Math.max(0, Math.min(100, p)));

export function isValidSession(s: StudySession): boolean {
  return !s.deletedAt && s.status !== 'cancelled' && s.focusSec > 0;
}
export const focusMinOf = (s: StudySession): number => s.focusSec / 60;

export function sessionsOn(sessions: StudySession[], date: DateKey): StudySession[] {
  return sessions.filter((s) => isValidSession(s) && s.date === date);
}
export function sumFocusMin(sessions: StudySession[]): number {
  return sessions.reduce((a, s) => a + (isValidSession(s) ? focusMinOf(s) : 0), 0);
}

/* ---------------- Targets with history ---------------- */

export function targetsOn(history: TargetEntry[], date: DateKey, fallback: { dailyMin: number; weeklyMin: number }): TargetEntry {
  const sorted = [...history].sort((a, b) => a.from.localeCompare(b.from));
  let found: TargetEntry | null = null;
  for (const h of sorted) if (h.from <= date) found = h;
  return found ?? { from: '0000-01-01', dailyMin: fallback.dailyMin, weeklyMin: fallback.weeklyMin, subjects: {} };
}

/** Returns an updated history if today's targets differ from the ones in force; otherwise the same array. */
export function recordTargets(history: TargetEntry[], today: DateKey, prefs: Pick<Preferences, 'dailyStudyTargetMin' | 'weeklyStudyTargetMin'>, subjects: Subject[]): TargetEntry[] {
  const entry: TargetEntry = {
    from: today, dailyMin: prefs.dailyStudyTargetMin, weeklyMin: prefs.weeklyStudyTargetMin,
    subjects: Object.fromEntries(subjects.filter((s) => !s.deletedAt).map((s) => [s.id, { daily: s.dailyTargetMin, weekly: s.weeklyTargetMin }])),
  };
  const current = [...history].sort((a, b) => a.from.localeCompare(b.from)).filter((h) => h.from <= today).pop();
  const same = current && current.dailyMin === entry.dailyMin && current.weeklyMin === entry.weeklyMin
    && JSON.stringify(sortKeys(current.subjects)) === JSON.stringify(sortKeys(entry.subjects));
  if (same) return history;
  return [...history.filter((h) => h.from !== today), entry];
}
function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k] as T]));
}

/* ---------------- Timetable completion ---------------- */

export type BlockState = 'excluded' | 'upcoming' | 'in_progress' | 'done' | 'partial' | 'missed' | 'skipped';
export type BlockProgress = {
  occurrence: Occurrence;
  state: BlockState;
  scheduledMin: number;
  elapsedMin: number; // scheduled time that has passed so far
  creditMin: number;
  linkedFocusMin: number;
  counts: boolean;
};

export function countsTowardProgress(o: Occurrence, prefs: Pick<Preferences, 'excludeSleepFromProgress'>): boolean {
  if (!o.countInProgress) return false;
  if (prefs.excludeSleepFromProgress && o.category === 'sleep') return false;
  return true;
}

export function evaluateBlock(
  o: Occurrence, log: ActivityLog | undefined, sessions: StudySession[], now: Date, today: DateKey,
  prefs: Pick<Preferences, 'excludeSleepFromProgress'>,
): BlockProgress {
  const scheduledMin = o.durationMin;
  const nowAbs = diffDays(o.date, today) < 0 ? -1 : (diffDays(o.date, today) === 0 ? now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 : Number.POSITIVE_INFINITY);
  // nowAbs: minutes since midnight of o.date; Infinity if the date is in the past, -1 if in the future.
  const start = o.startMin, end = absoluteEnd(o.startMin, o.endMin);
  const elapsedMin = nowAbs === Number.POSITIVE_INFINITY ? scheduledMin : Math.max(0, Math.min(scheduledMin, nowAbs - start));
  const linkedFocusMin = sessions.filter((s) => isValidSession(s) && s.occurrenceKey === o.key).reduce((a, s) => a + focusMinOf(s), 0);
  const counts = countsTowardProgress(o, prefs) && log?.status !== 'cancelled';

  let manual = 0;
  if (log?.status === 'done') manual = scheduledMin;
  else if (log?.status === 'partial') manual = Math.min(scheduledMin, Math.max(0, log.completedMin));
  const creditMin = Math.min(scheduledMin, Math.max(manual, o.category === 'study' ? linkedFocusMin : 0));

  let state: BlockState;
  if (!counts) state = 'excluded';
  else if (log?.status === 'skipped') state = 'skipped';
  else if (creditMin >= scheduledMin - 1e-9) state = 'done';
  else if (nowAbs !== Number.POSITIVE_INFINITY && nowAbs < start) state = creditMin > 0 ? 'partial' : 'upcoming';
  else if (nowAbs !== Number.POSITIVE_INFINITY && nowAbs < end) state = creditMin > 0 ? 'partial' : 'in_progress';
  else state = creditMin > 0 ? 'partial' : 'missed';

  return { occurrence: o, state, scheduledMin, elapsedMin, creditMin: counts && log?.status !== 'skipped' ? creditMin : 0, linkedFocusMin, counts };
}

export type TimetableProgress = {
  blocks: BlockProgress[];
  scheduledMin: number;
  creditMin: number;
  elapsedMin: number;
  /** Credit ÷ time elapsed so far (null before anything has elapsed). */
  currentPct: number | null;
  /** Credit ÷ whole day's scheduled time — what the day would score if it ended now. */
  projectedFinalPct: number | null;
  isFinal: boolean;
};

export function computeTimetableProgress(
  date: DateKey, occurrences: Occurrence[], logs: ActivityLog[], sessions: StudySession[],
  now: Date, today: DateKey, prefs: Pick<Preferences, 'excludeSleepFromProgress'>,
): TimetableProgress {
  const logByKey = new Map(logs.filter((l) => !l.deletedAt).map((l) => [l.occurrenceKey, l]));
  const blocks = occurrences.map((o) => evaluateBlock(o, logByKey.get(o.key), sessions, now, today, prefs));
  const counted = blocks.filter((b) => b.counts);
  const scheduledMin = counted.reduce((a, b) => a + b.scheduledMin, 0);
  const creditMin = counted.reduce((a, b) => a + b.creditMin, 0);
  const elapsedMin = counted.reduce((a, b) => a + Math.max(b.elapsedMin, b.creditMin), 0);
  const isFinal = date < today || (date === today && counted.every((b) => b.state !== 'upcoming' && b.state !== 'in_progress'));
  return {
    blocks, scheduledMin, creditMin, elapsedMin,
    currentPct: pct(creditMin, elapsedMin),
    projectedFinalPct: pct(creditMin, scheduledMin),
    isFinal,
  };
}

/* ---------------- Study ---------------- */

export type SubjectProgress = {
  subjectId: string; name: string; color: string; focusMin: number; targetMin: number | null; pct: number | null;
};

export function computeStudyProgress(
  date: DateKey, sessions: StudySession[], subjects: Subject[], prefs: Pick<Preferences, 'dailyStudyTargetMin' | 'weeklyStudyTargetMin' | 'targetHistory'>,
): { focusMin: number; targetMin: number; pct: number | null; remainingMin: number; subjects: SubjectProgress[]; unassignedMin: number } {
  const day = sessionsOn(sessions, date);
  const t = targetsOn(prefs.targetHistory, date, { dailyMin: prefs.dailyStudyTargetMin, weeklyMin: prefs.weeklyStudyTargetMin });
  const focusMin = sumFocusMin(day);
  const subs: SubjectProgress[] = subjects
    .filter((s) => !s.deletedAt && (!s.archived || day.some((x) => x.subjectId === s.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => {
      const f = sumFocusMin(day.filter((x) => x.subjectId === s.id));
      const hist = t.subjects[s.id];
      const targetMin = hist ? hist.daily : s.dailyTargetMin;
      return { subjectId: s.id, name: s.name, color: s.color, focusMin: f, targetMin: targetMin && targetMin > 0 ? targetMin : null, pct: pct(f, targetMin ?? 0) };
    });
  const unassignedMin = sumFocusMin(day.filter((x) => !x.subjectId || !subjects.some((s) => s.id === x.subjectId)));
  return { focusMin, targetMin: t.dailyMin, pct: pct(focusMin, t.dailyMin), remainingMin: Math.max(0, t.dailyMin - focusMin), subjects: subs, unassignedMin };
}

export function computeWeeklyGoal(
  date: DateKey, sessions: StudySession[], weekStart: 0 | 1 | 6,
  prefs: Pick<Preferences, 'dailyStudyTargetMin' | 'weeklyStudyTargetMin' | 'targetHistory'>,
): { focusMin: number; targetMin: number; pct: number | null; remainingMin: number; days: DateKey[] } {
  const days = weekDates(date, weekStart);
  const focusMin = days.reduce((a, d) => a + sumFocusMin(sessionsOn(sessions, d)), 0);
  const t = targetsOn(prefs.targetHistory, days[0] as DateKey, { dailyMin: prefs.dailyStudyTargetMin, weeklyMin: prefs.weeklyStudyTargetMin });
  // Use the target in force at the END of the week if it changed mid-week (the latest intent wins).
  const end = targetsOn(prefs.targetHistory, days[6] as DateKey, { dailyMin: prefs.dailyStudyTargetMin, weeklyMin: prefs.weeklyStudyTargetMin });
  const target = end.weeklyMin ?? t.weeklyMin;
  return { focusMin, targetMin: target, pct: pct(focusMin, target), remainingMin: Math.max(0, target - focusMin), days };
}

/* ---------------- Tasks & habits ---------------- */

export function taskDueOn(t: Task, date: DateKey): boolean {
  if (t.deletedAt || t.status === 'cancelled') return false;
  if (t.recurrence) {
    if (t.dueDate && date < t.dueDate) return false;
    return t.recurrence.freq === 'daily' || t.recurrence.weekdays.includes(weekdayOf(date));
  }
  return t.dueDate === date;
}
export function taskDoneOn(t: Task, date: DateKey): boolean {
  if (t.recurrence) return t.doneDates.includes(date);
  return t.status === 'done';
}
export function isOverdue(t: Task, today: DateKey): boolean {
  if (t.deletedAt || t.recurrence || t.status === 'done' || t.status === 'cancelled') return false;
  return t.dueDate !== null && t.dueDate < today;
}

export function computeTaskProgress(date: DateKey, tasks: Task[]): { done: number; total: number; pct: number | null } {
  const due = tasks.filter((t) => taskDueOn(t, date) || (!t.recurrence && !t.deletedAt && t.status === 'done' && t.completedAt && t.dueDate !== date && localDateOf(t.completedAt) === date && t.dueDate !== null && t.dueDate < date));
  const total = due.length;
  const done = due.filter((t) => taskDoneOn(t, date)).length;
  return { done, total, pct: pct(done, total) };
}
function localDateOf(iso: string): DateKey {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function habitScheduledOn(h: Habit, date: DateKey): boolean {
  return !h.deletedAt && !h.archived && h.weekdays.includes(weekdayOf(date));
}
export function computeHabitProgress(date: DateKey, habits: Habit[], records: HabitRecord[]): { done: number; total: number; pct: number | null } {
  const sched = habits.filter((h) => habitScheduledOn(h, date));
  const done = sched.filter((h) => records.some((r) => !r.deletedAt && r.habitId === h.id && r.date === date && r.done)).length;
  return { done, total: sched.length, pct: pct(done, sched.length) };
}

/** Consecutive-day habit streak ending today (or yesterday if today isn't done yet), counting only scheduled days. */
export function habitStreak(h: Habit, records: HabitRecord[], today: DateKey): number {
  const done = new Set(records.filter((r) => r.habitId === h.id && r.done && !r.deletedAt).map((r) => r.date));
  let streak = 0;
  let d = today;
  if (!done.has(d)) d = addDays(d, -1); // today not finished yet shouldn't break the streak
  for (let i = 0; i < 400; i++) {
    if (!h.weekdays.includes(weekdayOf(d))) { d = addDays(d, -1); continue; }
    if (done.has(d)) { streak++; d = addDays(d, -1); } else break;
  }
  return streak;
}

/* ---------------- Overall score ---------------- */

export function weightedScore(components: { timetable: number | null; study: number | null; tasks: number | null; habits: number | null }, w: ProgressWeights): number | null {
  const entries: [number | null, number][] = [
    [components.timetable, w.timetable], [components.study, w.study], [components.tasks, w.tasks], [components.habits, w.habits],
  ];
  let sum = 0, wsum = 0;
  for (const [v, wt] of entries) {
    if (v === null || !(wt > 0)) continue;
    sum += Math.max(0, Math.min(100, v)) * wt;
    wsum += wt;
  }
  return wsum > 0 ? round1(sum / wsum) : null;
}

export type DayProgress = {
  date: DateKey;
  timetable: TimetableProgress;
  study: ReturnType<typeof computeStudyProgress>;
  tasks: ReturnType<typeof computeTaskProgress>;
  habits: ReturnType<typeof computeHabitProgress>;
  weekly: ReturnType<typeof computeWeeklyGoal>;
  score: number | null;
};

export type DayInputs = {
  date: DateKey; now: Date; today: DateKey;
  occurrences: Occurrence[]; logs: ActivityLog[]; sessions: StudySession[]; subjects: Subject[];
  tasks: Task[]; habits: Habit[]; habitRecords: HabitRecord[]; prefs: Preferences;
};

export function computeDayProgress(i: DayInputs): DayProgress {
  const timetable = computeTimetableProgress(i.date, i.occurrences, i.logs.filter((l) => l.date === i.date), i.sessions, i.now, i.today, i.prefs);
  const study = computeStudyProgress(i.date, i.sessions, i.subjects, i.prefs);
  const tasks = computeTaskProgress(i.date, i.tasks);
  const habits = computeHabitProgress(i.date, i.habits, i.habitRecords);
  const weekly = computeWeeklyGoal(i.date, i.sessions, i.prefs.weekStart, i.prefs);
  const score = weightedScore({ timetable: timetable.currentPct, study: study.pct, tasks: tasks.pct, habits: habits.pct }, i.prefs.weights);
  return { date: i.date, timetable, study, tasks, habits, weekly, score };
}

/* ---------------- Daily summary ---------------- */

export type DailySummary = { headline: string; achievements: string[]; missed: string[]; opportunities: string[] };

/** Plain, deterministic summary — no invented praise: every line is derived from recorded data. */
export function buildDailySummary(p: DayProgress, isFinal: boolean): DailySummary {
  const achievements: string[] = [], missed: string[] = [], opportunities: string[] = [];
  const { study, timetable, tasks, habits } = p;
  if (study.focusMin > 0) achievements.push(`Focused for ${formatDuration(study.focusMin)}${study.pct !== null ? ` (${study.pct}% of your ${formatDuration(study.targetMin)} target)` : ''}.`);
  for (const s of study.subjects) if (s.pct !== null && s.pct >= 100) achievements.push(`${s.name} target reached (${formatDuration(s.focusMin)}).`);
  const done = timetable.blocks.filter((b) => b.state === 'done' && b.counts).length;
  if (done > 0) achievements.push(`Completed ${done} scheduled block${done === 1 ? '' : 's'}.`);
  if (tasks.total > 0 && tasks.done === tasks.total) achievements.push(`All ${tasks.total} task${tasks.total === 1 ? '' : 's'} for the day done.`);
  if (habits.total > 0 && habits.done === habits.total) achievements.push('Every scheduled habit checked off.');

  if (isFinal || study.pct !== null) {
    for (const s of study.subjects) {
      if (s.targetMin && s.focusMin < s.targetMin) missed.push(`${s.name}: ${formatDuration(s.focusMin)} of ${formatDuration(s.targetMin)}.`);
    }
  }
  const missedBlocks = timetable.blocks.filter((b) => b.state === 'missed' || b.state === 'skipped');
  if (missedBlocks.length) missed.push(`${missedBlocks.length} scheduled block${missedBlocks.length === 1 ? '' : 's'} not completed.`);
  if (tasks.total > tasks.done) missed.push(`${tasks.total - tasks.done} task${tasks.total - tasks.done === 1 ? '' : 's'} still open.`);

  const studyBlocksWithoutSession = timetable.blocks.filter((b) => b.counts && b.occurrence.category === 'study' && b.linkedFocusMin === 0 && (b.state === 'missed' || b.state === 'in_progress'));
  if (studyBlocksWithoutSession.length) opportunities.push('Start the focus timer from a timetable block so its time is linked and counted.');
  if (study.remainingMin > 0 && study.focusMin > 0) opportunities.push(`${formatDuration(study.remainingMin)} left to reach today's study target.`);
  const weakest = study.subjects.filter((s) => s.pct !== null && s.pct < 100).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))[0];
  if (weakest) opportunities.push(`${weakest.name} is furthest from its target — a short session would help most.`);

  const headline = p.score === null ? 'No data recorded yet.' : `${isFinal ? 'Final' : 'So far'}: ${p.score}% productivity score.`;
  return { headline, achievements, missed, opportunities };
}

export { daySegments };
