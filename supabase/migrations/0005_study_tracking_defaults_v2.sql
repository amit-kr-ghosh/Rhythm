-- 0005: study-tracking defaults v2 (DSA / AI/ML / RBI Preparation / Communication). SAFE + IDEMPOTENT.
--
-- * Never deletes rows and never touches study_sessions data, so history is preserved.
-- * Only rows that still equal the shipped v1 defaults are changed; anything the user customised is left alone.
-- * The weekly TIMETABLE templates are NOT rewritten here: the app replaces untouched v1 templates itself on first
--   launch (closing old versions, inserting new ones with deterministic ids), which then syncs up. That keeps
--   user-customised timetables safe and avoids duplicate rows.
-- Re-running this file is a no-op.

-- 1) New accounts start with the 6.5 h / 45.5 h overall targets (existing rows are handled in the function below).
alter table public.user_preferences alter column daily_study_target_min set default 390;
alter table public.user_preferences alter column weekly_study_target_min set default 2730;

-- 2) Reporting index for per-subject daily/weekly totals (partial: live rows only).
create index if not exists study_sessions_user_subject_live_idx
  on public.study_sessions (user_id, subject_id, date) where deleted_at is null;

-- 3) No duplicate recordings of the same session. Only created when the data is already clean, so the migration can
--    never fail on (or silently drop) existing rows. If duplicates exist it reports them and skips the index.
do $$
begin
  if exists (
    select 1 from public.study_sessions where deleted_at is null and subject_id is not null
    group by user_id, subject_id, started_at, ended_at having count(*) > 1
  ) then
    raise notice 'study_sessions has duplicate (user, subject, start, end) rows; unique index skipped. Review and soft-delete duplicates, then re-run.';
  else
    create unique index if not exists study_sessions_no_duplicate_idx
      on public.study_sessions (user_id, subject_id, started_at, ended_at) where deleted_at is null and subject_id is not null;
  end if;
end $$;

-- 4) Upgrade the CALLING user's untouched v1 subject/target defaults. Runs as the caller, so RLS limits it to their rows.
create or replace function public.rhythm_apply_defaults_v2() returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n_sub int := 0; n_pref int := 0; c int;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  -- "English Speaking" (60 min) -> "Communication" (30 min). Same id: its sessions stay attached.
  update public.subjects set name = 'Communication', daily_target_min = 30, weekly_target_min = 210, updated_at = now()
   where user_id = auth.uid() and is_default and deleted_at is null and name = 'English Speaking' and daily_target_min = 60;
  get diagnostics c = row_count; n_sub := n_sub + c;

  update public.subjects set name = 'RBI Preparation', updated_at = now()
   where user_id = auth.uid() and is_default and deleted_at is null and name = 'RBI Grade B Preparation';
  get diagnostics c = row_count; n_sub := n_sub + c;

  -- Only the four study subjects are tracked: archive (never delete) the unused default.
  update public.subjects set archived = true, updated_at = now()
   where user_id = auth.uid() and is_default and deleted_at is null and not archived and name = 'Backend Development' and daily_target_min is null;
  get diagnostics c = row_count; n_sub := n_sub + c;

  update public.user_preferences set daily_study_target_min = 390, weekly_study_target_min = 2730, updated_at = now()
   where user_id = auth.uid() and deleted_at is null and daily_study_target_min = 480 and weekly_study_target_min = 3360;
  get diagnostics c = row_count; n_pref := n_pref + c;

  return jsonb_build_object('subjects_updated', n_sub, 'preferences_updated', n_pref);
end $$;
revoke all on function public.rhythm_apply_defaults_v2() from public, anon;
grant execute on function public.rhythm_apply_defaults_v2() to authenticated;
