import type { PlannedNotification } from '../domain/notify';
import { claimEvent } from './alerts.web';

/**
 * Web notifications.
 *
 * Delivery is `ServiceWorkerRegistration.showNotification` (the only form Android Chrome and installed PWAs allow), with
 * `new Notification()` as a fallback for browsers without a service worker. Browsers cannot schedule a notification for a page
 * that is closed or frozen without a push server, so reminders are delivered from timers while a Rhythm tab is alive
 * (background tabs are fine). Focus-timer boundaries are NOT scheduled here: `state/alertRuntime.ts` owns them, because it also
 * has to play the sound and show the on-screen alert, and it must not double-notify.
 */
export type PermissionState = 'granted' | 'denied' | 'undetermined';
export type NotificationSupport = 'supported' | 'ios-needs-install' | 'unsupported';

const hasNotification = (): boolean => typeof window !== 'undefined' && 'Notification' in window;
let timers = new Map<string, ReturnType<typeof setTimeout>>();
let tapHandler: ((data: Record<string, string>) => void) | null = null;
const MAX_DELAY = 2 ** 31 - 1; // setTimeout limit (~24.8 days); the 3-day planning horizon is far below it

export function notificationSupport(): NotificationSupport {
  if (hasNotification()) return 'supported';
  if (typeof navigator === 'undefined') return 'unsupported';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches);
  // iOS Safari exposes Notification only to web apps added to the Home Screen (iOS 16.4+).
  return ios && !standalone ? 'ios-needs-install' : 'unsupported';
}

let regPromise: Promise<ServiceWorkerRegistration | null> | null = null;
function registration(): Promise<ServiceWorkerRegistration | null> {
  if (regPromise) return regPromise;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return (regPromise = Promise.resolve(null));
  const ready = navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready).catch(() => null);
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
  return (regPromise = Promise.race([ready, timeout]));
}

export function initNotifications(onTap: (data: Record<string, string>) => void): () => void {
  tapHandler = onTap;
  void registration();
  const onMessage = (e: MessageEvent) => {
    const m = e.data as { type?: string; data?: Record<string, string> } | undefined;
    if (m?.type === 'rhythm-notification-click' && m.data) tapHandler?.(m.data);
  };
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onMessage);
  return () => {
    tapHandler = null;
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onMessage);
  };
}

export async function getPermission(): Promise<PermissionState> {
  if (!hasNotification()) return 'denied';
  const p = Notification.permission;
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined';
}

export async function requestPermission(): Promise<PermissionState> {
  if (!hasNotification()) return 'denied';
  try {
    const p = await Notification.requestPermission();
    return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined';
  } catch { return 'denied'; }
}

type Presentable = Pick<PlannedNotification, 'id' | 'title' | 'body' | 'data'>;

/** Show a notification right now. Resolves false if permission is missing or the browser refused. */
export async function presentNow(p: Presentable): Promise<boolean> {
  if (!hasNotification() || Notification.permission !== 'granted') return false;
  const urgent = p.data.type === 'timer';
  // vibrate/renotify are widely supported but missing from TypeScript's DOM typings.
  const options = {
    body: p.body, tag: p.id, icon: '/icon-192.png', badge: '/badge-96.png', data: p.data,
    silent: false, renotify: true, requireInteraction: urgent, vibrate: [200, 100, 200, 100, 400],
  } as NotificationOptions;
  const reg = await registration();
  if (reg) { try { await reg.showNotification(p.title, options); return true; } catch { /* fall through */ } }
  try {
    const n = new Notification(p.title, options);
    n.onclick = () => { try { window.focus(); } catch { /* ignore */ } tapHandler?.(p.data); n.close(); };
    return true;
  } catch { return false; }
}

function fire(p: PlannedNotification): void {
  // The tab that claims it shows it; other open tabs stay quiet.
  void claimEvent(`${p.id}.${p.at}`, 'system').then((won) => { if (won) void presentNow(p); });
}

/** Make the pending timers exactly equal `planned` (timer boundaries excluded; see the file comment). */
export async function applyPlan(planned: PlannedNotification[]): Promise<number> {
  for (const t of timers.values()) clearTimeout(t);
  timers = new Map();
  if ((await getPermission()) !== 'granted') return 0;
  const now = Date.now();
  let n = 0;
  for (const p of planned) {
    if (p.data.type === 'timer') continue;
    const delay = p.at - now;
    if (delay <= 0 || delay > MAX_DELAY) continue;
    timers.set(p.id, setTimeout(() => fire(p), delay));
    n++;
  }
  return n;
}

/** Native schedules a test with the OS so it fires with the app closed; a browser cannot, so the caller uses an in-page timer. */
export async function scheduleTestNotification(_seconds: number): Promise<boolean> { return false; }
