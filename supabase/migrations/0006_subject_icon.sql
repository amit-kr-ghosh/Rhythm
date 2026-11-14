-- 0006: per-subject icon (customisation). Additive and idempotent; existing rows keep NULL, which the app
-- shows as the default icon for the subject's name. The app validates the value against its icon list.
alter table public.subjects add column if not exists icon text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subjects_icon_len_check') then
    alter table public.subjects add constraint subjects_icon_len_check check (icon is null or char_length(icon) between 1 and 40);
  end if;
end $$;
