import type { PlannedNotification } from '../domain/notify';

/**
 * Web notifications. Browsers cannot schedule notifications for a closed page without a push server, so reminders are
 * delivered with timers while a Rhythm tab is open (any tab; background tabs are fine, closed ones are not).
 * To avoid duplicates when several tabs are open, the tab that fires one claims it in localStorage first.
 */
export type PermissionState = 'granted' | 'denied' | 'undetermined';

const supported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;
let timers = new Map<string, ReturnType<typeof setTimeout>>();
let tapHandler: ((data: Record<string, string>) => void) | null = null;
const MAX_DELAY = 2 ** 31 - 1; // setTimeout limit (~24.8 days); the 3-day planning horizon is far below it

export function initNotifications(onTap: (data: Record<string, string>) => void): () => void {
  tapHandler = onTap;
  return () => { tapHandler = null; };
}

export async function getPermission(): Promise<PermissionState> {
  if (!supported()) return 'denied';
  const p = Notification.permission;
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined';
}

export async function requestPermission(): Promise<PermissionState> {
  if (!supported()) return 'denied';
  try {
    const p = await Notification.requestPermission();
    return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined';
  } catch { return 'denied'; }
}

function claim(id: string, at: number): boolean {
  const key = `rhythm.notified.${id}.${at}`;
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, '1');
    // Old claims are harmless but would accumulate; drop this one after a day.
    setTimeout(() => { try { localStorage.removeItem(key); } catch { /* ignore */ } }, 24 * 3600 * 1000);
    return true;
  } catch { return true; }
}

function fire(p: PlannedNotification): void {
  if (!supported() || Notification.permission !== 'granted' || !claim(p.id, p.at)) return;
  try {
    const n = new Notification(p.title, { body: p.body, tag: p.id, data: p.data });
    n.onclick = () => { try { window.focus(); } catch { /* ignore */ } tapHandler?.(p.data); n.close(); };
  } catch { /* some browsers only allow notifications from a service worker; skip silently */ }
}

/** Make the pending timers exactly equal `planned`. Resolves with how many were scheduled. */
export async function applyPlan(planned: PlannedNotification[]): Promise<number> {
  for (const t of timers.values()) clearTimeout(t);
  timers = new Map();
  if ((await getPermission()) !== 'granted') return 0;
  const now = Date.now();
  let n = 0;
  for (const p of planned) {
    const delay = p.at - now;
    if (delay <= 0 || delay > MAX_DELAY) continue;
    timers.set(p.id, setTimeout(() => fire(p), delay));
    n++;
  }
  return n;
}
