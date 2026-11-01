-- Triggers and RPCs. Nothing here needs (or uses) the service-role key.

-- Last-writer-wins guard. A write carrying an older updated_at than the stored row is silently ignored, so a late
-- retry from an offline device cannot clobber newer data. Equal timestamps are allowed (idempotent retries).
-- Applied writes also get a fresh server_updated_at. A client clock far in the future is clamped so it cannot "freeze" a row against later edits.
create or replace function public.guard_stale_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.updated_at > now() + interval '5 minutes' then
    new.updated_at := now() + interval '5 minutes';
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'user_id is immutable' using errcode = '42501';
    end if;
    if new.updated_at < old.updated_at then
      return null; -- stale write: ignored entirely, so server_updated_at is NOT bumped
    end if;
  end if;
  -- Applied write: stamp the server clock, discarding anything the client sent.
  -- clock_timestamp() (not now()) so rows written later in one long transaction still sort after earlier ones.
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'subjects','timetable_templates','activity_templates','schedule_exceptions','activity_logs','goals','tasks',
    'study_sessions','habits','habit_records','saved_quotes','affirmations','user_preferences','notification_settings'
  ] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.guard_stale_write()', t || '_guard', t);
  end loop;
end $$;

-- Auto-create a profile for each new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_profile() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_profile();

-- In-app "Delete my personal data": removes everything the signed-in user owns. The auth account itself is kept
-- (deleting auth users needs a privileged key, which the app never holds); the profile row is reset.
create or replace function public.delete_my_data() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.study_sessions where user_id = uid;
  delete from public.activity_logs where user_id = uid;
  delete from public.habit_records where user_id = uid;
  delete from public.schedule_exceptions where user_id = uid;
  delete from public.tasks where user_id = uid;
  delete from public.goals where user_id = uid;
  delete from public.habits where user_id = uid;
  delete from public.activity_templates where user_id = uid;
  delete from public.timetable_templates where user_id = uid;
  delete from public.subjects where user_id = uid;
  delete from public.saved_quotes where user_id = uid;
  delete from public.affirmations where user_id = uid;
  delete from public.user_preferences where user_id = uid;
  delete from public.notification_settings where user_id = uid;
  update public.profiles set display_name = '' where id = uid;
end $$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
