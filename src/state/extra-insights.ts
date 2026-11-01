import { addDays, diffDays, endOfMonth, parseDateKey, startOfMonth, startOfWeek, WEEKDAY_SHORT } from '../domain/time';
import type { DateKey } from '../domain/types';
import type { Range } from '../domain/analytics';

export type RangeKey = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';
export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: 'this_week', label: 'This week' }, { value: 'last_week', label: 'Last week' },
  { value: 'this_month', label: 'This month' }, { value: 'last_month', label: 'Last month' }, { value: 'custom', label: 'Custom' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wed, 29 Oct 2026" */
export function formatDateLong(key: DateKey): string {
  const { y, m, d } = parseDateKey(key);
  const dow = new Date(y, m - 1, d).getDay();
  return `${WEEKDAY_SHORT[dow]}, ${d} ${MONTHS[m - 1]} ${y}`;
}
/** "29 Oct" */
export function formatDateShort(key: DateKey): string {
  const { m, d } = parseDateKey(key);
  return `${d} ${MONTHS[m - 1]}`;
}

/** Week boundaries use the user's week-start preference; months are calendar months. */
export function resolveRange(key: RangeKey, today: DateKey, weekStart: 0 | 1 | 6, custom: Range): Range {
  switch (key) {
    case 'this_week': { const f = startOfWeek(today, weekStart); return { from: f, to: addDays(f, 6) }; }
    case 'last_week': { const f = addDays(startOfWeek(today, weekStart), -7); return { from: f, to: addDays(f, 6) }; }
    case 'this_month': return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'last_month': { const last = addDays(startOfMonth(today), -1); return { from: startOfMonth(last), to: endOfMonth(last) }; }
    default: return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
  }
}

/** Clip a range to today so comparisons are like-for-like (days that haven't happened are not "zero"). */
export function clipToToday(r: Range, today: DateKey): Range {
  return { from: r.from, to: r.to > today ? today : r.to };
}

/** Previous range with exactly the same number of days as `r`. */
export function equalLengthPrevious(r: Range): Range {
  const n = diffDays(r.from, r.to) + 1;
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}

export const hoursLabel = (min: number): string => `${(min / 60).toFixed(1)}h`;
