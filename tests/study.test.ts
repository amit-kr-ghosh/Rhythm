import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_LABEL, formatCompact, formatExact, overrideKey, rangeSummary, statusFromPct, studyDay, subjectDay, trackedSubjects,
} from '../src/domain/study';
import { DEFAULTS_V2_KEY, SEED_EPOCH, buildDefaultPreferences, buildDefaultSubjects, buildDefaultTemplates, planDefaultsV2, subjectId } from '../src/domain/defaults';
import { cancelTimer, finishTimer, pause, resume, startTimer } from '../src/domain/timer';
import { buildManualSession, isDuplicateSession, toSession } from '../src/domain/sessions';
import { recordTargets } from '../src/domain/progress';
import { instantAt } from '../src/domain/time';
import { log, session, NOW_ISO } from './factories';
import { legacySubjects, legacyTemplates } from './legacy-defaults';

const subjects = buildDefaultSubjects(NOW_ISO);
const prefs = buildDefaultPreferences(NOW_ISO);
const DSA = subjectId('dsa'), AIML = subjectId('aiml'), RBI = subjectId('rbi'), COMM = subjectId('english');
const dsa = subjects.find((s) => s.id === DSA)!;
const D = '2026-10-27'; // Tuesday

test('status thresholds use exact percentages: <50 not done, 50–99 half, ≥100 done', () => {
  assert.equal(statusFromPct(0), 'not_done'); assert.equal(statusFromPct(49.99), 'not_done');
  assert.equal(statusFromPct(50), 'half'); assert.equal(statusFromPct(99.9), 'half');
  assert.equal(statusFromPct(100), 'done'); assert.equal(statusFromPct(140), 'done');
  assert.deepEqual(Object.values(STATUS_LABEL), ['Not done', 'Half done', 'Done']);
});

test('tracked subjects are exactly DSA, AI/ML, RBI Preparation, Communication — in priority order', () => {
  assert.deepEqual(trackedSubjects(subjects).map((s) => s.name), ['DSA', 'AI/ML', 'RBI Preparation', 'Communication']);
  // an archived subject (e.g. the old Backend Development) is never tracked
  assert.deepEqual(trackedSubjects(legacySubjects(NOW_ISO).map((s) => (s.name === 'Backend Development' ? { ...s, archived: true } : s))).map((s) => s.name),
    ['DSA', 'AI/ML', 'RBI Grade B Preparation', 'English Speaking']);
});

test('the DSA example: three 60-minute sessions reach 180/180 with start and end times recorded', () => {
  const ss = [session({ date: D, startMin: 8 * 60 }), session({ date: D, startMin: 10 * 60 }), session({ date: D, startMin: 16 * 60 + 30 })];
  const r = subjectDay(D, dsa, ss, prefs);
  assert.equal(r.actualSec, 180 * 60); assert.equal(r.targetSec, 180 * 60); assert.equal(r.remainingSec, 0);
  assert.equal(r.pct, 100); assert.equal(r.status, 'done'); assert.equal(r.sessionCount, 3);
  assert.deepEqual(r.sessions.map((s) => s.startedAt), ss.map((s) => s.startedAt).sort());
  assert.equal(r.sessions[0]!.endedAt, instantAt(D, 9 * 60).toISOString());
});

test('actual time is exact to the second and remaining time is target − actual', () => {
  const r = subjectDay(D, dsa, [session({ date: D, minutes: 45, focusSec: 45 * 60 + 30, elapsedSec: 45 * 60 + 30 })], prefs);
  assert.equal(r.actualSec, 2730); assert.equal(r.remainingSec, 180 * 60 - 2730);
  assert.equal(formatExact(r.actualSec), '45m 30s'); assert.equal(formatExact(3909), '1h 05m 09s'); assert.equal(formatCompact(3 * 3600 + 20 * 60), '3h 20m');
});

test('studying outside the scheduled block still counts; scheduled time alone never counts', () => {
  const night = session({ date: D, startMin: 23 * 60 - 30, minutes: 30 }); // not linked to any block, late at night
  assert.equal(subjectDay(D, dsa, [night], prefs).actualSec, 30 * 60);
  // no sessions at all: the timetable has DSA scheduled (3h) yet nothing is recorded
  const day = studyDay(D, subjects, [], prefs);
  assert.equal(day.total.actualSec, 0); assert.equal(day.rows.every((r) => r.status === 'not_done'), true);
  assert.equal(day.total.targetSec, 390 * 60);
});

test('cancelled sessions, deleted sessions and other subjects/days do not leak into a subject', () => {
  const ss = [session({ date: D, status: 'cancelled' }), session({ date: D, deletedAt: NOW_ISO }), session({ date: D, subjectId: AIML }), session({ date: '2026-10-26' }), session({ date: D, minutes: 10 })];
  assert.equal(subjectDay(D, dsa, ss, prefs).actualSec, 600);
});

test('dashboard example: 120/180, 90/120, 30/60, 30/30 → 67%, 75%, 50%, 100% and a combined total', () => {
  const ss = [session({ date: D, minutes: 120 }), session({ date: D, subjectId: AIML, minutes: 90 }), session({ date: D, subjectId: RBI, minutes: 30 }), session({ date: D, subjectId: COMM, minutes: 30 })];
  const { rows, total } = studyDay(D, subjects, ss, prefs);
  assert.deepEqual(rows.map((r) => Math.round(r.pct)), [67, 75, 50, 100]);
  assert.deepEqual(rows.map((r) => r.status), ['half', 'half', 'half', 'done']);
  assert.equal(total.actualSec, 270 * 60); assert.equal(total.targetSec, 390 * 60); assert.equal(Math.round(total.pct), 69);
});

test('manual status override changes the label only — it can never fabricate study minutes', () => {
  const ov = log(overrideKey(DSA, D), D, 'done', { id: 'ov1' });
  const r = subjectDay(D, dsa, [], prefs, [ov]);
  assert.equal(r.status, 'done'); assert.equal(r.manual, true); assert.equal(r.computedStatus, 'not_done');
  assert.equal(r.actualSec, 0); assert.equal(r.pct, 0); assert.equal(r.remainingSec, 180 * 60);
  assert.equal(studyDay(D, subjects, [], prefs, [ov]).total.actualSec, 0);
  assert.equal(subjectDay(D, dsa, [], prefs, [{ ...ov, deletedAt: NOW_ISO }]).manual, false, 'clearing restores the computed status');
});

test('timer: paused time is excluded, resume continues, and the saved record carries real start/end timestamps', () => {
  const t0 = Date.parse('2026-10-27T04:00:00.000Z');
  let s = startTimer({ mode: 'stopwatch', focusMs: 0, breakMs: 0, subjectId: DSA, occurrenceKey: null, taskId: null }, 'sess-1', t0);
  s = pause(s, t0 + 20 * 60_000);          // studied 20 min
  s = resume(s, t0 + 50 * 60_000);         // 30 min paused (not counted)
  const draft = finishTimer(s, t0 + 65 * 60_000)!;  // 15 more min
  assert.equal(draft.focusSec, 35 * 60);
  assert.equal(draft.startedAt, new Date(t0).toISOString()); assert.equal(draft.endedAt, new Date(t0 + 65 * 60_000).toISOString());
  assert.equal(draft.subjectId, DSA);
  assert.equal(finishTimer(pause(s, t0 + 55 * 60_000), t0 + 120 * 60_000)!.focusSec, 25 * 60, 'time after a final pause is not counted');
  const saved = toSession(draft, NOW_ISO);
  assert.equal(subjectDay(saved.date, dsa, [saved], prefs).actualSec, 35 * 60);
  assert.equal(cancelTimer(s, t0 + 65 * 60_000)!.status, 'cancelled', 'discarded sessions are kept but excluded from totals');
});

test('multiple and interrupted sessions for one subject accumulate; saving twice never duplicates', () => {
  const a = session({ date: D, startMin: 9 * 60, minutes: 40, status: 'interrupted' });
  const b = session({ date: D, startMin: 11 * 60, minutes: 20 });
  assert.equal(subjectDay(D, dsa, [a, b], prefs).actualSec, 60 * 60);
  assert.equal(isDuplicateSession(a, [a]), true, 'same id');
  assert.equal(isDuplicateSession({ ...a, id: 'other' }, [a]), true, 'same subject + same start/end');
  assert.equal(isDuplicateSession(b, [a]), false);
});

test('manual entry: exact start/end, counts toward the subject, rejects overlaps and future times', () => {
  const now = instantAt(D, 20 * 60);
  const ok = buildManualSession({ date: D, startMin: 8 * 60, durationMin: 90, subjectId: AIML, note: '' }, [], now);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.session.startedAt, instantAt(D, 8 * 60).toISOString()); assert.equal(ok.session.endedAt, instantAt(D, 9 * 60 + 30).toISOString());
    assert.equal(subjectDay(D, subjects.find((s) => s.id === AIML)!, [ok.session], prefs).actualSec, 90 * 60);
    assert.equal(buildManualSession({ date: D, startMin: 9 * 60, durationMin: 30, subjectId: AIML, note: '' }, [ok.session], now).ok, false, 'overlap');
  }
  assert.equal(buildManualSession({ date: D, startMin: 21 * 60, durationMin: 30, subjectId: AIML, note: '' }, [], now).ok, false, 'future');
});

test('week summary: per-subject actual vs target, only elapsed days count, future days are gaps', () => {
  const today = '2026-10-29'; // Thursday; week Mon 26 – Sun 1 Nov
  const ss = [session({ date: '2026-10-26', minutes: 180 }), session({ date: '2026-10-27', minutes: 90 }), session({ date: '2026-10-28', subjectId: AIML, minutes: 120 })];
  const w = rangeSummary('2026-10-26', '2026-11-01', today, subjects, ss, prefs);
  assert.equal(w.days, 4);
  const dsaRow = w.subjects[0]!; assert.equal(dsaRow.actualSec, 270 * 60); assert.equal(dsaRow.targetSec, 4 * 180 * 60); assert.equal(dsaRow.activeDays, 2);
  assert.equal(w.total.targetSec, 4 * 390 * 60); assert.equal(w.total.actualSec, 390 * 60);
  assert.deepEqual(w.daily.map((d) => (d.pct === null ? null : Math.round(d.pct))), [46, 23, 31, 0, null, null, null]);
  assert.equal(w.sessionCount, 3);
});

test('month and custom ranges use the same maths; sessions outside the range are ignored', () => {
  const today = '2026-10-31';
  const ss = [session({ date: '2026-10-01', minutes: 60 }), session({ date: '2026-10-15', minutes: 60 }), session({ date: '2026-09-30', minutes: 600 })];
  const m = rangeSummary('2026-10-01', '2026-10-31', today, subjects, ss, prefs);
  assert.equal(m.days, 31); assert.equal(m.subjects[0]!.actualSec, 120 * 60); assert.equal(m.subjects[0]!.targetSec, 31 * 180 * 60);
  const c = rangeSummary('2026-10-10', '2026-10-20', today, subjects, ss, prefs);
  assert.equal(c.days, 11); assert.equal(c.subjects[0]!.actualSec, 60 * 60); assert.equal(c.sessionCount, 1);
  assert.equal(rangeSummary('2026-11-05', '2026-11-09', today, subjects, ss, prefs).total.targetSec, 0, 'entirely in the future');
});

test('analytics never invent history: no sessions → zero actual, null daily points only for the future', () => {
  const r = rangeSummary('2026-10-26', '2026-11-01', '2026-10-28', subjects, [], prefs);
  assert.equal(r.total.actualSec, 0); assert.equal(r.sessionCount, 0);
  assert.deepEqual(r.daily.map((d) => d.pct), [0, 0, 0, null, null, null, null]);
});

test('changing a target later does not rewrite earlier days', () => {
  const h1 = recordTargets([], '2026-10-01', prefs, subjects);
  const bumped = subjects.map((s) => (s.id === DSA ? { ...s, dailyTargetMin: 240 } : s));
  const p2 = { ...prefs, targetHistory: recordTargets(h1, '2026-10-20', prefs, bumped) };
  assert.equal(subjectDay('2026-10-10', bumped[0]!, [], p2).targetSec, 180 * 60);
  assert.equal(subjectDay('2026-10-21', bumped[0]!, [], p2).targetSec, 240 * 60);
});

/* ---------------- upgrade from the v1 defaults ---------------- */
const v1 = () => ({ subjects: legacySubjects(SEED_EPOCH), templates: legacyTemplates('2026-10-01', SEED_EPOCH), prefs: { ...buildDefaultPreferences(SEED_EPOCH), dailyStudyTargetMin: 480, weeklyStudyTargetMin: 3360 } });

test('upgrade: untouched v1 defaults become the v2 subjects, targets and timetable', () => {
  const { subjects: s, templates: t, prefs: p } = v1();
  const plan = planDefaultsV2({ subjects: s, templates: t, prefs: p, today: '2026-10-31', now: NOW_ISO });
  const byId = new Map(plan.subjects.map((x) => [x.id, x]));
  assert.equal(byId.get(COMM)!.name, 'Communication'); assert.equal(byId.get(COMM)!.dailyTargetMin, 30); assert.equal(byId.get(COMM)!.id, COMM, 'same id keeps its history');
  assert.equal(byId.get(RBI)!.name, 'RBI Preparation');
  assert.equal(byId.get(subjectId('backend'))!.archived, true);
  assert.equal(plan.preferences!.dailyStudyTargetMin, 390); assert.equal(plan.preferences!.weeklyStudyTargetMin, 2730);
  assert.equal(plan.timetableSkipped, false);
  assert.equal(plan.insert.length, 36);
  assert.ok(plan.close.every((x) => x.effectiveTo === '2026-10-30' || x.deletedAt), 'old versions are closed, never hard-deleted');
  assert.ok(plan.insert.every((x) => x.effectiveFrom === '2026-10-31' && x.defaultKey!.includes('-v2-')));
});

test('upgrade is idempotent and creates no duplicate timetable rows', () => {
  const { subjects: s, templates: t, prefs: p } = v1();
  const first = planDefaultsV2({ subjects: s, templates: t, prefs: p, today: '2026-10-31', now: NOW_ISO });
  const s2 = s.map((x) => first.subjects.find((y) => y.id === x.id) ?? x);
  const t2 = [...t.map((x) => first.close.find((y) => y.id === x.id) ?? x), ...first.insert];
  const second = planDefaultsV2({ subjects: s2, templates: t2, prefs: first.preferences!, today: '2026-10-31', now: NOW_ISO });
  assert.deepEqual([second.subjects.length, second.close.length, second.insert.length, second.preferences], [0, 0, 0, null]);
  const active = t2.filter((x) => !x.deletedAt && x.effectiveTo === null);
  assert.equal(new Set(active.map((x) => x.id)).size, active.length);
  assert.equal(DEFAULTS_V2_KEY, 'defaultsV2');
});

test('upgrade preserves user customisation and history', () => {
  const { subjects: s, templates: t, prefs: p } = v1();
  const custom = s.map((x) => (x.id === COMM ? { ...x, name: 'Speaking club', dailyTargetMin: 45 } : x));
  const edited = t.map((x, i) => (i === 0 ? { ...x, updatedAt: '2026-10-20T00:00:00.000Z', title: 'My own routine' } : x));
  const plan = planDefaultsV2({ subjects: custom, templates: edited, prefs: { ...p, dailyStudyTargetMin: 500 }, today: '2026-10-31', now: NOW_ISO });
  assert.equal(plan.subjects.some((x) => x.id === COMM), false, 'customised subject untouched');
  assert.equal(plan.preferences, null, 'customised overall target untouched');
  assert.equal(plan.timetableSkipped, true); assert.equal(plan.insert.length, 0); assert.equal(plan.close.length, 0);
  // sessions recorded against English Speaking stay attached (same id) and keep counting for Communication
  const old = session({ date: '2026-10-20', subjectId: COMM, minutes: 40 });
  const upgraded = planDefaultsV2({ subjects: s, templates: t, prefs: p, today: '2026-10-31', now: NOW_ISO }).subjects;
  const comm = upgraded.find((x) => x.id === COMM)!;
  assert.equal(subjectDay('2026-10-20', comm, [old], { ...p, targetHistory: [] }).actualSec, 40 * 60);
});

test('fresh installs get the v2 defaults directly (nothing to upgrade)', () => {
  const plan = planDefaultsV2({ subjects: buildDefaultSubjects(SEED_EPOCH), templates: buildDefaultTemplates('2026-10-31', SEED_EPOCH), prefs: { ...buildDefaultPreferences(SEED_EPOCH) }, today: '2026-10-31', now: NOW_ISO });
  assert.deepEqual([plan.subjects.length, plan.close.length, plan.insert.length, plan.timetableSkipped], [0, 0, 0, false]);
});

import { addDays, weekDates, weekdayOf } from '../src/domain/time';
test('timetable arrows step one day: Sunday → Monday (next week) and Monday → Sunday (previous week)', () => {
  const sun = '2026-11-01', mon = '2026-11-02';
  assert.equal(weekdayOf(addDays(sun, 1)), 1);
  assert.equal(weekDates(addDays(sun, 1), 1)[0], mon, 'the strip now shows the next week, starting Monday');
  assert.equal(weekdayOf(addDays(mon, -1)), 0);
  assert.equal(weekDates(addDays(mon, -1), 1)[6], sun, 'back from Monday lands on the previous Sunday, last day of its week');
});
