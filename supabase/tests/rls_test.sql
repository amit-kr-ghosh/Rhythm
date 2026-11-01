-- RLS / constraint / trigger tests. Plain SQL, no pgTAP. Any failed assertion raises and aborts (psql -v ON_ERROR_STOP=1).
-- Needs migrations 0001-0003 applied. Run as a superuser; the script switches roles itself.
\set ON_ERROR_STOP on
\set QUIET on

create schema if not exists t;
create or replace function t.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;
create or replace function t.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;

grant usage on schema t to anon, authenticated;
grant execute on all functions in schema t to anon, authenticated;

delete from auth.users where email in ('a@test.local','b@test.local');
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@test.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@test.local');

begin;
do $$ begin
  perform t.assert((select count(*) from public.profiles) = 2, 'profile auto-created for each new auth user');
end $$;

-- Fixtures for user A (inserted as superuser; ids shared with user B on purpose where defaults are deterministic).
insert into public.subjects (id,user_id,name,color,created_at,updated_at) values ('10000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','DSA','#fff',now(),now());
insert into public.timetable_templates (id,user_id,name,created_at,updated_at) values ('10000000-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Regular',now(),now());
insert into public.activity_templates (id,user_id,plan_id,title,category,subject_id,start_min,end_min,weekdays,effective_from,series_id,created_at,updated_at)
  values ('10000000-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000002','Sleep','sleep',null,1380,360,array[0,1,2],'2026-01-01','10000000-0000-0000-0000-000000000003',now(),now());
insert into public.schedule_exceptions (id,user_id,date,type,template_id,created_at,updated_at) values ('10000000-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2026-02-01','skip','10000000-0000-0000-0000-000000000003',now(),now());
insert into public.activity_logs (id,user_id,occurrence_key,date,status,snapshot,created_at,updated_at) values ('10000000-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','k@2026-02-01','2026-02-01','done','{}',now(),now());
insert into public.goals (id,user_id,title,start_date,created_at,updated_at) values ('10000000-0000-0000-0000-000000000006','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Goal','2026-01-01',now(),now());
insert into public.tasks (id,user_id,title,priority,status,goal_id,created_at,updated_at) values ('10000000-0000-0000-0000-000000000007','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Task','low','todo','10000000-0000-0000-0000-000000000006',now(),now());
insert into public.study_sessions (id,user_id,subject_id,date,started_at,ended_at,focus_sec,elapsed_sec,mode,status,source,created_at,updated_at)
  values ('10000000-0000-0000-0000-000000000008','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000001','2026-02-01',now()-interval '1 hour',now(),3000,3600,'stopwatch','completed','timer',now(),now());
insert into public.habits (id,user_id,name,color,weekdays,created_at,updated_at) values ('10000000-0000-0000-0000-000000000009','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Run','#0f0',array[1],now(),now());
insert into public.habit_records (id,user_id,habit_id,date,created_at,updated_at) values ('10000000-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000009','2026-02-01',now(),now());
insert into public.saved_quotes (id,user_id,quote_id,created_at,updated_at) values ('10000000-0000-0000-0000-00000000000b','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','q1',now(),now());
insert into public.affirmations (id,user_id,text,created_at,updated_at) values ('10000000-0000-0000-0000-00000000000c','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','I show up',now(),now());
insert into public.user_preferences (user_id,timer,weights,motivation,created_at,updated_at) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{}','{}','{}',now(),now());
insert into public.notification_settings (user_id,created_at,updated_at) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',now(),now());

-- 1. Every user-owned table has RLS enabled AND forced, and exactly the 4 own-row policies.
do $$
declare r record;
begin
  for r in select c.relname, c.relrowsecurity, c.relforcerowsecurity,
                  (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as npol
           from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='r' loop
    perform t.assert(r.relrowsecurity, r.relname || ': RLS enabled');
    perform t.assert(r.relforcerowsecurity, r.relname || ': RLS forced');
    perform t.assert(r.npol = 4, r.relname || ': has 4 policies, found ' || r.npol);
  end loop;
end $$;

-- 2. Owner can read own rows in every table.
do $$
declare tbl text; n bigint;
begin
  perform t.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  foreach tbl in array array['subjects','timetable_templates','activity_templates','schedule_exceptions','activity_logs','goals','tasks','study_sessions','habits','habit_records','saved_quotes','affirmations','user_preferences','notification_settings'] loop
    execute format('select count(*) from public.%I', tbl) into n;
    perform t.assert(n = 1, 'owner sees own row in ' || tbl || ' (got ' || n || ')');
  end loop;
  execute 'select count(*) from public.profiles' into n;
  perform t.assert(n = 1, 'owner sees only own profile');
  reset role;
end $$;

-- 3. Another user (B) cannot read, update or delete A's rows in any table, and cannot insert rows as A.
do $$
declare
  tbl text; n bigint; pkcol text; affected bigint;
  a constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  b constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
begin
  perform t.as_user(b);
  foreach tbl in array array['subjects','timetable_templates','activity_templates','schedule_exceptions','activity_logs','goals','tasks','study_sessions','habits','habit_records','saved_quotes','affirmations','user_preferences','notification_settings'] loop
    execute format('select count(*) from public.%I', tbl) into n;
    perform t.assert(n = 0, 'B cannot SELECT A rows in ' || tbl || ' (saw ' || n || ')');
    execute format('update public.%I set updated_at = now() + interval ''1 minute'' where user_id = %L', tbl, a);
    get diagnostics affected = row_count;
    perform t.assert(affected = 0, 'B cannot UPDATE A rows in ' || tbl);
    execute format('delete from public.%I where user_id = %L', tbl, a);
    get diagnostics affected = row_count;
    perform t.assert(affected = 0, 'B cannot DELETE A rows in ' || tbl);
  end loop;
  -- cannot hijack a row by re-assigning user_id
  begin
    update public.subjects set user_id = b where user_id = a;
    get diagnostics affected = row_count;
    perform t.assert(affected = 0, 'B cannot re-assign A row to B');
  end;
  -- profiles
  select count(*) into n from public.profiles where id = a;
  perform t.assert(n = 0, 'B cannot read A profile');
  update public.profiles set display_name = 'pwned' where id = a;
  get diagnostics affected = row_count;
  perform t.assert(affected = 0, 'B cannot update A profile');
  reset role;
end $$;

-- 4. B cannot INSERT a row owned by A (WITH CHECK), in a representative set incl. singletons.
do $$
declare ok boolean;
  a constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  b constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
begin
  perform t.as_user(b);
  ok := false;
  begin insert into public.subjects (id,user_id,name,color,created_at,updated_at) values (gen_random_uuid(), a, 'x','#000',now(),now());
  exception when insufficient_privilege then ok := true; end;
  perform t.assert(ok, 'B cannot insert subject as A');
  ok := false;
  begin insert into public.tasks (id,user_id,title,priority,status,created_at,updated_at) values (gen_random_uuid(), a,'x','low','todo',now(),now());
  exception when insufficient_privilege then ok := true; end;
  perform t.assert(ok, 'B cannot insert task as A');
  ok := false;
  begin insert into public.notification_settings (user_id,created_at,updated_at) values (a, now(), now());
  exception when insufficient_privilege or unique_violation then ok := true; end;
  perform t.assert(ok, 'B cannot insert notification_settings as A');
  ok := false;
  begin insert into public.profiles (id) values (a);
  exception when insufficient_privilege or unique_violation then ok := true; end;
  perform t.assert(ok, 'B cannot insert profile as A');
  -- upsert onto A's row must not change it
  insert into public.subjects (id,user_id,name,color,created_at,updated_at)
    values ('10000000-0000-0000-0000-000000000001', b, 'B DSA', '#111', now(), now());   -- same deterministic id, different user: allowed
  reset role;
  perform t.assert((select name from public.subjects where user_id = a) = 'DSA', 'A subject untouched');
  perform t.assert((select count(*) from public.subjects) = 2, 'same id may exist per user (composite PK)');
end $$;

-- 5. Anonymous role has no access at all.
do $$
declare ok boolean;
begin
  perform t.as_anon();
  ok := false;
  begin perform count(*) from public.subjects; exception when insufficient_privilege then ok := true; end;
  perform t.assert(ok, 'anon cannot read subjects');
  ok := false;
  begin perform public.delete_my_data(); exception when insufficient_privilege then ok := true; end;
  perform t.assert(ok, 'anon cannot call delete_my_data');
  reset role;
end $$;

-- 6. Composite FKs: B cannot reference A's subject/task/goal.
do $$
declare ok boolean;
  b constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
begin
  perform t.as_user(b);
  ok := false;
  begin insert into public.tasks (id,user_id,title,priority,status,goal_id,created_at,updated_at)
        values (gen_random_uuid(), b,'x','low','todo','10000000-0000-0000-0000-000000000006',now(),now());
  exception when foreign_key_violation then ok := true; end;
  perform t.assert(ok, 'B cannot link own task to A goal');
  reset role;
end $$;

-- 7. Check constraints reject invalid data.
do $$
declare ok boolean;
  a constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
begin
  perform t.as_user(a);
  ok := false; begin insert into public.study_sessions (id,user_id,date,started_at,ended_at,focus_sec,elapsed_sec,mode,status,source,created_at,updated_at)
    values (gen_random_uuid(),a,'2026-02-02',now()-interval '1 hour',now(),4000,3600,'stopwatch','completed','timer',now(),now());
  exception when check_violation then ok := true; end;
  perform t.assert(ok, 'focus_sec > elapsed_sec rejected');
  ok := false; begin insert into public.study_sessions (id,user_id,date,started_at,ended_at,focus_sec,elapsed_sec,mode,status,source,created_at,updated_at)
    values (gen_random_uuid(),a,'2026-02-02',now()-interval '1 hour',now(),-1,3600,'stopwatch','completed','timer',now(),now());
  exception when check_violation then ok := true; end;
  perform t.assert(ok, 'negative focus_sec rejected');
  ok := false; begin insert into public.study_sessions (id,user_id,date,started_at,ended_at,focus_sec,elapsed_sec,mode,status,source,created_at,updated_at)
    values (gen_random_uuid(),a,'2026-02-02',now(),now()-interval '1 hour',0,0,'stopwatch','completed','timer',now(),now());
  exception when check_violation then ok := true; end;
  perform t.assert(ok, 'ended_at before started_at rejected');
  ok := false; begin insert into public.study_sessions (id,user_id,date,started_at,ended_at,focus_sec,elapsed_sec,mode,status,source,created_at,updated_at)
    values (gen_random_uuid(),a,'2026-02-02',now()-interval '1 hour',now(),1,1,'stopwatch','bogus','timer',now(),now());
  exception when check_violation then ok := true; end;
  perform t.assert(ok, 'bad session status rejected');
  ok := false; begin insert into public.activity_templates (id,user_id,title,category,start_min,end_min,weekdays,effective_from,series_id,created_at,updated_at)
    values (gen_random_uuid(),a,'x','study',1440,60,array[1],'2026-01-01',gen_random_uuid(),now(),now());
  exception when check_violation then ok := true; end;
  perform t.assert(ok, 'start_min 1440 rejected');
  ok := false; begin insert into public.activity_templates (id,user_id,title,category,start_min,end_min,weekdays,effective_from,series_id,created_at,updated_at)
    values (gen_random_uuid(),a,'x','study',60,120,array[7],'2026-01-01',gen_random_uuid(),now(),now());
  exception when check_violation then ok := true; end;
  perform t.assert(ok, 'weekday 7 rejected');
  ok := false; begin insert into public.activity_templates (id,user_id,title,category,start_min,end_min,weekdays,effective_from,effective_to,series_id,created_at,updated_at)
    values (gen_random_uuid(),a,'x','study',60,120,array[1],'2026-02-01','2026-01-01',gen_random_uuid(),now(),now());
  exception when check_violation then ok := true; end;
  perform t.assert(ok, 'effective_to before effective_from rejected');
  ok := false; begin insert into public.schedule_exceptions (id,user_id,date,type,created_at,updated_at) values (gen_random_uuid(),a,'2026-02-02','skip',now(),now());
  exception when check_violation then ok := true; end;
  perform t.assert(ok, 'skip exception without template rejected');
  ok := false; begin insert into public.tasks (id,user_id,title,priority,status,created_at,updated_at) values (gen_random_uuid(),a,'x','urgent','todo',now(),now());
  exception when check_violation then ok := true; end;
  perform t.assert(ok, 'bad task priority rejected');
  -- midnight-crossing block (end <= start) is valid
  insert into public.activity_templates (id,user_id,title,category,start_min,end_min,weekdays,effective_from,series_id,created_at,updated_at)
    values (gen_random_uuid(),a,'Sleep 2','sleep',1380,360,array[0,1,2,3,4,5,6],'2026-01-01',gen_random_uuid(),now(),now());
  reset role;
end $$;

-- 8. Stale-write guard: an older updated_at must not overwrite a newer row; equal/newer must.
do $$
declare a constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; n bigint; nm text;
begin
  perform t.as_user(a);
  update public.subjects set name = 'DSA v2', updated_at = now() - interval '1 minute' where id = '10000000-0000-0000-0000-000000000001' and user_id = a;
  select name into nm from public.subjects where id = '10000000-0000-0000-0000-000000000001' and user_id = a;
  perform t.assert(nm = 'DSA', 'stale update ignored (got ' || nm || ')');
  -- stale upsert (what an offline retry does)
  insert into public.subjects (id,user_id,name,color,created_at,updated_at)
    values ('10000000-0000-0000-0000-000000000001', a, 'STALE', '#000', now(), now() - interval '1 day')
    on conflict (user_id, id) do update set name = excluded.name, updated_at = excluded.updated_at;
  select name into nm from public.subjects where id = '10000000-0000-0000-0000-000000000001' and user_id = a;
  perform t.assert(nm = 'DSA', 'stale upsert ignored (got ' || nm || ')');
  insert into public.subjects (id,user_id,name,color,created_at,updated_at)
    values ('10000000-0000-0000-0000-000000000001', a, 'DSA v3', '#000', now(), now() + interval '1 second')
    on conflict (user_id, id) do update set name = excluded.name, updated_at = excluded.updated_at;
  select name into nm from public.subjects where id = '10000000-0000-0000-0000-000000000001' and user_id = a;
  perform t.assert(nm = 'DSA v3', 'newer upsert applied (got ' || nm || ')');
  -- idempotent retry (same payload twice) succeeds and does not duplicate
  insert into public.subjects (id,user_id,name,color,created_at,updated_at)
    values ('10000000-0000-0000-0000-000000000001', a, 'DSA v3', '#000', now(), now() + interval '1 second')
    on conflict (user_id, id) do update set name = excluded.name, updated_at = excluded.updated_at;
  select count(*) into n from public.subjects where user_id = a;
  perform t.assert(n = 1, 'retry did not duplicate');
  -- far-future clock is clamped
  update public.subjects set name = 'future', updated_at = now() + interval '10 days' where id = '10000000-0000-0000-0000-000000000001' and user_id = a;
  perform t.assert((select updated_at from public.subjects where user_id = a) <= now() + interval '6 minutes', 'future updated_at clamped');
  -- singleton upsert on user_id
  insert into public.user_preferences (user_id,timer,weights,motivation,theme,created_at,updated_at) values (a,'{}','{}','{}','light',now(),now() + interval '2 seconds')
    on conflict (user_id) do update set theme = excluded.theme, updated_at = excluded.updated_at;
  perform t.assert((select theme from public.user_preferences) = 'light', 'singleton upsert on user_id works');
  reset role;
end $$;

-- 8b. server_updated_at is server-assigned: client values are overwritten, backdated device clocks still advance it,
--     and ignored stale writes leave it untouched.
do $$
declare a constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; s1 timestamptz; s2 timestamptz; s3 timestamptz;
  id1 constant uuid := '20000000-0000-0000-0000-000000000001';
begin
  perform t.as_user(a);
  -- insert with a forged server_updated_at and a device updated_at backdated a week
  insert into public.affirmations (id,user_id,text,created_at,updated_at,server_updated_at)
    values (id1, a, 'one', now() - interval '7 days', now() - interval '7 days', '2000-01-01');
  select server_updated_at into s1 from public.affirmations where id = id1 and user_id = a;
  perform t.assert(s1 > now() - interval '1 minute', 'forged server_updated_at overwritten on insert (got ' || s1 || ')');
  -- update: newer than stored but still backdated vs. real time, plus a forged value
  update public.affirmations set text = 'two', updated_at = now() - interval '6 days', server_updated_at = '1999-01-01' where id = id1 and user_id = a;
  select server_updated_at into s2 from public.affirmations where id = id1 and user_id = a;
  perform t.assert(s2 > s1, 'backdated-but-newer update gets a fresh server_updated_at');
  perform t.assert(s2 > now() - interval '1 minute', 'forged server_updated_at overwritten on update');
  -- stale write (older updated_at than stored) is ignored and must not bump server_updated_at
  update public.affirmations set text = 'stale', updated_at = now() - interval '30 days' where id = id1 and user_id = a;
  select server_updated_at into s3 from public.affirmations where id = id1 and user_id = a;
  perform t.assert(s3 = s2 and (select text from public.affirmations where id = id1 and user_id = a) = 'two', 'stale write ignored; server_updated_at unchanged');
  -- singleton tables behave the same
  update public.notification_settings set enabled = true, server_updated_at = '1999-01-01', updated_at = now() + interval '1 second';
  perform t.assert((select server_updated_at from public.notification_settings) > now() - interval '1 minute', 'singleton server_updated_at overwritten');
  reset role;
end $$;

-- 9. delete_my_data removes only the caller's data.
do $$
declare a constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; b constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
begin
  perform t.as_user(b);
  perform public.delete_my_data();
  reset role;
  perform t.assert((select count(*) from public.subjects where user_id = b) = 0, 'B data deleted');
  perform t.assert((select count(*) from public.subjects where user_id = a) = 1, 'A data untouched by B delete');
  perform t.as_user(a);
  perform public.delete_my_data();
  reset role;
  perform t.assert((select count(*) from public.study_sessions) = 0, 'A sessions deleted');
  perform t.assert((select count(*) from public.tasks) = 0, 'A tasks deleted');
  perform t.assert((select count(*) from public.profiles) = 2, 'profiles retained');
end $$;

rollback;
delete from auth.users where email in ('a@test.local','b@test.local');
\echo ALL RLS TESTS PASSED
