import type { AlertPrefs, TimerEventKind } from '../domain/alerts';
import { repeatGapSeconds, soundForEvent } from '../domain/sounds';
import { scheduleSound } from './webAudioSynth';

/**
 * Browser side of timer alerts: sound (Web Audio, synthesised, no files), vibration, tab-title attention, a screen wake lock and
 * cross-tab de-duplication. The native counterpart is `alerts.ts`; both export the same functions.
 *
 * Browser limits that shape this file (all verified behaviour of current Chrome / Safari / Firefox):
 *  - Audio may only start after a user gesture. `initAlerts` listens for the first tap/click/key press and unlocks the
 *    AudioContext then; pressing "Start focus" is that gesture in normal use.
 *  - A page that is frozen (phone locked, tab discarded) runs no JavaScript at all, so nothing here can fire then. The wake
 *    lock keeps a phone's screen (and therefore the tab) alive while a timer runs, and the notification layer covers the
 *    "tab in the background but alive" case.
 */

export type AudioStatus = 'ready' | 'needs-tap' | 'unsupported';

type AudioCtor = typeof AudioContext;
const audioCtor = (): AudioCtor | undefined => (typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext));

let ctx: AudioContext | null = null;
let playing: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC = audioCtor();
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}

/** Call from a user gesture (tap/click/key). Safe to call repeatedly. */
export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state !== 'running') void c.resume().catch(() => undefined);
  try {
    // iOS Safari only counts audio that actually starts inside the gesture: play one silent sample.
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, 22050);
    src.connect(c.destination);
    src.start(0);
  } catch { /* not fatal */ }
}

export function audioStatus(): AudioStatus {
  if (!audioCtor()) return 'unsupported';
  return ctx && ctx.state === 'running' ? 'ready' : 'needs-tap';
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function playAlertSound(kind: TimerEventKind | 'test', prefs: AlertPrefs): Promise<void> {
  if (!prefs.sound) return;
  const c = getCtx();
  if (!c) return;
  if (c.state !== 'running') { try { await Promise.race([c.resume(), sleep(700)]); } catch { /* blocked */ } }
  if (c.state !== 'running') return; // still locked: the browser wants a tap first; the on-screen alert covers it
  stopAlertSound();
  const spec = soundForEvent(prefs.soundId, kind);
  const gap = repeatGapSeconds(spec);
  const out = c.createGain();
  out.gain.value = Math.min(1, Math.max(0.1, prefs.volume));
  // A compressor keeps stacked partials from clipping at high volume.
  const comp = c.createDynamicsCompressor();
  out.connect(comp); comp.connect(c.destination);
  for (let i = 0; i < prefs.repeat; i++) scheduleSound(c, out, spec, c.currentTime + 0.05 + i * gap);
  playing = out;
}

export function stopAlertSound(): void {
  try { playing?.disconnect(); } catch { /* already gone */ }
  playing = null;
  try { navigator.vibrate?.(0); } catch { /* unsupported */ }
}

export function vibrateAlert(prefs: AlertPrefs): void {
  if (!prefs.vibrate) return;
  try { navigator.vibrate?.([250, 120, 250, 120, 500]); } catch { /* iOS and desktops have no vibrator */ }
}

/* ---------- cross-tab de-duplication ---------- */

const CLAIM_PREFIX = 'rhythm.claim.';
/**
 * First caller wins: resolves true once per (channel, id) across all tabs of this browser. Check-and-set runs under a Web Lock,
 * because two tabs reach the same boundary within a millisecond of each other and a plain read-then-write lets both win.
 */
export async function claimEvent(id: string, channel: 'sound' | 'vibrate' | 'system'): Promise<boolean> {
  const key = `${CLAIM_PREFIX}${channel}.${id}`;
  const run = (): boolean => {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, String(Date.now()));
    return true;
  };
  try {
    if (typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request('rhythm-claim', () => run());
    return run();
  } catch { return true; } // storage/locks blocked: better a rare duplicate than a missed alert
}
function pruneClaims(): void {
  try {
    const cutoff = Date.now() - 2 * 24 * 3600_000;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(CLAIM_PREFIX) && Number(localStorage.getItem(k)) < cutoff) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

export function isAppVisible(): boolean {
  try { return document.visibilityState === 'visible' && document.hasFocus(); } catch { return true; }
}

/* ---------- tab title: running countdown + flashing attention ---------- */

let originalTitle: string | null = null;
let tabTitle: string | null = null;
let attention: string | null = null;
let flashOn = false;
let flashTimer: ReturnType<typeof setInterval> | null = null;

function renderTitle(): void {
  if (typeof document === 'undefined') return;
  if (originalTitle === null) originalTitle = document.title;
  document.title = attention && flashOn ? attention : (tabTitle ?? originalTitle);
}
/** Live status in the tab title (e.g. "24:10 · Focus"). Pass null to restore the page's own title. */
export function setTabTitle(text: string | null): void { tabTitle = text; renderTitle(); }
/** Flash a message in the tab title until the user comes back to the tab. */
export function setAttention(text: string | null): void {
  if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
  attention = text; flashOn = !!text;
  if (text) flashTimer = setInterval(() => { flashOn = !flashOn; renderTitle(); }, 1000);
  renderTitle();
}

/* ---------- screen wake lock ---------- */

let wantAwake = false;
let sentinel: WakeLockSentinel | null = null;
async function acquireWakeLock(): Promise<void> {
  if (sentinel || typeof navigator === 'undefined' || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    const s = await navigator.wakeLock.request('screen');
    s.addEventListener('release', () => { if (sentinel === s) sentinel = null; });
    sentinel = s;
    if (!wantAwake) void releaseWakeLock();
  } catch { /* denied (e.g. battery saver): carry on without it */ }
}
async function releaseWakeLock(): Promise<void> {
  const s = sentinel; sentinel = null;
  try { await s?.release(); } catch { /* already released */ }
}
/** Hold the screen awake while a timer runs. The browser drops the lock whenever the tab is hidden; it is re-taken on return. */
export function setKeepAwake(on: boolean): void { wantAwake = on; if (on) void acquireWakeLock(); else void releaseWakeLock(); }

/* ---------- already-shown memory (per tab, survives reload) ---------- */

export type Seen = { has(id: string): boolean; add(id: string): void };
const SHOWN_KEY = 'rhythm.alertShown';
export async function loadShown(): Promise<void> { /* sessionStorage is synchronous */ }
export function shownEvents(): Seen {
  const read = (): string[] => { try { return JSON.parse(sessionStorage.getItem(SHOWN_KEY) ?? '[]') as string[]; } catch { return []; } };
  return {
    has: (id) => read().includes(id),
    add: (id) => { try { sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...read(), id].slice(-60))); } catch { /* ignore */ } },
  };
}

/* ---------- lifecycle ---------- */

export function initAlerts(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  pruneClaims();
  const gesture = () => { if (!ctx || ctx.state !== 'running') unlockAudio(); };
  const events = ['pointerdown', 'touchend', 'keydown', 'click'] as const;
  for (const e of events) window.addEventListener(e, gesture, { capture: true, passive: true });
  const back = () => {
    if (document.visibilityState !== 'visible') return;
    setAttention(null);
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    if (wantAwake) void acquireWakeLock();
  };
  document.addEventListener('visibilitychange', back);
  window.addEventListener('focus', back);
  window.addEventListener('pageshow', back);
  return () => {
    for (const e of events) window.removeEventListener(e, gesture, { capture: true });
    document.removeEventListener('visibilitychange', back);
    window.removeEventListener('focus', back);
    window.removeEventListener('pageshow', back);
  };
}
