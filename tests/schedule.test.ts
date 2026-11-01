import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultTemplates, planRestoreDefaults } from '../src/domain/defaults';
import { legacyTemplates } from './legacy-defaults';
import {
  conflictsForCandidate, currentAndNext, daySegments, duplicateTemplate, findConflicts, planReschedule, planTemplateDelete, planTemplateEdit,
  resolveDay, spilloverInto, templateKey,
} from '../src/domain/schedule';
import type { ScheduleException } from '../src/domain/types';
import { NOW_ISO, templates } from './factories';

const T = templates('2026-01-01');
const ex = (over: Partial<ScheduleException>): ScheduleException => ({
  id: 'e1', date: '2026-10-28', type: 'add', templateId: null, title: null, category: null, subjectId: null, color: null, startMin: null, endMin: null,
  createdAt: NOW_ISO, updatedAt: NOW_ISO, deletedAt: null, ...over,
});

test('default timetable has the requested block counts and totals', () => {
  const regular = resolveDay('2026-10-26', T, []); // Monday
  const college = resolveDay('2026-10-28', T, []); // Wednesday
  assert.equal(regular.length, 22);
  assert.equal(college.length, 16);
  // Every regular day (and college day) must account for exactly 24 hours.
  assert.equal(regular.reduce((a, o) => a + o.durationMin, 0), 1440);
  assert.equal(college.reduce((a, o) => a + o.durationMin, 0), 1440);
});

test('weekday mapping: Wed/Thu are college days, everything else regular', () => {
  const titles = (d: string) => resolveDay(d, T, []).map((o) => o.title);
  for (const d of ['2026-10-26', '2026-10-27', '2026-10-30', '2026-10-31', '2026-11-01']) assert.ok(titles(d).includes('Cooking') && !titles(d).includes('College'), d);
  for (const d of ['2026-10-28', '2026-10-29']) assert.ok(titles(d).includes('College'), d);
});

test('study vs non-study categories are kept separate', () => {
  const occ = resolveDay('2026-10-26', T, []);
  const by = (t: string) => occ.find((o) => o.title === t)!;
  for (const t of ['DSA', 'AI/ML', 'AI/ML revision', 'DSA revision', 'English speaking', 'RBI aptitude']) assert.equal(by(t).category, 'study', t);
  assert.equal(by('Exercise').category, 'exercise');
  assert.equal(by('Sleep').category, 'sleep');
  assert.equal(by('Lunch').category, 'meal');
  assert.equal(by('Cooking').category, 'cooking');
  assert.equal(by('Bath').category, 'personal');
  assert.equal(by('Sleep').countInProgress, false);
  assert.ok(occ.filter((o) => o.category === 'study').every((o) => o.subjectId !== null));
});

test('sleep crosses midnight and spills into the next morning', () => {
  const sleep = resolveDay('2026-10-26', T, []).find((o) => o.title === 'Sleep')!;
  assert.equal(sleep.crossesMidnight, true);
  assert.equal(sleep.durationMin, 420);
  const spill = spilloverInto('2026-10-27', T, []);
  assert.equal(spill.length, 1);
  assert.equal(spill[0]!.segStart, 0);
  assert.equal(spill[0]!.segEnd, 6 * 60);
  const segs = daySegments('2026-10-27', T, []);
  assert.equal(segs[0]!.title, 'Sleep');
  assert.equal(segs[0]!.spill, true);
});

test('currentAndNext at 3 AM sees spilled sleep; at 6:30 AM sees Exercise then DSA', () => {
  const at3 = currentAndNext('2026-10-27', 3 * 60, T, []);
  assert.equal(at3.current?.title, 'Sleep');
  assert.equal(at3.remainingMin, 180);
  const at630 = currentAndNext('2026-10-27', 6 * 60 + 30, T, []);
  assert.equal(at630.current?.title, 'Exercise');
  assert.equal(at630.remainingMin, 30);
  assert.equal(at630.next?.title, 'DSA');
});

test('recurring templates respect effective dates', () => {
  const t = templates('2026-10-27'); // starts Tuesday
  assert.equal(resolveDay('2026-10-26', t, []).length, 0);
  assert.equal(resolveDay('2026-10-27', t, []).length, 22);
  const closed = t.map((x) => ({ ...x, effectiveTo: '2026-10-27' }));
  assert.equal(resolveDay('2026-10-28', closed, []).length, 0);
});

test('exceptions: skip removes, override reschedules (key preserved), add inserts', () => {
  const dsa = T.find((t) => t.defaultKey === 'college-v1-01-dsa')!;
  const exceptions: ScheduleException[] = [
    ex({ id: 's', type: 'skip', templateId: T.find((t) => t.defaultKey === 'college-v1-05-college')!.id }),
    ex({ id: 'o', type: 'override', templateId: dsa.id, startMin: 7 * 60 + 30, endMin: 9 * 60 }),
    ex({ id: 'a', type: 'add', title: 'Mock test', category: 'study', startMin: 20 * 60, endMin: 21 * 60 }),
  ];
  const occ = resolveDay('2026-10-28', T, exceptions);
  assert.ok(!occ.some((o) => o.title === 'College'));
  const moved = occ.find((o) => o.title === 'DSA' && o.exceptionId === 'o')!;
  assert.equal(moved.startMin, 450);
  assert.equal(moved.rescheduled, true);
  assert.equal(moved.key, templateKey(dsa.id, '2026-10-28'));
  assert.ok(occ.some((o) => o.title === 'Mock test' && o.key === 'x:a'));
  // Other dates are untouched
  assert.ok(resolveDay('2026-10-29', T, exceptions).some((o) => o.title === 'College'));
  // Soft-deleted exceptions are ignored
  assert.ok(resolveDay('2026-10-28', T, exceptions.map((e) => ({ ...e, deletedAt: NOW_ISO }))).some((o) => o.title === 'College'));
});

test('the default timetable has no overlaps (including across midnight)', () => {
  for (const d of ['2026-10-26', '2026-10-28']) assert.deepEqual(findConflicts(d, T, []), [], d);
});

test('overlap detection: same-day, and midnight-crossing against next morning', () => {
  const same = [ex({ id: 'a', date: '2026-10-26', type: 'add', title: 'Extra', category: 'study', startMin: 7 * 60 + 30, endMin: 8 * 60 + 30 })];
  const c = findConflicts('2026-10-26', T, same);
  assert.ok(c.length >= 1);
  assert.ok(c.some((x) => [x.a.title, x.b.title].includes('Extra')));
  // A 5 AM–6:30 AM block on Tuesday collides with Monday-night's sleep (ends 6 AM) and Exercise (starts 6 AM)
  const early = [ex({ id: 'b', date: '2026-10-27', type: 'add', title: 'Early', category: 'study', startMin: 5 * 60, endMin: 6 * 60 + 30 })];
  const titles = findConflicts('2026-10-27', T, early).flatMap((x) => [x.a.title, x.b.title]);
  assert.ok(titles.includes('Sleep') && titles.includes('Exercise'));
});

test('candidate conflict check supports ignoring the block being edited', () => {
  const dsa = resolveDay('2026-10-26', T, []).find((o) => o.startMin === 7 * 60)!;
  assert.equal(conflictsForCandidate('2026-10-26', { startMin: 7 * 60, endMin: 8 * 60 }, T, []).length, 1);
  assert.equal(conflictsForCandidate('2026-10-26', { startMin: 7 * 60, endMin: 8 * 60, ignoreKey: dsa.key }, T, []).length, 0);
  assert.equal(conflictsForCandidate('2026-10-26', { startMin: 23 * 60, endMin: 1 * 60 }, T, []).length >= 1, true);
});

test('editing a recurring activity from today keeps history intact', () => {
  const dsa = T.find((t) => t.defaultKey === 'regular-v1-01-dsa')!;
  const { update, create } = planTemplateEdit(dsa, { endMin: 8 * 60 + 30 }, '2026-10-28', NOW_ISO);
  assert.ok(create);
  assert.equal(update.effectiveTo, '2026-10-27');
  assert.equal(create!.effectiveFrom, '2026-10-28');
  assert.equal(create!.seriesId, dsa.seriesId);
  assert.equal(create!.isDefault, false);
  const all = [...T.filter((t) => t.id !== dsa.id), update, create!];
  // The Monday before the edit still shows the original 1h block; the Monday after shows the new length.
  const before = resolveDay('2026-10-26', all, []).find((o) => o.startMin === 7 * 60)!;
  const after = resolveDay('2026-11-02', all, []).find((o) => o.startMin === 7 * 60)!;
  assert.equal(before.durationMin, 60);
  assert.equal(after.durationMin, 90);
});

test('editing a template that has not taken effect updates it in place', () => {
  const future = templates('2026-12-01')[1]!;
  const { update, create } = planTemplateEdit(future, { title: 'Algorithms' }, '2026-11-01', NOW_ISO);
  assert.equal(create, null);
  assert.equal(update.title, 'Algorithms');
});

test('deleting from a date ends the series; deleting a future one tombstones it', () => {
  const dsa = T.find((t) => t.defaultKey === 'regular-v1-01-dsa')!;
  const ended = planTemplateDelete(dsa, '2026-10-28', NOW_ISO);
  assert.equal(ended.effectiveTo, '2026-10-27');
  assert.equal(ended.deletedAt, null);
  const future = planTemplateDelete(templates('2026-12-01')[0]!, '2026-11-01', NOW_ISO);
  assert.equal(future.deletedAt, NOW_ISO);
  assert.equal(resolveDay('2026-10-26', [ended], []).length, 1);
  assert.equal(resolveDay('2026-11-02', [ended], []).length, 0);
});

test('duplicate creates an independent copy', () => {
  const d = duplicateTemplate(T[0]!, NOW_ISO, '2026-10-28');
  assert.notEqual(d.id, T[0]!.id);
  assert.equal(d.seriesId, d.id);
  assert.equal(d.isDefault, false);
  assert.match(d.title, /copy/);
});

test('reschedule moves one occurrence to another date without touching the series', () => {
  const lunch = resolveDay('2026-10-28', T, []).find((o) => o.title === 'Lunch')!;
  const { exceptions } = planReschedule(lunch, { date: '2026-10-29', startMin: 14 * 60, endMin: 14 * 60 + 30 }, NOW_ISO);
  assert.deepEqual(exceptions.map((e) => e.type), ['skip', 'add']);
  assert.ok(!resolveDay('2026-10-28', T, exceptions).some((o) => o.title === 'Lunch'));
  assert.ok(resolveDay('2026-10-29', T, exceptions).some((o) => o.title === 'Lunch' && o.startMin === 14 * 60));
  const sameDay = planReschedule(lunch, { date: '2026-10-28', startMin: 15 * 60, endMin: 15 * 60 + 30 }, NOW_ISO);
  assert.deepEqual(sameDay.exceptions.map((e) => e.type), ['override']);
});

test('restore defaults ends current versions yesterday and starts fresh defaults today', () => {
  const user = [...T, { ...T[0]!, id: 'user-1', isDefault: false, title: 'Custom' }];
  const plan = planRestoreDefaults(user, '2026-10-28', NOW_ISO);
  assert.equal(plan.insert.length, 36); // 18 regular + 18 college rows
  assert.ok(plan.close.every((t) => t.effectiveTo === '2026-10-27'));
  const all = [...plan.close, ...plan.insert];
  assert.equal(resolveDay('2026-10-26', all, []).length, 22 + 1); // history intact (incl. the old custom block)
  assert.equal(resolveDay('2026-11-02', all, []).length, 18);
  assert.ok(!resolveDay('2026-11-02', all, []).some((o) => o.title === 'Custom'));
  assert.equal(buildDefaultTemplates('2026-10-28', NOW_ISO)[0]!.id, plan.insert[0]!.id); // deterministic ids
});
