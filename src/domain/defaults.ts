import { addDays } from './time';
import { deterministicUuid } from './ids';
import type { ActivityTemplate, Category, DateKey, NotificationSettings, Plan, Preferences, Subject } from './types';

const hhmm = (h: number, m = 0) => h * 60 + m;
const p = (s: string): number => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/.exec(s);
  if (!m) throw new Error(`bad time ${s}`);
  let h = Number(m[1]);
  if (m[3] === 'AM') h = h === 12 ? 0 : h; else h = h === 12 ? 12 : h + 12;
  return hhmm(h, Number(m[2]));
};

/**
 * The four tracked study subjects (priority order: DSA > AI/ML > RBI > Communication). The `english` key is kept for
 * Communication so sessions recorded against the old "English Speaking" subject stay attached to it.
 */
export const DEFAULT_SUBJECTS: { key: string; name: string; color: string; daily: number; weekly: number }[] = [
  { key: 'dsa', name: 'DSA', color: '#6C8CFF', daily: 180, weekly: 1260 },
  { key: 'aiml', name: 'AI/ML', color: '#C26BFF', daily: 120, weekly: 840 },
  { key: 'rbi', name: 'RBI Preparation', color: '#F59E0B', daily: 60, weekly: 420 },
  { key: 'english', name: 'Communication', color: '#34D399', daily: 30, weekly: 210 },
];

/** Subjects, targets and timetable shipped before the v2 defaults; used to recognise untouched data when upgrading. */
export const LEGACY_SUBJECTS = {
  english: { name: 'English Speaking', daily: 60 },
  rbi: { name: 'RBI Grade B Preparation', daily: 60 },
  backend: { name: 'Backend Development' },
} as const;
export const LEGACY_DAILY_TARGET = 480;
export const LEGACY_WEEKLY_TARGET = 3360;
export const DEFAULT_DAILY_TARGET = 390; // 3h + 2h + 1h + 30m
export const DEFAULT_WEEKLY_TARGET = 2730;

/**
 * Untouched seeded defaults carry this timestamp and are NOT queued for upload. That way a second device's fresh
 * defaults can never overwrite real data in the cloud: real edits always carry a newer updatedAt and win.
 */
export const SEED_EPOCH = '1970-01-01T00:00:00.000Z';
export const isUntouchedSeed = (e: { updatedAt: string }): boolean => e.updatedAt === SEED_EPOCH;

export const subjectId = (key: string) => deterministicUuid(`subject:${key}`);
export const PLAN_REGULAR = deterministicUuid('plan:regular');
export const PLAN_COLLEGE = deterministicUuid('plan:college');

export type Row = [start: string, end: string, title: string];

/** Regular days: Monday, Tuesday, Friday, Saturday, Sunday. */
const REGULAR: Row[] = [
  ['6:30 AM', '6:45 AM', 'Wake up'], ['6:45 AM', '7:15 AM', 'Exercise'], ['7:15 AM', '7:45 AM', 'Breakfast'],
  ['7:45 AM', '9:45 AM', 'DSA'], ['9:45 AM', '10:00 AM', 'Break'], ['10:00 AM', '11:00 AM', 'DSA'],
  ['11:00 AM', '1:00 PM', 'Cooking'], ['1:00 PM', '1:30 PM', 'Bath'], ['1:30 PM', '2:00 PM', 'Lunch'],
  ['2:00 PM', '4:00 PM', 'AI/ML'], ['4:00 PM', '5:00 PM', 'RBI Preparation'], ['5:00 PM', '5:30 PM', 'Communication'],
  ['5:30 PM', '6:00 PM', 'Break'], ['6:00 PM', '7:00 PM', 'Walk'], ['7:00 PM', '7:30 PM', 'Dinner'],
  ['7:30 PM', '10:30 PM', 'Flexible time'], ['10:30 PM', '11:00 PM', 'Prepare for tomorrow'], ['11:00 PM', '11:30 PM', 'Wind down'],
];

/** College days: Wednesday, Thursday. */
const COLLEGE: Row[] = [
  ['6:30 AM', '6:45 AM', 'Wake up'], ['6:45 AM', '7:15 AM', 'Exercise'], ['7:15 AM', '7:45 AM', 'Breakfast'],
  ['7:45 AM', '8:15 AM', 'Communication'], ['8:15 AM', '9:15 AM', 'DSA'], ['9:15 AM', '9:20 AM', 'Get ready'],
  ['9:20 AM', '10:00 AM', 'College commute'], ['10:00 AM', '1:00 PM', 'College'], ['1:00 PM', '1:40 PM', 'Return commute'],
  ['1:40 PM', '3:40 PM', 'Cooking'], ['3:40 PM', '4:10 PM', 'Bath'], ['4:10 PM', '4:30 PM', 'Lunch'],
  ['4:30 PM', '6:30 PM', 'DSA'], ['6:30 PM', '7:30 PM', 'Walk'], ['7:30 PM', '9:30 PM', 'AI/ML'],
  ['9:30 PM', '10:30 PM', 'RBI Preparation'], ['10:30 PM', '11:00 PM', 'Dinner'], ['11:00 PM', '11:30 PM', 'Wind down'],
];

/** Maps a default activity title to its category and (optional) subject key. */
export function classify(title: string): { category: Category; subjectKey: string | null } {
  const t = title.toLowerCase();
  if (t.startsWith('dsa')) return { category: 'study', subjectKey: 'dsa' };
  if (t.startsWith('ai/ml')) return { category: 'study', subjectKey: 'aiml' };
  if (t.startsWith('communication') || t.startsWith('english')) return { category: 'study', subjectKey: 'english' };
  if (t.startsWith('rbi')) return { category: 'study', subjectKey: 'rbi' };
  if (t === 'exercise' || t === 'walk') return { category: 'exercise', subjectKey: null };
  if (t === 'sleep') return { category: 'sleep', subjectKey: null };
  if (t === 'afternoon nap') return { category: 'rest', subjectKey: null };
  if (['breakfast', 'lunch', 'dinner'].includes(t)) return { category: 'meal', subjectKey: null };
  if (t === 'cooking') return { category: 'cooking', subjectKey: null };
  if (t === 'college') return { category: 'college', subjectKey: null };
  if (['bath', 'wind down', 'wake up', 'get ready', 'prepare for tomorrow'].includes(t)) return { category: 'personal', subjectKey: null };
  if (t === 'break') return { category: 'break', subjectKey: null };
  if (t === 'flexible time' || t === 'free time') return { category: 'leisure', subjectKey: null };
  return { category: 'other', subjectKey: null }; // commutes
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Exported so tests can build fixtures from other row sets (e.g. the v1 defaults). */
export function buildRows(rows: Row[], planKey: 'regular' | 'college', planId: string, weekdays: number[], from: DateKey, now: string, tag = 'v2'): ActivityTemplate[] {
  return rows.map(([s, e, title], i) => {
    const { category, subjectKey } = classify(title);
    const defaultKey = `${planKey}-${tag}-${String(i).padStart(2, '0')}-${slug(title)}`;
    return {
      id: deterministicUuid(`template:${defaultKey}:${from}`),
      seriesId: deterministicUuid(`series:${defaultKey}`),
      planId, title, category,
      subjectId: subjectKey ? subjectId(subjectKey) : null,
      color: null,
      startMin: p(s), endMin: p(e),
      weekdays: [...weekdays],
      effectiveFrom: from, effectiveTo: null,
      reminderLeadMin: null,
      countInProgress: category !== 'sleep',
      isDefault: true, defaultKey,
      createdAt: now, updatedAt: now, deletedAt: null,
    };
  });
}

export function buildDefaultTemplates(from: DateKey, now: string): ActivityTemplate[] {
  return [
    ...buildRows(REGULAR, 'regular', PLAN_REGULAR, [1, 2, 5, 6, 0], from, now),
    ...buildRows(COLLEGE, 'college', PLAN_COLLEGE, [3, 4], from, now),
  ];
}

export function buildDefaultPlans(now: string): Plan[] {
  const base = { createdAt: now, updatedAt: now, deletedAt: null, isDefault: true };
  return [
    { id: PLAN_REGULAR, name: 'Regular days (Mon, Tue, Fri, Sat, Sun)', ...base },
    { id: PLAN_COLLEGE, name: 'College days (Wed, Thu)', ...base },
  ];
}

export function buildDefaultSubjects(now: string): Subject[] {
  return DEFAULT_SUBJECTS.map((s, i) => ({
    id: subjectId(s.key), name: s.name, color: s.color, archived: false, sortOrder: i,
    dailyTargetMin: s.daily > 0 ? s.daily : null, weeklyTargetMin: s.weekly > 0 ? s.weekly : null,
    notes: '', isDefault: true, createdAt: now, updatedAt: now, deletedAt: null,
  }));
}

export function buildDefaultPreferences(now: string): Preferences {
  return {
    id: 'preferences', createdAt: now, updatedAt: now, deletedAt: null,
    theme: 'light', weekStart: 1,
    dailyStudyTargetMin: DEFAULT_DAILY_TARGET, weeklyStudyTargetMin: DEFAULT_WEEKLY_TARGET,
    timer: {
      focusMin: 25, breakMin: 5, mode: 'stopwatch', breakReminders: true,
      presets: [{ name: 'Pomodoro 25/5', focusMin: 25, breakMin: 5 }, { name: 'Deep work 50/10', focusMin: 50, breakMin: 10 }],
    },
    weights: { timetable: 30, study: 40, tasks: 15, habits: 15 },
    excludeSleepFromProgress: true,
    motivation: { quoteOfDay: true, encouragement: true, dailyReminder: false, reminderMin: 8 * 60, topics: [] },
    whys: [], onboarded: false, streakThresholdMin: 60, targetHistory: [],
  };
}

export function buildDefaultNotificationSettings(now: string): NotificationSettings {
  return {
    id: 'notificationSettings', createdAt: now, updatedAt: now, deletedAt: null,
    enabled: false, activities: true, activityLeadMin: 5, study: true, tasks: true, taskLeadMin: 60,
    goals: true, breaks: true, habits: true, summary: false, summaryMin: 21 * 60 + 30,
    quietEnabled: true, quietStartMin: 23 * 60, quietEndMin: 6 * 60,
  };
}

/**
 * Restore the default timetable without destroying history: every currently-active default OR user template
 * is closed the day before `today`, then fresh default versions begin `today`.
 */
export function planRestoreDefaults(existing: ActivityTemplate[], today: DateKey, now: string): { close: ActivityTemplate[]; insert: ActivityTemplate[] } {
  const yesterday = addDays(today, -1);
  const close: ActivityTemplate[] = [];
  for (const t of existing) {
    if (t.deletedAt) continue;
    if (t.effectiveTo !== null && t.effectiveTo < today) continue;
    if (t.effectiveFrom >= today) {
      close.push({ ...t, deletedAt: now, updatedAt: now }); // never took effect → just remove
    } else {
      close.push({ ...t, effectiveTo: yesterday, updatedAt: now });
    }
  }
  return { close, insert: buildDefaultTemplates(today, now) };
}

/* ---------------- Upgrade from the v1 defaults ---------------- */

export const DEFAULTS_V2_KEY = 'defaultsV2';

export type DefaultsV2Plan = {
  subjects: Subject[];
  preferences: Preferences | null;
  close: ActivityTemplate[];
  insert: ActivityTemplate[];
  /** True when the timetable was left alone because the user has customised it (it can still be restored from the menu). */
  timetableSkipped: boolean;
};

/**
 * Pure, idempotent upgrade plan. Only data that still equals the shipped v1 defaults is changed:
 *  - "English Speaking" (60 min) becomes "Communication" (30 min) — same id, so its sessions stay attached;
 *  - "RBI Grade B Preparation" is renamed "RBI Preparation";
 *  - the unused "Backend Development" subject is archived (never deleted);
 *  - the 8 h / 56 h overall study targets become 6.5 h / 45.5 h;
 *  - if every active timetable row is an untouched v1 default, old rows are closed yesterday and the new timetable starts today.
 * Running it again returns an empty plan.
 */
export function planDefaultsV2(input: { subjects: Subject[]; templates: ActivityTemplate[]; prefs: Preferences; today: DateKey; now: string }): DefaultsV2Plan {
  const { subjects, templates, prefs, today, now } = input;
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const changed: Subject[] = [];
  const upd = (id: string, patch: Partial<Subject>, guard: (s: Subject) => boolean) => {
    const s = byId.get(id);
    if (s && !s.deletedAt && s.isDefault && guard(s)) changed.push({ ...s, ...patch, updatedAt: now });
  };
  upd(subjectId('english'), { name: 'Communication', dailyTargetMin: 30, weeklyTargetMin: 210 }, (s) => s.name === LEGACY_SUBJECTS.english.name && s.dailyTargetMin === LEGACY_SUBJECTS.english.daily);
  upd(subjectId('rbi'), { name: 'RBI Preparation' }, (s) => s.name === LEGACY_SUBJECTS.rbi.name);
  upd(subjectId('backend'), { archived: true }, (s) => !s.archived && s.name === LEGACY_SUBJECTS.backend.name && s.dailyTargetMin === null);
  const preferences = prefs.dailyStudyTargetMin === LEGACY_DAILY_TARGET && prefs.weeklyStudyTargetMin === LEGACY_WEEKLY_TARGET
    ? { ...prefs, dailyStudyTargetMin: DEFAULT_DAILY_TARGET, weeklyStudyTargetMin: DEFAULT_WEEKLY_TARGET, updatedAt: now } : null;

  const active = templates.filter((t) => !t.deletedAt && (t.effectiveTo === null || t.effectiveTo >= today));
  const alreadyV2 = active.some((t) => t.defaultKey?.includes('-v2-'));
  const untouched = active.length > 0 && active.every((t) => t.isDefault && t.updatedAt === SEED_EPOCH);
  if (alreadyV2 || active.length === 0) return { subjects: changed, preferences, close: [], insert: [], timetableSkipped: false };
  if (!untouched) return { subjects: changed, preferences, close: [], insert: [], timetableSkipped: true };
  const { close, insert } = planRestoreDefaults(templates, today, now);
  return { subjects: changed, preferences, close, insert, timetableSkipped: false };
}
