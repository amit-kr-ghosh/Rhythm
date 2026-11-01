-- Rhythm — core schema.
-- Conventions: snake_case columns mirroring the app's camelCase fields (see src/domain/sync.ts toCloudRow).
-- IDs are client-generated UUIDs so every push is an idempotent upsert. Deletes are soft (deleted_at).
-- Dates are `date`, instants are `timestamptz`, minutes-since-midnight are smallint 0..1439.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subjects (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  color text not null,
  archived boolean not null default false,
  sort_order integer not null default 0,
  daily_target_min integer check (daily_target_min is null or daily_target_min between 0 and 1440),
  weekly_target_min integer check (weekly_target_min is null or weekly_target_min between 0 and 10080),
  notes text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index subjects_user_idx on public.subjects (user_id, sort_order);

-- Named weekly plans (the app's `plans`): "Regular days", "College days".
create table public.timetable_templates (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  is_default boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index timetable_templates_user_idx on public.timetable_templates (user_id);

-- Recurring activities. Edits create a new version (effective_from/to) so history is preserved.
create table public.activity_templates (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text not null check (category in ('study','exercise','sleep','rest','meal','cooking','college','personal','break','leisure','other')),
  subject_id uuid,
  color text,
  start_min smallint not null check (start_min between 0 and 1439),
  end_min smallint not null check (end_min between 0 and 1439),  -- end_min <= start_min means the block crosses midnight
  weekdays integer[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]),
  effective_from date not null,
  effective_to date,
  reminder_lead_min integer check (reminder_lead_min is null or reminder_lead_min between 0 and 1440),
  count_in_progress boolean not null default true,
  is_default boolean not null default false,
  default_key text,
  series_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  check (effective_to is null or effective_to >= effective_from)
);
create index activity_templates_user_idx on public.activity_templates (user_id, effective_from);
create index activity_templates_series_idx on public.activity_templates (user_id, series_id);

create table public.schedule_exceptions (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  type text not null check (type in ('skip','override','add')),
  template_id uuid,
  title text,
  category text check (category is null or category in ('study','exercise','sleep','rest','meal','cooking','college','personal','break','leisure','other')),
  subject_id uuid,
  color text,
  start_min smallint check (start_min is null or start_min between 0 and 1439),
  end_min smallint check (end_min is null or end_min between 0 and 1439),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  check (type = 'add' or template_id is not null),
  check (type <> 'add' or (title is not null and category is not null and start_min is not null and end_min is not null))
);
create index schedule_exceptions_user_date_idx on public.schedule_exceptions (user_id, date);

-- What actually happened for one occurrence; keeps a snapshot so edits to templates never rewrite history.
create table public.activity_logs (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurrence_key text not null,
  date date not null,
  status text not null check (status in ('done','partial','skipped','cancelled')),
  completed_min integer not null default 0 check (completed_min between 0 and 1440),
  snapshot jsonb not null,
  note text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index activity_logs_user_date_idx on public.activity_logs (user_id, date);
create index activity_logs_occurrence_idx on public.activity_logs (user_id, occurrence_key);

create table public.goals (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  why text not null default '',
  subject_id uuid,
  topic text not null default '',
  deadline date,
  target_min integer check (target_min is null or target_min > 0),
  start_date date not null,
  milestones jsonb not null default '[]'::jsonb check (jsonb_typeof(milestones) = 'array'),
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index goals_user_idx on public.goals (user_id);

create table public.tasks (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '',
  subject_id uuid,
  priority text not null check (priority in ('low','medium','high')),
  due_date date,
  due_min smallint check (due_min is null or due_min between 0 and 1439),
  estimate_min integer check (estimate_min is null or estimate_min > 0),
  status text not null check (status in ('todo','in_progress','done','cancelled')),
  completed_at timestamptz,
  occurrence_key text,
  template_id uuid,  -- app-level link to a recurring task source; deliberately not an FK
  reminder_lead_min integer check (reminder_lead_min is null or reminder_lead_min between 0 and 10080),
  recurrence jsonb check (recurrence is null or jsonb_typeof(recurrence) = 'object'),
  done_dates jsonb not null default '[]'::jsonb check (jsonb_typeof(done_dates) = 'array'),
  goal_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index tasks_user_due_idx on public.tasks (user_id, due_date);
create index tasks_user_status_idx on public.tasks (user_id, status);

create table public.study_sessions (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid,
  date date not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  focus_sec integer not null check (focus_sec >= 0),
  elapsed_sec integer not null check (elapsed_sec >= 0),
  break_sec integer not null default 0 check (break_sec >= 0),
  planned_sec integer check (planned_sec is null or planned_sec > 0),
  mode text not null check (mode in ('stopwatch','countdown','pomodoro')),
  status text not null check (status in ('completed','cancelled','interrupted')),
  source text not null check (source in ('timer','manual')),
  occurrence_key text,
  task_id uuid,
  note text not null default '',
  reflection text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  check (focus_sec <= elapsed_sec),
  check (ended_at >= started_at)
);
create index study_sessions_user_date_idx on public.study_sessions (user_id, date);
create index study_sessions_user_subject_idx on public.study_sessions (user_id, subject_id, date);
create index study_sessions_user_started_idx on public.study_sessions (user_id, started_at);

create table public.habits (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  color text not null,
  weekdays integer[] not null check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]),
  reminder_min smallint check (reminder_min is null or reminder_min between 0 and 1439),
  archived boolean not null default false,
  linked_category text check (linked_category is null or linked_category in ('study','exercise','sleep','rest','meal','cooking','college','personal','break','leisure','other')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index habits_user_idx on public.habits (user_id);

create table public.habit_records (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  date date not null,
  done boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index habit_records_user_date_idx on public.habit_records (user_id, date);
create index habit_records_habit_idx on public.habit_records (habit_id, date);

create table public.saved_quotes (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index saved_quotes_user_idx on public.saved_quotes (user_id);

create table public.affirmations (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 500),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index affirmations_user_idx on public.affirmations (user_id);

-- Singleton tables: one row per user, user_id is the primary key (the client sends no `id`).
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  week_start smallint not null default 1 check (week_start in (0,1,6)),
  daily_study_target_min integer not null default 480 check (daily_study_target_min between 0 and 1440),
  weekly_study_target_min integer not null default 3360 check (weekly_study_target_min between 0 and 10080),
  timer jsonb not null,
  weights jsonb not null,
  exclude_sleep_from_progress boolean not null default true,
  motivation jsonb not null,
  whys jsonb not null default '[]'::jsonb check (jsonb_typeof(whys) = 'array'),
  onboarded boolean not null default false,
  streak_threshold_min integer not null default 60 check (streak_threshold_min between 0 and 1440),
  target_history jsonb not null default '[]'::jsonb check (jsonb_typeof(target_history) = 'array'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table public.notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  activities boolean not null default true,
  activity_lead_min integer not null default 5 check (activity_lead_min between 0 and 1440),
  study boolean not null default true,
  tasks boolean not null default true,
  task_lead_min integer not null default 60 check (task_lead_min between 0 and 10080),
  goals boolean not null default true,
  breaks boolean not null default true,
  habits boolean not null default true,
  summary boolean not null default false,
  summary_min smallint not null default 1290 check (summary_min between 0 and 1439),
  quiet_enabled boolean not null default true,
  quiet_start_min smallint not null default 1380 check (quiet_start_min between 0 and 1439),
  quiet_end_min smallint not null default 360 check (quiet_end_min between 0 and 1439),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

-- Composite primary keys: ids are client-generated and some defaults are deterministic (shared by all users),
-- so uniqueness is per user. Composite foreign keys also guarantee a row can only reference the same user's rows.
alter table public.subjects add primary key (user_id, id);
alter table public.timetable_templates add primary key (user_id, id);
alter table public.activity_templates add primary key (user_id, id);
alter table public.schedule_exceptions add primary key (user_id, id);
alter table public.activity_logs add primary key (user_id, id);
alter table public.goals add primary key (user_id, id);
alter table public.tasks add primary key (user_id, id);
alter table public.study_sessions add primary key (user_id, id);
alter table public.habits add primary key (user_id, id);
alter table public.habit_records add primary key (user_id, id);
alter table public.saved_quotes add primary key (user_id, id);
alter table public.affirmations add primary key (user_id, id);
alter table public.activity_templates add constraint activity_templates_plan_id_fk foreign key (user_id, plan_id) references public.timetable_templates (user_id, id) on delete set null (plan_id);
alter table public.activity_templates add constraint activity_templates_subject_id_fk foreign key (user_id, subject_id) references public.subjects (user_id, id) on delete set null (subject_id);
alter table public.schedule_exceptions add constraint schedule_exceptions_template_id_fk foreign key (user_id, template_id) references public.activity_templates (user_id, id) on delete cascade;
alter table public.schedule_exceptions add constraint schedule_exceptions_subject_id_fk foreign key (user_id, subject_id) references public.subjects (user_id, id) on delete set null (subject_id);
alter table public.goals add constraint goals_subject_id_fk foreign key (user_id, subject_id) references public.subjects (user_id, id) on delete set null (subject_id);
alter table public.tasks add constraint tasks_subject_id_fk foreign key (user_id, subject_id) references public.subjects (user_id, id) on delete set null (subject_id);
alter table public.tasks add constraint tasks_goal_id_fk foreign key (user_id, goal_id) references public.goals (user_id, id) on delete set null (goal_id);
alter table public.study_sessions add constraint study_sessions_subject_id_fk foreign key (user_id, subject_id) references public.subjects (user_id, id) on delete set null (subject_id);
alter table public.study_sessions add constraint study_sessions_task_id_fk foreign key (user_id, task_id) references public.tasks (user_id, id) on delete set null (task_id);
alter table public.habit_records add constraint habit_records_habit_id_fk foreign key (user_id, habit_id) references public.habits (user_id, id) on delete cascade;

-- Server-assigned change cursor. The client pulls with `server_updated_at > cursor` because device `updated_at`
-- can be backdated by clock skew. Always overwritten by the guard trigger (0003); clients cannot choose it.
do $$
declare t text;
begin
  foreach t in array array['subjects','timetable_templates','activity_templates','schedule_exceptions','activity_logs','goals','tasks','study_sessions','habits','habit_records','saved_quotes','affirmations','user_preferences','notification_settings'] loop
    execute format('alter table public.%I add column server_updated_at timestamptz not null default now()', t);
    execute format('create index %I on public.%I (user_id, server_updated_at)', t || '_server_updated_idx', t);
  end loop;
end $$;
