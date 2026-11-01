import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, sessionsToCsv, toJsonExport, dailyTotalsToCsv } from '../src/domain/export';
import * as V from '../src/domain/validation';
import { session, subjects, task, habit, DSA, NOW_ISO } from './factories';

test('csv: quotes, commas, newlines and formula-injection are neutralised', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell(null), ''); assert.equal(csvCell(42), '42');
});

test('csv: sessions export has a header, one row per live session, correct minutes and subject names', () => {
  const s1 = session({ date: '2026-10-27', minutes: 90, note: 'graphs, trees' });
  const s2 = session({ date: '2026-10-28', minutes: 30 });
  const dead = session({ date: '2026-10-28', deletedAt: NOW_ISO });
  const csv = sessionsToCsv([s2, s1, dead], subjects());
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 3, 'header + 2 live sessions');
  assert.ok(lines[0]!.startsWith('id,date,subject,started_at'));
  assert.ok(lines[1]!.includes(',DSA,') && lines[1]!.includes(',90,'), lines[1]!);
  assert.ok(lines[1]!.includes('"graphs, trees"'));
  assert.ok(lines[1]!.localeCompare(lines[2]!) !== 0);
  assert.ok(Date.parse(s1.startedAt) < Date.parse(s2.startedAt) && lines[1]!.includes('2026-10-27'), 'sorted by start time');
});

test('csv: daily totals', () => {
  assert.equal(dailyTotalsToCsv([{ date: '2026-10-28', min: 75.5 }]), 'date,focus_minutes\r\n2026-10-28,75.5\r\n');
});

test('json export: valid JSON, tombstones removed, includes metadata and totals', () => {
  const t1 = task({ title: 'keep' }), t2 = task({ title: 'gone', deletedAt: NOW_ISO });
  const out = JSON.parse(toJsonExport({
    exportedAt: NOW_ISO, subjects: subjects(), sessions: [session({ date: '2026-10-28' })], tasks: [t1, t2], goals: [], habits: [habit()], habitRecords: [],
    dailyFocusMinutes: [{ date: '2026-10-28', min: 60 }],
  }));
  assert.equal(out.app, 'Rhythm'); assert.equal(out.version, 1);
  assert.equal(out.tasks.length, 1); assert.equal(out.tasks[0].title, 'keep');
  assert.equal(out.subjects.length, 5); assert.equal(out.dailyFocusMinutes[0].min, 60);
});

test('validation: activity', () => {
  const ok = { title: 'DSA', category: 'study' as const, startMin: 420, endMin: 480, weekdays: [1, 2] };
  assert.equal(V.validateActivity(ok).ok, true);
  assert.ok(V.validateActivity({ ...ok, title: '  ' }).errors.title);
  assert.ok(V.validateActivity({ ...ok, startMin: 600, endMin: 600 }).errors.time);
  assert.ok(V.validateActivity({ ...ok, endMin: 1440 }).errors.time);
  assert.ok(V.validateActivity({ ...ok, weekdays: [] }).errors.weekdays);
  assert.ok(V.validateActivity({ ...ok, weekdays: [7] }).errors.weekdays);
  assert.equal(V.validateActivity({ ...ok, startMin: 1380, endMin: 360 }).ok, true, 'midnight-crossing is valid');
  assert.ok(V.validateActivity({ ...ok, reminderLeadMin: -1 }).errors.reminder);
});

test('validation: subjects, targets, tasks, timer, habits, goals, quiet hours', () => {
  assert.ok(V.validateSubject({ name: 'dsa', dailyTargetMin: null, weeklyTargetMin: null }, ['DSA']).errors.name, 'duplicate (case-insensitive)');
  assert.ok(V.validateSubject({ name: 'X', dailyTargetMin: 2000, weeklyTargetMin: null }, []).errors.daily);
  assert.ok(V.validateSubject({ name: 'X', dailyTargetMin: 120, weeklyTargetMin: 60 }, []).errors.weekly);
  assert.equal(V.validateTargets({ dailyMin: 480, weeklyMin: 3360 }).ok, true);
  assert.ok(V.validateTargets({ dailyMin: 480, weeklyMin: 100 }).errors.weekly);
  assert.ok(V.validateTask({ title: '', priority: 'low', estimateMin: null, dueDate: null }).errors.title);
  assert.ok(V.validateTask({ title: 'x', priority: 'low', estimateMin: 0, dueDate: null }).errors.estimate);
  assert.ok(V.validateTask({ title: 'x', priority: 'low', estimateMin: 10, dueDate: '28/10/2026' }).errors.due);
  assert.equal(V.validateTimerConfig({ mode: 'stopwatch', focusMin: 0, breakMin: 0 }).ok, true);
  assert.ok(V.validateTimerConfig({ mode: 'countdown', focusMin: 0, breakMin: 0 }).errors.focus);
  assert.ok(V.validateTimerConfig({ mode: 'pomodoro', focusMin: 25, breakMin: 0 }).errors.break);
  assert.ok(V.validateHabit({ name: '', weekdays: [1] }).errors.name);
  assert.ok(V.validateGoal({ title: 'g', targetMin: -5 }).errors.target);
  assert.ok(V.validateQuietHours({ startMin: 600, endMin: 600 }).errors.quiet);
  assert.equal(V.validateQuietHours({ startMin: 1380, endMin: 360 }).ok, true);
  assert.ok(V.validateWeights({ timetable: 0, study: 0, tasks: 0, habits: 0 }).errors.weights);
});

test('validation: credentials', () => {
  assert.ok(V.validateCredentials({ email: 'nope', password: 'x' }, 'login').errors.email);
  assert.ok(V.validateCredentials({ email: 'a@b.co', password: '' }, 'login').errors.password);
  assert.equal(V.validateCredentials({ email: 'a@b.co', password: 'x' }, 'login').ok, true, 'login does not enforce policy');
  assert.ok(V.validateCredentials({ email: 'a@b.co', password: 'short1', confirm: 'short1' }, 'register').errors.password);
  assert.ok(V.validateCredentials({ email: 'a@b.co', password: 'longpassword', confirm: 'longpassword' }, 'register').errors.password, 'needs a digit');
  assert.ok(V.validateCredentials({ email: 'a@b.co', password: 'goodpass123', confirm: 'other' }, 'register').errors.confirm);
  assert.equal(V.validateCredentials({ email: 'a@b.co', password: 'goodpass123', confirm: 'goodpass123' }, 'register').ok, true);
  assert.equal(V.validateEmail('x@y.io').ok, true);
});
void DSA;
