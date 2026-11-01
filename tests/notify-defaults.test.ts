import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyQuietHours, inQuietHours, planNotifications, planTimerNotifications, MAX_SCHEDULED } from '../src/domain/notify';
import { startTimer } from '../src/domain/timer';
import { pause } from '../src/domain/timer';
import { buildDefaultPreferences, buildDefaultSubjects, buildDefaultTemplates, subjectId } from '../src/domain/defaults';
import { resolveDay } from '../src/domain/schedule';
import { QUOTES, TOPICS, quoteOfDay, quoteById, encouragement } from '../src/domain/quotes';
import { instantAt } from '../src/domain/time';
import { habit, habitRecord, notifSettings, prefs, subjects, task, templates, NOW_ISO } from './factories';
import type { ScheduleException } from '../src/domain/types';

const settings = (over = {}) => ({ ...notifSettings(), quietEnabled: true, quietStartMin: 23 * 60, quietEndMin: 6 * 60, ...over });
const input = (over = {}) => ({
  now: instantAt('2026-10-28', 6 * 60).getTime(), settings: settings(), prefs: prefs(), templates: templates('2026-01-01'), exceptions: [],
  subjects: subjects(), tasks: [], habits: [], habitRecords: [], today: '2026-10-28', ...over,
});

/* ---------- quiet hours ---------- */
test('quiet hours wrap past midnight and can be disabled', () => {
  const q = settings();
  assert.equal(inQuietHours(23 * 60 + 30, q), true); assert.equal(inQuietHours(5 * 60, q), true);
  assert.equal(inQuietHours(6 * 60, q), false); assert.equal(inQuietHours(12 * 60, q), false);
  assert.equal(inQuietHours(2 * 60, settings({ quietEnabled: false })), false);
});
test('quiet hours: time-critical channels are dropped, others are deferred to the end of quiet time', () => {
  const at = instantAt('2026-10-28', 23 * 60 + 30).getTime();
  assert.equal(applyQuietHours(at, 'activities', settings() as never), null);
  assert.equal(applyQuietHours(at, 'study', settings() as never), null);
  assert.equal(applyQuietHours(at, 'breaks', settings() as never), null);
  assert.equal(applyQuietHours(at, 'tasks', settings() as never), instantAt('2026-10-29', 6 * 60).getTime());
  const early = instantAt('2026-10-28', 5 * 60).getTime();
  assert.equal(applyQuietHours(early, 'summary', settings() as never), instantAt('2026-10-28', 6 * 60).getTime());
});

/* ---------- planning ---------- */
test('notifications: nothing is planned while reminders are disabled', () => {
  assert.deepEqual(planNotifications(input({ settings: settings({ enabled: false }) }) as never), []);
});
test('notifications: study blocks get a reminder `lead` minutes before start, with stable ids and none in the past', () => {
  const plan = planNotifications(input() as never);
  const dsa = plan.find((n) => n.id.startsWith('act:') && n.title === 'Study: DSA');
  assert.ok(dsa, 'a DSA study reminder exists');
  assert.equal(dsa!.at, instantAt('2026-10-28', 7 * 60 - 5).getTime(), '7:00 block, 5 min lead');
  assert.ok(plan.every((n) => n.at > instantAt('2026-10-28', 6 * 60).getTime()));
  assert.equal(new Set(plan.map((n) => n.id)).size, plan.length, 'ids are unique');
  assert.deepEqual(plan.map((n) => n.id), planNotifications(input() as never).map((n) => n.id), 'deterministic');
  assert.ok(plan.length <= MAX_SCHEDULED);
});
test('notifications: non-study blocks only notify when the block opts in', () => {
  const base = templates('2026-01-01');
  assert.equal(planNotifications(input({ templates: base }) as never).some((n) => n.title === 'Exercise'), false);
  const opted = base.map((t) => (t.title === 'Dinner' ? { ...t, reminderLeadMin: 10 } : t));
  const n = planNotifications(input({ templates: opted }) as never).find((x) => x.title === 'Dinner');
  assert.ok(n); assert.equal(n!.at, instantAt('2026-10-28', 20 * 60 + 30 - 10).getTime());
});
test('notifications: rescheduling — skipping an occurrence removes its reminder, a moved block moves it', () => {
  const t = templates('2026-01-01');
  const dsa = t.find((x) => x.title === 'DSA' && x.startMin === 7 * 60 && x.weekdays.includes(3 /* Wed */ ) === false)!;
  const skip: ScheduleException = { id: 'e1', date: '2026-10-28', type: 'skip', templateId: dsa.id, title: null, category: null, subjectId: null, color: null, startMin: null, endMin: null, createdAt: NOW_ISO, updatedAt: NOW_ISO, deletedAt: null };
  // 2026-10-28 is a Wednesday (college day) so use a Tuesday template day instead.
  const tue = '2026-10-27';
  const base = planNotifications(input({ now: instantAt(tue, 6 * 60).getTime(), today: tue }) as never).filter((n) => n.id.includes(`@${tue}`));
  const skipped = planNotifications(input({ now: instantAt(tue, 6 * 60).getTime(), today: tue, exceptions: [{ ...skip, date: tue }] }) as never).filter((n) => n.id.includes(`@${tue}`));
  assert.equal(skipped.length, base.length - 1);
  const moved: ScheduleException = { ...skip, id: 'e2', date: tue, type: 'override', startMin: 8 * 60, endMin: 9 * 60 };
  const mv = planNotifications(input({ now: instantAt(tue, 6 * 60).getTime(), today: tue, exceptions: [moved] }) as never).find((n) => n.id === `act:${dsa.id}@${tue}`);
  assert.equal(mv!.at, instantAt(tue, 8 * 60 - 5).getTime());
});
test('notifications: task and habit reminders respect completion and due dates', () => {
  const tk = task({ title: 'Submit form', dueDate: '2026-10-28', dueMin: 17 * 60, reminderLeadMin: 60 });
  const done = task({ title: 'Done already', dueDate: '2026-10-28', dueMin: 17 * 60, reminderLeadMin: 60, status: 'done' });
  const h = habit({ name: 'Read', reminderMin: 20 * 60 });
  const hDone = habit({ name: 'Stretch', reminderMin: 20 * 60 });
  const plan = planNotifications(input({ tasks: [tk, done], habits: [h, hDone], habitRecords: [habitRecord(hDone, '2026-10-28')] }) as never);
  assert.ok(plan.find((n) => n.body === 'Submit form' && n.at === instantAt('2026-10-28', 16 * 60).getTime()));
  assert.equal(plan.some((n) => n.body === 'Done already'), false);
  assert.ok(plan.some((n) => n.title === 'Read' && n.id.endsWith('2026-10-28')));
  assert.equal(plan.some((n) => n.title === 'Stretch' && n.id.endsWith('2026-10-28')), false, 'already ticked today');
});
test('notifications: the plan never exceeds the platform cap, even with many tasks', () => {
  const tasks = Array.from({ length: 200 }, (_, i) => task({ title: `t${i}`, dueDate: '2026-10-29', dueMin: 600 + (i % 100), reminderLeadMin: 15 }));
  assert.equal(planNotifications(input({ tasks }) as never).length, MAX_SCHEDULED);
});
test('timer notifications: countdown completion, pause cancels, pomodoro break reminders are optional', () => {
  const now = 1_000_000_000_000;
  const cd = startTimer({ mode: 'countdown', focusMs: 25 * 60_000, breakMs: 0, subjectId: null, occurrenceKey: null, taskId: null }, 'a', now);
  const p = planTimerNotifications(cd, now + 5 * 60_000, settings() as never, true);
  assert.equal(p.length, 1); assert.equal(p[0]!.at, now + 25 * 60_000);
  assert.deepEqual(planTimerNotifications(pause(cd, now + 60_000), now + 60_000, settings() as never, true), []);
  const pomo = startTimer({ mode: 'pomodoro', focusMs: 25 * 60_000, breakMs: 5 * 60_000, subjectId: null, occurrenceKey: null, taskId: null }, 'b', now);
  assert.ok(planTimerNotifications(pomo, now, settings() as never, true).length >= 2);
  assert.equal(planTimerNotifications(pomo, now, settings() as never, false).length, 0);
  assert.deepEqual(planTimerNotifications(cd, now, settings({ enabled: false }) as never, true), []);
});

/* ---------- the user's default timetable (v2) ---------- */
const V2 = buildDefaultTemplates('2026-01-01', NOW_ISO);
const day = (d: string) => resolveDay(d, V2, []);
const spec = (title: string) => (t: { title: string }) => t.title === title;
const mins = (o: { startMin: number; endMin: number }) => o.endMin - o.startMin;
test('defaults v2: regular days (Mon,Tue,Fri,Sat,Sun) run 6:30 AM–11:30 PM with no gaps or overlaps', () => {
  for (const d of ['2026-10-26', '2026-10-27', '2026-10-30', '2026-10-31', '2026-11-01']) {
    const blocks = day(d);
    assert.equal(blocks.length, 18, d);
    assert.equal(blocks[0]!.title, 'Wake up'); assert.equal(blocks[0]!.startMin, 6 * 60 + 30);
    assert.equal(blocks.at(-1)!.title, 'Wind down'); assert.equal(blocks.at(-1)!.endMin, 23 * 60 + 30);
    blocks.forEach((o, i) => { if (i > 0) assert.equal(o.startMin, blocks[i - 1]!.endMin, `${d} ${o.title}`); });
    assert.equal(blocks.reduce((a, o) => a + o.durationMin, 0), 17 * 60);
  }
});
test('defaults v2: college days (Wed,Thu) match the requested routine', () => {
  for (const d of ['2026-10-28', '2026-10-29']) {
    const blocks = day(d);
    assert.equal(blocks.length, 18, d);
    assert.equal(blocks[0]!.startMin, 6 * 60 + 30); assert.equal(blocks.at(-1)!.endMin, 23 * 60 + 30);
    blocks.forEach((o, i) => { if (i > 0) assert.equal(o.startMin, blocks[i - 1]!.endMin, `${d} ${o.title}`); });
    const c = blocks.find(spec('College'))!; assert.equal(c.startMin, 600); assert.equal(c.endMin, 780); assert.equal(c.category, 'college');
    assert.equal(mins(blocks.find(spec('College commute'))!), 40); assert.equal(mins(blocks.find(spec('Return commute'))!), 40);
    assert.equal(mins(blocks.find(spec('Cooking'))!), 120);
    assert.equal(blocks.find(spec('Walk'))!.startMin, 18 * 60 + 30);
  }
});
test('defaults v2: weekday assignment — only Wed/Thu are college days', () => {
  for (const d of ['2026-10-26', '2026-10-27', '2026-10-30', '2026-10-31', '2026-11-01']) assert.ok(!day(d).some(spec('College')) && day(d).some(spec('Flexible time')), d);
  for (const d of ['2026-10-28', '2026-10-29']) assert.ok(day(d).some(spec('College')) && !day(d).some(spec('Flexible time')), d);
});
test('defaults v2: scheduled study blocks add up to each subject target on BOTH timetables', () => {
  const target: Record<string, number> = { dsa: 180, aiml: 120, rbi: 60, english: 30 };
  for (const d of ['2026-10-27', '2026-10-28']) {
    const study = day(d).filter((o) => o.category === 'study');
    for (const [key, want] of Object.entries(target)) {
      assert.equal(study.filter((o) => o.subjectId === subjectId(key)).reduce((a, o) => a + o.durationMin, 0), want, `${d} ${key}`);
    }
    assert.equal(study.every((o) => o.subjectId !== null), true);
  }
});
test('defaults v2: only study blocks are linked to a subject; cooking is 2h; exercise 30 min', () => {
  const regular = day('2026-10-27');
  for (const o of regular.filter((x) => x.category !== 'study')) assert.equal(o.subjectId, null, o.title);
  assert.equal(mins(regular.find(spec('Cooking'))!), 120); assert.equal(mins(regular.find(spec('Exercise'))!), 30); assert.equal(mins(regular.find(spec('Walk'))!), 60);
  assert.equal(regular.find(spec('Bath'))!.startMin >= regular.find(spec('Cooking'))!.endMin, true, 'bath after cooking');
  assert.equal(V2.every((x) => x.isDefault), true);
});
test('defaults v2: four tracked subjects with the requested targets, in priority order', () => {
  const s = buildDefaultSubjects(NOW_ISO);
  assert.deepEqual(s.map((x) => [x.name, x.dailyTargetMin]), [['DSA', 180], ['AI/ML', 120], ['RBI Preparation', 60], ['Communication', 30]]);
  assert.equal(s.reduce((a, x) => a + (x.dailyTargetMin ?? 0), 0), 390);
  assert.equal(buildDefaultPreferences(NOW_ISO).dailyStudyTargetMin, 390);
});

/* ---------- motivation content ---------- */
test('quotes: unique ids, every quote is attributed, topics covered, quote of the day is stable and filterable', () => {
  assert.equal(new Set(QUOTES.map((q) => q.id)).size, QUOTES.length);
  assert.ok(QUOTES.every((q) => q.author.trim() && q.text.trim()));
  for (const topic of TOPICS) assert.ok(QUOTES.some((q) => q.topic === topic), topic);
  assert.equal(quoteOfDay('2026-10-28').id, quoteOfDay('2026-10-28').id);
  assert.ok(quoteOfDay('2026-10-28', ['courage']).topic === 'courage');
  assert.ok(new Set(Array.from({ length: 30 }, (_, i) => quoteOfDay(`2026-11-${String(i + 1).padStart(2, '0')}`).id)).size > 5, 'varies across days');
  assert.equal(quoteById('nope'), undefined);
  assert.ok(encouragement('behind', 'x').length > 0 && encouragement('session', 'a') === encouragement('session', 'a'));
});
