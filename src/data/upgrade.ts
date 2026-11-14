import type { Repo } from './repo';
import { DEFAULTS_V2_KEY, planDefaultsV2 } from '../domain/defaults';
import { recordTargets } from '../domain/progress';
import { toDateKey } from '../domain/time';

/**
 * One-time, idempotent upgrade of installs that were seeded with the v1 defaults (see planDefaultsV2). Real edits are
 * queued for sync like any user change; history (sessions, old timetable versions) is never rewritten or deleted.
 */
export async function applyDefaultsV2(r: Repo, nowDate: Date = new Date()): Promise<{ timetableSkipped: boolean }> {
  if ((await r.kvGet(DEFAULTS_V2_KEY)) === '1') return { timetableSkipped: false };
  const now = nowDate.toISOString();
  const today = toDateKey(nowDate);
  const [subjects, templates, prefs] = await Promise.all([r.all('subjects'), r.all('templates'), r.get('preferences', 'preferences')]);
  if (!prefs) return { timetableSkipped: false };
  const plan = planDefaultsV2({ subjects, templates, prefs, today, now });
  if (plan.subjects.length) await r.put('subjects', plan.subjects);
  const nextSubjects = subjects.map((s) => plan.subjects.find((x) => x.id === s.id) ?? s);
  let nextPrefs = plan.preferences ?? prefs;
  if (prefs.targetHistory.length > 0 && (plan.subjects.length || plan.preferences)) {
    const history = recordTargets(prefs.targetHistory, today, nextPrefs, nextSubjects);
    if (history !== prefs.targetHistory) nextPrefs = { ...nextPrefs, targetHistory: history, updatedAt: now };
  }
  if (nextPrefs !== prefs) await r.put('preferences', nextPrefs);
  // The timetable is gone from the app, so this upgrade no longer creates or rewrites timetable data.
  await r.kvSet(DEFAULTS_V2_KEY, '1');
  return { timetableSkipped: plan.timetableSkipped };
}


export const DESIGN_V3_KEY = 'designV3';

/**
 * One-time: the redesign is light-first (peach/lilac gradient). Installs still on the old "dark" default switch to light
 * once; anyone can switch back under Settings → Appearance and it will not be changed again.
 */
export async function applyDesignV3(r: Repo, nowDate: Date = new Date()): Promise<boolean> {
  if ((await r.kvGet(DESIGN_V3_KEY)) === '1') return false;
  const prefs = await r.get('preferences', 'preferences');
  let changed = false;
  if (prefs && prefs.theme === 'dark') { await r.put('preferences', { ...prefs, theme: 'light', updatedAt: nowDate.toISOString() }); changed = true; }
  await r.kvSet(DESIGN_V3_KEY, '1');
  return changed;
}
