import { AppState as RNAppState, Platform } from 'react-native';
import {
  FRESH_MS, dueTimerEvents, lateByMs, nextTimerEvent, wantsSystemNotification, type TimerEvent,
} from '../domain/alerts';
import { phaseAt, runningMs, type TimerState } from '../domain/timer';
import { formatHMS } from '../domain/time';
import { store, type TimerAlert } from './store';
import {
  claimEvent, initAlerts, isAppVisible, loadShown, playAlertSound, setAttention, setKeepAwake, setTabTitle, shownEvents, stopAlertSound,
  vibrateAlert,
} from '../services/alerts';
import { presentNow, scheduleTestNotification } from '../services/notifications';

/**
 * Runs for the whole life of the app, whichever screen is open: notices when a focus block, break or countdown ends and
 * raises the alert. Elapsed time is derived from timestamps (domain/timer.ts), so this only decides *when to look*; a throttled
 * or frozen timer makes the alert late, never wrong.
 *
 * What fires, by situation:
 *  - Page in front: on-screen alert card + sound + vibration (no system notification; the card is the notification).
 *  - Browser tab in the background / another window focused: all of the above plus a system notification and a flashing tab title.
 *  - Phone app in the background or closed: the OS notification scheduled in notifications.ts (this watcher is not running).
 *  - Noticed late (tab restored after a long freeze): silent card only; the system notification already did the pinging.
 */

type AlertSource = { id: string; kind: TimerAlert['kind']; title: string; body: string };

let started = false;
let seen = shownEvents();
let timeout: ReturnType<typeof setTimeout> | null = null;
let titleTimer: ReturnType<typeof setInterval> | null = null;
let lastKey = '';

function surface(ev: AlertSource, late: boolean, forceSystem = false): void {
  const s = store.get();
  const prefs = s.alertPrefs;
  const visible = isAppVisible();
  store.set({ alert: { id: ev.id, kind: ev.kind, title: ev.title, body: ev.body, late, at: Date.now() } });
  if (!late) {
    if (prefs.sound) void claimEvent(ev.id, 'sound').then((won) => { if (won) void playAlertSound(ev.kind, prefs); });
    if (prefs.vibrate) void claimEvent(ev.id, 'vibrate').then((won) => { if (won) vibrateAlert(prefs); });
  }
  if (!visible) {
    setAttention(ev.title);
    const t = s.timer;
    const wanted = forceSystem || (t !== null && wantsSystemNotification(t, s.data.notif, s.data.prefs.timer.breakReminders));
    if (wanted) {
      const note = { id: `timer:${ev.id}`, title: ev.title, body: ev.body, data: { type: 'timer', id: t?.id ?? '' } };
      void claimEvent(ev.id, 'system').then((won) => { if (won) void presentNow(note); });
    }
  }
  if (late) setTimeout(() => { if (store.get().alert?.id === ev.id) dismissAlert(); }, 12_000);
}

export function dismissAlert(): void {
  stopAlertSound();
  setAttention(null);
  if (store.get().alert) store.set({ alert: null });
}

const tabLabel = (t: TimerState, now: number): string => {
  const run = runningMs(t, now);
  if (t.status === 'paused') return `Paused · ${formatHMS(Math.floor(run / 1000))}`;
  if (t.mode === 'stopwatch') return `${formatHMS(Math.floor(run / 1000))} · Focus`;
  const p = phaseAt(t, now);
  return `${formatHMS(Math.floor((p.remainingMs ?? 0) / 1000))} · ${p.kind === 'break' ? 'Break' : p.kind === 'overtime' ? 'Time is up' : 'Focus'}`;
};

function syncTitleTicker(t: TimerState | null): void {
  if (Platform.OS !== 'web') return;
  if (!t) {
    if (titleTimer) { clearInterval(titleTimer); titleTimer = null; }
    setTabTitle(null);
    return;
  }
  const paint = () => { const cur = store.get().timer; if (cur) setTabTitle(`${tabLabel(cur, Date.now())} — Rhythm`); };
  paint();
  if (!titleTimer) titleTimer = setInterval(paint, 1000);
}

/** Look at the timer now, raise anything that is due, and arm a one-shot timer for the next boundary. */
function check(): void {
  if (timeout) { clearTimeout(timeout); timeout = null; }
  const s = store.get();
  const t = s.timer;
  setKeepAwake(!!t && t.status === 'running' && s.alertPrefs.keepAwake);
  syncTitleTicker(t);
  if (!t) {
    // The session ended (finished, discarded): a "go back to the timer" card no longer means anything.
    if (s.alert && s.alert.kind !== 'test') dismissAlert();
    return;
  }
  if (!s.ready || t.status !== 'running') return;
  const now = Date.now();
  const due: TimerEvent[] = dueTimerEvents(t, now, seen);
  if (due.length > 0) {
    for (const e of due) seen.add(e.id);
    const last = due[due.length - 1]!;
    surface(last, lateByMs(t, now, last) > FRESH_MS);
  }
  const next = nextTimerEvent(t, Date.now());
  if (next) timeout = setTimeout(check, Math.max(50, next.at - Date.now()) + 40);
}

/** Fire a fake boundary after `delaySec` seconds, through the same path a real one takes (so it tests the real thing). */
export async function testAlert(delaySec: number): Promise<void> {
  const ev: AlertSource = { id: `test:${Date.now()}`, kind: 'test', title: 'Test alert', body: 'This is how a finished focus block will sound and look.' };
  await scheduleTestNotification(delaySec); // phones: also schedule it with the OS, so it can fire with the app in the background
  setTimeout(() => surface(ev, false, true), Math.max(0, delaySec) * 1000);
}

export async function startAlertWatcher(): Promise<void> {
  if (started) return;
  started = true;
  await loadShown();
  seen = shownEvents();
  initAlerts();
  store.subscribe(() => {
    const s = store.get();
    // Re-evaluate only when something the watcher depends on changed (a heartbeat replaces `timer` every 15 s; that is cheap and fine).
    const key = `${s.ready}|${s.timer?.id ?? ''}|${s.timer?.status ?? ''}|${s.timer?.runStartedAt ?? ''}|${s.timer?.accumulatedMs ?? ''}|${s.alertPrefs.keepAwake}`;
    if (key !== lastKey) { lastKey = key; check(); }
  });
  RNAppState.addEventListener('change', (st) => { if (st === 'active') check(); });
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('online', check);
  }
  setInterval(check, 20_000); // safety net if a timeout was dropped
  check();
}
