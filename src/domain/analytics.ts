import { addDays, dateRange, diffDays, endOfMonth, formatDuration, startOfMonth, startOfWeek, weekdayOf, WEEKDAY_LONG } from './time';
import { resolveDay } from './schedule';
import {
  computeTimetableProgress, focusMinOf, isOverdue, isValidSession, pct, round1, sessionsOn, sumFocusMin, targetsOn, taskDoneOn, taskDueOn,
} from './progress';
import type {
  ActivityLog, ActivityTemplate, Category, DateKey, Preferences, ScheduleException, StudySession, Subject, Task,
} from './types';

export type AnalyticsInput = {
  sessions: StudySession[]; templates: ActivityTemplate[]; exceptions: ScheduleException[]; logs: ActivityLog[];
  tasks: Task[]; subjects: Subject[]; prefs: Preferences; today: DateKey; now: Date;
};
export type Range = { from: DateKey; to: DateKey };

function filtered(sessions: StudySession[], range: Range, subjectId?: string | null): StudySession[] {
  return sessions.filter((s) => isValidSession(s) && s.date >= range.from && s.date <= range.to && (!subjectId || s.subjectId === subjectId));
}

/* ------------- Focus time ------------- */

export function dailyFocus(sessions: StudySession[], range: Range, subjectId?: string | null): { date: DateKey; min: number }[] {
  const byDay = new Map<DateKey, number>();
  for (const s of filtered(sessions, range, subjectId)) byDay.set(s.date, (byDay.get(s.date) ?? 0) + focusMinOf(s));
  return dateRange(range.from, range.to).map((date) => ({ date, min: round1(byDay.get(date) ?? 0) }));
}

export const totalFocus = (sessions: StudySession[], range: Range, subjectId?: string | null): number =>
  round1(sumFocusMin(filtered(sessions, range, subjectId)));

export function subjectDistribution(sessions: StudySession[], subjects: Subject[], range: Range): { subjectId: string | null; name: string; color: string | null; min: number; share: number }[] {
  const map = new Map<string | null, number>();
  for (const s of filtered(sessions, range)) map.set(s.subjectId, (map.get(s.subjectId) ?? 0) + focusMinOf(s));
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()].map(([id, min]) => {
    const sub = subjects.find((x) => x.id === id);
    return { subjectId: id, name: sub?.name ?? 'Unassigned', color: sub?.color ?? null, min: round1(min), share: total > 0 ? round1((min / total) * 100) : 0 };
  }).sort((a, b) => b.min - a.min);
}

export function avgSessionMin(sessions: StudySession[], range: Range, subjectId?: string | null): number | null {
  const list = filtered(sessions, range, subjectId);
  return list.length ? round1(sumFocusMin(list) / list.length) : null;
}

/** completed ÷ all finished timer sessions (cancelled and interrupted count against it). Manual entries are excluded. */
export function sessionCompletionRate(sessions: StudySession[], range: Range, subjectId?: string | null): number | null {
  const list = sessions.filter((s) => !s.deletedAt && s.source === 'timer' && s.date >= range.from && s.date <= range.to && (!subjectId || s.subjectId === subjectId));
  return pct(list.filter((s) => s.status === 'completed').length, list.length);
}

export function compareRanges(sessions: StudySession[], current: Range, previous: Range, subjectId?: string | null): { current: number; previous: number; deltaMin: number; deltaPct: number | null } {
  const c = totalFocus(sessions, current, subjectId), p = totalFocus(sessions, previous, subjectId);
  return { current: c, previous: p, deltaMin: round1(c - p), deltaPct: p > 0 ? round1(((c - p) / p) * 100) : null };
}

export function previousRange(r: Range): Range {
  const n = diffDays(r.from, r.to) + 1;
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}
export const weekRange = (d: DateKey, ws: 0 | 1 | 6): Range => { const f = startOfWeek(d, ws); return { from: f, to: addDays(f, 6) }; };
export const monthRange = (d: DateKey): Range => ({ from: startOfMonth(d), to: endOfMonth(d) });
export function previousMonth(d: DateKey): Range { return monthRange(addDays(startOfMonth(d), -1)); }

/* ------------- When am I productive? ------------- */

/** Minutes of focus per weekday (0=Sun). */
export function focusByWeekday(sessions: StudySession[], range: Range, subjectId?: string | null): number[] {
  const out = Array<number>(7).fill(0);
  for (const s of filtered(sessions, range, subjectId)) out[weekdayOf(s.date)]! += focusMinOf(s);
  return out.map(round1);
}

/** Minutes of focus per local hour of day. A session's focus is spread evenly over the wall-clock span it covers. */
export function focusByHour(sessions: StudySession[], range: Range, subjectId?: string | null): number[] {
  const out = Array<number>(24).fill(0);
  for (const s of filtered(sessions, range, subjectId)) {
    const a = Date.parse(s.startedAt), b = Date.parse(s.endedAt);
    const span = Math.max(1, b - a);
    const focusMs = s.focusSec * 1000;
    let t = a;
    while (t < b) {
      const d = new Date(t);
      const hourEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1, 0, 0, 0).getTime();
      const chunkEnd = Math.min(b, hourEnd);
      out[d.getHours()]! += ((chunkEnd - t) / span) * (focusMs / 60_000);
      t = chunkEnd;
    }
  }
  return out.map(round1);
}

/* ------------- Streaks & heatmap ------------- */

export function streaks(sessions: StudySession[], today: DateKey, thresholdMin: number, lookbackDays = 365): {
  current: number; longest: number; runs: { from: DateKey; to: DateKey; days: number }[];
} {
  const from = addDays(today, -lookbackDays);
  const focus = new Map(dailyFocus(sessions, { from, to: today }).map((d) => [d.date, d.min]));
  const hit = (d: DateKey) => (focus.get(d) ?? 0) >= thresholdMin && thresholdMin > 0 ? true : (thresholdMin <= 0 && (focus.get(d) ?? 0) > 0);
  const runs: { from: DateKey; to: DateKey; days: number }[] = [];
  let runStart: DateKey | null = null, prev: DateKey | null = null;
  for (const d of dateRange(from, today)) {
    if (hit(d)) { if (runStart === null) runStart = d; prev = d; }
    else if (runStart !== null && prev !== null) { runs.push({ from: runStart, to: prev, days: diffDays(runStart, prev) + 1 }); runStart = null; prev = null; }
  }
  if (runStart !== null && prev !== null) runs.push({ from: runStart, to: prev, days: diffDays(runStart, prev) + 1 });
  // Today not yet counted must not break an otherwise live streak.
  const last = runs[runs.length - 1];
  const live = last && (last.to === today || last.to === addDays(today, -1)) ? last.days : 0;
  return { current: live, longest: runs.reduce((m, r) => Math.max(m, r.days), 0), runs: runs.slice(-12) };
}

export function heatmap(sessions: StudySession[], range: Range, subjectId?: string | null): { date: DateKey; min: number; level: 0 | 1 | 2 | 3 | 4 }[] {
  const days = dailyFocus(sessions, range, subjectId);
  const max = Math.max(0, ...days.map((d) => d.min));
  return days.map((d) => {
    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (d.min > 0 && max > 0) { const r = d.min / max; level = r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1; }
    return { ...d, level };
  });
}

/* ------------- Targets vs actual ------------- */

export function targetCompletion(i: AnalyticsInput, range: Range, subjectId?: string | null): { date: DateKey; focusMin: number; targetMin: number | null; pct: number | null }[] {
  return dateRange(range.from, range.to).map((date) => {
    const t = targetsOn(i.prefs.targetHistory, date, { dailyMin: i.prefs.dailyStudyTargetMin, weeklyMin: i.prefs.weeklyStudyTargetMin });
    const focusMin = sumFocusMin(sessionsOn(i.sessions, date).filter((s) => !subjectId || s.subjectId === subjectId));
    let target: number | null = t.dailyMin;
    if (subjectId) { const h = t.subjects[subjectId]; target = h ? h.daily : (i.subjects.find((s) => s.id === subjectId)?.dailyTargetMin ?? null); }
    return { date, focusMin: round1(focusMin), targetMin: target && target > 0 ? target : null, pct: pct(focusMin, target ?? 0) };
  });
}

export function scheduledVsActualStudy(i: AnalyticsInput, range: Range, subjectId?: string | null): { date: DateKey; scheduledMin: number; actualMin: number }[] {
  return dateRange(range.from, range.to).map((date) => {
    const scheduled = resolveDay(date, i.templates, i.exceptions)
      .filter((o) => o.category === 'study' && o.countInProgress && (!subjectId || o.subjectId === subjectId))
      .reduce((a, o) => a + o.durationMin, 0);
    const actual = sumFocusMin(sessionsOn(i.sessions, date).filter((s) => !subjectId || s.subjectId === subjectId));
    return { date, scheduledMin: scheduled, actualMin: round1(actual) };
  });
}

/* ------------- Timetable adherence & time distribution ------------- */

export function adherenceTrend(i: AnalyticsInput, range: Range): { date: DateKey; pct: number | null; scheduledMin: number }[] {
  return dateRange(range.from, range.to).filter((d) => d <= i.today).map((date) => {
    const occ = resolveDay(date, i.templates, i.exceptions);
    const tp = computeTimetableProgress(date, occ, i.logs.filter((l) => l.date === date), i.sessions, i.now, i.today, i.prefs);
    return { date, pct: tp.currentPct, scheduledMin: tp.scheduledMin };
  });
}

export function categoryDistribution(i: AnalyticsInput, range: Range): { category: Category; plannedMin: number; creditMin: number }[] {
  const map = new Map<Category, { plannedMin: number; creditMin: number }>();
  for (const date of dateRange(range.from, range.to)) {
    if (date > i.today) continue;
    const occ = resolveDay(date, i.templates, i.exceptions);
    const tp = computeTimetableProgress(date, occ, i.logs.filter((l) => l.date === date), i.sessions, i.now, i.today, { excludeSleepFromProgress: false });
    for (const b of tp.blocks) {
      if (!b.counts && b.state === 'excluded' && b.occurrence.category !== 'sleep') continue;
      const cur = map.get(b.occurrence.category) ?? { plannedMin: 0, creditMin: 0 };
      cur.plannedMin += b.scheduledMin; cur.creditMin += b.creditMin;
      map.set(b.occurrence.category, cur);
    }
  }
  return [...map.entries()].map(([category, v]) => ({ category, plannedMin: round1(v.plannedMin), creditMin: round1(v.creditMin) })).sort((a, b) => b.plannedMin - a.plannedMin);
}

/* ------------- Tasks ------------- */

export function taskStats(tasks: Task[], range: Range, today: DateKey): { dueDone: number; due: number; completionRate: number | null; overdue: number; createdInRange: number } {
  let due = 0, dueDone = 0;
  for (const date of dateRange(range.from, range.to)) {
    if (date > today) break;
    for (const t of tasks) if (taskDueOn(t, date)) { due++; if (taskDoneOn(t, date)) dueDone++; }
  }
  return {
    due, dueDone, completionRate: pct(dueDone, due), overdue: tasks.filter((t) => isOverdue(t, today)).length,
    createdInRange: tasks.filter((t) => !t.deletedAt && t.createdAt.slice(0, 10) >= range.from && t.createdAt.slice(0, 10) <= range.to).length,
  };
}

/* ------------- Insights ------------- */

export type Insight = { id: string; tone: 'positive' | 'neutral' | 'attention'; text: string };

/** Only emits an insight when there is real data behind it. */
export function buildInsights(i: AnalyticsInput): Insight[] {
  const out: Insight[] = [];
  const ws = i.prefs.weekStart;
  const wk = weekRange(i.today, ws);
  const prevWk = previousRange(wk);
  const daysElapsed = diffDays(wk.from, i.today) + 1; // including today

  const cmp = compareRanges(i.sessions, { from: wk.from, to: i.today }, { from: prevWk.from, to: addDays(prevWk.from, daysElapsed - 1) });
  if (cmp.previous > 0 && cmp.deltaPct !== null) {
    out.push({
      id: 'wow', tone: cmp.deltaMin >= 0 ? 'positive' : 'attention',
      text: `${cmp.deltaMin >= 0 ? 'Up' : 'Down'} ${Math.abs(cmp.deltaPct)}% on the same point last week (${formatDuration(cmp.current)} vs ${formatDuration(cmp.previous)}).`,
    });
  }

  // Subjects getting less attention than their weekly target implies by now.
  const t = targetsOn(i.prefs.targetHistory, i.today, { dailyMin: i.prefs.dailyStudyTargetMin, weeklyMin: i.prefs.weeklyStudyTargetMin });
  const expectedFraction = daysElapsed / 7;
  const hasRecentData = filtered(i.sessions, { from: addDays(i.today, -13), to: i.today }).length > 0;
  const lagging = !hasRecentData ? [] : i.subjects.filter((s) => !s.deletedAt && !s.archived).map((s) => {
    const weekly = t.subjects[s.id]?.weekly ?? s.weeklyTargetMin;
    if (!weekly || weekly <= 0) return null;
    const actual = totalFocus(i.sessions, { from: wk.from, to: i.today }, s.id);
    const expected = weekly * expectedFraction;
    return { s, weekly, actual, ratio: actual / expected };
  }).filter((x): x is NonNullable<typeof x> => x !== null && daysElapsed >= 3 && x.ratio < 0.6).sort((a, b) => a.ratio - b.ratio);
  for (const l of lagging.slice(0, 2)) {
    out.push({ id: `lag-${l.s.id}`, tone: 'attention', text: `${l.s.name} is behind pace: ${formatDuration(l.actual)} so far vs ${formatDuration(l.weekly)} weekly target.` });
  }

  const last30 = { from: addDays(i.today, -29), to: i.today };
  const wd = focusByWeekday(i.sessions, last30);
  const wdTotal = wd.reduce((a, b) => a + b, 0);
  const sessionsCount = filtered(i.sessions, last30).length;
  if (wdTotal > 0 && sessionsCount >= 5) {
    const best = wd.indexOf(Math.max(...wd));
    out.push({ id: 'best-day', tone: 'neutral', text: `${WEEKDAY_LONG[best]} is your strongest day (${formatDuration(wd[best] ?? 0)} over the last 30 days).` });
    const hrs = focusByHour(i.sessions, last30);
    const bh = hrs.indexOf(Math.max(...hrs));
    out.push({ id: 'best-hour', tone: 'neutral', text: `You focus most around ${bh % 12 === 0 ? 12 : bh % 12}${bh < 12 ? ' AM' : ' PM'}.` });
  }

  const st = streaks(i.sessions, i.today, i.prefs.streakThresholdMin);
  if (st.current >= 3) out.push({ id: 'streak', tone: 'positive', text: `${st.current}-day streak of at least ${formatDuration(i.prefs.streakThresholdMin)} focus.` });

  const sv = scheduledVsActualStudy(i, { from: addDays(i.today, -6), to: i.today });
  const sched = sv.reduce((a, d) => a + d.scheduledMin, 0), act = sv.reduce((a, d) => a + d.actualMin, 0);
  if (sched > 0 && act > 0 && act < sched * 0.7) out.push({ id: 'sched-gap', tone: 'attention', text: `Over the last 7 days you recorded ${formatDuration(act)} of focus against ${formatDuration(sched)} scheduled for study.` });
  return out;
}

