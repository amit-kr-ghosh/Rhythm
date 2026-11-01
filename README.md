# Rhythm — personal timetable, focus timer & study tracker

One shared TypeScript codebase that runs on **Android, iOS (Expo Go or builds) and the Web**, with optional **Supabase** sync.
React Native + Expo SDK 58 + Expo Router. Dark mode is the default; light and system modes are fully supported.

Everything you see is calculated from data you recorded. There are no sample statistics, no fabricated streaks and no
estimated study time. Where there is no data yet the app shows "—" or an empty state.

> **Read this first — verification status.** This project was written in a sandbox where the npm registry was blocked, so
> Expo / React Native could not be installed: the app has **never been bundled, opened in Expo Go, run in a browser, or run
> on a device**. What *was* executed for real: the domain/sync/storage tests (including the web storage layer in real
> Chromium IndexedDB) and the SQL/RLS tests. The UI layer was only type-checked against stand-in shims.
> See [Verification status](#verification-status). Your first commands should be
> `npm install && npx expo install --fix && npm run typecheck` — expect a few fixes that only real packages reveal.


## Run it — step by step (Windows + VS Code)

1. **Install Node.js 22 LTS** (22.13 or newer) from nodejs.org. Odd versions such as 23 or 25 are not supported by Expo SDK 58. Check with `node -v`.
2. **Unzip and open in VS Code.** Unzip `rhythm.zip` to a short path such as `C:\dev\rhythm`, then File → Open Folder → `rhythm`, and open the terminal with Ctrl+`.
3. **Install and align packages:**
   ```
   npm install
   npx expo install --fix
   ```
   The second command sets every Expo / React Native package to the exact SDK 58 versions. If `npm install` shows peer-dependency errors, run `npx expo install --fix` first.
4. **Check the code:** `npm run typecheck`. This is the first check against the real Expo types. If it prints errors, fix or report them before continuing.
5. **Run on your phone (Expo Go):** install **Expo Go** from the Play Store / App Store and update it to the latest version. Then run
   ```
   npx expo start
   ```
   and scan the QR code (Android: from inside Expo Go; iPhone: with the Camera app). Phone and PC must be on the same Wi-Fi; otherwise use `npx expo start --tunnel`.
6. **Run the website:** `npx expo start --web` opens http://localhost:8081. `npm run export:web` builds static files in `dist/` for hosting (use HTTPS).
7. **Finish the Supabase settings.** The database is already created and `.env` points to it (if you made your own project, copy `.env.example` to `.env` and fill in the URL and the **anon/publishable** key — never the service_role key). In the Supabase dashboard open *Authentication → URL Configuration* and set:
   - Site URL: `http://localhost:8081`
   - Redirect URLs: `http://localhost:8081/**`, `rhythm://auth/**`, `exp://**`

   For quick testing, turn off *Confirm email* under *Providers → Email*.
8. **Test sync:** create an account on the web, add a focus session, then sign in with the same account in Expo Go on your phone. The session should appear after a sync.

The app also works fully offline without Supabase; sign-in screens just say cloud sync isn't configured.

---

## Look & feel

- **Icons everywhere it helps:** every card on *Today* has a tinted icon badge, the main actions are big icon tiles (Start focus, Add task, Timetable, Insights), and the greeting changes its icon with the time of day.
- **Gentle motion:** sections fade and slide in one after another, buttons and cards give a small press-in feedback, progress bars and rings grow from zero to their value, and the focus timer shows a softly pulsing "live" dot. All built with React Native's own `Animated` (no extra packages), identical in Expo Go, builds and the browser, and **switched off automatically when the device's "reduce motion" setting is on**.
- **Easy to understand:** on a brand-new install *Today* starts with a short "Welcome — start here" card with three tappable steps; every number has a plain-language caption ("done of scheduled so far", "if the day ended now"), and *How is this calculated?* is one tap away.
- Code: `src/components/motion.tsx` (Reveal, usePressScale, useTween, PulseDot) and `CardTitle` / `QuickAction` in `src/components/ui.tsx`. None of this was visually checked on a device — see Verification status.

## Contents
1. [Features](#features) · 2. [Quick start](#quick-start-android) · 3. [Supabase setup](#supabase-setup) · 4. [Commands](#commands)
5. [Building an APK / AAB](#building-an-apk--aab) · 6. [Architecture](#architecture) · 7. [How progress is calculated](#how-progress-is-calculated)
8. [Offline & sync](#offline-first-and-sync) · 9. [Verification status](#verification-status) · 10. [Known limitations](#known-limitations)

---

## Features

| Area | What's included |
|---|---|
| **Timetable** | Your regular-day (22 blocks) and college-day (16 blocks) timetables preloaded and editable. Add / edit / delete / duplicate; move & resize (steppers + time fields — an accessible alternative to drag-and-drop); categories, subjects, colours; weekday recurrence; date-specific skip / override / one-off / reschedule; overlap warnings; midnight-crossing blocks (e.g. Sleep 11 PM–6 AM); day, week and month views; restore default timetable. Editing a recurring block creates a **new version from a date** so past days are never rewritten. |
| **Today dashboard** | Greeting, current & next activity with time remaining, daily completion ring ("so far" vs "if the day ended now"), focus time vs target, per-subject progress, tasks, habits, weekly chart, streak, overdue/upcoming, quote of the day, quick actions. |
| **Focus timer** | Stopwatch / Pomodoro (25/5, 50/10, custom). Timestamp-based so it's exact when backgrounded, killed or after reboot; crash recovery prompt; pause time and breaks never count; notes & reflections; manual entry with validation and overlap prevention; confirm before discarding. |
| **Progress** | Duration-weighted timetable %, study % vs target (e.g. 2 h of a 3 h DSA target = 66.7 %), per-subject, tasks, habits, weekly goal, optional weighted productivity score. No double counting of linked sessions; future blocks never penalise you. Rules are shown in-app (Settings → *How progress is calculated*). |
| **Analytics** | Daily/weekly/monthly focus, subject distribution, scheduled vs actual, target completion, productive weekdays/hours, avg session & completion rate, streaks, calendar heatmap, week-over-week & month-over-month, adherence trend, study vs non-study time, task stats, data-driven insights, subject filter and custom ranges. |
| **Tasks, habits, goals** | Priorities, due dates/times, estimates, recurrence, links to timetable blocks/goals, reminders; habit streaks; goals with milestones and focus-hour targets. Completing a task **never** creates study time. |
| **Motivation** | Quote of the day, curated quotes (properly attributed — nothing invented), favourites, personal "why", your own affirmations, encouragement after sessions and supportive messages when behind. All optional. |
| **Notifications** | Local notifications for timetable/study blocks, task deadlines, goals, breaks/timer completion, habits, daily summary and quote; lead times, quiet hours, Android channels, permission rationale; fully usable if denied. |
| **Account & sync** | Email/password, password reset, optional Google, secure session storage (Android Keystore), RLS-protected per-user data, sync status/retry, deterministic conflict rules, export (CSV/JSON), delete-my-data. |

## Quick start

Prerequisites: **Node 22.13+** (22 LTS recommended — odd versions like 23/25 are not supported by SDK 58). That's all for
Expo Go and the web: **no Android Studio, no Xcode, no custom dev build.**

```bash
npm install
npx expo install --fix        # pins every Expo/React Native package to the exact SDK 58 versions (see note below)
npm run typecheck             # real React Native types — run this once before anything else
npx expo start                # phone: scan the QR code with Expo Go
npx expo start --web          # website in your browser
```

* **Phone (Android / iOS):** install **Expo Go** from the Play Store / App Store, run `npx expo start`, scan the QR code
  (Android: from inside Expo Go; iOS: with the Camera app). Phone and computer must be on the same Wi-Fi — otherwise use
  `npx expo start --tunnel`.
* **Web:** `npx expo start --web` opens the site (default http://localhost:8081). `npm run export:web` builds a static
  bundle in `dist/` that any static host can serve (**use HTTPS** so notifications and secure cookies work; the host must
  rewrite unknown paths to `index.html` because the app uses client-side routing).
* **Expo Go must match the SDK.** This project targets **SDK 58**; Expo Go only supports the newest SDK. If your Expo Go
  says the project is incompatible, update Expo Go (or, on Android, install the matching version from expo.dev/go).
* **Why `expo install --fix`:** the dependency list was written without being able to reach the registry, so some packages
  are declared as `*` and others as ranges. `npx expo install --fix` replaces them with the versions Expo certifies for the
  SDK. If `npm install` complains about peer dependencies, run `npx expo install --fix` first.
* Optional: `cp .env.example .env` and add your Supabase values to enable cloud sync (below). Without them the app runs
  fully offline on every platform.

What differs by platform (all implemented behind the same screens):

| Capability | Android / iOS (Expo Go) | Web |
|---|---|---|
| Local database | `expo-sqlite` (on-device SQLite) | **IndexedDB** (in-memory working set, written through to IndexedDB in atomic transactions; multiple tabs stay in sync via `BroadcastChannel`) |
| Session storage | Keystore / Keychain (`expo-secure-store`) | `localStorage` (browsers have no secure enclave — see Security notes) |
| Reminders | Local scheduled notifications (work when the app is closed) | Browser Notifications **while a Rhythm tab is open** (browsers cannot schedule for a closed page without a push server) |
| Focus timer | Timestamp based, survives background / kill, crash-recovery prompt | Timestamp based, correct in throttled background tabs and after reload; recovery prompt too |
| Export | Share sheet | File download |
| Dialogs | System alerts | In-app dialogs (RN `Alert` does nothing on the web) |
| Layout | Bottom tab bar | Bottom bar on phones, **left sidebar** and centred content on wide screens |
| Offline | Full | Full *after the first load*; the page itself is not cached for offline start (no service worker yet) |

### Environment variables

`.env.example` documents them. Only public values belong in the app:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Your project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The **anon / publishable** key (safe to ship — RLS protects data) |
| `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED` | `true` only after Google is configured in Supabase |

**Never** put the `service_role` key (or any other secret) in this app or its `.env`.

## Supabase setup

1. **Create a project** at <https://supabase.com> (free tier is fine).
2. **Apply the migrations** in order — either paste each file into *SQL Editor → Run*, or with the CLI:
   ```bash
   supabase link --project-ref <ref>
   supabase db push            # applies supabase/migrations/0001_schema.sql … 0004_lock_trigger_function.sql
   ```
   They create 14 user-owned tables + `profiles`, constraints, indexes, **RLS (enabled and forced) on every table**,
   a stale-write guard trigger, a server-assigned `server_updated_at` sync cursor, an auto-profile trigger, and
   `delete_my_data()` (used by *Delete my data*).
3. **Auth settings** (*Authentication → URL Configuration*):
   - **Site URL:** your website's address (e.g. `http://localhost:8081` while developing, your HTTPS domain in production).
   - **Redirect URLs** — add all that apply: `http://localhost:8081/**` and your production `https://your-domain/**` (web),
     `rhythm://auth/**` (installed Android/iOS builds) and `exp://**` (Expo Go; the exact address changes with your
     network, so a wildcard is needed). Under *Providers → Email* decide whether to require email confirmation.
4. **Optional Google sign-in:** create an OAuth client in Google Cloud, enable *Providers → Google* in Supabase with its
   client id/secret, then set `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=true`.
5. **Copy keys** (*Project Settings → API*): URL and **anon** key into `.env`. Rebuild (`expo run:android`) — `EXPO_PUBLIC_*`
   values are inlined at build time.
6. **Seed data:** not required — the app seeds your default timetable locally, and it uploads when you first sign in.
   To pre-load a specific user server-side: `npx tsx scripts/gen-seed-sql.ts <user-uuid> > supabase/seed.generated.sql`
   and run it in the SQL editor.

### Testing the database policies
```bash
npm run test:db     # = bash supabase/tests/run-local.sh
```
Uses the Supabase CLI + Docker if present, otherwise a throwaway local Postgres (14+) with a stub `auth` schema
(`PGURL=<superuser url of a throwaway DB>` also works). It applies all migrations, then asserts that user B can't
select / insert-as / update / delete user A's rows on every table, that `anon` is blocked, cross-user foreign keys are
rejected, check constraints hold, stale writes are ignored, and `delete_my_data()` only affects the caller.

## Commands

| Command | What it does |
|---|---|
| `npm start` | `expo start` — QR code for Expo Go |
| `npm run web` | `expo start --web` — the website |
| `npm run android` / `npm run ios` | Open in Expo Go on an emulator/simulator if you have one |
| `npm run export:web` | Static production build of the website in `dist/` |
| `npm run dev:android-native` | Optional: native dev build (`expo run:android`, needs Android Studio) |
| `npm run test:browser` | Storage-layer tests in real Chromium IndexedDB (needs Playwright + esbuild) |
| `npm run typecheck` | Strict TypeScript over the whole app (real RN types) |
| `npm run typecheck:core` | Strict TypeScript over domain/tests only (no RN needed) |
| `npm run lint` | Dependency-free check that no hard-coded colours exist outside the theme files |
| `npm run lint:eslint` | Optional full ESLint via `expo lint` (Expo installs a compatible ESLint setup the first time) |
| `npm run clean:install` | Recovery: delete `node_modules` (with Windows-safe retries), `npm cache verify`, reinstall, align versions, run Expo Doctor and the type check |
| `npm test` | 131 unit + integration tests on SQLite, then the sync/storage suites again on the web backend (`TZ=Asia/Kolkata`) |
| `npm run test:tz` | Same suite under `America/New_York` (DST) and `Pacific/Auckland` |
| `npm run test:all` | Both of the above |
| `npm run test:db` | Migrations + RLS tests on Postgres |
| `npm run seed:sql` | Generate seed SQL |
| `npm run doctor` | `expo-doctor` |

Tests use Node's built-in runner via `tsx`; the repository/sync tests run against **real SQLite** (`node:sqlite`) through
the same driver interface the app uses with `expo-sqlite`, and again against the web storage backend. Needs Node ≥ 22.13.

## Troubleshooting installs

Design choices that keep installs clean: no `--force` / `--legacy-peer-deps` anywhere; `react` and `react-dom` are pinned to
one version through `overrides` (so no library can pull in a second copy or force a peer conflict); linting is
dependency-free (`npm run lint`), so the old ESLint 9 deprecation warning is gone; only packages the app actually imports
are listed. Remaining `npm warn deprecated` lines for *transitive* packages come from Expo/React Native themselves and are harmless.

| Symptom | Fix |
|---|---|
| Anything odd after a failed install | `npm run clean:install` (does everything below in the right order) |
| `ERESOLVE` / peer-dependency messages | Run `npx expo install --fix`. It rewrites the version ranges in `package.json` to the exact set Expo certifies for SDK 58. Commit the resulting `package-lock.json`. |
| Corrupted cache (`EINTEGRITY`, `ENOENT … _cacache`, `Unexpected end of JSON`) | `npm cache verify`. Only if that does not help: `npm cache clean --force` (this is the one place a force flag is the documented npm repair for a damaged cache — it does not affect your project). |
| `EPERM` / `EBUSY` on Windows | Something is holding files open. Close VS Code terminals and dev servers, **keep the project out of OneDrive/Dropbox folders**, exclude the project folder from Windows Defender real-time scanning, use a short path (`C:\dev\rhythm`), then `npm run clean:install` (its delete step retries while Windows releases the locks). Running the terminal as Administrator is rarely needed and not recommended. |
| `npm warn deprecated …` | Informational. Direct dependencies here are not deprecated. |

## Building an APK / AAB

With EAS (needs a free Expo account): 
```bash
npm i -g eas-cli && eas login
eas build -p android --profile preview      # installable APK (internal distribution)
eas build -p android --profile production   # AAB for Google Play
```
Put the Supabase variables in EAS secrets or an EAS environment so the build can inline them:
`eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value ... --visibility sensitive` (repeat for the anon key).

Local build (no EAS):
```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease     # APK  -> app/build/outputs/apk/release/
./gradlew bundleRelease                     # AAB
```
Configure a release keystore for store uploads (EAS manages one for you).

## Architecture

```
app/                      Expo Router screens (tabs: Today · Timetable · Focus · Insights · Tasks; stack/modal screens)
src/
  domain/                 PURE TypeScript — no React, no I/O. Fully unit-tested.
    time · schedule · progress · timer · sessions · analytics · notify · sync · export · validation · defaults · quotes
  data/                   repo + syncEngine (platform independent) over a Backend interface:
                          sqliteBackend (expo-sqlite) · memoryBackend + idb (IndexedDB, web) · openStorage(.web).ts picks one
  services/               cloud (Supabase auth + client) · notifications · secureStorage · config · deepLinks
  state/                  store (tiny external store) · runtime (boot, sync/notification scheduling) · actions (all mutations) · hooks
  theme/                  tokens (palettes, spacing, type) · ThemeProvider
  components/             ui · inputs · feedback · charts (hand-built SVG) · per-area parts
supabase/                 migrations · seed · RLS tests
tests/                    node:test suites
tools/typecheck/          sandbox-only type shims (see Verification status)
```

Key decisions:
- **Domain core is pure** so the risky logic (time arithmetic, midnight crossing, progress %, timer, sync rules) is testable without a device.
- **One storage interface, two engines.** `Repo` talks to a `Backend`; Android/iOS use SQLite, the web uses IndexedDB. A parity test runs the same scripted scenario on both and requires identical results. AsyncStorage (localStorage on web) only caches the theme to avoid a flash of the wrong theme at launch.
- **Platform files:** Metro picks `*.web.ts` on the web — `openStorage`, `secureStorage`, `notifications`, `polyfills`. Everything else is shared.
- **Every write is one transaction**: the entity and its sync-queue entry are saved together — a crash can't lose a queued change.
- **Charts are custom SVG** (`react-native-svg`) rather than a chart library: no extra native dependency, exact theme integration, and every chart exposes a text summary / table alternative for screen readers.
- **Design tokens** (`src/theme/tokens.ts`) are the only place colours live; an ESLint rule forbids hex literals elsewhere. Contrast ratios are asserted in tests.
- **Dates**: a date is a local `YYYY-MM-DD` key; sessions store their local date at start so history survives time-zone changes; week start is a preference. Durations across DST are computed from real instants.

## How progress is calculated

(Also shown in the app.) 1) Focused time = `focusSec` of valid sessions (completed/interrupted, > 0); cancelled sessions, paused/idle time and breaks never count.
2) Timetable completion is **duration-weighted**: `credit = min(duration, max(manual log credit, linked-session minutes))` — max, not sum, so a linked session and a manual tick never double-count.
3) Skipped-by-exception and cancelled blocks (and optionally sleep) are excluded; a block you mark "not done" stays and earns 0.
4) **"Progress so far"** divides by scheduled time that has already elapsed, so upcoming blocks never lower it; **"if the day ended now"** divides by the whole day.
5) Study % = focused ÷ target (can exceed 100 %; rings cap at 100). 6) Task % = done ÷ due that day; habit % = done ÷ scheduled.
7) Productivity score = weighted mean of components that have data; weights are re-normalised. 8) Targets are stored with their effective date, so changing a target never rewrites past days.

## Offline-first and sync

- All reads/writes hit the local database (SQLite on phones, IndexedDB on the web). The app never blocks on the network. Phone and web are just two devices of the same account: they sync through Supabase using the rules below, so data entered on one appears on the other after a sync (on app start, on reconnect, when the app returns to the foreground, and a moment after each change).
- Changes go into an **outbox** (one entry per entity, latest payload wins). The sync engine pushes in foreign-key order, in batches, with exponential back-off and jitter; a single bad row is isolated and marked *failed* (kept, visible, retryable) instead of blocking others.
- IDs are client-generated UUIDs and writes are idempotent upserts keyed by `(user_id, id)` → **retries can't create duplicate sessions**.
- **Conflicts:** last-writer-wins on `updatedAt`, ties favour the local copy; deletes are tombstones. The server also ignores writes older than the stored row. Any version that loses is written to a local **conflict log** (Settings → Sync) — nothing is silently discarded.
- Pulls use a server-assigned `server_updated_at` cursor, so devices with wrong clocks can't hide data.
- Default timetable rows are seeded locally with an epoch timestamp and are **not uploaded until edited**, so a new device can never overwrite your real cloud data. Signing into a *different* account on a device that has data asks you to **merge** or **replace** — never silent.
- Signing out keeps local data. *Delete my data* removes this device's data and (optionally) the cloud copy; it explains the consequences and requires typing `DELETE`.

## Verification status

What was **actually executed** in the build sandbox:

| Check | Result |
|---|---|
| Domain + data-layer tests (`npm test`): time, schedule, recurrence, midnight crossing, progress %, analytics, timer, notification planning, theme contrast, export, validation, defaults, quotes | **131 tests: 130 pass, 0 fail, 1 deliberate time-zone skip** (Asia/Kolkata). Also run in America/New_York (DST) and Pacific/Auckland: 0 failures. |
| Repository + sync engine on **real SQLite**, then the same suite on the **web backend** (memory + simulated durable store): outbox, offline queue, retries without duplicates, conflicts, tombstones, clock skew, account switching | pass on both (22 tests each) |
| **Backend parity**: the same scenario on SQLite and the web backend gives identical results; a failed durable write rolls the transaction back; data survives restart; concurrent writes serialise; another tab's write is picked up | pass |
| **Real IndexedDB in headless Chromium** (`npm run test:browser`): persistence across reopen, wipe, rollback on failed commit, cross-tab notification via BroadcastChannel, 200 concurrent writes | **11/11 pass** |
| SQL migrations + RLS suite on PostgreSQL 16 (stub auth schema) | pass. Migrations 0001–0004 were also applied to a real Supabase project, and the Supabase security advisor was checked (it found one issue, fixed in 0004). |
| Strict TypeScript on domain/data/tests (`npm run typecheck:core`) | clean |
| TypeScript on the whole app with sandbox shims (`tsconfig.shim.json`; third-party modules are `any`) | clean — checks our own wiring only. **Not** a substitute for `npm run typecheck`: the shims hide every React Native / Expo typing error. `tools/typecheck/` is excluded from the real `tsconfig.json` so the shims can never mask real types. |
| No hard-coded colours outside the theme files (`npm run lint`) | none |

What was **NOT** run:

- `npm install`, `package-lock.json` generation, Metro bundling (native **or web**), `expo-doctor`, a real `tsc` with React Native types. (The sandbox's network policy blocks the npm registry, so none of the npm commands could run.)
- **Expo Go on any phone, any emulator, any real browser rendering of the UI.** So unverified: rendering, the web layout and sidebar, dark/light visuals, keyboard behaviour, back navigation, backgrounding, TalkBack/VoiceOver/screen-reader behaviour on web, performance.
- **Notification delivery** on phone (planning is unit-tested) and on the web (browser permission + timers).
- **Live Supabase flows**: sign-up, confirmation e-mails, password reset links, Google OAuth, and a real sync round-trip between phone and web. (The database itself is deployed and policy-tested.)
- **SDK 58 specifics.** I upgraded the project from SDK 54 to SDK 58 using the published changelog (Expo Go only supports the newest SDK) but could not install anything, so package versions are resolved by `npx expo install --fix`, and any API change in SDK 55–58 not mentioned in the changelogs I could read may surface as a type or runtime error. `expo-router`'s `tabBarPosition: 'left'` (wide-screen sidebar) in particular is untested.
- No UI component/integration tests exist.

## Known limitations

- **Unverified UI layer** (above) — expect some first-run fixes.
- Drag-and-drop is intentionally replaced by steppers/time fields (reliable and accessible).
- **Expo Go limits:** remote push is not available in Expo Go on Android (the app doesn't use it; local reminders work). Email-confirmation and reset links open `exp://…` addresses in Expo Go and are more reliable when tapped on the same device — for quick testing, disable "Confirm email" in Supabase or test sign-up on the web build. Google sign-in additionally needs the redirect URLs below.
- **Web reminders only fire while a Rhythm tab is open.** There is no push server; closing every tab means no reminders.
- **No offline start on the web yet** (no service worker): once loaded the app works offline, but a fresh visit with no network cannot load the page.
- Reminders on phones are local, inexact notifications; battery optimisation can delay them. Exact-alarm permission is deliberately not requested.
- Notifications are scheduled 3 days ahead (max 60) and re-planned when the app opens or data changes, so they need the app opened every few days.
- Account deletion removes your **data**; deleting the auth user itself needs a privileged key and isn't possible from the client (do it in the Supabase dashboard).
- Editing a timer-recorded session's *time* isn't allowed (delete and re-add instead); notes/reflections/subject are editable.
- Monthly subject targets are derived from the weekly target (no separate monthly field).
- iOS is now supported through Expo Go / EAS but, like everything UI-related here, has not been run.

## Contributing notes

Screens follow `SCREENS.md`: data via hooks, mutations only via `src/state/actions.ts`, colours only from the theme, 48 dp targets, labelled controls, explicit empty/loading/error states.


## Windows PowerShell

The test scripts use `cross-env` so timezone-dependent tests run in PowerShell and Command Prompt. After installing dependencies, use `npm run test:all`. Start mobile Expo Go development with `npx expo start`; start the web build with `npx expo start --web`. The root Expo Router Stack remains mounted while the app initializes local storage so deep links and initial navigation can initialize correctly.
