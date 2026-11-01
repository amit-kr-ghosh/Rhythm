import { addDays, dateRange, instantAt, toDateKey, weekdayOf } from './time';
import { resolveDay } from './schedule';
import { habitScheduledOn, taskDueOn } from './progress';
import type {
  ActivityTemplate, DateKey, Habit, HabitRecord, Minutes, NotificationSettings, Preferences, ScheduleException, Subject, Task,
} from './types';
import type { TimerState } from './timer';
import { runningMs } from './timer';

export type Channel = 'activities' | 'study' | 'tasks' | 'goals' | 'breaks' | 'habits' | 'summary' | 'motivation';
export type PlannedNotification = {
  /** Stable id so re-planning never duplicates. */
  id: string; channel: Channel; title: string; body: string; at: number; data: Record<string, string>;
};

export const MAX_SCHEDULED = 60; // stays under the 64-notification cap some platforms enforce
export const HORIZON_DAYS = 3;

/** Is minute-of-day `m` inside quiet hours (which may wrap past midnight, e.g. 23:00–06:00)? */
export function inQuietHours(m: Minutes, s: Pick<NotificationSettings, 'quietEnabled' | 'quietStartMin' | 'quietEndMin'>): boolean {
  if (!s.quietEnabled) return false;
  const { quietStartMin: a, quietEndMin: b } = s;
  if (a === b) return false;
  return a < b ? m >= a && m < b : m >= a || m < b;
}

/** Quiet-hour policy: time-critical channels (activities, study, breaks) are dropped; others are deferred to when quiet hours end. */
export function applyQuietHours(at: number, channel: Channel, s: NotificationSettings): number | null {
  const d = new Date(at);
  const m = d.getHours() * 60 + d.getMinutes();
  if (!inQuietHours(m, s)) return at;
  if (channel === 'activities' || channel === 'study' || channel === 'breaks') return null;
  const key = toDateKey(d);
  let end = instantAt(key, s.quietEndMin).getTime();
  if (end <= at) end = instantAt(addDays(key, 1), s.quietEndMin).getTime();
  return end;
}

export type PlanInput = {
  now: number; settings: NotificationSettings; prefs: Preferences;
  templates: ActivityTemplate[]; exceptions: ScheduleException[]; subjects: Subject[];
  tasks: Task[]; habits: Habit[]; habitRecords: HabitRecord[];
  today: DateKey; horizonDays?: number;
};

export function planNotifications(i: PlanInput): PlannedNotification[] {
  const s = i.settings;
  if (!s.enabled) return [];
  const horizon = i.horizonDays ?? HORIZON_DAYS;
  const days = dateRange(i.today, addDays(i.today, horizon - 1));
  const out: PlannedNotification[] = [];
  const push = (n: Omit<PlannedNotification, 'at'> & { at: number }) => {
    if (n.at <= i.now) return;
    const at = applyQuietHours(n.at, n.channel, s);
    if (at === null || at <= i.now) return;
    out.push({ ...n, at });
  };
  const subjectName = (id: string | null) => i.subjects.find((x) => x.id === id)?.name;

  for (const date of days) {
    // Timetable + study reminders (opt-in per block, or all study blocks when "study" reminders are on)
    for (const o of resolveDay(date, i.templates, i.exceptions)) {
      const isStudy = o.category === 'study';
      let lead: number | null = o.reminderLeadMin;
      let channel: Channel = 'activities';
      if (lead === null && isStudy && s.study) { lead = s.activityLeadMin; channel = 'study'; }
      else if (lead !== null && isStudy) channel = 'study';
      else if (lead !== null && !s.activities) lead = null;
      if (lead === null) continue;
      const startAt = instantAt(date, o.startMin).getTime();
      push({
        id: `act:${o.key}`, channel, at: startAt - lead * 60_000,
        title: isStudy ? `Study: ${subjectName(o.subjectId) ?? o.title}` : o.title,
        body: lead === 0 ? 'Starting now.' : `Starts in ${lead} min.`, data: { type: 'occurrence', key: o.key, date },
      });
    }

    if (s.tasks) {
      for (const t of i.tasks) {
        if (t.reminderLeadMin === null || t.status === 'done' || !taskDueOn(t, date)) continue;
        if (t.recurrence && t.doneDates.includes(date)) continue;
        const dueMin = t.dueMin ?? 9 * 60;
        push({ id: `task:${t.id}:${date}`, channel: 'tasks', at: instantAt(date, dueMin).getTime() - t.reminderLeadMin * 60_000, title: 'Task due', body: t.title, data: { type: 'task', id: t.id } });
      }
    }

    if (s.habits) {
      for (const h of i.habits) {
        if (h.reminderMin === null || !habitScheduledOn(h, date)) continue;
        if (i.habitRecords.some((r) => !r.deletedAt && r.habitId === h.id && r.date === date && r.done)) continue;
        push({ id: `habit:${h.id}:${date}`, channel: 'habits', at: instantAt(date, h.reminderMin).getTime(), title: h.name, body: 'Time for your habit.', data: { type: 'habit', id: h.id } });
      }
    }

    if (s.goals) {
      push({ id: `goal:daily:${date}`, channel: 'goals', at: instantAt(date, 18 * 60).getTime(), title: 'Daily goal check-in', body: 'Open Rhythm to see how today’s study target is going.', data: { type: 'goals' } });
      if (weekdayOf(date) === (i.prefs.weekStart + 6) % 7) {
        push({ id: `goal:weekly:${date}`, channel: 'goals', at: instantAt(date, 18 * 60 + 30).getTime(), title: 'Last day of the week', body: 'Check your weekly study goal.', data: { type: 'goals' } });
      }
    }

    if (s.summary) push({ id: `summary:${date}`, channel: 'summary', at: instantAt(date, s.summaryMin).getTime(), title: 'Daily summary', body: 'Review what you planned vs. what you did today.', data: { type: 'summary' } });

    if (i.prefs.motivation.dailyReminder) {
      push({ id: `motivation:${date}`, channel: 'motivation', at: instantAt(date, i.prefs.motivation.reminderMin).getTime(), title: 'Today’s quote', body: 'Open Rhythm for your quote of the day.', data: { type: 'quote' } });
    }
  }

  return out.sort((a, b) => a.at - b.at).slice(0, MAX_SCHEDULED);
}

/** Notifications to schedule while a timer is running, so phase changes/completion reach the user while backgrounded. */
export function planTimerNotifications(t: TimerState, now: number, s: NotificationSettings, breakReminders: boolean): PlannedNotification[] {
  if (!s.enabled || t.status !== 'running') return [];
  const out: PlannedNotification[] = [];
  const r = runningMs(t, now);
  if (t.mode === 'countdown') {
    if (r < t.focusMs) {
      out.push({ id: `timer:${t.id}:done`, channel: 'breaks', at: now + (t.focusMs - r), title: 'Focus session complete', body: 'Open Rhythm to save your session.', data: { type: 'timer', id: t.id } });
    }
  } else if (t.mode === 'pomodoro' && breakReminders && t.focusMs + t.breakMs > 0) {
    const cycle = t.focusMs + t.breakMs;
    for (let k = 0; k < 4; k++) {
      const focusEnd = k * cycle + t.focusMs, breakEnd = (k + 1) * cycle;
      if (focusEnd > r) out.push({ id: `timer:${t.id}:f${k}`, channel: 'breaks', at: now + (focusEnd - r), title: 'Time for a break', body: 'Nice work. Step away for a few minutes.', data: { type: 'timer', id: t.id } });
      if (breakEnd > r) out.push({ id: `timer:${t.id}:b${k}`, channel: 'breaks', at: now + (breakEnd - r), title: 'Break over', body: 'Ready for the next focus block?', data: { type: 'timer', id: t.id } });
    }
  }
  return out.filter((n) => n.at > now);
}
