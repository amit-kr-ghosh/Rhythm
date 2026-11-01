import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  absoluteEnd, actualDurationMin, addDays, crossesMidnight, dateRange, diffDays, durationMin, endOfMonth, formatClock, formatDuration, formatHMS,
  instantAt, isValidDateKey, minutesOfDay, parseClock, parseDateKey, startOfMonth, startOfWeek, toDateKey, weekDates, weekdayOf,
} from '../src/domain/time';

test('duration of ordinary and midnight-crossing blocks', () => {
  assert.equal(durationMin(6 * 60, 7 * 60), 60);
  assert.equal(durationMin(10 * 60 + 30, 12 * 60 + 30), 120);
  assert.equal(durationMin(23 * 60, 6 * 60), 7 * 60); // Sleep 11 PM → 6 AM
  assert.equal(crossesMidnight(23 * 60, 6 * 60), true);
  assert.equal(crossesMidnight(6 * 60, 7 * 60), false);
  assert.equal(absoluteEnd(23 * 60, 6 * 60), 30 * 60);
});

test('date keys round-trip and reject impossible dates', () => {
  assert.deepEqual(parseDateKey('2026-02-28'), { y: 2026, m: 2, d: 28 });
  assert.equal(isValidDateKey('2026-02-29'), false);
  assert.equal(isValidDateKey('2028-02-29'), true);
  assert.equal(isValidDateKey('2026-13-01'), false);
  assert.equal(isValidDateKey('nope'), false);
  assert.equal(toDateKey(new Date(2026, 9, 28, 23, 59)), '2026-10-28');
});

test('addDays / diffDays cross month and year boundaries', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(diffDays('2026-01-01', '2026-12-31'), 364);
  assert.equal(diffDays('2026-10-28', '2026-10-27'), -1);
});

test('week start preference decides the week boundaries', () => {
  // 2026-10-28 is a Wednesday
  assert.equal(weekdayOf('2026-10-28'), 3);
  assert.equal(startOfWeek('2026-10-28', 1), '2026-10-26');
  assert.equal(startOfWeek('2026-10-28', 0), '2026-10-25');
  assert.equal(startOfWeek('2026-10-28', 6), '2026-10-24');
  assert.equal(startOfWeek('2026-10-26', 1), '2026-10-26'); // already the first day
  assert.deepEqual(weekDates('2026-10-28', 1).length, 7);
  assert.equal(weekDates('2026-10-28', 1)[6], '2026-11-01');
});

test('month bounds and ranges', () => {
  assert.equal(startOfMonth('2026-10-28'), '2026-10-01');
  assert.equal(endOfMonth('2026-02-10'), '2026-02-28');
  assert.equal(endOfMonth('2028-02-10'), '2028-02-29');
  assert.deepEqual(dateRange('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
});

test('clock parsing and formatting', () => {
  assert.equal(parseClock('6:30 PM'), 18 * 60 + 30);
  assert.equal(parseClock('12 am'), 0);
  assert.equal(parseClock('12:15 pm'), 12 * 60 + 15);
  assert.equal(parseClock('06:05'), 6 * 60 + 5);
  assert.equal(parseClock('23:59'), 23 * 60 + 59);
  assert.equal(parseClock('24:00'), null);
  assert.equal(parseClock('13 pm'), null);
  assert.equal(parseClock('7:75'), null);
  assert.equal(parseClock('abc'), null);
  assert.equal(formatClock(0), '12:00 AM');
  assert.equal(formatClock(12 * 60), '12:00 PM');
  assert.equal(formatClock(18 * 60 + 5), '6:05 PM');
  assert.equal(formatClock(18 * 60 + 5, true), '18:05');
});

test('duration formatting', () => {
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(45), '45m');
  assert.equal(formatDuration(120), '2h');
  assert.equal(formatDuration(125), '2h 5m');
  assert.equal(formatHMS(65), '01:05');
  assert.equal(formatHMS(3725), '1:02:05');
});

test('instantAt places wall-clock minutes on the right local day, including rollover', () => {
  const d = instantAt('2026-10-28', 23 * 60 + 30);
  assert.equal(toDateKey(d), '2026-10-28');
  assert.equal(minutesOfDay(d), 23 * 60 + 30);
  const next = instantAt('2026-10-28', 30 * 60); // 6 AM next day
  assert.equal(toDateKey(next), '2026-10-29');
  assert.equal(minutesOfDay(next), 6 * 60);
});

const tz = process.env.TZ ?? '';
test('DST: calendar-day arithmetic is unaffected; real duration differs from nominal', { skip: !tz.startsWith('America/') }, () => {
  // US spring-forward 2026-03-08 (23-hour day), fall-back 2026-11-01 (25-hour day)
  assert.equal(addDays('2026-03-07', 1), '2026-03-08');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(diffDays('2026-03-01', '2026-03-31'), 30);
  assert.equal(durationMin(23 * 60, 6 * 60), 420); // nominal
  assert.equal(actualDurationMin('2026-03-07', 23 * 60, 6 * 60), 360); // sleep over spring-forward is 6 real hours
  assert.equal(actualDurationMin('2026-10-31', 23 * 60, 6 * 60), 480); // and 8 over fall-back
  assert.equal(actualDurationMin('2026-10-28', 23 * 60, 6 * 60), 420); // ordinary night
  assert.equal(toDateKey(instantAt('2026-03-08', 12 * 60)), '2026-03-08');
});

test('Kolkata has no DST: nominal equals actual', { skip: tz !== 'Asia/Kolkata' }, () => {
  assert.equal(actualDurationMin('2026-03-07', 23 * 60, 6 * 60), 420);
  assert.equal(actualDurationMin('2026-10-31', 23 * 60, 6 * 60), 420);
});
