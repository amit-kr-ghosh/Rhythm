import { instantAt, isValidDateKey, toDateKey } from './time';
import { uuid } from './ids';
import type { DateKey, StudySession } from './types';
import type { SessionDraft } from './timer';
import { isValidSession } from './progress';

export function toSession(draft: SessionDraft, now: string): StudySession {
  return { ...draft, createdAt: now, updatedAt: now, deletedAt: null };
}

const interval = (s: Pick<StudySession, 'startedAt' | 'endedAt'>): [number, number] => [Date.parse(s.startedAt), Date.parse(s.endedAt)];

/** Existing valid sessions whose time span overlaps [startMs, endMs). `ignoreId` lets an edit ignore itself. */
export function overlappingSessions(startMs: number, endMs: number, existing: StudySession[], ignoreId?: string): StudySession[] {
  return existing.filter((s) => {
    if (s.id === ignoreId || !isValidSession(s)) return false;
    const [a, b] = interval(s);
    return startMs < b && a < endMs;
  });
}

/** A retry/duplicate: same id, or an identical start+end for the same subject. */
export function isDuplicateSession(draft: Pick<StudySession, 'id' | 'startedAt' | 'endedAt' | 'subjectId'>, existing: StudySession[]): boolean {
  return existing.some((s) => !s.deletedAt && (s.id === draft.id || (s.startedAt === draft.startedAt && s.endedAt === draft.endedAt && s.subjectId === draft.subjectId)));
}

export type ManualEntryInput = {
  date: DateKey; startMin: number; durationMin: number; subjectId: string | null;
  note: string; occurrenceKey?: string | null; taskId?: string | null;
};
export type ManualResult = { ok: true; session: StudySession } | { ok: false; errors: Partial<Record<'date' | 'startMin' | 'durationMin' | 'overlap', string>> };

export const MAX_MANUAL_MIN = 16 * 60;

export function buildManualSession(
  input: ManualEntryInput, existing: StudySession[], now: Date, activeTimer?: { startedAt: number } | null,
): ManualResult {
  const errors: Partial<Record<'date' | 'startMin' | 'durationMin' | 'overlap', string>> = {};
  if (!isValidDateKey(input.date)) errors.date = 'Enter a valid date.';
  if (!Number.isFinite(input.startMin) || input.startMin < 0 || input.startMin >= 1440) errors.startMin = 'Enter a valid start time.';
  if (!Number.isFinite(input.durationMin) || input.durationMin < 1) errors.durationMin = 'Duration must be at least 1 minute.';
  else if (input.durationMin > MAX_MANUAL_MIN) errors.durationMin = 'Duration cannot exceed 16 hours.';
  if (Object.keys(errors).length) return { ok: false, errors };

  const start = instantAt(input.date, input.startMin);
  const endMs = start.getTime() + input.durationMin * 60_000;
  if (start.getTime() > now.getTime()) errors.date = 'Sessions cannot start in the future.';
  else if (endMs > now.getTime() + 60_000) errors.durationMin = 'Sessions cannot end in the future.';
  if (Object.keys(errors).length) return { ok: false, errors };

  if (overlappingSessions(start.getTime(), endMs, existing).length > 0) {
    return { ok: false, errors: { overlap: 'This overlaps an existing session. Adjust the time or edit that session.' } };
  }
  if (activeTimer && start.getTime() < now.getTime() && endMs > activeTimer.startedAt) {
    return { ok: false, errors: { overlap: 'This overlaps the timer that is currently running.' } };
  }
  const iso = now.toISOString();
  return {
    ok: true,
    session: {
      id: uuid(), subjectId: input.subjectId, date: toDateKey(start), startedAt: start.toISOString(), endedAt: new Date(endMs).toISOString(),
      focusSec: input.durationMin * 60, elapsedSec: input.durationMin * 60, breakSec: 0, plannedSec: null,
      mode: 'stopwatch', status: 'completed', source: 'manual', occurrenceKey: input.occurrenceKey ?? null, taskId: input.taskId ?? null,
      note: input.note, reflection: '', createdAt: iso, updatedAt: iso, deletedAt: null,
    },
  };
}
