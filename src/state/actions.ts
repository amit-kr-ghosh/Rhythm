import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deterministicUuid, uuid } from '../domain/ids';
import { toDateKey } from '../domain/time';
import type {
  ActivityLog, ActivityTemplate, Affirmation, Category, DateKey, EntityBase, EntityKind, EntityMap, Goal, Habit, HabitRecord, LogStatus,
  Milestone, NotificationSettings, Occurrence, Preferences, Priority, Recurrence, SavedQuote, ScheduleException, SessionMode,
  StudySession, Subject, Task, TaskStatus,
} from '../domain/types';
import {
  duplicateTemplate, planReschedule, planTemplateDelete, planTemplateEdit, type TemplateEdit,
} from '../domain/schedule';
import { buildDefaultPlans, buildDefaultSubjects, planRestoreDefaults } from '../domain/defaults';
import {
  validateActivity, validateGoal, validateHabit, validateQuietHours, validateSubject, validateTargets, validateTask, validateTimerConfig,
  validateWeights, type Validation,
} from '../domain/validation';
import {
  cancelTimer, finishTimer, heartbeat, interruptAt, pause as pauseTimer, resume as resumeTimer, startTimer, type TimerConfig,
} from '../domain/timer';
import { buildManualSession, isDuplicateSession, overlappingSessions, toSession, type ManualEntryInput, type ManualResult } from '../domain/sessions';
import { recordTargets } from '../domain/progress';
import { overrideKey, overrideLogId, overrideLogStatus, type StudyStatus } from '../domain/study';
import { encouragement } from '../domain/quotes';
import { dailyTotalsToCsv, sessionsToCsv, toJsonExport } from '../domain/export';
import { dailyFocus } from '../domain/analytics';
import { startOfMonth } from '../domain/time';
import { getEngine, getRepo, persistTimer, reloadAll, replanNotifications, scheduleReplan, scheduleSync, syncNow } from './runtime';
import { LIST_KINDS, mergeIntoState, showToast, store, type ListKind } from './store';
import { auth } from '../services/cloud';
import { getPermission, requestPermission } from '../services/notifications';
import { normalizeAlertPrefs, type AlertPrefs } from '../domain/alerts';

const nowIso = (): string => new Date().toISOString();
const today = (): DateKey => toDateKey(new Date());
const D = () => store.get().data;
const stamp = (): EntityBase => { const t = nowIso(); return { id: uuid(), createdAt: t, updatedAt: t, deletedAt: null }; };

/** Persist + mirror into memory + schedule sync/notifications. Every mutation funnels through here. */
async function save<K extends ListKind>(kind: K, entities: EntityMap[K] | EntityMap[K][], opts: { replan?: boolean } = {}): Promise<void> {
  const list = Array.isArray(entities) ? entities : [entities];
  await getRepo().put(kind, list);
  mergeIntoState(kind, list);
  scheduleSync();
  if (opts.replan !== false) scheduleReplan();
}
async function remove<K extends ListKind>(kind: K, id: string): Promise<void> {
  const dead = await getRepo().softDelete(kind, id, nowIso());
  if (dead) mergeIntoState(kind, [dead as EntityMap[K]]);
  scheduleSync(); scheduleReplan();
}

export type Result<T = void> = ({ ok: true } & (T extends void ? object : { value: T })) | { ok: false; errors: Record<string, string> };
const bad = (v: Validation): { ok: false; errors: Record<string, string> } => ({ ok: false, errors: v.errors as Record<string, string> });

/* ======================= Preferences & settings ======================= */

export async function updatePrefs(patch: Partial<Omit<Preferences, keyof EntityBase>>): Promise<Result> {
  const cur = D().prefs;
  const next: Preferences = { ...cur, ...patch, id: 'preferences', updatedAt: nowIso(), deletedAt: null };
  if (patch.dailyStudyTargetMin !== undefined || patch.weeklyStudyTargetMin !== undefined) {
    const v = validateTargets({ dailyMin: next.dailyStudyTargetMin, weeklyMin: next.weeklyStudyTargetMin });
    if (!v.ok) return bad(v);
    next.targetHistory = recordTargets(next.targetHistory, today(), next, D().subjects);
  }
  if (patch.weights) { const v = validateWeights(next.weights); if (!v.ok) return bad(v); }
  if (patch.timer) {
    const v = validateTimerConfig({ mode: next.timer.mode, focusMin: next.timer.focusMin, breakMin: next.timer.breakMin });
    if (!v.ok) return bad(v);
  }
  await getRepo().put('preferences', next);
  store.set((s) => ({ data: { ...s.data, prefs: next } }));
  if (patch.theme) { try { await AsyncStorage.setItem('rhythm.theme', patch.theme); } catch { /* cached copy is only an optimisation */ } }
  scheduleSync(); scheduleReplan();
  return { ok: true };
}

export async function updateNotif(patch: Partial<Omit<NotificationSettings, keyof EntityBase>>): Promise<Result> {
  const cur = D().notif;
  const next: NotificationSettings = { ...cur, ...patch, id: 'notificationSettings', updatedAt: nowIso(), deletedAt: null };
  if (patch.quietStartMin !== undefined || patch.quietEndMin !== undefined) {
    const v = validateQuietHours({ startMin: next.quietStartMin, endMin: next.quietEndMin });
    if (!v.ok) return bad(v);
  }
  await getRepo().put('notificationSettings', next);
  store.set((s) => ({ data: { ...s.data, notif: next } }));
  scheduleSync(); scheduleReplan(200);
  return { ok: true };
}

/** Sound / vibration / keep-awake for timer alerts. Stored on this device only. */
export async function updateAlertPrefs(patch: Partial<AlertPrefs>): Promise<void> {
  const next = normalizeAlertPrefs({ ...store.get().alertPrefs, ...patch });
  store.set({ alertPrefs: next });
  try { await getRepo().kvSet('alertPrefs', JSON.stringify(next)); } catch { /* the choice still applies for this session */ }
}

/** Explain-then-ask flow lives in the UI; this performs the OS request and turns reminders on only if granted. */
export async function enableNotifications(): Promise<'granted' | 'denied' | 'undetermined'> {
  const p = await requestPermission();
  store.set({ notifPermission: p });
  if (p === 'granted') await updateNotif({ enabled: true });
  return p;
}
export async function disableNotifications(): Promise<void> {
  await updateNotif({ enabled: false });
  store.set({ notifPermission: await getPermission() });
}

export async function completeOnboarding(whys: string[]): Promise<void> {
  await updatePrefs({ onboarded: true, whys: whys.map((w) => w.trim()).filter(Boolean) });
}

/* ======================= Subjects ======================= */

export type SubjectInput = { id?: string; name: string; color: string; dailyTargetMin: number | null; weeklyTargetMin: number | null; notes?: string };

export async function saveSubject(i: SubjectInput): Promise<Result<Subject>> {
  const others = D().subjects.filter((s) => s.id !== i.id).map((s) => s.name);
  const v = validateSubject(i, others);
  if (!v.ok) return bad(v);
  const existing = i.id ? D().subjects.find((s) => s.id === i.id) : undefined;
  const t = nowIso();
  const subject: Subject = existing
    ? { ...existing, name: i.name.trim(), color: i.color, dailyTargetMin: i.dailyTargetMin, weeklyTargetMin: i.weeklyTargetMin, notes: i.notes ?? existing.notes, updatedAt: t }
    : { ...stamp(), name: i.name.trim(), color: i.color, archived: false, sortOrder: D().subjects.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1, dailyTargetMin: i.dailyTargetMin, weeklyTargetMin: i.weeklyTargetMin, notes: i.notes ?? '', isDefault: false };
  await save('subjects', subject);
  await recordTargetHistory();
  return { ok: true, value: subject };
}

export async function archiveSubject(id: string, archived: boolean): Promise<void> {
  const s = D().subjects.find((x) => x.id === id);
  if (s) await save('subjects', { ...s, archived, updatedAt: nowIso() });
}

/** What deleting a subject will touch, for the confirmation message. */
export function subjectUsage(id: string): { sessions: number; tasks: number; goals: number; activities: number } {
  const d = D();
  return {
    sessions: d.sessions.filter((x) => x.subjectId === id).length,
    tasks: d.tasks.filter((x) => x.subjectId === id).length,
    goals: d.goals.filter((x) => x.subjectId === id).length,
    activities: d.templates.filter((x) => x.subjectId === id).length + d.exceptions.filter((x) => x.subjectId === id).length,
  };
}

/**
 * Delete a subject. It is a tombstone (so the deletion syncs to every device). Recorded sessions are never deleted: they
 * stay in history and totals as "Unassigned". Tasks, goals and timetable blocks that pointed at it are unlinked first,
 * so nothing keeps referencing a subject that no longer exists.
 */
export async function deleteSubject(id: string): Promise<Result> {
  const subject = D().subjects.find((x) => x.id === id);
  if (!subject) return { ok: false, errors: { general: 'Subject not found.' } };
  if (store.get().timer?.subjectId === id) return { ok: false, errors: { general: 'A timer is running for this subject. Finish or cancel it first.' } };
  const t = nowIso();
  const d = D();
  const unlink = <T extends { subjectId: string | null; updatedAt: string }>(list: T[]): T[] =>
    list.filter((x) => x.subjectId === id).map((x) => ({ ...x, subjectId: null, updatedAt: t }));
  const templates = unlink(d.templates), exceptions = unlink(d.exceptions), tasks = unlink(d.tasks), goals = unlink(d.goals);
  if (templates.length) await save('templates', templates, { replan: false });
  if (exceptions.length) await save('exceptions', exceptions, { replan: false });
  if (tasks.length) await save('tasks', tasks, { replan: false });
  if (goals.length) await save('goals', goals, { replan: false });
  await remove('subjects', id);
  await recordTargetHistory();
  return { ok: true };
}

async function recordTargetHistory(): Promise<void> {
  const d = D();
  const hist = recordTargets(d.prefs.targetHistory, today(), d.prefs, d.subjects);
  if (hist !== d.prefs.targetHistory) await updatePrefs({ targetHistory: hist });
}

/* ======================= Timetable ======================= */

export type ActivityInput = {
  title: string; category: Category; subjectId: string | null; color: string | null; startMin: number; endMin: number;
  weekdays: number[]; reminderLeadMin: number | null; countInProgress: boolean; planId?: string | null;
};

/** Create a recurring activity starting on `effectiveFrom` (default today). */
export async function createActivity(i: ActivityInput, effectiveFrom: DateKey = today()): Promise<Result<ActivityTemplate>> {
  const v = validateActivity(i);
  if (!v.ok) return bad(v);
  const b = stamp();
  const t: ActivityTemplate = {
    ...b, planId: i.planId ?? null, title: i.title.trim(), category: i.category, subjectId: i.category === 'study' ? i.subjectId : i.subjectId,
    color: i.color, startMin: i.startMin, endMin: i.endMin, weekdays: [...i.weekdays].sort(), effectiveFrom, effectiveTo: null,
    reminderLeadMin: i.reminderLeadMin, countInProgress: i.countInProgress, isDefault: false, defaultKey: null, seriesId: b.id,
  };
  await save('templates', t);
  return { ok: true, value: t };
}

/**
 * Edit a recurring activity from `effectiveFrom` onward. Earlier dates keep the old version so history is never rewritten.
 * Pass `effectiveFrom` = the occurrence date to edit "this and following days".
 */
export async function editActivity(templateId: string, edit: TemplateEdit, effectiveFrom: DateKey = today()): Promise<Result> {
  const t = D().templates.find((x) => x.id === templateId);
  if (!t) return { ok: false, errors: { general: 'Activity not found.' } };
  const merged = { ...t, ...edit };
  const v = validateActivity({ title: merged.title, category: merged.category, startMin: merged.startMin, endMin: merged.endMin, weekdays: merged.weekdays, reminderLeadMin: merged.reminderLeadMin });
  if (!v.ok) return bad(v);
  const { update, create } = planTemplateEdit(t, { ...edit, title: merged.title.trim() }, effectiveFrom, nowIso());
  await save('templates', create ? [update, create] : [update]);
  return { ok: true };
}

export async function deleteActivity(templateId: string, from: DateKey = today()): Promise<void> {
  const t = D().templates.find((x) => x.id === templateId);
  if (t) await save('templates', planTemplateDelete(t, from, nowIso()));
}

export async function duplicateActivity(templateId: string): Promise<ActivityTemplate | null> {
  const t = D().templates.find((x) => x.id === templateId);
  if (!t) return null;
  const copy = duplicateTemplate(t, nowIso(), today());
  await save('templates', copy);
  return copy;
}

const blankEx = { title: null, category: null, subjectId: null, color: null, startMin: null, endMin: null } as const;

/** Skip one occurrence (it disappears from that day and is excluded from progress). */
export async function skipOccurrence(occ: Occurrence): Promise<void> {
  if (occ.templateId) {
    const ex: ScheduleException = { ...stamp(), ...blankEx, date: occ.date, type: 'skip', templateId: occ.templateId };
    await save('exceptions', ex);
  } else if (occ.exceptionId) await remove('exceptions', occ.exceptionId);
}

/** Undo a skip: remove the exception so the recurring block returns. */
export async function restoreSkipped(exceptionId: string): Promise<void> { await remove('exceptions', exceptionId); }

/** Move one occurrence to another date/time without touching the recurring template. */
export async function rescheduleOccurrence(occ: Occurrence, to: { date: DateKey; startMin: number; endMin: number }): Promise<Result> {
  if (to.startMin === to.endMin) return { ok: false, errors: { time: 'Start and end cannot be the same time.' } };
  const { exceptions, deleteExceptionIds } = planReschedule(occ, to, nowIso());
  await save('exceptions', exceptions);
  for (const id of deleteExceptionIds) await remove('exceptions', id);
  return { ok: true };
}

/** Change just this day's version of a recurring block (title/time/subject). */
export async function overrideOccurrence(occ: Occurrence, over: { title?: string; category?: Category; subjectId?: string | null; startMin: number; endMin: number }): Promise<Result> {
  if (!occ.templateId) {
    const ex = D().exceptions.find((e) => e.id === occ.exceptionId);
    if (!ex) return { ok: false, errors: { general: 'Not found.' } };
    await save('exceptions', { ...ex, title: over.title ?? ex.title, category: over.category ?? ex.category, subjectId: over.subjectId === undefined ? ex.subjectId : over.subjectId, startMin: over.startMin, endMin: over.endMin, updatedAt: nowIso() });
    return { ok: true };
  }
  const existing = D().exceptions.find((e) => e.id === occ.exceptionId && e.type === 'override');
  const base = existing ?? { ...stamp(), ...blankEx, date: occ.date, type: 'override' as const, templateId: occ.templateId };
  await save('exceptions', { ...base, title: over.title ?? null, category: over.category ?? null, subjectId: over.subjectId ?? null, startMin: over.startMin, endMin: over.endMin, updatedAt: nowIso() });
  return { ok: true };
}

export async function addOneOffActivity(date: DateKey, i: { title: string; category: Category; subjectId: string | null; color: string | null; startMin: number; endMin: number }): Promise<Result> {
  const v = validateActivity({ ...i, weekdays: [0] });
  if (!v.ok) return bad(v);
  await save('exceptions', { ...stamp(), date, type: 'add', templateId: null, title: i.title.trim(), category: i.category, subjectId: i.subjectId, color: i.color, startMin: i.startMin, endMin: i.endMin });
  return { ok: true };
}

/** Restore the default timetable from today. Old versions are closed (history kept), never deleted. */
export async function restoreDefaultTimetable(): Promise<void> {
  const t = nowIso();
  const { close, insert } = planRestoreDefaults(D().templates, today(), t);
  const plans = buildDefaultPlans(t).filter((p) => !D().plans.some((x) => x.id === p.id));
  const subjects = buildDefaultSubjects(t).filter((s) => !D().subjects.some((x) => x.id === s.id));
  await save('templates', [...close, ...insert], { replan: false });
  if (plans.length) await save('plans', plans, { replan: false });
  if (subjects.length) await save('subjects', subjects, { replan: false });
  scheduleReplan();
}

/** Mark what actually happened for one occurrence. `clear` removes the record. Never creates study time. */
export async function setOccurrenceStatus(occ: Occurrence, status: LogStatus | 'clear', completedMin = 0): Promise<void> {
  const id = deterministicUuid(`log:${occ.key}`);
  if (status === 'clear') { await remove('logs', id); return; }
  const cur = D().logs.find((l) => l.id === id);
  const t = nowIso();
  const log: ActivityLog = {
    id, createdAt: cur?.createdAt ?? t, updatedAt: t, deletedAt: null, occurrenceKey: occ.key, date: occ.date, status,
    completedMin: status === 'partial' ? Math.max(1, Math.min(completedMin, occ.durationMin)) : 0,
    snapshot: { title: occ.title, category: occ.category, subjectId: occ.subjectId, startMin: occ.startMin, endMin: occ.endMin },
    note: cur?.note ?? '',
  };
  await save('logs', log, { replan: false });
}

/* ======================= Focus timer & sessions ======================= */

export type FocusStart = { mode: SessionMode; focusMin: number; breakMin: number; subjectId: string | null; occurrenceKey?: string | null; taskId?: string | null };

export async function startFocus(i: FocusStart): Promise<Result> {
  if (store.get().timer) return { ok: false, errors: { general: 'A timer is already running. Finish or cancel it first.' } };
  const v = validateTimerConfig({ mode: i.mode, focusMin: i.focusMin, breakMin: i.breakMin });
  if (!v.ok) return bad(v);
  const now = Date.now();
  if (overlappingSessions(now, now + 1000, D().sessions).length > 0) {
    return { ok: false, errors: { general: 'This time overlaps a recorded session. Edit or delete that session first.' } };
  }
  const cfg: TimerConfig = {
    mode: i.mode, focusMs: i.focusMin * 60_000, breakMs: i.breakMin * 60_000, subjectId: i.subjectId,
    occurrenceKey: i.occurrenceKey ?? null, taskId: i.taskId ?? null,
  };
  await persistTimer(startTimer(cfg, uuid(), now));
  scheduleReplan(100);
  return { ok: true };
}

export async function pauseFocus(): Promise<void> { const t = store.get().timer; if (t && t.status === 'running') { await persistTimer(pauseTimer(t, Date.now())); scheduleReplan(100); } }
export async function resumeFocus(): Promise<void> { const t = store.get().timer; if (t && t.status === 'paused') { await persistTimer(resumeTimer(t, Date.now())); scheduleReplan(100); } }
export async function setTimerNote(note: string): Promise<void> { const t = store.get().timer; if (t) await persistTimer({ ...t, note }); }
/** Cheap liveness stamp so a crash can be reconciled on next launch. Call every ~15 s while the timer screen is visible. */
export async function touchTimer(): Promise<void> { const t = store.get().timer; if (t) await persistTimer(heartbeat(t, Date.now())); }

/** Save the session and clear the timer. Returns the saved session, or null when there was nothing valid to record. */
let finishing = false;
/** Stop and save. Re-entrant taps (double tap on Save) are ignored while one save is in flight, and the session id is idempotent. */
export async function finishFocus(note?: string): Promise<StudySession | null> {
  if (finishing) return null;
  const t = store.get().timer;
  if (!t) return null;
  finishing = true;
  try {
    const draft = finishTimer(t, Date.now(), note);
    await persistTimer(null);
    scheduleReplan(100);
    if (!draft) { showToast('info', 'Nothing was recorded — the session had no focused time.'); return null; }
    return commitSession(draft);
  } finally { finishing = false; }
}

async function commitSession(draft: ReturnType<typeof finishTimer>): Promise<StudySession | null> {
  if (!draft) return null;
  if (isDuplicateSession(draft, D().sessions)) return D().sessions.find((s) => s.id === draft.id) ?? null; // retry-safe
  const s = toSession(draft, nowIso());
  await save('sessions', s, { replan: false });
  if (D().prefs.motivation.encouragement && s.status !== 'cancelled') showToast('success', encouragement('session', s.id));
  return s;
}

/** The caller must have asked the user to confirm. Keeps what was recorded (≥10 s) as a *cancelled* session, excluded from analytics. */
export async function cancelFocus(): Promise<void> {
  const t = store.get().timer;
  if (!t) return;
  const draft = cancelTimer(t, Date.now());
  await persistTimer(null);
  scheduleReplan(100);
  if (draft) await commitSession(draft);
}

/** Recovery prompt answers. */
export async function keepRecoveredTimer(): Promise<void> {
  const p = store.get().timerPrompt;
  if (!p) return;
  store.set({ timerPrompt: null });
  await persistTimer(heartbeat(p.state, Date.now()));
}
export async function stopRecoveredTimer(): Promise<StudySession | null> {
  const p = store.get().timerPrompt;
  if (!p) return null;
  store.set({ timerPrompt: null });
  const draft = interruptAt(p.state, p.lastSeen);
  await persistTimer(null);
  return commitSession(draft);
}

export async function addManualSession(i: ManualEntryInput): Promise<ManualResult> {
  const t = store.get().timer;
  const res = buildManualSession(i, D().sessions, new Date(), t ? { startedAt: t.startedAt } : null);
  if (res.ok) await save('sessions', res.session, { replan: false });
  return res;
}

export type SessionEdit = { note?: string; reflection?: string; subjectId?: string | null; time?: { date: DateKey; startMin: number; durationMin: number } };
export async function editSession(id: string, e: SessionEdit): Promise<Result> {
  const s = D().sessions.find((x) => x.id === id);
  if (!s) return { ok: false, errors: { general: 'Session not found.' } };
  let next: StudySession = { ...s, updatedAt: nowIso() };
  if (e.note !== undefined) next.note = e.note;
  if (e.reflection !== undefined) next.reflection = e.reflection;
  if (e.subjectId !== undefined) next.subjectId = e.subjectId;
  if (e.time) {
    if (s.source !== 'manual') return { ok: false, errors: { time: 'Only manual entries can change time. Delete and re-add instead.' } };
    const probe = buildManualSession({ ...e.time, subjectId: next.subjectId, note: next.note }, D().sessions.filter((x) => x.id !== id), new Date(), store.get().timer ? { startedAt: store.get().timer!.startedAt } : null);
    if (!probe.ok) return { ok: false, errors: probe.errors as Record<string, string> };
    next = { ...next, date: probe.session.date, startedAt: probe.session.startedAt, endedAt: probe.session.endedAt, focusSec: probe.session.focusSec, elapsedSec: probe.session.elapsedSec };
  }
  await save('sessions', next, { replan: false });
  return { ok: true };
}
export async function deleteSession(id: string): Promise<void> { await remove('sessions', id); }

/* ======================= Tasks ======================= */

export type TaskInput = {
  id?: string; title: string; description?: string; subjectId: string | null; priority: Priority; dueDate: DateKey | null; dueMin?: number | null;
  estimateMin: number | null; reminderLeadMin?: number | null; recurrence?: Recurrence; occurrenceKey?: string | null; goalId?: string | null;
};
export async function saveTask(i: TaskInput): Promise<Result<Task>> {
  const v = validateTask({ title: i.title, priority: i.priority, estimateMin: i.estimateMin, dueDate: i.dueDate });
  if (!v.ok) return bad(v);
  const cur = i.id ? D().tasks.find((t) => t.id === i.id) : undefined;
  const fields = {
    title: i.title.trim(), description: i.description ?? cur?.description ?? '', subjectId: i.subjectId, priority: i.priority,
    dueDate: i.dueDate, dueMin: i.dueMin ?? null, estimateMin: i.estimateMin, reminderLeadMin: i.reminderLeadMin ?? null,
    recurrence: i.recurrence ?? null, occurrenceKey: i.occurrenceKey ?? cur?.occurrenceKey ?? null, goalId: i.goalId ?? cur?.goalId ?? null,
  };
  const task: Task = cur
    ? { ...cur, ...fields, updatedAt: nowIso() }
    : { ...stamp(), ...fields, status: 'todo', completedAt: null, templateId: null, doneDates: [] };
  await save('tasks', task);
  return { ok: true, value: task };
}

/** Completing a task never creates study time — only recorded sessions or validated manual entries do. */
export async function setTaskStatus(id: string, status: TaskStatus, onDate: DateKey = today()): Promise<void> {
  const t = D().tasks.find((x) => x.id === id);
  if (!t) return;
  const now = nowIso();
  if (t.recurrence) {
    const set = new Set(t.doneDates);
    if (status === 'done') set.add(onDate); else set.delete(onDate);
    await save('tasks', { ...t, doneDates: [...set].sort(), updatedAt: now });
    return;
  }
  await save('tasks', { ...t, status, completedAt: status === 'done' ? now : null, updatedAt: now });
  if (status === 'done' && D().prefs.motivation.encouragement) showToast('success', encouragement('goal', id));
}
export async function deleteTask(id: string): Promise<void> { await remove('tasks', id); }

/* ======================= Goals & milestones ======================= */

export type GoalInput = { id?: string; title: string; why: string; subjectId: string | null; topic: string; deadline: DateKey | null; targetMin: number | null };
export async function saveGoal(i: GoalInput): Promise<Result<Goal>> {
  const v = validateGoal({ title: i.title, targetMin: i.targetMin });
  if (!v.ok) return bad(v);
  const cur = i.id ? D().goals.find((g) => g.id === i.id) : undefined;
  const goal: Goal = cur
    ? { ...cur, title: i.title.trim(), why: i.why.trim(), subjectId: i.subjectId, topic: i.topic.trim(), deadline: i.deadline, targetMin: i.targetMin, updatedAt: nowIso() }
    : { ...stamp(), title: i.title.trim(), why: i.why.trim(), subjectId: i.subjectId, topic: i.topic.trim(), deadline: i.deadline, targetMin: i.targetMin, startDate: today(), milestones: [], archived: false };
  await save('goals', goal, { replan: false });
  return { ok: true, value: goal };
}
export async function addMilestone(goalId: string, title: string): Promise<void> {
  const g = D().goals.find((x) => x.id === goalId); const name = title.trim();
  if (!g || !name) return;
  const m: Milestone = { id: uuid(), title: name, done: false, doneAt: null };
  await save('goals', { ...g, milestones: [...g.milestones, m], updatedAt: nowIso() }, { replan: false });
}
export async function toggleMilestone(goalId: string, milestoneId: string): Promise<void> {
  const g = D().goals.find((x) => x.id === goalId);
  if (!g) return;
  const t = nowIso();
  const milestones = g.milestones.map((m) => (m.id === milestoneId ? { ...m, done: !m.done, doneAt: m.done ? null : t } : m));
  await save('goals', { ...g, milestones, updatedAt: t }, { replan: false });
  if (milestones.find((m) => m.id === milestoneId)?.done && D().prefs.motivation.encouragement) showToast('success', encouragement('goal', milestoneId));
}
export async function removeMilestone(goalId: string, milestoneId: string): Promise<void> {
  const g = D().goals.find((x) => x.id === goalId);
  if (g) await save('goals', { ...g, milestones: g.milestones.filter((m) => m.id !== milestoneId), updatedAt: nowIso() }, { replan: false });
}
export async function archiveGoal(id: string, archived: boolean): Promise<void> {
  const g = D().goals.find((x) => x.id === id);
  if (g) await save('goals', { ...g, archived, updatedAt: nowIso() }, { replan: false });
}
export async function deleteGoal(id: string): Promise<void> { await remove('goals', id); }

/* ======================= Habits ======================= */

export type HabitInput = { id?: string; name: string; color: string; weekdays: number[]; reminderMin: number | null; linkedCategory: Category | null };
export async function saveHabit(i: HabitInput): Promise<Result<Habit>> {
  const v = validateHabit({ name: i.name, weekdays: i.weekdays });
  if (!v.ok) return bad(v);
  const cur = i.id ? D().habits.find((h) => h.id === i.id) : undefined;
  const habit: Habit = cur
    ? { ...cur, name: i.name.trim(), color: i.color, weekdays: [...i.weekdays].sort(), reminderMin: i.reminderMin, linkedCategory: i.linkedCategory, updatedAt: nowIso() }
    : { ...stamp(), name: i.name.trim(), color: i.color, weekdays: [...i.weekdays].sort(), reminderMin: i.reminderMin, archived: false, linkedCategory: i.linkedCategory };
  await save('habits', habit);
  return { ok: true, value: habit };
}
export async function archiveHabit(id: string, archived: boolean): Promise<void> {
  const h = D().habits.find((x) => x.id === id);
  if (h) await save('habits', { ...h, archived, updatedAt: nowIso() });
}
export async function deleteHabit(id: string): Promise<void> { await remove('habits', id); }

export async function toggleHabit(habitId: string, date: DateKey = today()): Promise<void> {
  const id = deterministicUuid(`habit:${habitId}:${date}`);
  const cur = D().habitRecords.find((r) => r.id === id);
  const t = nowIso();
  const rec: HabitRecord = cur
    ? { ...cur, done: !cur.done, updatedAt: t }
    : { id, habitId, date, done: true, createdAt: t, updatedAt: t, deletedAt: null };
  await save('habitRecords', rec);
}

/* ======================= Motivation ======================= */

export async function toggleSavedQuote(quoteId: string): Promise<void> {
  const id = deterministicUuid(`quote:${quoteId}`);
  const cur = [...D().savedQuotes].find((q) => q.id === id);
  if (cur) { await remove('savedQuotes', id); return; }
  const t = nowIso();
  const q: SavedQuote = { id, quoteId, createdAt: t, updatedAt: t, deletedAt: null };
  await save('savedQuotes', q, { replan: false });
}
export async function saveAffirmation(text: string, id?: string): Promise<Result> {
  const clean = text.trim();
  if (!clean) return { ok: false, errors: { text: 'Write something first.' } };
  if (clean.length > 200) return { ok: false, errors: { text: 'Keep it under 200 characters.' } };
  const cur = id ? D().affirmations.find((a) => a.id === id) : undefined;
  const a: Affirmation = cur ? { ...cur, text: clean, updatedAt: nowIso() } : { ...stamp(), text: clean };
  await save('affirmations', a, { replan: false });
  return { ok: true };
}
export async function deleteAffirmation(id: string): Promise<void> { await remove('affirmations', id); }

/* ======================= Export ======================= */

export type ExportFile = { filename: string; mime: string; content: string };

export function buildExport(format: 'csv' | 'json', range?: { from: DateKey; to: DateKey }): ExportFile {
  const d = D();
  const from = range?.from ?? '0000-01-01', to = range?.to ?? '9999-12-31';
  const sessions = d.sessions.filter((s) => s.date >= from && s.date <= to);
  const stamped = nowIso().slice(0, 10);
  const first = sessions.map((s) => s.date).sort()[0] ?? startOfMonth(today());
  const days = dailyFocus(sessions, { from: range?.from ?? first, to: range?.to ?? today() });
  if (format === 'csv') return { filename: `rhythm-sessions-${stamped}.csv`, mime: 'text/csv', content: sessionsToCsv(sessions, d.subjects) + '\n\n' + dailyTotalsToCsv(days) };
  return {
    filename: `rhythm-export-${stamped}.json`, mime: 'application/json',
    content: toJsonExport({ exportedAt: nowIso(), subjects: d.subjects, sessions, tasks: d.tasks, goals: d.goals, habits: d.habits, habitRecords: d.habitRecords, dailyFocusMinutes: days }),
  };
}

export async function shareExport(file: ExportFile): Promise<void> {
  if (Platform.OS === 'web') {
    // Browser: hand the file to the download manager. (Blob URL is revoked right after the click.)
    const blob = new Blob([file.content], { type: `${file.mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    showToast('success', `Downloaded ${file.filename}`);
    return;
  }
  const { File, Paths } = await import('expo-file-system');
  const Sharing = await import('expo-sharing');
  const f = new File(Paths.cache, file.filename);
  if (f.exists) f.delete();
  f.create();
  await f.write(file.content); // async since SDK 58; awaiting is also correct for the older synchronous form
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: file.mime, dialogTitle: 'Export Rhythm data' });
  else showToast('error', 'Sharing is not available on this device.');
}

/* ======================= Account & data ======================= */

export async function signOut(): Promise<void> {
  await auth.signOut();
  store.set({ auth: null, pendingAccountDecision: null });
  await getEngine().refreshCounts();
}

export async function manualSync(): Promise<void> { await syncNow(); }
export async function retryFailedSync(): Promise<void> { await getEngine().retryFailed(); await reloadAll(); }

/**
 * Permanently delete personal data. Always clears this device; optionally the signed-in cloud copy too.
 * The caller has already explained the consequences and obtained confirmation.
 */
export async function deleteAllPersonalData(opts: { alsoCloud: boolean }): Promise<Result> {
  if (opts.alsoCloud && store.get().auth) {
    const r = await auth.deleteCloudData();
    if (!r.ok) return { ok: false, errors: { general: r.message } };
  }
  await persistTimer(null);
  const { resetLocalData } = await import('./runtime');
  await resetLocalData();
  return { ok: true };
}

export { LIST_KINDS, replanNotifications };
export type { EntityKind };

/**
 * Manually set (or clear) the status label for a tracked subject on a day. This NEVER creates or changes study minutes:
 * minutes come only from recorded sessions. Stored as an activity log with a reserved key, so it syncs like any log.
 */
export async function setSubjectStatus(subjectId: string, date: DateKey, status: StudyStatus | 'clear'): Promise<void> {
  const id = overrideLogId(subjectId, date);
  if (status === 'clear') { await remove('logs', id); return; }
  const cur = D().logs.find((l) => l.id === id);
  const t = nowIso();
  const log: ActivityLog = {
    id, createdAt: cur?.createdAt ?? t, updatedAt: t, deletedAt: null, occurrenceKey: overrideKey(subjectId, date), date,
    status: overrideLogStatus(status), completedMin: 0,
    snapshot: { title: 'Study status', category: 'study', subjectId, startMin: 0, endMin: 0 }, note: 'manual',
  };
  await save('logs', log, { replan: false });
}
