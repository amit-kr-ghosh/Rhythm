import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailySummary, computeDayProgress, computeHabitProgress, computeStudyProgress, computeTaskProgress, computeTimetableProgress, computeWeeklyGoal,
  habitStreak, isOverdue, pct, recordTargets, ringValue, targetsOn, weightedScore,
} from '../src/domain/progress';
import { resolveDay } from '../src/domain/schedule';
import { instantAt } from '../src/domain/time';
import { AIML, DSA, habit, habitRecord, log, prefs, session, subjects, task, templates } from './factories';

const T = templates('2026-01-01');
const P = prefs();
const DAY = '2026-10-26'; // Monday (regular day)
const at = (h: number, m = 0) => instantAt(DAY, h * 60 + m);
const occ = () => resolveDay(DAY, T, []);
const noSleep = { excludeSleepFromProgress: true };
const tp = (now: Date, logs = [] as ReturnType<typeof log>[], sessions = [] as ReturnType<typeof session>[], today = DAY) =>
  computeTimetableProgress(DAY, occ(), logs, sessions, now, today, noSleep);

test('pct: the spec example — 2h of a 3h DSA target is 66.7%', () => {
  assert.equal(pct(120, 180), 66.7);
  assert.equal(pct(0, 180), 0);
  assert.equal(pct(10, 0), null);
  assert.equal(ringValue(250), 100);
  assert.equal(ringValue(null), 0);
});

test('study progress uses recorded focus only and per-subject targets', () => {
  const s = [session({ date: DAY, minutes: 120, subjectId: DSA }), session({ date: DAY, startMin: 14 * 60, minutes: 30, subjectId: AIML }),
    session({ date: DAY, startMin: 18 * 60, minutes: 50, status: 'cancelled' })];
  const sp = computeStudyProgress(DAY, s, subjects(), P);
  const dsa = sp.subjects.find((x) => x.subjectId === DSA)!;
  assert.equal(dsa.focusMin, 120);
  assert.equal(dsa.targetMin, 180);
  assert.equal(dsa.pct, 66.7);
  assert.equal(sp.focusMin, 150); // cancelled 50 min excluded
  assert.equal(sp.pct, 31.3); // 150 / 480
  assert.equal(sp.remainingMin, 330);
});

test('paused/idle time never counts: only focusSec is used', () => {
  const s = session({ date: DAY, minutes: 60, focusSec: 20 * 60, elapsedSec: 60 * 60 });
  assert.equal(computeStudyProgress(DAY, [s], subjects(), P).focusMin, 20);
});

test('timetable progress is weighted by duration, not block count', () => {
  const o = occ();
  const dsa1 = o.find((x) => x.startMin === 7 * 60)!; // 1h
  const breakfast = o.find((x) => x.title === 'Breakfast')!; // 30m
  const now = at(9, 0);
  const a = tp(now, [log(breakfast.key, DAY, 'done')]);
  const b = tp(now, [log(dsa1.key, DAY, 'done')]);
  assert.equal(a.creditMin, 30);
  assert.equal(b.creditMin, 60);
  assert.ok(b.currentPct! > a.currentPct!);
});

test('upcoming blocks never penalise current progress', () => {
  // 8:00 AM: Exercise (6–7) and DSA (7–8) elapsed and done; rest of the day not started.
  const o = occ();
  const logs = [o[0]!, o[1]!].map((x) => log(x.key, DAY, 'done'));
  const r = tp(at(8, 0), logs);
  assert.equal(r.currentPct, 100);
  assert.ok(r.projectedFinalPct! < 20);
  assert.equal(r.isFinal, false);
});

test('before the first block starts there is nothing to judge yet', () => {
  const r = tp(at(5, 0));
  assert.equal(r.currentPct, null);
  assert.equal(r.projectedFinalPct, 0);
});

test('a block in progress counts only its elapsed part in the denominator', () => {
  const dsa = occ().find((x) => x.startMin === 7 * 60)!;
  const r = tp(at(7, 30), [log(occ()[0]!.key, DAY, 'done')]);
  const b = r.blocks.find((x) => x.occurrence.key === dsa.key)!;
  assert.equal(b.state, 'in_progress');
  assert.equal(b.elapsedMin, 30);
  assert.equal(r.elapsedMin, 60 + 30);
});

test('sleep is excluded by default and included when the preference is off', () => {
  const withSleep = computeTimetableProgress(DAY, occ(), [], [], at(23, 59), DAY, { excludeSleepFromProgress: false });
  const without = tp(at(23, 59));
  assert.equal(without.scheduledMin, 1440 - 420);
  // countInProgress=false on the template still excludes it even if the preference is off
  assert.equal(withSleep.scheduledMin, 1440 - 420);
  const sleepTpl = T.map((t) => (t.title === 'Sleep' ? { ...t, countInProgress: true } : t));
  const inc = computeTimetableProgress(DAY, resolveDay(DAY, sleepTpl, []), [], [], at(23, 59), DAY, { excludeSleepFromProgress: false });
  assert.equal(inc.scheduledMin, 1440);
});

test('cancelled blocks are excluded; skipped blocks earn zero but stay in the plan; partial earns its minutes', () => {
  const o = occ();
  const ex = o.find((x) => x.startMin === 7 * 60)!;
  const dsa2 = o.find((x) => x.startMin === 8 * 60 + 30)!;
  const bath = o.find((x) => x.title === 'Bath')!;
  const base = tp(at(23, 0));
  const r = tp(at(23, 0), [log(ex.key, DAY, 'cancelled'), log(dsa2.key, DAY, 'skipped'), log(bath.key, DAY, 'partial', { completedMin: 10 })]);
  assert.equal(r.scheduledMin, base.scheduledMin - 60); // cancelled DSA removed from the denominator
  assert.equal(r.blocks.find((b) => b.occurrence.key === dsa2.key)!.state, 'skipped');
  assert.equal(r.blocks.find((b) => b.occurrence.key === bath.key)!.creditMin, 10);
  assert.equal(r.blocks.find((b) => b.occurrence.key === bath.key)!.state, 'partial');
});

test('no double counting: a linked session and a manual tick credit the block once', () => {
  const dsa = occ().find((x) => x.startMin === 7 * 60)!;
  const linked = session({ date: DAY, startMin: 7 * 60, minutes: 60, occurrenceKey: dsa.key });
  const both = tp(at(9, 0), [log(dsa.key, DAY, 'done')], [linked]);
  assert.equal(both.blocks.find((b) => b.occurrence.key === dsa.key)!.creditMin, 60);
  // Two linked sessions of 45 min can't exceed the block's 60 min.
  const two = tp(at(9, 0), [], [session({ date: DAY, minutes: 45, occurrenceKey: dsa.key }), session({ date: DAY, startMin: 9 * 60, minutes: 45, occurrenceKey: dsa.key })]);
  assert.equal(two.blocks.find((b) => b.occurrence.key === dsa.key)!.creditMin, 60);
  // Unlinked sessions do not credit a timetable block (they still count toward study targets)
  const unlinked = tp(at(9, 0), [], [session({ date: DAY, minutes: 60 })]);
  assert.equal(unlinked.blocks.find((b) => b.occurrence.key === dsa.key)!.creditMin, 0);
});

test('linked focus on a study block credits only what was actually focused', () => {
  const dsa = occ().find((x) => x.startMin === 7 * 60)!;
  const r = tp(at(9, 0), [], [session({ date: DAY, minutes: 40, occurrenceKey: dsa.key })]);
  const b = r.blocks.find((x) => x.occurrence.key === dsa.key)!;
  assert.equal(b.creditMin, 40);
  assert.equal(b.state, 'partial');
});

test('past days are final; today is final only once nothing is pending', () => {
  const past = computeTimetableProgress(DAY, occ(), [], [], instantAt('2026-10-27', 600), '2026-10-27', noSleep);
  assert.equal(past.isFinal, true);
  assert.equal(past.currentPct, 0);
  assert.equal(past.currentPct, past.projectedFinalPct);
  assert.equal(tp(at(12, 0)).isFinal, false);
});

test('future days have no elapsed time and no score', () => {
  const r = computeTimetableProgress('2026-10-30', resolveDay('2026-10-30', T, []), [], [], at(12), DAY, noSleep);
  assert.equal(r.elapsedMin, 0);
  assert.equal(r.currentPct, null);
});

test('target history: changing a target does not rewrite earlier days', () => {
  const subs = subjects();
  let history = recordTargets([], '2026-10-01', P, subs);
  assert.equal(history.length, 1);
  assert.equal(recordTargets(history, '2026-10-05', P, subs), history); // unchanged → same array
  const changed = { ...P, dailyStudyTargetMin: 240 };
  history = recordTargets(history, '2026-10-20', changed, subs);
  assert.equal(history.length, 2);
  const withHistory = { ...changed, targetHistory: history };
  const s = [session({ date: '2026-10-10', minutes: 240 }), session({ date: '2026-10-25', minutes: 240 })];
  assert.equal(computeStudyProgress('2026-10-10', s, subs, withHistory).pct, 50); // old 480 target
  assert.equal(computeStudyProgress('2026-10-25', s, subs, withHistory).pct, 100); // new 240 target
  assert.equal(targetsOn(history, '2026-09-01', { dailyMin: 1, weeklyMin: 7 }).dailyMin, 1); // before any entry → fallback
  // changing a subject's own target also records a new entry
  const edited = subs.map((x) => (x.id === DSA ? { ...x, dailyTargetMin: 90 } : x));
  assert.equal(recordTargets(history, '2026-10-26', changed, edited).length, 3);
});

test('weekly goal sums the week (respecting week start) and reports remaining time', () => {
  const s = [session({ date: '2026-10-26', minutes: 120 }), session({ date: '2026-10-28', minutes: 60 }), session({ date: '2026-10-25', minutes: 500 })];
  const mon = computeWeeklyGoal('2026-10-28', s, 1, P);
  assert.equal(mon.focusMin, 180); // Sunday 10-25 belongs to the previous Mon-start week
  assert.equal(mon.pct, pct(180, 3360));
  const sun = computeWeeklyGoal('2026-10-28', s, 0, P);
  assert.equal(sun.focusMin, 680);
});

test('tasks: due today, recurring, overdue and completion percentage', () => {
  const t1 = task({ dueDate: DAY, status: 'done', completedAt: instantAt(DAY, 600).toISOString() });
  const t2 = task({ dueDate: DAY });
  const t3 = task({ dueDate: '2026-10-20' });
  const rec = task({ dueDate: '2026-10-01', recurrence: { freq: 'weekly', weekdays: [1] }, doneDates: [DAY] });
  const cancelled = task({ dueDate: DAY, status: 'cancelled' });
  const r = computeTaskProgress(DAY, [t1, t2, t3, rec, cancelled]);
  assert.deepEqual([r.done, r.total, r.pct], [2, 3, 66.7]);
  assert.equal(isOverdue(t3, DAY), true);
  assert.equal(isOverdue(t1, DAY), false);
  assert.equal(isOverdue(rec, DAY), false);
  assert.equal(computeTaskProgress(DAY, []).pct, null);
});

test('habits: scheduled days only, with streaks that survive an unfinished today', () => {
  const h = habit({ weekdays: [1, 2, 3, 4, 5] });
  const records = ['2026-10-23', '2026-10-26', '2026-10-27'].map((d) => habitRecord(h, d)); // Fri, Mon, Tue (weekend skipped)
  assert.equal(computeHabitProgress('2026-10-27', [h], records).pct, 100);
  assert.equal(computeHabitProgress('2026-10-31', [h], records).total, 0); // Saturday → not scheduled
  assert.equal(habitStreak(h, records, '2026-10-27'), 3);
  assert.equal(habitStreak(h, records, '2026-10-28'), 3); // Wed not done yet → streak intact
  assert.equal(habitStreak(h, records, '2026-10-29'), 0); // missed Wed → broken
});

test('weighted score renormalises over components that have data and ignores zero weights', () => {
  const w = { timetable: 30, study: 40, tasks: 15, habits: 15 };
  assert.equal(weightedScore({ timetable: 100, study: 50, tasks: null, habits: null }, w), round((100 * 30 + 50 * 40) / 70));
  assert.equal(weightedScore({ timetable: null, study: null, tasks: null, habits: null }, w), null);
  assert.equal(weightedScore({ timetable: 80, study: 20, tasks: 100, habits: 0 }, { timetable: 1, study: 0, tasks: 0, habits: 0 }), 80);
  assert.equal(weightedScore({ timetable: 120, study: 0, tasks: null, habits: null }, w), round((100 * 30) / 70)); // capped at 100
});
const round = (n: number) => Math.round(n * 10) / 10;

test('overall day progress for a brand-new user is null, not a fabricated number', () => {
  const r = computeDayProgress({ date: DAY, now: at(8), today: DAY, occurrences: [], logs: [], sessions: [], subjects: subjects(), tasks: [], habits: [], habitRecords: [], prefs: P });
  assert.equal(r.timetable.currentPct, null);
  assert.equal(r.tasks.pct, null);
  assert.equal(r.habits.pct, null);
  assert.equal(r.study.pct, 0); // there IS a target, and 0 minutes recorded
  assert.equal(r.score, 0);
  const s = buildDailySummary(r, false);
  assert.deepEqual(s.achievements, []);
});

test('daily summary reports only what happened', () => {
  const dsa = occ().find((x) => x.startMin === 7 * 60)!;
  const sessions = [session({ date: DAY, minutes: 180, subjectId: DSA, occurrenceKey: dsa.key })];
  const r = computeDayProgress({ date: DAY, now: at(23), today: DAY, occurrences: occ(), logs: [], sessions, subjects: subjects(), tasks: [task({ dueDate: DAY })], habits: [], habitRecords: [], prefs: P });
  const s = buildDailySummary(r, true);
  assert.ok(s.achievements.some((a) => a.includes('DSA target reached')));
  assert.ok(s.missed.some((m) => m.includes('AI/ML')));
  assert.ok(s.missed.some((m) => m.includes('task')));
  assert.match(s.headline, /^Final:/);
});
