import { useMemo } from 'react';
import { endOfMonth, startOfMonth, diffDays, formatDuration } from '../domain/time';
import { monthRange, totalFocus, weekRange } from '../domain/analytics';
import { pct } from '../domain/progress';
import { targetsOn } from '../domain/progress';
import type { StudySession, Subject } from '../domain/types';
import { useApp } from './store';
import { useToday } from './hooks';

export type SubjectStats = {
  todayMin: number; weekMin: number; monthMin: number;
  dailyTargetMin: number | null; weeklyTargetMin: number | null; monthlyTargetMin: number | null;
  dailyPct: number | null; weeklyPct: number | null; monthlyPct: number | null;
};

/** Focus minutes + target completion for one subject. Monthly target = weekly target scaled to the month's length (no separate monthly field exists). */
export function useSubjectStats(subject: Subject | undefined): SubjectStats {
  const sessions = useApp((s) => s.data.sessions);
  const prefs = useApp((s) => s.data.prefs);
  const today = useToday();
  return useMemo(() => {
    if (!subject) return { todayMin: 0, weekMin: 0, monthMin: 0, dailyTargetMin: null, weeklyTargetMin: null, monthlyTargetMin: null, dailyPct: null, weeklyPct: null, monthlyPct: null };
    const todayMin = totalFocus(sessions, { from: today, to: today }, subject.id);
    const weekMin = totalFocus(sessions, weekRange(today, prefs.weekStart), subject.id);
    const mr = monthRange(today);
    const monthMin = totalFocus(sessions, mr, subject.id);
    // Targets in force today (history-aware), falling back to the subject's current values.
    const hist = targetsOn(prefs.targetHistory, today, { dailyMin: prefs.dailyStudyTargetMin, weeklyMin: prefs.weeklyStudyTargetMin }).subjects[subject.id];
    const daily = hist ? hist.daily : subject.dailyTargetMin;
    const weekly = hist ? hist.weekly : subject.weeklyTargetMin;
    const days = diffDays(startOfMonth(today), endOfMonth(today)) + 1;
    const monthly = weekly && weekly > 0 ? Math.round((weekly * days) / 7) : null;
    const d = daily && daily > 0 ? daily : null, w = weekly && weekly > 0 ? weekly : null;
    return {
      todayMin, weekMin, monthMin, dailyTargetMin: d, weeklyTargetMin: w, monthlyTargetMin: monthly,
      dailyPct: d ? pct(todayMin, d) : null, weeklyPct: w ? pct(weekMin, w) : null, monthlyPct: monthly ? pct(monthMin, monthly) : null,
    };
  }, [subject, sessions, prefs, today]);
}

export const minLabel = (m: number): string => formatDuration(Math.round(m));

export function sessionStatusLabel(s: StudySession): string {
  if (s.status === 'cancelled') return 'Cancelled (not counted)';
  if (s.status === 'interrupted') return 'Interrupted';
  return 'Completed';
}
export const modeLabel = (m: StudySession['mode']): string => (m === 'pomodoro' ? 'Pomodoro' : m === 'countdown' ? 'Countdown' : 'Stopwatch');
