import type { DateKey, Minutes } from './types';

export const MIN_PER_DAY = 1440;
const pad = (n: number) => String(n).padStart(2, '0');

/** Local-calendar date key for an instant, using the device time zone. */
export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: DateKey): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Invalid date key: ${key}`);
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const probe = new Date(y, mo - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) {
    throw new Error(`Invalid calendar date: ${key}`);
  }
  return { y, m: mo, d };
}

export function isValidDateKey(key: string): boolean {
  try { parseDateKey(key); return true; } catch { return false; }
}

/** Local midnight at the start of the date. */
export function startOfDate(key: DateKey): Date {
  const { y, m, d } = parseDateKey(key);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDays(key: DateKey, n: number): DateKey {
  const { y, m, d } = parseDateKey(key);
  // Constructing via (y, m, d + n) is DST-safe; no millisecond arithmetic.
  return toDateKey(new Date(y, m - 1, d + n));
}

export function diffDays(a: DateKey, b: DateKey): number {
  const pa = parseDateKey(a), pb = parseDateKey(b);
  // Use UTC to avoid DST skew when counting calendar days.
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(key: DateKey): number {
  const { y, m, d } = parseDateKey(key);
  return new Date(y, m - 1, d).getDay();
}

/** First day of the week containing `key`, given weekStart (0 Sun, 1 Mon, 6 Sat). */
export function startOfWeek(key: DateKey, weekStart: 0 | 1 | 6): DateKey {
  const delta = (weekdayOf(key) - weekStart + 7) % 7;
  return addDays(key, -delta);
}

export function weekDates(key: DateKey, weekStart: 0 | 1 | 6): DateKey[] {
  const s = startOfWeek(key, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function startOfMonth(key: DateKey): DateKey { return `${key.slice(0, 7)}-01`; }
export function endOfMonth(key: DateKey): DateKey {
  const { y, m } = parseDateKey(key);
  return toDateKey(new Date(y, m, 0));
}

export function dateRange(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  const n = diffDays(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

export function inRange(key: DateKey, from: DateKey, to: DateKey): boolean {
  return key >= from && key <= to; // ISO date keys sort lexicographically
}

/** Minutes since local midnight for an instant. */
export function minutesOfDay(d: Date): Minutes { return d.getHours() * 60 + d.getMinutes(); }

/** Wall-clock instant for a date + minutes offset. Offsets >= 1440 roll onto following days. */
export function instantAt(key: DateKey, min: Minutes): Date {
  const { y, m, d } = parseDateKey(key);
  return new Date(y, m - 1, d, 0, min, 0, 0);
}

export function crossesMidnight(startMin: Minutes, endMin: Minutes): boolean { return endMin <= startMin; }

/** Nominal (wall-clock) duration. endMin <= startMin means the block wraps past midnight. Equal times are invalid (use 1440 explicitly via validation). */
export function durationMin(startMin: Minutes, endMin: Minutes): number {
  return endMin > startMin ? endMin - startMin : endMin + MIN_PER_DAY - startMin;
}

/** End offset relative to the start date (may exceed 1440 when crossing midnight). */
export function absoluteEnd(startMin: Minutes, endMin: Minutes): Minutes {
  return startMin + durationMin(startMin, endMin);
}

/** Real elapsed minutes between wall-clock start and end on `key` (differs from nominal on DST days). */
export function actualDurationMin(key: DateKey, startMin: Minutes, endMin: Minutes): number {
  const s = instantAt(key, startMin);
  const e = instantAt(key, absoluteEnd(startMin, endMin));
  return Math.round((e.getTime() - s.getTime()) / 60_000);
}

export function formatClock(min: Minutes, use24h = false): string {
  const m = ((min % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  const h = Math.floor(m / 60), mm = m % 60;
  if (use24h) return `${pad(h)}:${pad(mm)}`;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(mm)} ${suffix}`;
}

/** Parses "6:30", "06:30", "6:30 PM", "6 pm" → minutes since midnight, or null. */
export function parseClock(input: string): Minutes | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(input);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase();
  if (mm > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'am') h = h === 12 ? 0 : h; else h = h === 12 ? 12 : h + 12;
  } else if (h > 23) return null;
  return h * 60 + mm;
}

export function formatDuration(totalMin: number): string {
  const t = Math.max(0, Math.round(totalMin));
  const h = Math.floor(t / 60), m = t % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatHMS(totalSec: number): string {
  const t = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Overlap of two [start,end) intervals expressed as absolute minute offsets. */
export function overlapMin(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}
