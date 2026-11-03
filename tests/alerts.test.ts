import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ALERT_PREFS, FRESH_MS, SOUND_IDS, boundariesUntil, dueTimerEvents, lateByMs, nextTimerEvent, normalizeAlertPrefs, wantsSystemNotification,
} from '../src/domain/alerts';
import { SOUNDS, repeatGapSeconds, soundForEvent, soundLength } from '../src/domain/sounds';
import { pause, resume, startTimer, type TimerConfig } from '../src/domain/timer';
import { planTimerNotifications, TIMER_LOOKAHEAD } from '../src/domain/notify';
import { notifSettings } from './factories';

const MIN = 60_000;
const T0 = 1_800_000_000_000;
const cfg = (over: Partial<TimerConfig> = {}): TimerConfig => ({ mode: 'pomodoro', focusMs: 25 * MIN, breakMs: 5 * MIN, subjectId: null, occurrenceKey: null, taskId: null, ...over });
const on = { enabled: true, breaks: true };

test('pomodoro boundaries alternate focus_done / break_done at the right running offsets', () => {
  const t = startTimer(cfg(), 'p', T0);
  const b = boundariesUntil(t, 70 * MIN);
  assert.deepEqual(b.map((e) => [e.kind, e.round, e.offsetMs / MIN]), [
    ['focus_done', 1, 25], ['break_done', 1, 30], ['focus_done', 2, 55], ['break_done', 2, 60],
  ]);
  assert.equal(b[0]!.id, 'p:focus_done:1');
  assert.match(b[0]!.body, /5 minutes/);
  assert.equal(b[1]!.body, 'Ready for focus round 2?');
});

test('a pomodoro with no break only has focus boundaries; stopwatches have none; countdown has one', () => {
  const nb = startTimer(cfg({ breakMs: 0 }), 'n', T0);
  assert.deepEqual(boundariesUntil(nb, 80 * MIN).map((e) => e.kind), ['focus_done', 'focus_done', 'focus_done']);
  assert.deepEqual(boundariesUntil(startTimer(cfg({ mode: 'stopwatch', focusMs: 0, breakMs: 0 }), 's', T0), 10 ** 9), []);
  const cd = startTimer(cfg({ mode: 'countdown', breakMs: 0 }), 'c', T0);
  assert.deepEqual(boundariesUntil(cd, 99 * MIN).map((e) => e.kind), ['countdown_done']);
});

test('next event: wall-clock time follows pauses (paused time never counts, paused timers have no next event)', () => {
  let t = startTimer(cfg(), 'p', T0);
  assert.equal(nextTimerEvent(t, T0 + 10 * MIN)!.at, T0 + 25 * MIN);
  t = pause(t, T0 + 10 * MIN);
  assert.equal(nextTimerEvent(t, T0 + 40 * MIN), null);
  t = resume(t, T0 + 40 * MIN); // 15 min of focus left
  assert.equal(nextTimerEvent(t, T0 + 40 * MIN)!.at, T0 + 55 * MIN);
  assert.equal(nextTimerEvent(t, T0 + 40 * MIN)!.event.kind, 'focus_done');
});

test('next event is correct deep into a long session', () => {
  const t = startTimer(cfg(), 'p', T0);
  const now = T0 + 3 * 60 * MIN + 2 * MIN; // 182 min in: cycles of 30 -> in round 7 focus, boundary at 205 (7*30-5)
  const n = nextTimerEvent(t, now)!;
  assert.equal(n.event.kind, 'focus_done'); assert.equal(n.event.round, 7); assert.equal(n.at, T0 + 205 * MIN);
});

test('due events: everything reached and unseen, oldest first; seen ones are skipped', () => {
  const t = startTimer(cfg(), 'p', T0);
  const now = T0 + 58 * MIN;
  const due = dueTimerEvents(t, now, new Set());
  assert.deepEqual(due.map((e) => e.id), ['p:focus_done:1', 'p:break_done:1', 'p:focus_done:2']);
  assert.deepEqual(dueTimerEvents(t, now, new Set(due.map((e) => e.id))), []);
  assert.deepEqual(dueTimerEvents(t, T0 + 24 * MIN, new Set()), []);
  assert.equal(lateByMs(t, now, due[2]!), 3 * MIN);
});

test('a timer that was paused when a boundary would have passed does not report it', () => {
  let t = startTimer(cfg(), 'p', T0);
  t = pause(t, T0 + 20 * MIN);
  assert.deepEqual(dueTimerEvents(t, T0 + 500 * MIN, new Set()), []);
});

test('fresh window: an alert noticed within 45 s plays sound, a stale one does not', () => {
  const t = startTimer(cfg(), 'p', T0);
  const e = boundariesUntil(t, 25 * MIN)[0]!;
  assert.ok(lateByMs(t, T0 + 25 * MIN + 20_000, e) <= FRESH_MS);
  assert.ok(lateByMs(t, T0 + 25 * MIN + 10 * MIN, e) > FRESH_MS);
});

test('system notification policy mirrors the settings screens', () => {
  assert.equal(wantsSystemNotification({ mode: 'pomodoro' }, on, true), true);
  assert.equal(wantsSystemNotification({ mode: 'pomodoro' }, on, false), false, 'Break reminders off');
  assert.equal(wantsSystemNotification({ mode: 'pomodoro' }, { enabled: true, breaks: false }, true), false, 'Breaks & focus complete off');
  assert.equal(wantsSystemNotification({ mode: 'pomodoro' }, { enabled: false, breaks: true }, true), false);
  assert.equal(wantsSystemNotification({ mode: 'countdown' }, on, false), true);
  assert.equal(wantsSystemNotification({ mode: 'stopwatch' }, on, true), false);
});

test('OS timer notifications: upcoming boundaries only, capped, on the dedicated timer channel', () => {
  const t = startTimer(cfg(), 'p', T0);
  const s = notifSettings();
  const plan = planTimerNotifications(t, T0 + 26 * MIN, s as never, true);
  assert.equal(plan.length, TIMER_LOOKAHEAD);
  assert.ok(plan.every((n) => n.channel === 'timer' && n.at > T0 + 26 * MIN && n.data.type === 'timer'));
  assert.equal(plan[0]!.at, T0 + 30 * MIN); // break over
  assert.deepEqual(new Set(plan.map((n) => n.id)).size, plan.length);
  const honoursBreaksSwitch = planTimerNotifications(t, T0, { ...s, breaks: false } as never, true);
  assert.deepEqual(honoursBreaksSwitch, []);
});

test('alert prefs: garbage in, safe defaults out', () => {
  assert.deepEqual(normalizeAlertPrefs(undefined), DEFAULT_ALERT_PREFS);
  assert.deepEqual(normalizeAlertPrefs('nope'), DEFAULT_ALERT_PREFS);
  const p = normalizeAlertPrefs({ sound: false, soundId: 'bell', volume: 7, repeat: 2, vibrate: 'yes', keepAwake: false });
  assert.deepEqual(p, { sound: false, soundId: 'bell', volume: 1, repeat: DEFAULT_ALERT_PREFS.repeat, vibrate: DEFAULT_ALERT_PREFS.vibrate, keepAwake: false });
  assert.equal(normalizeAlertPrefs({ volume: -3 }).volume, 0.1);
  assert.equal(normalizeAlertPrefs({ soundId: 'airhorn' }).soundId, 'chime');
});

test('sounds: every sound is bounded, audible and in a sane frequency range', () => {
  for (const id of SOUND_IDS) {
    const s = SOUNDS[id];
    assert.ok(soundLength(s) > 0.3 && soundLength(s) <= 3, `${id} length`);
    assert.ok(repeatGapSeconds(s) >= soundLength(s));
    for (const n of s.notes) {
      assert.ok(n.freq >= 200 && n.freq <= 2000, `${id} freq`);
      assert.ok(n.gain > 0 && n.gain <= 0.6, `${id} gain leaves headroom for partials`);
      assert.ok(n.dur > 0 && n.at >= 0);
      assert.ok((n.attack ?? 0.01) < n.dur);
    }
  }
});

test('sounds: the end of a break sounds different from the end of a focus block, for every sound', () => {
  for (const id of SOUND_IDS) {
    const focus = soundForEvent(id, 'focus_done').notes.map((n) => Math.round(n.freq));
    const brk = soundForEvent(id, 'break_done').notes.map((n) => Math.round(n.freq));
    assert.notEqual(focus.join(), brk.join(), id);
    assert.equal(brk.length, focus.length);
    assert.deepEqual(soundForEvent(id, 'test').notes, soundForEvent(id, 'focus_done').notes);
  }
});
