import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelTimer, finishTimer, heartbeat, interruptAt, pause, phaseAt, RECOVERY_PROMPT_GAP_MS, recoverTimer, resume, runningMs, splitFocusBreak, startTimer,
  msToNextBoundary, selectableMode, SELECTABLE_MODES, type TimerConfig,
} from '../src/domain/timer';
import { buildManualSession, isDuplicateSession, overlappingSessions, toSession } from '../src/domain/sessions';
import { toDateKey } from '../src/domain/time';
import { DSA, NOW_ISO, session } from './factories';

const MIN = 60_000;
const T0 = new Date(2026, 9, 28, 9, 0, 0).getTime();
const cfg = (over: Partial<TimerConfig> = {}): TimerConfig => ({ mode: 'stopwatch', focusMs: 0, breakMs: 0, subjectId: DSA, occurrenceKey: null, taskId: null, ...over });

test('stopwatch: start, pause, resume and finish with exact elapsed time', () => {
  let s = startTimer(cfg(), 'id-1', T0);
  assert.equal(runningMs(s, T0 + 10 * MIN), 10 * MIN);
  s = pause(s, T0 + 10 * MIN);
  assert.equal(runningMs(s, T0 + 60 * MIN), 10 * MIN); // paused time is not counted, however long
  s = resume(s, T0 + 60 * MIN);
  assert.equal(runningMs(s, T0 + 75 * MIN), 25 * MIN);
  const d = finishTimer(s, T0 + 75 * MIN)!;
  assert.equal(d.focusSec, 25 * 60);
  assert.equal(d.elapsedSec, 25 * 60);
  assert.equal(d.status, 'completed');
  assert.equal(d.id, 'id-1');
  assert.equal(d.date, toDateKey(new Date(T0)));
  assert.equal(new Date(d.startedAt).getTime(), T0);
  assert.equal(new Date(d.endedAt).getTime(), T0 + 75 * MIN); // wall-clock end includes the pause
});

test('pause/resume are idempotent and cannot double-count', () => {
  let s = startTimer(cfg(), 'id', T0);
  s = pause(pause(s, T0 + MIN), T0 + 5 * MIN);
  assert.equal(runningMs(s, T0 + 9 * MIN), MIN);
  s = resume(resume(s, T0 + 10 * MIN), T0 + 12 * MIN);
  assert.equal(runningMs(s, T0 + 13 * MIN), 4 * MIN);
});

test('elapsed time is derived from timestamps, so backgrounding or a clock jump back cannot go negative', () => {
  const s = startTimer(cfg(), 'id', T0);
  assert.equal(runningMs(s, T0 + 3 * 3600_000), 3 * 3600_000); // phone locked for 3 hours
  assert.equal(runningMs(s, T0 - 5000), 0);
});

test('nothing is recorded for a zero-length session', () => {
  const s = startTimer(cfg(), 'id', T0);
  assert.equal(finishTimer(s, T0), null);
  assert.equal(finishTimer(pause(s, T0), T0 + 99 * MIN), null);
});

test('countdown completes at its target; focus is capped even if finished late', () => {
  const s = startTimer(cfg({ mode: 'countdown', focusMs: 25 * MIN }), 'id', T0);
  assert.equal(phaseAt(s, T0 + 10 * MIN).remainingMs, 15 * MIN);
  assert.equal(phaseAt(s, T0 + 30 * MIN).kind, 'overtime');
  const d = finishTimer(s, T0 + 40 * MIN)!; // user returned 15 min after it rang
  assert.equal(d.focusSec, 25 * 60);
  assert.equal(new Date(d.endedAt).getTime(), T0 + 25 * MIN);
  assert.equal(d.plannedSec, 25 * 60);
});

test('pomodoro 25/5: focus and break are split correctly and breaks never count as focus', () => {
  const c = { mode: 'pomodoro' as const, focusMs: 25 * MIN, breakMs: 5 * MIN };
  assert.deepEqual(splitFocusBreak(c, 20 * MIN), { focusMs: 20 * MIN, breakMs: 0 });
  assert.deepEqual(splitFocusBreak(c, 27 * MIN), { focusMs: 25 * MIN, breakMs: 2 * MIN });
  assert.deepEqual(splitFocusBreak(c, 30 * MIN), { focusMs: 25 * MIN, breakMs: 5 * MIN });
  assert.deepEqual(splitFocusBreak(c, 40 * MIN), { focusMs: 35 * MIN, breakMs: 5 * MIN });
  assert.deepEqual(splitFocusBreak(c, 90 * MIN), { focusMs: 75 * MIN, breakMs: 15 * MIN });
  const s = startTimer(cfg(c), 'p', T0);
  assert.equal(phaseAt(s, T0 + 26 * MIN).kind, 'break');
  assert.equal(phaseAt(s, T0 + 26 * MIN).remainingMs, 4 * MIN);
  assert.equal(phaseAt(s, T0 + 31 * MIN).kind, 'focus');
  assert.equal(phaseAt(s, T0 + 31 * MIN).cycle, 2);
  assert.equal(msToNextBoundary(s, T0 + 10 * MIN), 15 * MIN);
  const d = finishTimer(s, T0 + 57 * MIN)!;
  assert.equal(d.focusSec, 50 * 60); // 25 + 25 (second focus block is already full at 27 min into the cycle)
  assert.equal(d.breakSec, 7 * 60); // 5 + 2
  assert.equal(d.elapsedSec, 57 * 60);
});

test('50/10 preset', () => {
  const c = { mode: 'pomodoro' as const, focusMs: 50 * MIN, breakMs: 10 * MIN };
  assert.deepEqual(splitFocusBreak(c, 65 * MIN), { focusMs: 55 * MIN, breakMs: 10 * MIN });
});

test('cancel keeps a record flagged cancelled (not counted) only if meaningful', () => {
  const s = startTimer(cfg(), 'id', T0);
  assert.equal(cancelTimer(s, T0 + 5_000), null);
  const d = cancelTimer(s, T0 + 12 * MIN)!;
  assert.equal(d.status, 'cancelled');
  assert.equal(toSession(d, NOW_ISO).status, 'cancelled');
});

test('invalid configs are rejected', () => {
  assert.throws(() => startTimer(cfg({ mode: 'countdown', focusMs: 0 }), 'x', T0));
  assert.throws(() => startTimer(cfg({ mode: 'pomodoro', focusMs: MIN, breakMs: -1 }), 'x', T0));
});

test('recovery: paused timers come back exactly as left', () => {
  const s = pause(startTimer(cfg(), 'id', T0), T0 + 20 * MIN);
  const r = recoverTimer(s, T0 + 5 * 3600_000);
  assert.equal(r.action, 'continue');
  if (r.action === 'continue') assert.equal(runningMs(r.state, T0 + 5 * 3600_000), 20 * MIN);
});

test('recovery: a running timer seen moments ago simply continues', () => {
  let s = startTimer(cfg(), 'id', T0);
  s = heartbeat(s, T0 + 30 * MIN);
  const r = recoverTimer(s, T0 + 30 * MIN + 2 * MIN);
  assert.equal(r.action, 'continue');
});

test('recovery: long gap asks the user; "stop at last seen" records an interrupted session that still counts', () => {
  let s = startTimer(cfg(), 'id', T0);
  s = heartbeat(s, T0 + 40 * MIN);
  const now = T0 + 40 * MIN + RECOVERY_PROMPT_GAP_MS + MIN;
  const r = recoverTimer(s, now);
  assert.equal(r.action, 'prompt');
  if (r.action !== 'prompt') return;
  assert.equal(r.lastSeen, T0 + 40 * MIN);
  const d = interruptAt(r.state, r.lastSeen)!;
  assert.equal(d.status, 'interrupted');
  assert.equal(d.focusSec, 40 * 60);
  // "keep counting" alternative: finishing now includes the gap
  assert.equal(finishTimer(r.state, now)!.focusSec, Math.round((now - T0) / 1000));
});

test('recovery: a countdown that finished while closed is finalised at its natural end', () => {
  const s = startTimer(cfg({ mode: 'countdown', focusMs: 25 * MIN }), 'id', T0);
  const r = recoverTimer(s, T0 + 4 * 3600_000);
  assert.equal(r.action, 'finalize');
  if (r.action === 'finalize') {
    assert.equal(r.draft!.focusSec, 25 * 60);
    assert.equal(new Date(r.draft!.endedAt).getTime(), T0 + 25 * MIN);
  }
});

test('absurdly long sessions are capped at 16 hours', () => {
  const s = startTimer(cfg(), 'id', T0);
  assert.equal(finishTimer(s, T0 + 30 * 3600_000)!.focusSec, 16 * 3600);
});

/* ---------- duplicate and overlap prevention ---------- */

test('retrying a save with the same id is detected as a duplicate (idempotent)', () => {
  const s = startTimer(cfg(), 'same-id', T0);
  const draft = finishTimer(s, T0 + 30 * MIN)!;
  const stored = toSession(draft, NOW_ISO);
  assert.equal(isDuplicateSession(draft, [stored]), true);
  assert.equal(isDuplicateSession({ ...draft, id: 'other' }, [stored]), true); // identical interval + subject
  assert.equal(isDuplicateSession({ ...draft, id: 'other', subjectId: null }, [stored]), false);
  assert.equal(isDuplicateSession(draft, []), false);
});

test('overlap detection ignores cancelled sessions and the session being edited', () => {
  const a = session({ date: '2026-10-28', startMin: 9 * 60, minutes: 60 });
  const cancelled = session({ date: '2026-10-28', startMin: 11 * 60, minutes: 60, status: 'cancelled' });
  const start = new Date(2026, 9, 28, 9, 30).getTime();
  assert.equal(overlappingSessions(start, start + 30 * MIN, [a, cancelled]).length, 1);
  assert.equal(overlappingSessions(start, start + 30 * MIN, [a], a.id).length, 0);
  const s2 = new Date(2026, 9, 28, 11, 15).getTime();
  assert.equal(overlappingSessions(s2, s2 + 15 * MIN, [cancelled]).length, 0);
  assert.equal(overlappingSessions(a.endedAt ? Date.parse(a.endedAt) : 0, Date.parse(a.endedAt) + MIN, [a]).length, 0); // touching is fine
});

test('manual entry: validation', () => {
  const now = new Date(2026, 9, 28, 18, 0);
  const base = { date: '2026-10-28', startMin: 9 * 60, durationMin: 60, subjectId: DSA, note: '' };
  const ok = buildManualSession(base, [], now);
  assert.equal(ok.ok, true);
  if (ok.ok) { assert.equal(ok.session.focusSec, 3600); assert.equal(ok.session.source, 'manual'); assert.equal(ok.session.date, '2026-10-28'); }
  const bad = (over: object) => { const r = buildManualSession({ ...base, ...over }, [], now); return r.ok ? null : r.errors; };
  assert.ok(bad({ durationMin: 0 })?.durationMin);
  assert.ok(bad({ durationMin: -5 })?.durationMin);
  assert.ok(bad({ durationMin: 17 * 60 })?.durationMin);
  assert.ok(bad({ durationMin: NaN })?.durationMin);
  assert.ok(bad({ date: '2026-02-30' })?.date);
  assert.ok(bad({ startMin: 1500 })?.startMin);
  assert.ok(bad({ date: '2026-10-29' })?.date); // future
  assert.ok(bad({ startMin: 17 * 60 + 30, durationMin: 90 })?.durationMin); // would end in the future
});

test('manual entry: overlap with an existing session or the running timer is rejected', () => {
  const now = new Date(2026, 9, 28, 18, 0);
  const existing = [session({ date: '2026-10-28', startMin: 9 * 60, minutes: 60 })];
  const r = buildManualSession({ date: '2026-10-28', startMin: 9 * 60 + 30, durationMin: 30, subjectId: DSA, note: '' }, existing, now);
  assert.equal(r.ok, false);
  const timerStart = new Date(2026, 9, 28, 16, 0).getTime();
  const r2 = buildManualSession({ date: '2026-10-28', startMin: 15 * 60 + 30, durationMin: 60, subjectId: DSA, note: '' }, [], now, { startedAt: timerStart });
  assert.equal(r2.ok, false);
  const r3 = buildManualSession({ date: '2026-10-28', startMin: 11 * 60, durationMin: 60, subjectId: DSA, note: '' }, existing, now);
  assert.equal(r3.ok, true);
});

test('countdown is no longer selectable; legacy countdown preferences map to pomodoro, stopwatch is untouched', () => {
  assert.deepEqual([...SELECTABLE_MODES], ['stopwatch', 'pomodoro']);
  assert.equal(selectableMode('countdown'), 'pomodoro');
  assert.equal(selectableMode('pomodoro'), 'pomodoro');
  assert.equal(selectableMode('stopwatch'), 'stopwatch');
  // A countdown recorded earlier must keep working (history, sync, a timer that was running during the update).
  const s = startTimer(cfg({ mode: 'countdown', focusMs: 25 * MIN }), 'legacy', T0);
  assert.equal(phaseAt(s, T0 + 5 * MIN).remainingMs, 20 * MIN);
});
