/** Core domain types. Everything here is plain data (JSON-serialisable). */

export type DateKey = string; // 'YYYY-MM-DD' in the user's local calendar
export type ISODateTime = string; // UTC instant, e.g. 2026-10-28T05:30:00.000Z
export type Minutes = number; // minutes since local midnight (0..1439) or a duration

export type Category =
  | 'study' | 'exercise' | 'sleep' | 'rest' | 'meal' | 'cooking'
  | 'college' | 'personal' | 'break' | 'leisure' | 'other';

export const CATEGORIES: Category[] = [
  'study', 'exercise', 'sleep', 'rest', 'meal', 'cooking',
  'college', 'personal', 'break', 'leisure', 'other',
];

export type EntityBase = {
  id: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Soft-delete tombstone so deletions can sync. */
  deletedAt: ISODateTime | null;
};

export type Subject = EntityBase & {
  name: string;
  color: string;
  archived: boolean;
  sortOrder: number;
  dailyTargetMin: number | null;
  weeklyTargetMin: number | null;
  notes: string;
  isDefault: boolean;
  /** Ionicons name picked by the user (see subjectIcons.ts); absent or null means the default for the subject's name. */
  icon?: string | null;
};

export type Plan = EntityBase & { name: string; isDefault: boolean };

/** A recurring activity. Edits create a new version (effectiveFrom/To) so history is never rewritten. */
export type ActivityTemplate = EntityBase & {
  planId: string | null;
  title: string;
  category: Category;
  subjectId: string | null;
  color: string | null;
  startMin: Minutes;
  /** If endMin <= startMin the block crosses midnight (ends the next day). */
  endMin: Minutes;
  weekdays: number[]; // 0=Sun..6=Sat
  effectiveFrom: DateKey;
  effectiveTo: DateKey | null; // inclusive
  reminderLeadMin: number | null;
  countInProgress: boolean;
  isDefault: boolean;
  defaultKey: string | null;
  /** Groups successive versions of the "same" activity. */
  seriesId: string;
};

export type ExceptionType = 'skip' | 'override' | 'add';
export type ScheduleException = EntityBase & {
  date: DateKey;
  type: ExceptionType;
  templateId: string | null; // required for skip/override
  title: string | null;
  category: Category | null;
  subjectId: string | null;
  color: string | null;
  startMin: Minutes | null;
  endMin: Minutes | null;
};

export type LogStatus = 'done' | 'partial' | 'skipped' | 'cancelled';
export type ActivitySnapshot = {
  title: string; category: Category; subjectId: string | null; startMin: Minutes; endMin: Minutes;
};
/** The user's record of what actually happened for one occurrence. Keeps a snapshot for history. */
export type ActivityLog = EntityBase & {
  occurrenceKey: string;
  date: DateKey;
  status: LogStatus;
  completedMin: number; // meaningful for 'partial'
  snapshot: ActivitySnapshot;
  note: string;
};

export type SessionMode = 'stopwatch' | 'countdown' | 'pomodoro';
export type SessionStatus = 'completed' | 'cancelled' | 'interrupted';
export type StudySession = EntityBase & {
  subjectId: string | null;
  date: DateKey; // local date at session start (stored, so history survives tz changes)
  startedAt: ISODateTime;
  endedAt: ISODateTime;
  focusSec: number; // validated focused time — the only value analytics use
  elapsedSec: number; // running time incl. breaks, excl. paused time
  breakSec: number;
  plannedSec: number | null;
  mode: SessionMode;
  status: SessionStatus;
  source: 'timer' | 'manual';
  occurrenceKey: string | null;
  taskId: string | null;
  note: string;
  reflection: string;
};

export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type Recurrence = { freq: 'daily' | 'weekly'; weekdays: number[] } | null;
export type Task = EntityBase & {
  title: string;
  description: string;
  subjectId: string | null;
  priority: Priority;
  dueDate: DateKey | null;
  /** Optional time of day the task is due (minutes since midnight). */
  dueMin: Minutes | null;
  estimateMin: number | null;
  status: TaskStatus;
  completedAt: ISODateTime | null;
  occurrenceKey: string | null;
  templateId: string | null;
  reminderLeadMin: number | null;
  recurrence: Recurrence;
  /** For recurring tasks: dates on which this recurrence was completed. */
  doneDates: DateKey[];
  goalId: string | null;
};

export type Milestone = { id: string; title: string; done: boolean; doneAt: ISODateTime | null };
export type Goal = EntityBase & {
  title: string;
  why: string;
  subjectId: string | null;
  topic: string;
  deadline: DateKey | null;
  targetMin: number | null; // long-term focus target (counts sessions after startDate)
  startDate: DateKey;
  milestones: Milestone[];
  archived: boolean;
};

export type Habit = EntityBase & {
  name: string;
  color: string;
  weekdays: number[];
  reminderMin: Minutes | null;
  archived: boolean;
  linkedCategory: Category | null;
};
export type HabitRecord = EntityBase & { habitId: string; date: DateKey; done: boolean };

export type SavedQuote = EntityBase & { quoteId: string };
export type Affirmation = EntityBase & { text: string };

export type ProgressWeights = {
  timetable: number; study: number; tasks: number; habits: number;
};

/** Targets in force from `from` onward. Lets past days be judged against the targets that applied then. */
export type TargetEntry = {
  from: DateKey;
  dailyMin: number;
  weeklyMin: number;
  subjects: Record<string, { daily: number | null; weekly: number | null }>;
};

export type Preferences = EntityBase & {
  theme: 'dark' | 'light' | 'system';
  weekStart: 0 | 1 | 6;
  dailyStudyTargetMin: number;
  weeklyStudyTargetMin: number;
  timer: {
    focusMin: number; breakMin: number; mode: SessionMode;
    breakReminders: boolean; presets: { name: string; focusMin: number; breakMin: number }[];
  };
  weights: ProgressWeights;
  excludeSleepFromProgress: boolean;
  motivation: { quoteOfDay: boolean; encouragement: boolean; dailyReminder: boolean; reminderMin: Minutes; topics: string[] };
  whys: string[];
  onboarded: boolean;
  /** Daily study minutes needed for a day to "count" toward the streak. */
  streakThresholdMin: number;
  targetHistory: TargetEntry[];
};

export type NotificationSettings = EntityBase & {
  enabled: boolean;
  activities: boolean;
  activityLeadMin: number;
  study: boolean;
  tasks: boolean;
  taskLeadMin: number;
  goals: boolean;
  breaks: boolean;
  habits: boolean;
  summary: boolean;
  summaryMin: Minutes;
  quietEnabled: boolean;
  quietStartMin: Minutes;
  quietEndMin: Minutes;
};

/** Every synced entity kind and its local/cloud name. */
export type EntityMap = {
  subjects: Subject; plans: Plan; templates: ActivityTemplate; exceptions: ScheduleException;
  logs: ActivityLog; sessions: StudySession; tasks: Task; goals: Goal; habits: Habit;
  habitRecords: HabitRecord; savedQuotes: SavedQuote; affirmations: Affirmation;
  preferences: Preferences; notificationSettings: NotificationSettings;
};
export type EntityKind = keyof EntityMap;
export const ENTITY_KINDS: EntityKind[] = [
  'subjects', 'plans', 'templates', 'exceptions', 'logs', 'sessions', 'tasks', 'goals',
  'habits', 'habitRecords', 'savedQuotes', 'affirmations', 'preferences', 'notificationSettings',
];

/** A concrete scheduled block on a specific date, after applying recurrence + exceptions. */
export type Occurrence = {
  key: string;
  date: DateKey;
  templateId: string | null;
  exceptionId: string | null;
  title: string;
  category: Category;
  subjectId: string | null;
  color: string | null;
  startMin: Minutes;
  endMin: Minutes;
  durationMin: number;
  crossesMidnight: boolean;
  reminderLeadMin: number | null;
  countInProgress: boolean;
  rescheduled: boolean;
};
