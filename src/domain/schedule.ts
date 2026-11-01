import { absoluteEnd, addDays, crossesMidnight, durationMin, overlapMin, weekdayOf, MIN_PER_DAY } from './time';
import { uuid } from './ids';
import type { ActivityTemplate, DateKey, Occurrence, ScheduleException } from './types';

export const templateKey = (templateId: string, date: DateKey) => `${templateId}@${date}`;
export const addedKey = (exceptionId: string) => `x:${exceptionId}`;

export function templateActiveOn(t: ActivityTemplate, date: DateKey): boolean {
  if (t.deletedAt) return false;
  if (date < t.effectiveFrom) return false;
  if (t.effectiveTo !== null && date > t.effectiveTo) return false;
  return t.weekdays.includes(weekdayOf(date));
}

function toOccurrence(base: Omit<Occurrence, 'durationMin' | 'crossesMidnight'>): Occurrence {
  return { ...base, durationMin: durationMin(base.startMin, base.endMin), crossesMidnight: crossesMidnight(base.startMin, base.endMin) };
}

/**
 * The timetable for one date: recurring templates active that day, with date-specific exceptions applied.
 * - skip      → the occurrence is removed from the plan (not counted against progress)
 * - override  → the occurrence's fields are replaced for that date only (key is unchanged so logs stay attached)
 * - add       → a one-off block
 * Blocks are returned sorted by start time. Blocks that started the previous day and spill past midnight are NOT
 * included here; use `spilloverInto` for those.
 */
export function resolveDay(date: DateKey, templates: ActivityTemplate[], exceptions: ScheduleException[]): Occurrence[] {
  const dayEx = exceptions.filter((e) => !e.deletedAt && e.date === date);
  const out: Occurrence[] = [];

  for (const t of templates) {
    if (!templateActiveOn(t, date)) continue;
    const ex = dayEx.filter((e) => e.templateId === t.id);
    if (ex.some((e) => e.type === 'skip')) continue;
    const ov = ex.filter((e) => e.type === 'override').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const startMin = ov?.startMin ?? t.startMin;
    const endMin = ov?.endMin ?? t.endMin;
    out.push(toOccurrence({
      key: templateKey(t.id, date), date, templateId: t.id, exceptionId: ov?.id ?? null,
      title: ov?.title ?? t.title, category: ov?.category ?? t.category,
      subjectId: ov ? (ov.subjectId ?? t.subjectId) : t.subjectId,
      color: ov?.color ?? t.color, startMin, endMin,
      reminderLeadMin: t.reminderLeadMin, countInProgress: t.countInProgress,
      rescheduled: !!ov && (startMin !== t.startMin || endMin !== t.endMin),
    }));
  }

  for (const e of dayEx) {
    if (e.type !== 'add' || e.startMin == null || e.endMin == null) continue;
    out.push(toOccurrence({
      key: addedKey(e.id), date, templateId: null, exceptionId: e.id,
      title: e.title ?? 'Activity', category: e.category ?? 'other', subjectId: e.subjectId,
      color: e.color, startMin: e.startMin, endMin: e.endMin,
      reminderLeadMin: null, countInProgress: true, rescheduled: false,
    }));
  }

  return out.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

export type Segment = Occurrence & { /** minutes into `date` where this segment begins/ends */ segStart: number; segEnd: number; spill: boolean };

/** Segment of an occurrence that falls inside its own start date (0..1440). */
export function ownSegment(o: Occurrence): Segment {
  return { ...o, segStart: o.startMin, segEnd: Math.min(MIN_PER_DAY, o.startMin + o.durationMin), spill: false };
}

/** Parts of yesterday's midnight-crossing blocks that fall on `date` (e.g. sleep 11 PM → 6 AM shows 0:00–6:00 today). */
export function spilloverInto(date: DateKey, templates: ActivityTemplate[], exceptions: ScheduleException[]): Segment[] {
  return resolveDay(addDays(date, -1), templates, exceptions)
    .filter((o) => o.startMin + o.durationMin > MIN_PER_DAY)
    .map((o) => ({ ...o, segStart: 0, segEnd: o.startMin + o.durationMin - MIN_PER_DAY, spill: true }));
}

/** Everything visible on a day's timeline: spill from yesterday + today's own blocks. */
export function daySegments(date: DateKey, templates: ActivityTemplate[], exceptions: ScheduleException[]): Segment[] {
  return [...spilloverInto(date, templates, exceptions), ...resolveDay(date, templates, exceptions).map(ownSegment)]
    .sort((a, b) => a.segStart - b.segStart);
}

export type Conflict = { a: Occurrence; b: Occurrence; overlapMin: number };

/** Overlapping blocks that involve at least one occurrence starting on `date` (looks at the previous and next day for midnight crossings). */
export function findConflicts(date: DateKey, templates: ActivityTemplate[], exceptions: ScheduleException[]): Conflict[] {
  const days: [number, Occurrence[]][] = [-1, 0, 1].map((d) => [d, resolveDay(addDays(date, d), templates, exceptions)]);
  const items = days.flatMap(([d, occs]) => occs.map((o) => ({
    o, d, s: d * MIN_PER_DAY + o.startMin, e: d * MIN_PER_DAY + absoluteEnd(o.startMin, o.endMin),
  })));
  const out: Conflict[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i]!, B = items[j]!;
      if (A.d !== 0 && B.d !== 0) continue;
      const ov = overlapMin(A.s, A.e, B.s, B.e);
      if (ov > 0) out.push({ a: A.o, b: B.o, overlapMin: ov });
    }
  }
  return out;
}

/** Would a candidate block overlap anything on `date`? Used for form warnings before saving. */
export function conflictsForCandidate(
  date: DateKey, candidate: { startMin: number; endMin: number; ignoreKey?: string },
  templates: ActivityTemplate[], exceptions: ScheduleException[],
): Occurrence[] {
  const s = candidate.startMin, e = absoluteEnd(candidate.startMin, candidate.endMin);
  const hits: Occurrence[] = [];
  for (const d of [-1, 0, 1]) {
    for (const o of resolveDay(addDays(date, d), templates, exceptions)) {
      if (o.key === candidate.ignoreKey) continue;
      const os = d * MIN_PER_DAY + o.startMin, oe = d * MIN_PER_DAY + absoluteEnd(o.startMin, o.endMin);
      if (overlapMin(s, e, os, oe) > 0) hits.push(o);
    }
  }
  return hits;
}

/** The occurrence in progress at `at` (minutes since midnight of `date`), counting spill from the previous day. */
export function currentAndNext(
  date: DateKey, nowMin: number, templates: ActivityTemplate[], exceptions: ScheduleException[],
): { current: Segment | null; next: Segment | null; remainingMin: number | null } {
  const segs = daySegments(date, templates, exceptions);
  const current = segs.find((s) => s.segStart <= nowMin && nowMin < s.segEnd) ?? null;
  const next = segs.find((s) => s.segStart > nowMin && s !== current) ?? null;
  return { current, next, remainingMin: current ? current.segEnd - nowMin : null };
}

/* ---------- Editing recurring templates without rewriting history ---------- */

export type TemplateEdit = Partial<Pick<ActivityTemplate,
  'title' | 'category' | 'subjectId' | 'color' | 'startMin' | 'endMin' | 'weekdays' | 'reminderLeadMin' | 'countInProgress' | 'planId'>>;

/**
 * Edit a recurring activity starting on `effectiveFrom` (default: today). Past dates keep the old version.
 * - If the template hasn't taken effect yet (effectiveFrom >= edit date) it is updated in place.
 * - Otherwise the old version is closed the day before and a new version (same series) is created.
 */
export function planTemplateEdit(
  t: ActivityTemplate, edit: TemplateEdit, effectiveFrom: DateKey, now: string,
): { update: ActivityTemplate; create: ActivityTemplate | null } {
  if (t.effectiveFrom >= effectiveFrom) {
    return { update: { ...t, ...edit, isDefault: t.isDefault && !hasChange(t, edit), updatedAt: now }, create: null };
  }
  const closed: ActivityTemplate = { ...t, effectiveTo: addDays(effectiveFrom, -1), updatedAt: now };
  const created: ActivityTemplate = {
    ...t, ...edit, id: uuid(), effectiveFrom, effectiveTo: t.effectiveTo,
    isDefault: t.isDefault && !hasChange(t, edit), createdAt: now, updatedAt: now,
  };
  return { update: closed, create: created };
}

function hasChange(t: ActivityTemplate, edit: TemplateEdit): boolean {
  return (Object.keys(edit) as (keyof TemplateEdit)[]).some((k) => JSON.stringify(t[k]) !== JSON.stringify(edit[k]));
}

/** Delete a recurring activity from `from` onward; earlier dates are untouched. */
export function planTemplateDelete(t: ActivityTemplate, from: DateKey, now: string): ActivityTemplate {
  if (t.effectiveFrom >= from) return { ...t, deletedAt: now, updatedAt: now };
  return { ...t, effectiveTo: addDays(from, -1), updatedAt: now };
}

export function duplicateTemplate(t: ActivityTemplate, now: string, from: DateKey): ActivityTemplate {
  const id = uuid();
  return { ...t, id, seriesId: id, title: `${t.title} (copy)`, isDefault: false, defaultKey: null, effectiveFrom: from, effectiveTo: null, createdAt: now, updatedAt: now, deletedAt: null };
}

/** Move one occurrence to another date/time: skip the original, add a one-off at the destination. */
export function planReschedule(
  occ: Occurrence, to: { date: DateKey; startMin: number; endMin: number }, now: string,
): { exceptions: ScheduleException[]; deleteExceptionIds: string[] } {
  const base = { createdAt: now, updatedAt: now, deletedAt: null };
  const blank = { title: null, category: null, subjectId: null, color: null, startMin: null, endMin: null };
  const list: ScheduleException[] = [];
  if (to.date === occ.date && occ.templateId) {
    list.push({ ...base, ...blank, id: uuid(), date: occ.date, type: 'override', templateId: occ.templateId, startMin: to.startMin, endMin: to.endMin });
    return { exceptions: list, deleteExceptionIds: [] };
  }
  const deleteExceptionIds: string[] = [];
  if (occ.templateId) list.push({ ...base, ...blank, id: uuid(), date: occ.date, type: 'skip', templateId: occ.templateId });
  else if (occ.exceptionId) deleteExceptionIds.push(occ.exceptionId);
  list.push({
    ...base, id: uuid(), date: to.date, type: 'add', templateId: null, title: occ.title, category: occ.category,
    subjectId: occ.subjectId, color: occ.color, startMin: to.startMin, endMin: to.endMin,
  });
  return { exceptions: list, deleteExceptionIds };
}
