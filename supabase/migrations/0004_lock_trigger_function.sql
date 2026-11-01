-- handle_new_user() is a trigger function only; it must not be callable through /rest/v1/rpc.
-- (Flagged by the Supabase security advisor on the live project.)
revoke all on function public.handle_new_user() from public, anon, authenticated;
