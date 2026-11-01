# Study tracking (v3)

**Principle:** the timetable says when you plan to study; the timer records how long you actually studied. They stay separate but connected.

- Tracked subjects: DSA 180 min, AI/ML 120, RBI Preparation 60, Communication 30 (6.5 h total). Priority order is the display order.
- All maths lives in `src/domain/study.ts` and reads **recorded sessions only**. Status: 0–49 % Not done, 50–99 % Half done, ≥100 % Done (exact seconds). A manual status is a label (stored as an activity log with key `study-status:<subject>:<date>`) and can never add minutes.
- Timer (existing `domain/timer.ts`): select subject → start → pause/resume → stop. Paused time is excluded; start/end timestamps are stored; interrupted sessions count; discarded ones don't. `finishFocus` ignores re-entrant taps and session ids are idempotent, so double-saving can't duplicate.
- Manual entry reuses the same session record (`source: 'manual'`) with overlap/future validation.
- Screens: Today (4 subject rows + compact timetable), Timetable (study blocks show *Planned* vs *Studied*), Focus, Analytics (4 rings, one line chart, week / month / custom, actual vs target), History (every session with start–end–duration), Settings.
- Timetables: `src/domain/defaults.ts` (regular Mon/Tue/Fri/Sat/Sun and college Wed/Thu). Scheduled study blocks add up to each target on both templates (tested).

## Upgrade of existing data (idempotent)
`planDefaultsV2` (pure) + `applyDefaultsV2` (`src/data/upgrade.ts`, run at boot, guarded by kv `defaultsV2`):
- "English Speaking 60" → "Communication 30" (same id, history stays attached); "RBI Grade B Preparation" → "RBI Preparation"; "Backend Development" archived; 8 h/56 h → 6.5 h/45.5 h. Only when still equal to the shipped v1 defaults.
- Timetable replaced only if every active row is an untouched v1 default (old rows closed yesterday, never deleted). Customised timetables are kept and the new default is offered under Timetable → ⋯ → Restore default.
- Target history is updated so past days keep their old targets.

## Supabase
`supabase/migrations/0005_study_tracking_defaults_v2.sql` (idempotent, additive): new-account defaults, reporting index, duplicate-session unique index (only if data is clean), and `rhythm_apply_defaults_v2()` (security invoker, caller's rows only). `supabase/seed.sql` regenerated (placeholder user id; re-run `npm run seed:sql` with your id).
