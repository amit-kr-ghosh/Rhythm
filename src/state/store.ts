import { useSyncExternalStore } from 'react';
import type {
  ActivityLog, ActivityTemplate, Affirmation, EntityKind, EntityMap, Goal, Habit, HabitRecord, NotificationSettings, Plan,
  Preferences, SavedQuote, ScheduleException, StudySession, Subject, Task,
} from '../domain/types';
import type { TimerState } from '../domain/timer';
import type { SyncStatus } from '../data/syncEngine';
import { buildDefaultNotificationSettings, buildDefaultPreferences } from '../domain/defaults';

export type AppData = {
  subjects: Subject[]; plans: Plan[]; templates: ActivityTemplate[]; exceptions: ScheduleException[];
  logs: ActivityLog[]; sessions: StudySession[]; tasks: Task[]; goals: Goal[]; habits: Habit[];
  habitRecords: HabitRecord[]; savedQuotes: SavedQuote[]; affirmations: Affirmation[];
  prefs: Preferences; notif: NotificationSettings;
};

export type TimerPrompt = { state: TimerState; lastSeen: number; gapMs: number };
export type AuthUser = { userId: string; email: string | null };
export type Toast = { id: number; kind: 'success' | 'info' | 'error'; text: string };

export type AppState = {
  ready: boolean;
  bootError: string | null;
  data: AppData;
  timer: TimerState | null;
  /** Set on a cold start when a running timer was last seen long ago: ask whether to keep or stop it. */
  timerPrompt: TimerPrompt | null;
  sync: SyncStatus;
  auth: AuthUser | null;
  /** A different account signed in on a device with existing data: the user must choose merge or replace. */
  pendingAccountDecision: AuthUser | null;
  systemScheme: 'dark' | 'light' | null;
  toast: Toast | null;
  /** Bumped when notification permission/schedule changes so settings UIs refresh. */
  notifPermission: 'granted' | 'denied' | 'undetermined';
};

type Listener = () => void;

export function createStore<T>(initial: T, normalize?: (next: T, previous: T) => T) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: (): T => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)): void {
      const p = typeof patch === 'function' ? patch(state) : patch;
      const merged = { ...state, ...p } as T;
      // Normalize before notifying subscribers. This prevents a transient/invalid async
      // update from replacing critical state (such as AppState.data) with undefined.
      state = normalize ? normalize(merged, state) : merged;
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

export const emptyData = (prefs: Preferences, notif: NotificationSettings): AppData => ({
  subjects: [], plans: [], templates: [], exceptions: [], logs: [], sessions: [], tasks: [], goals: [], habits: [],
  habitRecords: [], savedQuotes: [], affirmations: [], prefs, notif,
});

// Keep a complete, safe in-memory data shape from the very first render. Expo Router can
// mount route components before the async storage boot finishes, even while the root layout
// displays its loading overlay. Empty arrays/default preferences prevent those screens from
// dereferencing `undefined`; boot() replaces this snapshot with persisted data before ready=true.
const initialTimestamp = new Date().toISOString();
const initialData = emptyData(
  buildDefaultPreferences(initialTimestamp),
  buildDefaultNotificationSettings(initialTimestamp),
);

/** Keep every collection and settings object available even if a boot/reload patch is incomplete. */
export function normalizeAppData(candidate: AppData | null | undefined, fallback: AppData = initialData): AppData {
  const source = candidate && typeof candidate === 'object' ? candidate : fallback;
  const arraysValid = Array.isArray(source.subjects) && Array.isArray(source.plans)
    && Array.isArray(source.templates) && Array.isArray(source.exceptions) && Array.isArray(source.logs)
    && Array.isArray(source.sessions) && Array.isArray(source.tasks) && Array.isArray(source.goals)
    && Array.isArray(source.habits) && Array.isArray(source.habitRecords)
    && Array.isArray(source.savedQuotes) && Array.isArray(source.affirmations);
  // Preserve object identity during ordinary updates (e.g. toast/timer changes) to avoid
  // forcing every data-dependent screen to re-render.
  if (arraysValid && source.prefs && source.notif) return source as AppData;
  return {
    subjects: Array.isArray(source.subjects) ? source.subjects : fallback.subjects,
    plans: Array.isArray(source.plans) ? source.plans : fallback.plans,
    templates: Array.isArray(source.templates) ? source.templates : fallback.templates,
    exceptions: Array.isArray(source.exceptions) ? source.exceptions : fallback.exceptions,
    logs: Array.isArray(source.logs) ? source.logs : fallback.logs,
    sessions: Array.isArray(source.sessions) ? source.sessions : fallback.sessions,
    tasks: Array.isArray(source.tasks) ? source.tasks : fallback.tasks,
    goals: Array.isArray(source.goals) ? source.goals : fallback.goals,
    habits: Array.isArray(source.habits) ? source.habits : fallback.habits,
    habitRecords: Array.isArray(source.habitRecords) ? source.habitRecords : fallback.habitRecords,
    savedQuotes: Array.isArray(source.savedQuotes) ? source.savedQuotes : fallback.savedQuotes,
    affirmations: Array.isArray(source.affirmations) ? source.affirmations : fallback.affirmations,
    prefs: source.prefs ?? fallback.prefs,
    notif: source.notif ?? fallback.notif,
  };
}

export const store = createStore<AppState>({
  ready: false, bootError: null,
  data: initialData,
  timer: null, timerPrompt: null,
  sync: { state: 'signed_out', pending: 0, failed: 0, lastSyncAt: null, lastError: null },
  auth: null, pendingAccountDecision: null, systemScheme: null, toast: null, notifPermission: 'undetermined',
}, (next, previous) => ({
  ...next,
  // An accidental `data: undefined` patch must never erase the last valid application data.
  data: normalizeAppData(next.data, previous.data ?? initialData),
}));

/** Subscribe a component to a slice of state. The selector must return a stable reference (don't build new arrays inline). */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}

/** Plural entity kinds held as arrays in AppData. */
export type ListKind = Exclude<EntityKind, 'preferences' | 'notificationSettings'>;
export const LIST_KINDS: ListKind[] = [
  'subjects', 'plans', 'templates', 'exceptions', 'logs', 'sessions', 'tasks', 'goals', 'habits', 'habitRecords', 'savedQuotes', 'affirmations',
];

/** Merge saved entities into the in-memory copy (replace by id, drop tombstones). */
export function mergeIntoState<K extends ListKind>(kind: K, entities: EntityMap[K][]): void {
  store.set((s) => {
    const byId = new Map<string, EntityMap[K]>((s.data[kind] as EntityMap[K][]).map((e) => [e.id, e]));
    for (const e of entities) { if (e.deletedAt) byId.delete(e.id); else byId.set(e.id, e); }
    return { data: { ...s.data, [kind]: [...byId.values()] } };
  });
}

let toastId = 0;
export function showToast(kind: Toast['kind'], text: string): void {
  const id = ++toastId;
  store.set({ toast: { id, kind, text } });
  setTimeout(() => { if (store.get().toast?.id === id) store.set({ toast: null }); }, 4000);
}
