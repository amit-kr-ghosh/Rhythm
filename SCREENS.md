# Screen contract (for contributors)

Routes (Expo Router, `app/`):
- Tabs: `(tabs)/index` Today · `timetable` · `focus` · `insights` · `tasks` (tasks + habits + goals segments)
- Stack/modal: `onboarding`, `rules`, `motivation`, `summary/[date]`, `activity/[id]` (`new` to create), `occurrence` (params `key`,`date`),
  `session/[id]`, `manual-session`, `subjects/index`, `subjects/[id]`, `task/[id]`, `goal/[id]`, `habit/[id]`,
  `settings/*`, `auth/{login,register,forgot,reset,callback}`.

Rules every screen follows:
1. Data comes only from `useApp`/`useDayModel`/`useAnalyticsInput`; mutations only through `src/state/actions.ts`.
2. Colours/spacing/type only from `useTheme()`/`useStyles()` — no hex literals in screens or components.
3. Touch targets ≥ 48dp, every control has an accessibility label, charts expose a text summary.
4. Empty / loading / error states are explicit; a missing value is shown as "—", never as a fabricated 0 or sample number.
