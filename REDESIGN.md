# Rhythm redesign

**Direction:** soft pastel washes, white rounded cards, an always-dark "hero" surface with a lime highlight, ink-coloured primary actions and a full-width docked tab bar (inspired by the supplied reference).

## System
- `src/theme/tokens.ts`: new palettes (light + dark) with `ink`, `hero`, `lime`, `wash*` tokens; bolder type scale; larger radii; `tint()` helper. Labels are sentence case (no all-caps).
- `src/components/ui.tsx`: Screen with ambient washes, PageHeader (stacks on phones), Card (incl. `hero`), pill Button (`primary`/`lime`/`secondary`/`ghost`/`danger`), round IconButton, Chip (with counts), Pill, animated Check, IconBadge, Grid (1–2 columns), ProgressRing/Bar with hero variants, visible keyboard focus rings on web.
- `src/components/motion.tsx`: added `useToggleAnim` and `Pop` (all motion honours reduce-motion).
- `src/components/nav/TabBar.tsx`: full-width white bar docked to the bottom edge on phones (it also paints behind the system navigation area; the active tab is a black capsule), sidebar with brand on tablet/desktop. Tabs: Today, Timetable, Focus, Analytics, Settings.
- Segmented control with a sliding indicator, sheets with grab handle, toast above the tab bar, friendlier dialogs.

## Screens
Today (hero progress card, now/next with one-tap focus, task tabs, study, week, habits, timeline, "+" quick-add sheet), Timetable (week strip, tinted blocks), Focus (hero timer, ring while running), Tasks (inline quick add, filters, animated checks, habits, goals), Insights (hero summary, titled cards in a responsive grid), onboarding, auth, settings, summary and every modal inherit the new system.

## Unchanged
Data layer, sync, auth, notifications, domain logic, routes and Supabase files are untouched.

## v4: design-reference match
Light-first peach → lilac gradient (CSS gradient on web, interpolated bands on native — no new dependency), white borderless cards with soft shadows, charcoal hero card with lime ring, black pill buttons, white chips with black / lime selected states, two-weight headlines ("Let’s make / Today productive"), avatar + black "+" + bell header, stacked time column with Morning / Afternoon / Evening groups and filled status buttons, white pill tab bar with a black active capsule (icon over label). Plus Jakarta Sans on web (`app/+html.tsx`); native uses the system font. Installs on the old dark default switch to light once (`designV3`).
