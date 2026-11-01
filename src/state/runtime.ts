import { AppState as RNAppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { Session } from '@supabase/supabase-js';
import { Repo } from '../data/repo';
import { openStorage } from '../data/openStorage';
import { SyncEngine } from '../data/syncEngine';
import { auth, makeCloudClient } from '../services/cloud';
import { cloudConfigured } from '../services/config';
import { handleNotificationTap } from '../services/deepLinks';
import { applyPlan, getPermission, initNotifications } from '../services/notifications';
import {
  SEED_EPOCH, buildDefaultNotificationSettings, buildDefaultPlans, buildDefaultPreferences, buildDefaultSubjects, buildDefaultTemplates,
} from '../domain/defaults';
import { toDateKey } from '../domain/time';
import { planNotifications, planTimerNotifications } from '../domain/notify';
import { recoverTimer, type TimerState } from '../domain/timer';
import { recordTargets } from '../domain/progress';
import { applyDefaultsV2, applyDesignV3 } from '../data/upgrade';
import { toSession } from '../domain/sessions';
import { ENTITY_KINDS, type EntityKind } from '../domain/types';
import { LIST_KINDS, emptyData, mergeIntoState, showToast, store, type AppData, type ListKind } from './store';

let repo: Repo | null = null;
let engine: SyncEngine | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let replanTimer: ReturnType<typeof setTimeout> | null = null;
let booted = false;

export function getRepo(): Repo {
  if (!repo) throw new Error('Database not ready');
  return repo;
}
export function getEngine(): SyncEngine {
  if (!engine) throw new Error('Sync engine not ready');
  return engine;
}

const seedStamp = <T extends { createdAt: string; updatedAt: string }>(e: T): T => ({ ...e, createdAt: SEED_EPOCH, updatedAt: SEED_EPOCH });

async function seedIfNeeded(r: Repo): Promise<void> {
  if ((await r.kvGet('seeded')) === '1') return;
  const nowIso = new Date().toISOString();
  const today = toDateKey(new Date());
  // enqueue:false — untouched defaults are never uploaded, so they can't overwrite real cloud data (see SEED_EPOCH).
  await r.put('subjects', buildDefaultSubjects(nowIso).map(seedStamp), { enqueue: false });
  await r.put('plans', buildDefaultPlans(nowIso).map(seedStamp), { enqueue: false });
  await r.put('templates', buildDefaultTemplates(today, nowIso).map(seedStamp), { enqueue: false });
  await r.put('preferences', seedStamp(buildDefaultPreferences(nowIso)), { enqueue: false });
  await r.put('notificationSettings', seedStamp(buildDefaultNotificationSettings(nowIso)), { enqueue: false });
  await r.kvSet('seeded', '1');
  await r.kvSet('designV3', '1');
  await r.kvSet('defaultsV2', '1'); // fresh installs already have the v2 defaults
}

export async function loadAll(): Promise<AppData> {
  const r = getRepo();
  const [prefs, notif] = await Promise.all([r.get('preferences', 'preferences'), r.get('notificationSettings', 'notificationSettings')]);
  const nowIso = new Date().toISOString();
  const data = emptyData(prefs ?? buildDefaultPreferences(nowIso), notif ?? buildDefaultNotificationSettings(nowIso));
  for (const kind of LIST_KINDS) {
    (data[kind] as unknown[]) = await r.all(kind);
  }
  return data;
}

/** Re-read everything from SQLite into memory (after a remote merge, restore or wipe). */
export async function reloadAll(): Promise<void> {
  store.set({ data: await loadAll() });
  scheduleReplan();
}

/** Web multi-tab: pick up everything another tab wrote, including a timer it started, paused or finished. */
export async function reloadFromDisk(): Promise<void> {
  await reloadAll();
  const saved = await getRepo().kvJson<TimerState>('timer');
  const cur = store.get().timer;
  if (JSON.stringify(saved) !== JSON.stringify(cur) && !store.get().timerPrompt) store.set({ timer: saved });
}

export async function reloadKinds(kinds: EntityKind[]): Promise<void> {
  const r = getRepo();
  for (const k of kinds) {
    if (k === 'preferences') { const p = await r.get('preferences', 'preferences'); if (p) store.set((s) => ({ data: { ...s.data, prefs: p } })); }
    else if (k === 'notificationSettings') { const n = await r.get('notificationSettings', 'notificationSettings'); if (n) store.set((s) => ({ data: { ...s.data, notif: n } })); }
    else {
      const rows = await r.all(k as ListKind);
      store.set((s) => ({ data: { ...s.data, [k]: rows } }));
    }
  }
  scheduleReplan();
}

/* ---------------- timer persistence ---------------- */

export async function persistTimer(t: TimerState | null): Promise<void> {
  const r = getRepo();
  if (t) await r.kvSet('timer', JSON.stringify(t)); else await r.kvDelete('timer');
  store.set({ timer: t });
}

async function recoverPersistedTimer(): Promise<void> {
  const r = getRepo();
  const saved = await r.kvJson<TimerState>('timer');
  if (!saved) return;
  const out = recoverTimer(saved, Date.now());
  if (out.action === 'continue') { await persistTimer(out.state); return; }
  if (out.action === 'finalize') {
    await persistTimer(null);
    if (out.draft) {
      const s = toSession(out.draft, new Date().toISOString());
      await r.put('sessions', s);
      mergeIntoState('sessions', [s]);
      showToast('info', 'A focus session finished while the app was closed and was saved.');
    }
    return;
  }
  store.set({ timer: out.state, timerPrompt: { state: out.state, lastSeen: out.lastSeen, gapMs: out.gapMs } });
}

/* ---------------- sync + notifications scheduling ---------------- */

export function scheduleSync(delayMs = 1500): void {
  if (!engine) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { void syncNow(); }, delayMs);
}

export async function syncNow(): Promise<void> {
  if (!engine) return;
  await engine.syncNow();
  await afterSync();
}

async function afterSync(): Promise<void> {
  const r = getRepo();
  const uid = store.get().auth?.userId;
  if (!uid || store.get().sync.state === 'offline') return;
  if ((await r.kvGet(`seedPurged:${uid}`)) === null && store.get().sync.lastSyncAt !== null) {
    // If the account already had a timetable in the cloud, this device's untouched default timetable is redundant.
    if ((await r.kvGet('cursor:templates')) !== null) {
      const n = await r.purgeUntouchedSeeds('templates');
      if (n > 0) await reloadAll();
    }
    await r.kvSet(`seedPurged:${uid}`, '1');
  }
}

export function scheduleReplan(delayMs = 800): void {
  if (replanTimer) clearTimeout(replanTimer);
  replanTimer = setTimeout(() => { void replanNotifications(); }, delayMs);
}

export async function replanNotifications(): Promise<void> {
  const s = store.get();
  if (!s.ready) return;
  const d = s.data;
  const now = Date.now();
  const planned = planNotifications({
    now, settings: d.notif, prefs: d.prefs, templates: d.templates, exceptions: d.exceptions, subjects: d.subjects,
    tasks: d.tasks, habits: d.habits, habitRecords: d.habitRecords, today: toDateKey(new Date(now)),
  });
  const timerPlanned = s.timer ? planTimerNotifications(s.timer, now, d.notif, d.prefs.timer.breakReminders) : [];
  await applyPlan(d.notif.enabled ? [...planned, ...timerPlanned] : []);
  store.set({ notifPermission: await getPermission() });
}

/* ---------------- accounts ---------------- */

export async function handleSession(session: Session | null): Promise<void> {
  if (!engine) return;
  if (!session) {
    store.set({ auth: null, pendingAccountDecision: null });
    await engine.refreshCounts();
    return;
  }
  const user = { userId: session.user.id, email: session.user.email ?? null };
  store.set({ auth: user });
  const res = await engine.connect(user.userId);
  if (res === 'needs_decision') { store.set({ pendingAccountDecision: user }); return; }
  await syncNow();
}

/** User's choice after signing into a different account on a device that already holds data. */
export async function resolveAccountDecision(decision: 'merge' | 'replace'): Promise<void> {
  const pending = store.get().pendingAccountDecision;
  if (!pending || !engine) return;
  try {
    await engine.connect(pending.userId, decision);
    store.set({ pendingAccountDecision: null });
    if (decision === 'replace') { await seedIfNeeded(getRepo()); await reloadAll(); }
    await syncNow();
    await reloadAll();
  } catch (e) {
    showToast('error', e instanceof Error ? e.message : 'Could not switch account.');
  }
}

/* ---------------- boot ---------------- */

export async function boot(): Promise<void> {
  if (booted) return;
  booted = true;
  try {
    const backend = await openStorage();
    repo = new Repo(backend);
    await repo.init();
    if (!repo.persistent) showToast('error', 'This browser blocked local storage, so changes will not be saved on this device. Sign in to keep your data in the cloud.');
    // Web: another tab changed the data — reload so this tab never shows (or overwrites with) stale state.
    repo.onExternalChange(() => { void reloadFromDisk(); });
    await seedIfNeeded(repo);
    const upgrade = await applyDefaultsV2(repo);
    await applyDesignV3(repo);

    const uidProvider = () => store.get().auth?.userId ?? null;
    engine = new SyncEngine(repo, makeCloudClient(uidProvider), {
      isOnline: async () => { const n = await NetInfo.fetch(); return !!n.isConnected && n.isInternetReachable !== false; },
      onStatus: (sync) => store.set({ sync }),
      onRemoteChange: (kinds) => { void reloadKinds(kinds); },
    });

    store.set({ data: await loadAll() });
    // Keep dated target history so changing a target later never rewrites past days.
    const d = store.get().data;
    const hist = recordTargets(d.prefs.targetHistory, toDateKey(new Date()), d.prefs, d.subjects);
    if (hist !== d.prefs.targetHistory) {
      const prefs = { ...d.prefs, targetHistory: hist, updatedAt: new Date().toISOString() };
      await repo.put('preferences', prefs);
      store.set((s) => ({ data: { ...s.data, prefs } }));
    }
    await recoverPersistedTimer();
    await engine.refreshCounts();

    initNotifications(handleNotificationTap);
    store.set({ notifPermission: await getPermission(), ready: true });
    scheduleReplan(300);
    if (upgrade.timetableSkipped) showToast('info', 'Your custom timetable was kept. The new default is in Timetable → ⋯ → Restore default.');

    NetInfo.addEventListener((n) => { if (n.isConnected && store.get().auth) scheduleSync(500); });
    RNAppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      scheduleSync(300); scheduleReplan(300);
    });

    if (cloudConfigured()) {
      auth.onChange((s) => { void handleSession(s); });
      await handleSession(await auth.session());
    }
  } catch (e) {
    booted = false;
    store.set({ bootError: e instanceof Error ? e.message : 'Could not start the app.' });
  }
}

export const allKinds = ENTITY_KINDS;

/** Wipe this device's data and re-seed the default timetable/subjects (used by "Delete my data"). */
export async function resetLocalData(): Promise<void> {
  const r = getRepo();
  await r.wipe();
  await seedIfNeeded(r);
  await reloadAll();
  store.set({ timer: null, timerPrompt: null });
  await replanNotifications();
}
