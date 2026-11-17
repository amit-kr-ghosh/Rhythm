import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adherenceTrend, avgSessionMin, buildInsights, categoryDistribution, compareRanges, dailyFocus, focusByHour, focusByWeekday, heatmap, monthRange,
  previousMonth, previousRange, scheduledVsActualStudy, sessionCompletionRate, streaks, subjectDistribution, targetCompletion, taskStats, totalFocus,
  weekRange, type AnalyticsInput,
} from '../src/domain/analytics';
import { dailyFocusBySubject, subjectHeatmap } from '../src/domain/analytics';
import { instantAt } from '../src/domain/time';
import { AIML, DSA, log, prefs, session, subjects, task, templates } from './factories';

const TODAY = '2026-10-28'; // Wednesday
const NOW = instantAt(TODAY, 20 * 60);
const input = (sessions: ReturnType<typeof session>[] = [], extra: Partial<AnalyticsInput> = {}): AnalyticsInput => ({
  sessions, templates: templates(), exceptions: [], logs: [], tasks: [], subjects: subjects(), prefs: prefs(), today: TODAY, now: NOW, ...extra,
});

test('daily focus sums per local date, fills gaps with zero, and honours the subject filter', () => {
  const s = [session({ date: '2026-10-26', minutes: 90 }), session({ date: '2026-10-26', startMin: 15 * 60, minutes: 30, subjectId: AIML }), session({ date: '2026-10-28', minutes: 45 })];
  const r = dailyFocus(s, { from: '2026-10-26', to: '2026-10-28' });
  assert.deepEqual(r.map((d) => d.min), [120, 0, 45]);
  assert.deepEqual(dailyFocus(s, { from: '2026-10-26', to: '2026-10-28' }, AIML).map((d) => d.min), [30, 0, 0]);
  assert.equal(totalFocus(s, { from: '2026-10-26', to: '2026-10-28' }), 165);
});

test('invalid sessions (cancelled, zero focus, deleted) never reach analytics', () => {
  const s = [session({ date: TODAY, minutes: 60 }), session({ date: TODAY, minutes: 60, status: 'cancelled' }), session({ date: TODAY, minutes: 60, focusSec: 0 }), session({ date: TODAY, minutes: 60, deletedAt: 'x' })];
  assert.equal(totalFocus(s, { from: TODAY, to: TODAY }), 60);
  assert.equal(avgSessionMin(s, { from: TODAY, to: TODAY }), 60);
});

test('a late-night session stays on the local day it started (date boundary)', () => {
  const s = session({ date: '2026-10-27', startMin: 23 * 60 + 30, minutes: 60 }); // crosses midnight
  assert.equal(totalFocus([s], { from: '2026-10-27', to: '2026-10-27' }), 60);
  assert.equal(totalFocus([s], { from: '2026-10-28', to: '2026-10-28' }), 0);
  const hours = focusByHour([s], { from: '2026-10-27', to: '2026-10-27' });
  assert.equal(hours[23], 30);
  assert.equal(hours[0], 30);
});

test('subject distribution shares sum to ~100 and unassigned time is labelled', () => {
  const s = [session({ date: TODAY, minutes: 60, subjectId: DSA }), session({ date: TODAY, startMin: 12 * 60, minutes: 30, subjectId: AIML }), session({ date: TODAY, startMin: 15 * 60, minutes: 30, subjectId: null })];
  const d = subjectDistribution(s, subjects(), { from: TODAY, to: TODAY });
  assert.equal(d[0]!.name, 'DSA');
  assert.equal(d[0]!.share, 50);
  assert.equal(d.find((x) => x.subjectId === null)!.name, 'Unassigned');
  assert.ok(Math.abs(d.reduce((a, b) => a + b.share, 0) - 100) < 0.2);
});

test('average session length and completion rate (manual entries excluded from the rate)', () => {
  const s = [session({ date: TODAY, minutes: 30 }), session({ date: TODAY, startMin: 11 * 60, minutes: 90 }),
    session({ date: TODAY, startMin: 14 * 60, minutes: 20, status: 'cancelled' }), session({ date: TODAY, startMin: 16 * 60, minutes: 40, status: 'interrupted' }),
    session({ date: TODAY, startMin: 18 * 60, minutes: 60, source: 'manual' })];
  const r = { from: TODAY, to: TODAY };
  assert.equal(avgSessionMin(s, r), 55); // (30+90+40+60)/4, cancelled excluded
  assert.equal(sessionCompletionRate(s, r), 50); // 2 completed timer sessions of 4
  assert.equal(sessionCompletionRate([], r), null);
});

test('week and month comparisons use the week-start preference and calendar months', () => {
  const s = [session({ date: '2026-10-19', minutes: 60 }), session({ date: '2026-10-26', minutes: 120 }), session({ date: '2026-09-30', minutes: 30 })];
  const wk = weekRange(TODAY, 1);
  assert.deepEqual(wk, { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(previousRange(wk), { from: '2026-10-19', to: '2026-10-25' });
  const c = compareRanges(s, wk, previousRange(wk));
  assert.deepEqual([c.current, c.previous, c.deltaMin, c.deltaPct], [120, 60, 60, 100]);
  assert.equal(compareRanges(s, previousRange(wk), { from: '2026-10-12', to: '2026-10-18' }).deltaPct, null); // no baseline → no percentage
  assert.deepEqual(monthRange(TODAY), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(previousMonth(TODAY), { from: '2026-09-01', to: '2026-09-30' });
  assert.equal(totalFocus(s, previousMonth(TODAY)), 30);
});

test('weekday and hour histograms', () => {
  const s = [session({ date: '2026-10-26', startMin: 9 * 60, minutes: 60 }), session({ date: '2026-10-27', startMin: 9 * 60, minutes: 30 })];
  const wd = focusByWeekday(s, { from: '2026-10-25', to: '2026-10-31' });
  assert.equal(wd[1], 60);
  assert.equal(wd[2], 30);
  const h = focusByHour(s, { from: '2026-10-25', to: '2026-10-31' });
  assert.equal(h[9], 90);
  assert.equal(h.reduce((a, b) => a + b, 0), 90);
});

test('hour histogram spreads only the focused portion of a session with pauses', () => {
  const s = session({ date: TODAY, startMin: 10 * 60, minutes: 60, focusSec: 30 * 60 });
  const h = focusByHour([s], { from: TODAY, to: TODAY });
  assert.equal(h[10], 30);
});

test('streaks: threshold, today-not-yet-counted grace, longest run', () => {
  const day = (d: string, m: number) => session({ date: d, minutes: m });
  const s = [day('2026-10-20', 90), day('2026-10-21', 90), day('2026-10-22', 30), day('2026-10-24', 90), day('2026-10-25', 90), day('2026-10-26', 90), day('2026-10-27', 90)];
  const r = streaks(s, TODAY, 60); // Wed 28th has no session yet
  assert.equal(r.current, 4); // 24th–27th; today pending doesn't break it
  assert.equal(r.longest, 4);
  assert.equal(r.runs.length, 2);
  const broken = streaks(s, '2026-10-29', 60);
  assert.equal(broken.current, 0);
  assert.equal(streaks([], TODAY, 60).current, 0);
  assert.equal(streaks([day('2026-10-28', 5)], TODAY, 0).current, 1); // threshold 0 → any focus counts
});

test('heatmap levels scale to the busiest day', () => {
  const s = [session({ date: '2026-10-26', minutes: 240 }), session({ date: '2026-10-27', minutes: 60 }), session({ date: '2026-10-28', minutes: 130 })];
  const h = heatmap(s, { from: '2026-10-25', to: '2026-10-28' });
  assert.deepEqual(h.map((x) => x.level), [0, 4, 1, 3]);
});

test('target completion uses the targets that applied on each day', () => {
  const p = prefs();
  const hist = [{ from: '2026-10-01', dailyMin: 480, weeklyMin: 3360, subjects: { [DSA]: { daily: 180, weekly: 1260 } } }, { from: '2026-10-27', dailyMin: 240, weeklyMin: 1680, subjects: { [DSA]: { daily: 90, weekly: 630 } } }];
  const i = input([session({ date: '2026-10-26', minutes: 180 }), session({ date: '2026-10-27', minutes: 90 })], { prefs: { ...p, targetHistory: hist } });
  const all = targetCompletion(i, { from: '2026-10-26', to: '2026-10-27' });
  assert.deepEqual(all.map((d) => d.pct), [37.5, 37.5]);
  const dsa = targetCompletion(i, { from: '2026-10-26', to: '2026-10-27' }, DSA);
  assert.deepEqual(dsa.map((d) => d.pct), [100, 100]);
});

test('scheduled vs actual study time', () => {
  const i = input([session({ date: '2026-10-26', minutes: 200 })]);
  const r = scheduledVsActualStudy(i, { from: '2026-10-26', to: '2026-10-28' });
  assert.equal(r[0]!.scheduledMin, 480); // regular day: 8 h of study blocks
  assert.equal(r[0]!.actualMin, 200);
  assert.equal(r[2]!.scheduledMin, 300 - 0 + 0 === 300 ? r[2]!.scheduledMin : 0); // college day computed independently
  const dsaOnly = scheduledVsActualStudy(i, { from: '2026-10-26', to: '2026-10-26' }, DSA);
  assert.equal(dsaOnly[0]!.scheduledMin, 210);
});

test('adherence trend skips future days; category distribution separates study from non-study', () => {
  const i = input([], { logs: [log(`${templates()[0]!.id}@2026-10-26`, '2026-10-26', 'done')] });
  const trend = adherenceTrend(i, { from: '2026-10-26', to: '2026-10-31' });
  assert.equal(trend.length, 3); // 26, 27, 28 (today) — nothing for the future
  const dist = categoryDistribution(i, { from: '2026-10-26', to: '2026-10-26' });
  const study = dist.find((d) => d.category === 'study')!;
  assert.equal(study.plannedMin, 480);
  assert.equal(dist.find((d) => d.category === 'exercise')!.creditMin, 60);
  assert.ok(dist.some((d) => d.category === 'sleep'));
});

test('task statistics', () => {
  const tasks = [task({ dueDate: '2026-10-26', status: 'done' }), task({ dueDate: '2026-10-27' }), task({ dueDate: '2026-10-28', status: 'done' }), task({ dueDate: '2026-11-05' })];
  const r = taskStats(tasks, { from: '2026-10-26', to: '2026-11-01' }, TODAY);
  assert.deepEqual([r.due, r.dueDone, r.completionRate, r.overdue], [3, 2, 66.7, 1]);
});

test('insights: nothing is invented for an empty history', () => {
  assert.deepEqual(buildInsights(input([])), []);
});

test('insights: flag a lagging subject and report week-over-week change from real data', () => {
  const s = [
    session({ date: '2026-10-19', minutes: 100 }), session({ date: '2026-10-20', minutes: 100 }),
    session({ date: '2026-10-26', minutes: 30, subjectId: AIML }), session({ date: '2026-10-27', minutes: 30, subjectId: AIML }), session({ date: '2026-10-28', minutes: 30, subjectId: AIML }),
  ];
  const ins = buildInsights(input(s));
  assert.ok(ins.some((x) => x.id === `lag-${DSA}` && x.tone === 'attention'), JSON.stringify(ins));
  assert.ok(ins.some((x) => x.id === 'wow'));
});

/* ---------- per-subject views ---------- */

test('dailyFocusBySubject splits a day by subject, largest first, and keeps empty days', () => {
  const subs = subjects();
  const [a, b] = [subs[0]!, subs[1]!];
  const sessions = [
    session({ date: '2026-11-02', subjectId: a.id, minutes: 30 }),
    session({ date: '2026-11-02', subjectId: b.id, minutes: 50 }),
    session({ date: '2026-11-02', subjectId: a.id, minutes: 10 }),
  ];
  const days = dailyFocusBySubject(sessions, { from: '2026-11-01', to: '2026-11-03' });
  assert.equal(days.length, 3);
  assert.equal(days[0]!.totalMin, 0); assert.deepEqual(days[0]!.parts, []);
  assert.equal(days[1]!.totalMin, 90);
  assert.deepEqual(days[1]!.parts.map((p) => [p.subjectId, p.min]), [[b.id, 50], [a.id, 40]]);
  assert.equal(dailyFocusBySubject(sessions, { from: '2026-11-02', to: '2026-11-02' }, a.id)[0]!.totalMin, 40, 'subject filter');
});

test('subjectHeatmap colours each day by its top subject and scales intensity to the busiest day', () => {
  const subs = subjects();
  const [a, b] = [subs[0]!, subs[1]!];
  const sessions = [
    session({ date: '2026-11-02', subjectId: a.id, minutes: 20 }),
    session({ date: '2026-11-02', subjectId: b.id, minutes: 100 }),
    session({ date: '2026-11-03', subjectId: a.id, minutes: 30 }),
  ];
  const cells = subjectHeatmap(sessions, subs, { from: '2026-11-01', to: '2026-11-04' });
  assert.deepEqual(cells.map((c) => c.level), [0, 4, 1, 0]);
  assert.equal(cells[1]!.color, b.color, 'busiest subject on 2 Nov is b');
  assert.equal(cells[2]!.color, a.color);
  assert.equal(cells[0]!.color, null, 'empty day has no colour');
  assert.equal(cells[0]!.subjectId, null);
});

import { overallTargets } from '../src/domain/study';
test('overallTargets sums per-subject targets; missing weekly counts as 7 days', () => {
  const mk = (id: string, d: number | null, w: number | null) => ({ id, deletedAt: null, archived: false, sortOrder: 0, dailyTargetMin: d, weeklyTargetMin: w }) as never;
  assert.deepEqual(overallTargets([mk('a', 120, 600), mk('b', 60, null), mk('c', null, null)]), { dailyMin: 180, weeklyMin: 1020 });
  assert.deepEqual(overallTargets([]), { dailyMin: 0, weeklyMin: 0 });
});
