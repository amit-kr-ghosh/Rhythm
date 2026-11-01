import { useEffect, useMemo, useState } from 'react';
import { resolveDay } from '../domain/schedule';
import { currentAndNext, daySegments } from '../domain/schedule';
import { buildDailySummary, computeDayProgress, type DayProgress } from '../domain/progress';
import { buildInsights, type AnalyticsInput } from '../domain/analytics';
import { minutesOfDay, toDateKey } from '../domain/time';
import type { DateKey, Occurrence, Subject } from '../domain/types';
import { useApp } from './store';
import { studyDay } from '../domain/study';

/** Re-renders every `ms` with the current time. Use sparingly (e.g. 1000 for the timer, 30000 elsewhere). */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Today's local date key; flips at local midnight. */
export function useToday(): DateKey {
  const now = useNow(30_000);
  return toDateKey(now);
}

export function useActiveSubjects(): Subject[] {
  const subjects = useApp((s) => s.data.subjects);
  return useMemo(() => subjects.filter((s) => !s.archived).sort((a, b) => a.sortOrder - b.sortOrder), [subjects]);
}

export type DayModel = {
  date: DateKey; isToday: boolean; occurrences: Occurrence[];
  progress: DayProgress; summary: ReturnType<typeof buildDailySummary>;
  current: ReturnType<typeof currentAndNext>['current']; next: ReturnType<typeof currentAndNext>['next']; remainingMin: number | null;
  segments: ReturnType<typeof daySegments>;
};

/** Everything a day screen needs, derived from stored data only. */
export function useDayModel(date: DateKey, tickMs = 30_000): DayModel {
  const d = useApp((s) => s.data);
  const now = useNow(tickMs);
  const today = toDateKey(now);
  return useMemo(() => {
    const occurrences = resolveDay(date, d.templates, d.exceptions);
    const progress = computeDayProgress({
      date, now, today, occurrences, logs: d.logs, sessions: d.sessions, subjects: d.subjects,
      tasks: d.tasks, habits: d.habits, habitRecords: d.habitRecords, prefs: d.prefs,
    });
    const isToday = date === today;
    const cn = isToday ? currentAndNext(date, minutesOfDay(now), d.templates, d.exceptions) : { current: null, next: null, remainingMin: null };
    return {
      date, isToday, occurrences, progress, summary: buildDailySummary(progress, progress.timetable.isFinal),
      current: cn.current, next: cn.next, remainingMin: cn.remainingMin, segments: daySegments(date, d.templates, d.exceptions),
    };
  }, [d, date, now, today]);
}

export function useAnalyticsInput(): AnalyticsInput {
  const d = useApp((s) => s.data);
  const now = useNow(60_000);
  return useMemo(() => ({
    sessions: d.sessions, templates: d.templates, exceptions: d.exceptions, logs: d.logs, tasks: d.tasks, subjects: d.subjects,
    prefs: d.prefs, today: toDateKey(now), now,
  }), [d, now]);
}

export function useInsights() {
  const input = useAnalyticsInput();
  return useMemo(() => buildInsights(input), [input]);
}

/** Per-subject actual vs target for one day, from recorded sessions only (see domain/study.ts). */
export function useStudyDay(date: DateKey) {
  const d = useApp((s) => s.data);
  return useMemo(() => studyDay(date, d.subjects, d.sessions, d.prefs, d.logs), [date, d.subjects, d.sessions, d.prefs, d.logs]);
}
