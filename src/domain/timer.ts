import { toDateKey } from './time';
import type { SessionMode, StudySession } from './types';

/**
 * Timestamp-based timer. Nothing here depends on setInterval: elapsed time is always derived from
 * epoch-millisecond timestamps, so it stays correct while the app is backgrounded, suspended or killed.
 * The state is a plain object that the app persists on every transition (and a heartbeat while visible).
 */
export type TimerConfig = {
  mode: SessionMode;
  /** countdown: total length. pomodoro: focus length. stopwatch: unused (but used for optional break reminders). */
  focusMs: number;
  /** pomodoro break length (ignored otherwise). */
  breakMs: number;
  subjectId: string | null;
  occurrenceKey: string | null;
  taskId: string | null;
};

export type TimerState = TimerConfig & {
  id: string; // becomes the StudySession id → retries/upserts can never create duplicates
  status: 'running' | 'paused';
  startedAt: number; // epoch ms of first start
  runStartedAt: number | null; // epoch ms when the current running segment began
  accumulatedMs: number; // running time from completed segments
  lastHeartbeat: number;
  note: string;
};

/**
 * Modes offered in the UI. 'countdown' is no longer selectable (a Pomodoro with a break is the same thing with one more
 * feature), but it stays a valid SessionMode so sessions recorded earlier, synced data and a timer that was already running
 * when the app updated keep working. Old preferences saying 'countdown' are shown as Pomodoro.
 */
export const SELECTABLE_MODES = ['stopwatch', 'pomodoro'] as const;
export const selectableMode = (m: SessionMode): 'stopwatch' | 'pomodoro' => (m === 'stopwatch' ? 'stopwatch' : 'pomodoro');

export const MAX_SESSION_MS = 16 * 3600_000;

export function startTimer(cfg: TimerConfig, id: string, now: number): TimerState {
  if (cfg.mode !== 'stopwatch' && !(cfg.focusMs > 0)) throw new Error('Focus length must be positive');
  if (cfg.mode === 'pomodoro' && !(cfg.breakMs >= 0)) throw new Error('Break length must not be negative');
  return { ...cfg, id, status: 'running', startedAt: now, runStartedAt: now, accumulatedMs: 0, lastHeartbeat: now, note: '' };
}

export function runningMs(s: TimerState, now: number): number {
  const live = s.status === 'running' && s.runStartedAt !== null ? Math.max(0, now - s.runStartedAt) : 0;
  return Math.max(0, s.accumulatedMs + live);
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.status !== 'running') return s;
  return { ...s, status: 'paused', accumulatedMs: runningMs(s, now), runStartedAt: null, lastHeartbeat: now };
}

export function resume(s: TimerState, now: number): TimerState {
  if (s.status !== 'paused') return s;
  return { ...s, status: 'running', runStartedAt: now, lastHeartbeat: now };
}

export function heartbeat(s: TimerState, now: number): TimerState {
  return s.status === 'running' ? { ...s, lastHeartbeat: now } : s;
}

/** Splits total running time into focus and break time for the timer's mode. Break/idle time is never focus. */
export function splitFocusBreak(cfg: Pick<TimerConfig, 'mode' | 'focusMs' | 'breakMs'>, runMs: number): { focusMs: number; breakMs: number } {
  const r = Math.max(0, runMs);
  switch (cfg.mode) {
    case 'stopwatch': return { focusMs: r, breakMs: 0 };
    case 'countdown': { const f = Math.min(r, cfg.focusMs); return { focusMs: f, breakMs: 0 }; }
    case 'pomodoro': {
      const cycle = cfg.focusMs + cfg.breakMs;
      if (cycle <= 0) return { focusMs: r, breakMs: 0 };
      const full = Math.floor(r / cycle);
      const rem = r - full * cycle;
      const focus = full * cfg.focusMs + Math.min(rem, cfg.focusMs);
      return { focusMs: focus, breakMs: r - focus };
    }
  }
}

export type Phase = { kind: 'focus' | 'break' | 'overtime'; remainingMs: number | null; cycle: number };

export function phaseAt(s: TimerState, now: number): Phase {
  const r = runningMs(s, now);
  if (s.mode === 'stopwatch') return { kind: 'focus', remainingMs: null, cycle: 1 };
  if (s.mode === 'countdown') {
    return r >= s.focusMs ? { kind: 'overtime', remainingMs: 0, cycle: 1 } : { kind: 'focus', remainingMs: s.focusMs - r, cycle: 1 };
  }
  const cycle = s.focusMs + s.breakMs;
  const idx = Math.floor(r / cycle);
  const rem = r - idx * cycle;
  return rem < s.focusMs
    ? { kind: 'focus', remainingMs: s.focusMs - rem, cycle: idx + 1 }
    : { kind: 'break', remainingMs: cycle - rem, cycle: idx + 1 };
}

export const isCountdownDone = (s: TimerState, now: number): boolean => s.mode === 'countdown' && runningMs(s, now) >= s.focusMs;

/** Milliseconds of running time until the next phase boundary/completion (for scheduling a background notification). */
export function msToNextBoundary(s: TimerState, now: number): number | null {
  const p = phaseAt(s, now);
  return p.remainingMs;
}

export type SessionDraft = Omit<StudySession, 'createdAt' | 'updatedAt' | 'deletedAt'>;

function toDraft(s: TimerState, endMs: number, runMs: number, status: StudySession['status'], note?: string): SessionDraft | null {
  const { focusMs, breakMs } = splitFocusBreak(s, Math.min(runMs, MAX_SESSION_MS));
  const focusSec = Math.round(focusMs / 1000);
  if (focusSec <= 0) return null; // nothing valid to record
  return {
    id: s.id, subjectId: s.subjectId, date: toDateKey(new Date(s.startedAt)),
    startedAt: new Date(s.startedAt).toISOString(), endedAt: new Date(Math.max(endMs, s.startedAt)).toISOString(),
    focusSec, elapsedSec: Math.round(Math.min(runMs, MAX_SESSION_MS) / 1000), breakSec: Math.round(breakMs / 1000),
    plannedSec: s.mode === 'stopwatch' ? null : Math.round(s.focusMs / 1000),
    mode: s.mode, status, source: 'timer', occurrenceKey: s.occurrenceKey, taskId: s.taskId,
    note: note ?? s.note, reflection: '',
  };
}

/** Finish the timer normally. A countdown that overran (e.g. app was closed) is capped at its target and ended when it hit zero. */
export function finishTimer(s: TimerState, now: number, note?: string): SessionDraft | null {
  let run = runningMs(s, now);
  let end = now;
  if (s.mode === 'countdown' && run > s.focusMs) { end = now - (run - s.focusMs); run = s.focusMs; }
  return toDraft(s, end, run, 'completed', note);
}

/** Record whatever was focused but mark the session as cancelled (excluded from analytics). Returns null if under 10s. */
export function cancelTimer(s: TimerState, now: number): SessionDraft | null {
  const run = runningMs(s, now);
  if (run < 10_000) return null;
  return toDraft(s, now, run, 'cancelled');
}

/** Stop at a known time, flagged as interrupted (counts, because the time was really spent). */
export function interruptAt(s: TimerState, at: number): SessionDraft | null {
  const frozen = s.status === 'running' && s.runStartedAt !== null ? { ...s, accumulatedMs: s.accumulatedMs + Math.max(0, at - s.runStartedAt) } : s;
  const run = frozen.accumulatedMs;
  return toDraft(s, at, run, 'interrupted');
}

export const RECOVERY_PROMPT_GAP_MS = 10 * 60_000;

export type Recovery =
  | { action: 'continue'; state: TimerState }
  | { action: 'finalize'; draft: SessionDraft | null }
  | { action: 'prompt'; state: TimerState; lastSeen: number; gapMs: number };

/**
 * Called on a cold start with a persisted timer.
 * - Paused timers resume exactly as left (paused time never ticks).
 * - A countdown that completed while the app was closed is finalised at its natural end time.
 * - A running timer last seen long ago asks the user whether to keep counting or stop at the last known time.
 */
export function recoverTimer(s: TimerState, now: number): Recovery {
  if (s.status === 'paused') return { action: 'continue', state: s };
  if (isCountdownDone(s, now)) return { action: 'finalize', draft: finishTimer(s, now) };
  const gap = now - s.lastHeartbeat;
  if (gap > RECOVERY_PROMPT_GAP_MS) return { action: 'prompt', state: s, lastSeen: s.lastHeartbeat, gapMs: gap };
  return { action: 'continue', state: heartbeat(s, now) };
}
