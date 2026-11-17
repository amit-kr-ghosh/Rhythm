import { runningMs, type TimerState } from './timer';
import type { NotificationSettings } from './types';

/**
 * Timer alerts: what should ping the user, and when. Pure functions of the (timestamp-based) timer state, so they are
 * exact after a background freeze, a reload or a cold start, and can be unit-tested without a browser or a phone.
 */

/* ---------------- per-device alert preferences ---------------- */

export const SOUND_IDS = ['chime', 'bell', 'beep', 'gentle'] as const;
export type SoundId = (typeof SOUND_IDS)[number];
export const REPEAT_OPTIONS = [1, 3, 5] as const;
export const VOLUME_OPTIONS = [0.25, 0.5, 0.75, 1] as const;

/** Stored on the device only (sound/vibration/keep-awake differ between a phone and a laptop), never synced. */
export type AlertPrefs = {
  sound: boolean;
  soundId: SoundId;
  /** 0.1 – 1 */
  volume: number;
  /** How many times the alert sound plays (spaced a few seconds apart) unless it is dismissed first. */
  repeat: 1 | 3 | 5;
  vibrate: boolean;
  /** Web only: hold a screen wake lock while a timer runs, so a phone browser does not freeze the tab. */
  keepAwake: boolean;
};

export const DEFAULT_ALERT_PREFS: AlertPrefs = { sound: true, soundId: 'chime', volume: 0.75, repeat: 3, vibrate: true, keepAwake: true };

const isRepeat = (n: unknown): n is 1 | 3 | 5 => n === 1 || n === 3 || n === 5;

/** Defensive parse of whatever was stored: unknown or invalid fields fall back to the defaults. */
export function normalizeAlertPrefs(raw: unknown): AlertPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_ALERT_PREFS;
  const vol = typeof o.volume === 'number' && Number.isFinite(o.volume) ? Math.min(1, Math.max(0.1, o.volume)) : d.volume;
  return {
    sound: typeof o.sound === 'boolean' ? o.sound : d.sound,
    soundId: (SOUND_IDS as readonly unknown[]).includes(o.soundId) ? (o.soundId as SoundId) : d.soundId,
    volume: vol,
    repeat: isRepeat(o.repeat) ? o.repeat : d.repeat,
    vibrate: typeof o.vibrate === 'boolean' ? o.vibrate : d.vibrate,
    keepAwake: typeof o.keepAwake === 'boolean' ? o.keepAwake : d.keepAwake,
  };
}

/* ---------------- timer events ---------------- */

export type TimerEventKind = 'focus_done' | 'break_done' | 'countdown_done' | 'goal_done';
export type TimerEvent = {
  /** Stable: `${timer.id}:${kind}:${round}`. Used to make sure each boundary alerts once. */
  id: string;
  kind: TimerEventKind;
  /** 1-based Pomodoro round the boundary closes. */
  round: number;
  /** Running time (ms of un-paused time since the timer started) at which this boundary happens. */
  offsetMs: number;
  title: string;
  body: string;
};

/** Boundaries are computed lazily; this bounds the scan for absurdly long (16 h+) sessions. */
const MAX_ROUNDS = 200;
const minutesLabel = (ms: number) => { const m = Math.max(1, Math.round(ms / 60_000)); return m === 1 ? '1 minute' : `${m} minutes`; };

function focusDone(t: TimerState, round: number, offsetMs: number): TimerEvent {
  const hasBreak = t.breakMs > 0;
  return {
    id: `${t.id}:focus_done:${round}`, kind: 'focus_done', round, offsetMs,
    title: round === 1 ? 'Focus complete' : `Focus round ${round} complete`,
    body: hasBreak ? `Great work. Take a ${minutesLabel(t.breakMs)} break.` : 'Great work. Open Rhythm to save your session.',
  };
}
const breakDone = (t: TimerState, round: number, offsetMs: number): TimerEvent => ({
  id: `${t.id}:break_done:${round}`, kind: 'break_done', round, offsetMs,
  title: 'Break over', body: `Ready for focus round ${round + 1}?`,
});

/** Every boundary of this timer, in order, with `offsetMs <= untilMs` (running-time offset). Stopwatches have none. */
function baseBoundaries(t: TimerState, untilMs: number): TimerEvent[] {
  const out: TimerEvent[] = [];
  if (t.mode === 'countdown') {
    if (t.focusMs > 0 && t.focusMs <= untilMs) out.push({ id: `${t.id}:countdown_done:1`, kind: 'countdown_done', round: 1, offsetMs: t.focusMs, title: 'Time’s up', body: 'Your countdown finished. Open Rhythm to save your session.' });
    return out;
  }
  if (t.mode !== 'pomodoro' || !(t.focusMs > 0)) return out;
  const cycle = t.focusMs + Math.max(0, t.breakMs);
  for (let k = 0; k < MAX_ROUNDS; k++) {
    const f = k * cycle + t.focusMs;
    if (f > untilMs) break;
    out.push(focusDone(t, k + 1, f));
    if (t.breakMs > 0) {
      const b = (k + 1) * cycle;
      if (b > untilMs) break;
      out.push(breakDone(t, k + 1, b));
    }
  }
  return out;
}

/**
 * Running-time offset (ms) at which this timer's subject reaches its daily target, or null when there is none to reach.
 * Stopwatch: running time is focus time. Pomodoro: breaks do not count, so focus time F maps to F plus the breaks taken before
 * it; hitting a target exactly at the end of a round lands on that round's end, before its break.
 */
export function goalOffsetMs(t: TimerState): number | null {
  const g = t.goalMs;
  if (typeof g !== 'number' || !Number.isFinite(g) || g <= 0) return null;
  if (t.mode !== 'pomodoro') return g;
  if (!(t.focusMs > 0)) return null;
  const rounds = Math.ceil(g / t.focusMs); // the round in which the target is reached
  return g + (rounds - 1) * Math.max(0, t.breakMs);
}

const goalEvent = (t: TimerState, offsetMs: number): TimerEvent => ({
  id: `${t.id}:goal_done:1`, kind: 'goal_done', round: 1, offsetMs,
  title: t.goalName ? `${t.goalName} target reached` : 'Daily target reached',
  body: 'You hit today’s study target for this subject. Keep going or finish when you’re ready.',
});

/** Every boundary of this timer, in order, with `offsetMs <= untilMs`: round/countdown ends plus the subject's daily target. */
export function boundariesUntil(t: TimerState, untilMs: number): TimerEvent[] {
  const out = baseBoundaries(t, untilMs);
  const g = goalOffsetMs(t);
  if (g !== null && g <= untilMs) { out.push(goalEvent(t, g)); out.sort((a, b) => a.offsetMs - b.offsetMs); }
  return out;
}

/** Boundaries already reached by `now` that are not in `seen`, oldest first. */
export function dueTimerEvents(t: TimerState, now: number, seen: { has(id: string): boolean }): TimerEvent[] {
  return boundariesUntil(t, runningMs(t, now)).filter((e) => !seen.has(e.id));
}

/** The next boundary still ahead of a running timer, and the wall-clock time it will happen. Null if paused / none. */
export function nextTimerEvent(t: TimerState, now: number): { event: TimerEvent; at: number } | null {
  if (t.status !== 'running') return null;
  const r = runningMs(t, now);
  // Scan one cycle plus one boundary ahead; that always contains the next one.
  const horizon = Math.max(r + (t.mode === 'pomodoro' ? t.focusMs + Math.max(0, t.breakMs) : t.focusMs) + 1, (goalOffsetMs(t) ?? 0) + 1);
  const next = boundariesUntil(t, horizon).find((e) => e.offsetMs > r);
  return next ? { event: next, at: now + (next.offsetMs - r) } : null;
}

/** How late (ms) an already-reached boundary is noticed. Running timers only; used to decide sound vs. silent banner. */
export const lateByMs = (t: TimerState, now: number, e: TimerEvent): number => Math.max(0, runningMs(t, now) - e.offsetMs);

/** A boundary noticed within this window plays sound/vibration. Later than this (e.g. a tab restored after an hour) it is a silent banner. */
export const FRESH_MS = 45_000;

/**
 * Should this boundary produce a system notification? Mirrors the existing rules: notifications must be on, the "Breaks &
 * focus complete" switch must be on, and Pomodoro boundaries additionally honour the "Break reminders" timer setting.
 */
export function wantsSystemNotification(t: Pick<TimerState, 'mode'>, s: Pick<NotificationSettings, 'enabled' | 'breaks'>, breakReminders: boolean, kind?: TimerEventKind): boolean {
  // Reaching a subject's daily target is a milestone, not a phase change: it needs only notifications on, in every timer mode.
  if (kind === 'goal_done') return s.enabled;
  if (!s.enabled || !s.breaks) return false;
  return t.mode === 'pomodoro' ? breakReminders : t.mode === 'countdown';
}
