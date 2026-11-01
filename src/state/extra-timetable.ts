import { addDays, dateRange, endOfMonth, startOfMonth, weekdayOf } from '../domain/time';
import { resolveDay } from '../domain/schedule';
import type { BlockState } from '../domain/progress';
import type { ActivityTemplate, DateKey, Occurrence, ScheduleException, Subject } from '../domain/types';
import type { Palette } from '../theme/tokens';

/** Block colour: explicit colour › subject colour › category colour from the theme. */
export function blockColor(colors: Palette, subjects: Subject[], o: Pick<Occurrence, 'color' | 'subjectId' | 'category'>): string {
  if (o.color) return o.color;
  const s = o.subjectId ? subjects.find((x) => x.id === o.subjectId) : undefined;
  return s?.color ?? colors.category[o.category];
}

export const STATE_LABEL: Record<BlockState, string> = {
  excluded: 'Not counted', upcoming: 'Upcoming', in_progress: 'In progress', done: 'Done', partial: 'Partly done', missed: 'Missed', skipped: 'Skipped',
};
export const stateTone = (s: BlockState): 'muted' | 'accent' | 'success' | 'warning' | 'danger' =>
  s === 'done' ? 'success' : s === 'in_progress' ? 'accent' : s === 'partial' ? 'warning' : s === 'missed' ? 'danger' : 'muted';

const wrap = (m: number): number => ((m % 1440) + 1440) % 1440;

/** Move a block by `delta` minutes keeping its length (wraps past midnight). */
export function shiftTimes(startMin: number, endMin: number, delta: number): { startMin: number; endMin: number } {
  return { startMin: wrap(startMin + delta), endMin: wrap(endMin + delta) };
}

/** Change the end time by `delta`, never below 5 minutes long and never longer than 24h − 5. */
export function resizeTimes(startMin: number, endMin: number, delta: number, durationMin: number): { startMin: number; endMin: number } {
  const next = Math.max(5, Math.min(1435, durationMin + delta));
  return { startMin, endMin: wrap(startMin + next) };
}

/** First date on/after `from` that falls on `weekday` (0=Sun). */
export function nextDateOn(weekday: number, from: DateKey): DateKey {
  for (let i = 0; i < 7; i++) { const d = addDays(from, i); if (weekdayOf(d) === weekday) return d; }
  return from;
}

/** Month grid: leading/trailing nulls so each row starts on `weekStart`. */
export function monthCells(anchor: DateKey, weekStart: 0 | 1 | 6): (DateKey | null)[] {
  const first = startOfMonth(anchor), last = endOfMonth(anchor);
  const lead = (weekdayOf(first) - weekStart + 7) % 7;
  const days = dateRange(first, last);
  const cells: (DateKey | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function scheduledStudyMin(date: DateKey, templates: ActivityTemplate[], exceptions: ScheduleException[]): number {
  return resolveDay(date, templates, exceptions).filter((o) => o.category === 'study').reduce((a, o) => a + o.durationMin, 0);
}

export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'None' }, { value: 5, label: '5 min' }, { value: 10, label: '10 min' }, { value: 15, label: '15 min' }, { value: 30, label: '30 min' },
];

export const CATEGORY_LABEL: Record<string, string> = {
  study: 'Study', exercise: 'Exercise', sleep: 'Sleep', rest: 'Rest', meal: 'Meal', cooking: 'Cooking', college: 'College',
  personal: 'Personal', break: 'Break', leisure: 'Leisure', other: 'Other',
};
