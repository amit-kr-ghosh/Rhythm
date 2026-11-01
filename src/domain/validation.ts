import { MIN_PER_DAY } from './time';
import type { Category, Priority } from './types';
import { CATEGORIES } from './types';

export type Errors<K extends string = string> = Partial<Record<K, string>>;
export type Validation<K extends string = string> = { ok: boolean; errors: Errors<K> };
const result = <K extends string>(errors: Errors<K>): Validation<K> => ({ ok: Object.keys(errors).length === 0, errors });
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

export function validateActivity(i: { title: string; category: Category; startMin: number; endMin: number; weekdays: number[]; reminderLeadMin?: number | null }): Validation<'title' | 'category' | 'time' | 'weekdays' | 'reminder'> {
  const e: Errors<'title' | 'category' | 'time' | 'weekdays' | 'reminder'> = {};
  const title = i.title.trim();
  if (!title) e.title = 'Give the activity a name.';
  else if (title.length > 80) e.title = 'Keep the name under 80 characters.';
  if (!CATEGORIES.includes(i.category)) e.category = 'Choose a category.';
  if (!isInt(i.startMin) || i.startMin < 0 || i.startMin >= MIN_PER_DAY || !isInt(i.endMin) || i.endMin < 0 || i.endMin >= MIN_PER_DAY) e.time = 'Enter valid start and end times.';
  else if (i.startMin === i.endMin) e.time = 'Start and end cannot be the same time.';
  if (!i.weekdays.length) e.weekdays = 'Pick at least one day.';
  else if (i.weekdays.some((d) => !isInt(d) || d < 0 || d > 6)) e.weekdays = 'Invalid weekday.';
  if (i.reminderLeadMin != null && (!isInt(i.reminderLeadMin) || i.reminderLeadMin < 0 || i.reminderLeadMin > 24 * 60)) e.reminder = 'Reminder lead time must be 0–1440 minutes.';
  return result(e);
}

export function validateSubject(i: { name: string; dailyTargetMin: number | null; weeklyTargetMin: number | null }, existingNames: string[]): Validation<'name' | 'daily' | 'weekly'> {
  const e: Errors<'name' | 'daily' | 'weekly'> = {};
  const name = i.name.trim();
  if (!name) e.name = 'Enter a subject name.';
  else if (name.length > 40) e.name = 'Keep the name under 40 characters.';
  else if (existingNames.some((n) => n.trim().toLowerCase() === name.toLowerCase())) e.name = 'A subject with this name already exists.';
  if (i.dailyTargetMin != null && (!isInt(i.dailyTargetMin) || i.dailyTargetMin < 0 || i.dailyTargetMin > 1440)) e.daily = 'Daily target must be 0–24 hours.';
  if (i.weeklyTargetMin != null && (!isInt(i.weeklyTargetMin) || i.weeklyTargetMin < 0 || i.weeklyTargetMin > 10080)) e.weekly = 'Weekly target must be 0–168 hours.';
  if (!e.daily && !e.weekly && i.dailyTargetMin && i.weeklyTargetMin && i.weeklyTargetMin < i.dailyTargetMin) e.weekly = 'Weekly target should be at least the daily target.';
  return result(e);
}

export function validateTask(i: { title: string; priority: Priority; estimateMin: number | null; dueDate: string | null }): Validation<'title' | 'estimate' | 'due'> {
  const e: Errors<'title' | 'estimate' | 'due'> = {};
  if (!i.title.trim()) e.title = 'Enter a task title.';
  else if (i.title.trim().length > 120) e.title = 'Keep the title under 120 characters.';
  if (i.estimateMin != null && (!isInt(i.estimateMin) || i.estimateMin < 1 || i.estimateMin > 960)) e.estimate = 'Estimate must be 1–960 minutes.';
  if (i.dueDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate)) e.due = 'Use a valid date.';
  return result(e);
}

export function validateTimerConfig(i: { mode: 'stopwatch' | 'countdown' | 'pomodoro'; focusMin: number; breakMin: number }): Validation<'focus' | 'break'> {
  const e: Errors<'focus' | 'break'> = {};
  if (i.mode !== 'stopwatch') {
    if (!isInt(i.focusMin) || i.focusMin < 1 || i.focusMin > 300) e.focus = 'Focus length must be 1–300 minutes.';
  }
  if (i.mode === 'pomodoro' && (!isInt(i.breakMin) || i.breakMin < 1 || i.breakMin > 60)) e.break = 'Break must be 1–60 minutes.';
  return result(e);
}

export function validateTargets(i: { dailyMin: number; weeklyMin: number }): Validation<'daily' | 'weekly'> {
  const e: Errors<'daily' | 'weekly'> = {};
  if (!isInt(i.dailyMin) || i.dailyMin < 0 || i.dailyMin > 1440) e.daily = 'Daily target must be 0–24 hours.';
  if (!isInt(i.weeklyMin) || i.weeklyMin < 0 || i.weeklyMin > 10080) e.weekly = 'Weekly target must be 0–168 hours.';
  else if (!e.daily && i.weeklyMin < i.dailyMin) e.weekly = 'Weekly target should be at least the daily target.';
  return result(e);
}

export function validateWeights(w: { timetable: number; study: number; tasks: number; habits: number }): Validation<'weights'> {
  const vals = Object.values(w);
  if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return result({ weights: 'Weights must be between 0 and 100.' });
  if (vals.every((v) => v === 0)) return result({ weights: 'At least one weight must be above zero.' });
  return result({});
}

export function validateHabit(i: { name: string; weekdays: number[] }): Validation<'name' | 'weekdays'> {
  const e: Errors<'name' | 'weekdays'> = {};
  if (!i.name.trim()) e.name = 'Enter a habit name.';
  else if (i.name.trim().length > 60) e.name = 'Keep the name under 60 characters.';
  if (!i.weekdays.length) e.weekdays = 'Pick at least one day.';
  return result(e);
}

export function validateGoal(i: { title: string; targetMin: number | null }): Validation<'title' | 'target'> {
  const e: Errors<'title' | 'target'> = {};
  if (!i.title.trim()) e.title = 'Enter a goal title.';
  if (i.targetMin != null && (!isInt(i.targetMin) || i.targetMin < 1)) e.target = 'Target must be a positive number of minutes.';
  return result(e);
}

export function validateQuietHours(i: { startMin: number; endMin: number }): Validation<'quiet'> {
  if (![i.startMin, i.endMin].every((m) => isInt(m) && m >= 0 && m < MIN_PER_DAY)) return result({ quiet: 'Enter valid times.' });
  if (i.startMin === i.endMin) return result({ quiet: 'Quiet hours need different start and end times.' });
  return result({});
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function validateCredentials(i: { email: string; password: string; confirm?: string }, mode: 'login' | 'register'): Validation<'email' | 'password' | 'confirm'> {
  const e: Errors<'email' | 'password' | 'confirm'> = {};
  if (!EMAIL.test(i.email.trim())) e.email = 'Enter a valid email address.';
  if (mode === 'register') {
    if (i.password.length < 8) e.password = 'Use at least 8 characters.';
    else if (!/[A-Za-z]/.test(i.password) || !/\d/.test(i.password)) e.password = 'Include at least one letter and one number.';
    if (i.confirm !== i.password) e.confirm = 'Passwords do not match.';
  } else if (!i.password) e.password = 'Enter your password.';
  return result(e);
}

export function validateEmail(email: string): Validation<'email'> {
  return result(EMAIL.test(email.trim()) ? {} : { email: 'Enter a valid email address.' });
}
