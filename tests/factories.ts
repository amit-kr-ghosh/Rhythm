import { buildDefaultNotificationSettings, buildDefaultPreferences, subjectId } from '../src/domain/defaults';
import { legacySubjects, legacyTemplates } from './legacy-defaults';
import { instantAt } from '../src/domain/time';
import type { ActivityLog, DateKey, Habit, HabitRecord, StudySession, Task } from '../src/domain/types';

export const NOW_ISO = '2026-10-28T05:30:00.000Z';
/** Engine tests run on the v1 24-hour timetable + 480/3360 targets (see legacy-defaults.ts). */
export const prefs = () => ({ ...buildDefaultPreferences(NOW_ISO), dailyStudyTargetMin: 480, weeklyStudyTargetMin: 3360 });
export const notifSettings = () => ({ ...buildDefaultNotificationSettings(NOW_ISO), enabled: true });
export const subjects = () => legacySubjects(NOW_ISO);
export const templates = (from: DateKey = '2026-01-01') => legacyTemplates(from, NOW_ISO);
export const DSA = subjectId('dsa');
export const AIML = subjectId('aiml');

let n = 0;
export function session(over: Partial<StudySession> & { date: DateKey; startMin?: number; minutes?: number }): StudySession {
  const { date, startMin = 9 * 60, minutes = 60, ...rest } = over;
  const start = instantAt(date, startMin);
  const end = new Date(start.getTime() + minutes * 60_000);
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, subjectId: DSA, date,
    startedAt: start.toISOString(), endedAt: end.toISOString(), focusSec: minutes * 60, elapsedSec: minutes * 60, breakSec: 0,
    plannedSec: null, mode: 'stopwatch', status: 'completed', source: 'timer', occurrenceKey: null, taskId: null,
    note: '', reflection: '', createdAt: NOW_ISO, updatedAt: NOW_ISO, deletedAt: null, ...rest,
  };
}

export function task(over: Partial<Task> = {}): Task {
  n++;
  return {
    id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`, title: 'Task', description: '', subjectId: null, priority: 'medium',
    dueDate: null, dueMin: null, estimateMin: null, status: 'todo', completedAt: null, occurrenceKey: null, templateId: null,
    reminderLeadMin: null, recurrence: null, doneDates: [], goalId: null,
    createdAt: NOW_ISO, updatedAt: NOW_ISO, deletedAt: null, ...over,
  };
}

export function habit(over: Partial<Habit> = {}): Habit {
  n++;
  return {
    id: `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`, name: 'Exercise', color: '#34D399', weekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderMin: null, archived: false, linkedCategory: 'exercise', createdAt: NOW_ISO, updatedAt: NOW_ISO, deletedAt: null, ...over,
  };
}
export const habitRecord = (h: Habit, date: DateKey, done = true): HabitRecord => ({
  id: `h:${h.id}:${date}`, habitId: h.id, date, done, createdAt: NOW_ISO, updatedAt: NOW_ISO, deletedAt: null,
});

export function log(key: string, date: DateKey, status: ActivityLog['status'], over: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: `log:${key}`, occurrenceKey: key, date, status, completedMin: 0, note: '',
    snapshot: { title: 'x', category: 'other', subjectId: null, startMin: 0, endMin: 60 },
    createdAt: NOW_ISO, updatedAt: NOW_ISO, deletedAt: null, ...over,
  };
}
