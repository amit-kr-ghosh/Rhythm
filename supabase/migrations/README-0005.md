# 0005 – study tracking defaults v2

Run in the Supabase SQL editor (or `supabase db push`). It is idempotent.

Optional, per user, in the SQL editor while impersonating the user (or from the app's SQL console): `select public.rhythm_apply_defaults_v2();`
The app already performs the same upgrade on first launch (`applyDefaultsV2` in `src/state/runtime.ts`), so calling the function is only needed for accounts that will not open the new app build soon.
