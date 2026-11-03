# Rhythm

A personal **timetable, focus timer and study tracker**. One TypeScript codebase for **Android, iOS and the web**, offline-first, with optional cloud sync through **Supabase**.

Everything on screen is calculated from data you recorded: no sample statistics, no invented streaks, no estimated study time. Where there is no data yet, the app shows "—" or an empty state.

**Stack:** Expo SDK 58 · React Native · Expo Router · TypeScript · SQLite (phones) / IndexedDB (web) · Supabase Auth + Postgres (RLS)

---

## Contents

1. [Features](#features) · 2. [Quick start](#quick-start) · 3. [Configuration](#configuration) · 4. [Supabase setup](#supabase-setup)
5. [Build and update the app](#build-and-update-the-app) · 6. [How sync works](#how-sync-works) · 7. [Commands](#commands)
8. [Project layout](#project-layout) · 9. [Troubleshooting](#troubleshooting) · 10. [Known limitations](#known-limitations)

---

## Features

| Area | What you get |
|---|---|
| **Timetable** | Editable regular-day and college-day plans. Add, edit, delete and duplicate blocks; categories, colours and subjects; weekday recurrence; skip, override, one-off and reschedule for a single date; overlap warnings; blocks that cross midnight; day, week and month views; restore the default timetable. Editing a recurring block creates a **new version from a date**, so past days are never rewritten. |
| **Today** | Current and next activity, daily completion, focus time vs target, per-subject progress, tasks, habits, streak, quote of the day. |
| **Focus timer** | Stopwatch or Pomodoro. Timestamp-based, so it stays exact when the app is backgrounded or killed, with a recovery prompt after a crash. Pauses and breaks never count. Manual time entry with validation and overlap prevention. |
| **Subjects** | Add, edit, archive and **delete** subjects, each with a colour and daily/weekly targets. Defaults: DSA, AI/ML, RBI Preparation, Communication. Deleting keeps every recorded session in history (shown as "Unassigned") and unlinks tasks, goals and timetable blocks. Find it under **Settings → Subjects**. |
| **Progress and Analytics** | Study % vs target per subject, duration-weighted timetable completion, tasks, habits, weekly and monthly trends, subject distribution, heatmap, streaks, data-driven insights. Rules are shown in the app (Settings → *How progress is calculated*). |
| **Tasks, habits, goals** | Priorities, due dates, estimates, recurrence, reminders, habit streaks, goals with milestones. Completing a task never creates study time. |
| **Notifications** | Local reminders for blocks, tasks, goals, breaks, habits and a daily summary, with quiet hours and Android channels. The app works fully if permission is denied. |
| **Account and sync** | Email/password sign-in (Google optional), password reset, secure session storage, per-user data protected by row-level security, sync status with retry, CSV/JSON export, delete-my-data. |

The design is light-first (peach and lilac), with dark and system modes under **Settings → Appearance**.

---

## Quick start

Requirements: **Node 22.13 or newer** (22 LTS recommended; odd versions such as 23 or 25 are not supported by SDK 58).

```bash
git clone https://github.com/amit-kr-ghosh/Rhythm.git
cd Rhythm
npm install
cp .env.example .env        # then fill in your Supabase values (see Configuration)
npx expo start --clear
```

- **Phone (Expo Go):** install Expo Go, run the command above and scan the QR code. Phone and PC must be on the same Wi-Fi, otherwise use `npx expo start --tunnel`. Expo Go must support SDK 58.
- **Web:** `npx expo start --web` opens http://localhost:8081. `npm run export:web` builds static files in `dist/` (host over HTTPS; unknown paths must rewrite to `index.html`, as in `vercel.json`).
- **Without Supabase:** leave the variables empty and the app runs fully offline. Sign-in screens will say cloud sync is not configured.

> **Expo Go vs an installed app.** Inside Expo Go, notifications are shown as "Expo Go" and Android notification channels are unavailable. For the real "Rhythm" app name, icon and channels, install a build (see below).

---

## Configuration

Only public values belong in the app. **Never** put the Supabase `service_role` key in this project.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Your project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The anon / publishable key (safe to ship, because row-level security protects the data) |
| `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED` | `true` only after Google is configured in Supabase |

`EXPO_PUBLIC_*` values are inlined at build time. For EAS builds, store them in an EAS environment (for example *preview* and *production*) instead of committing `.env`.

---

## Supabase setup

1. Create a project at https://supabase.com.
2. **Apply the migrations** in `supabase/migrations/` in order (`0001` to `0005`), either by pasting each file into *SQL Editor* or with the CLI:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
   They create the user-owned tables and `profiles`, composite `(user_id, id)` keys and foreign keys, **row-level security (enabled and forced) on every table**, a stale-write guard trigger, a server-assigned `server_updated_at` sync cursor, an auto-profile trigger and `delete_my_data()`.
3. **Authentication → URL Configuration**
   - Site URL: your website address (`http://localhost:8081` while developing).
   - Redirect URLs: `http://localhost:8081/**`, your production `https://your-domain/**`, `rhythm://auth/**` (installed Android/iOS builds) and `exp://**` (Expo Go).
   - Without these, confirmation and password-reset links fail.
4. **Authentication → Providers → Email:** decide whether to require email confirmation (turn it off for quick testing).
5. **Authentication → Password security:** enable leaked-password protection if your plan allows it.
6. Optional Google sign-in: create a Google OAuth client, enable the Google provider in Supabase, then set `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=true`.

Test the policies with `npm run test:db`. It checks that one user cannot read or write another user's rows, that `anon` is blocked, that cross-user foreign keys are rejected and that stale writes are ignored.

---

## Build and update the app

Builds use [EAS](https://docs.expo.dev/build/introduction/) (free Expo account).

```bash
npm i -g eas-cli && eas login
npm run build:apk     # installable Android APK (the "preview" profile)
npm run build:aab     # Android App Bundle for Google Play (the "production" profile)
```

**Updating an installed app.** App code is bundled into the build, so a code change needs a new build:

1. `git pull`, then `npm install`.
2. `npm run build:apk`, then download and install the new APK over the old one. Data is kept, because it lives on the device and in Supabase.
3. Builds signed with the same keystore update in place. If Android refuses the update, sync first (**Settings → Sync → Sync now**), then reinstall.

While developing, you do not need a build: pull, run `npx expo start --clear` and reload Expo Go.

---

## How sync works

- All reads and writes use the local database, so the app never waits for the network.
- Each change is saved together with a queue entry (the **outbox**) in one transaction, so a crash cannot lose a queued change.
- **When it syncs:** a moment after each change, when the app returns to the foreground, when the network comes back and when you sign in. **Settings → Sync → Sync now** forces it. There is no background sync while the app is closed.
- IDs are client-generated UUIDs and writes are idempotent upserts, so retries never create duplicates. Failures back off exponentially. A single bad row is isolated and shown as *failed* (kept, never discarded) without blocking the rest.
- **Parents before children.** Cloud foreign keys require subjects, plans, tasks and goals to exist before rows that reference them. The built-in default subjects and plans are created locally and are not uploaded by themselves, so the sync engine uploads a default only when a row that points at it is being sent. If the server still reports a missing parent, it uploads the parents from the device and retries. A reference to something that exists nowhere is cleared instead of blocking the row.
- **Conflicts:** last-writer-wins on `updatedAt`, ties favour the local copy, deletes are tombstones, and the server ignores writes older than the stored row. A losing version is kept in the conflict log (**Settings → Sync**).
- The pull cursor is a server-assigned timestamp, so a device with a wrong clock cannot hide data.
- Signing in to a different account on a device that already has data asks you to **merge** or **replace**. It is never silent.

---

## Commands

| Command | What it does |
|---|---|
| `npm start` / `npm run web` | Start Expo (QR code for Expo Go) / the website |
| `npm run typecheck` | Strict TypeScript over the whole app |
| `npm run typecheck:core` | Strict TypeScript over domain, data and tests only |
| `npm run lint` | Fails on hard-coded colours outside the theme files |
| `npm test` | Unit and integration tests on SQLite, then the sync and storage suites again on the web backend (`TZ=Asia/Kolkata`) |
| `npm run test:tz` / `npm run test:all` | The same suite under other time zones (DST) / everything |
| `npm run test:db` | Migrations and row-level-security tests on Postgres |
| `npm run test:browser` | Storage tests in real Chromium IndexedDB (needs Playwright) |
| `npm run build:apk` / `npm run build:aab` | EAS builds |
| `npm run export:web` | Static website build in `dist/` |
| `npm run doctor` | `expo-doctor` |
| `npm run clean:install` | Recovery: remove `node_modules`, reinstall, align versions, type-check |

Tests use Node's built-in runner through `tsx`. The repository and sync tests run against real SQLite and again against the web backend, with a fake cloud that enforces the same foreign keys as Postgres.

---

## Project layout

```
app/            Expo Router screens. Tabs: Today · Timetable · Focus · Analytics · Settings; stack screens for
                subjects, tasks, goals, habits, sessions, history, settings/*, auth/*
src/
  domain/       Pure TypeScript, no React and no I/O, fully unit-tested
                (time, schedule, progress, study, timer, sessions, analytics, notify, sync, export, validation, defaults)
  data/         repo + syncEngine over a Backend interface: sqliteBackend (expo-sqlite) or memoryBackend + IndexedDB (web)
  services/     Supabase client and auth, notifications, secure storage, config, deep links
  state/        store, runtime (boot, sync and notification scheduling), actions (every mutation), hooks
  theme/        design tokens and ThemeProvider (the only place colours live)
  components/   shared UI, inputs, charts (hand-built SVG), per-area parts
supabase/       migrations, seed script, RLS tests
tests/          node:test suites
```

Key decisions:
- The domain core is pure, so the risky logic (time arithmetic, midnight crossing, progress %, timer, sync rules) is testable without a device.
- One storage interface with two engines. A parity test runs the same scenario on SQLite and the web backend and requires identical results.
- Screens read data through hooks and change it only through `src/state/actions.ts`. See [SCREENS.md](SCREENS.md).
- Dates are local `YYYY-MM-DD` keys. A session stores its local start date, so history survives time-zone changes.

More detail: [STUDY-TRACKING.md](STUDY-TRACKING.md) (how study time and targets are tracked), [REDESIGN.md](REDESIGN.md) and [UI-REFRESH.md](UI-REFRESH.md) (design notes).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Sync shows "violates foreign key constraint" | Update to the latest version, then **Settings → Sync → Retry failed changes**. Failed changes stay on the device and are never discarded. |
| Notifications say "Expo Go" | You are running inside Expo Go. Install a build with `npm run build:apk`. Reminders scheduled under Expo Go keep firing from it until you clear Expo Go's data. |
| A new subject is missing from the Focus picker | Update. Older versions listed only subjects that had a daily target. |
| Confirmation or reset link does nothing | Check the redirect URLs in [Supabase setup](#supabase-setup). |
| `ERESOLVE` or peer-dependency errors | `npx expo install --fix`, then commit the resulting `package-lock.json`. |
| Anything odd after a failed install | `npm run clean:install` |
| `EPERM` / `EBUSY` on Windows | Close dev servers and terminals, keep the project out of OneDrive/Dropbox, exclude it from antivirus scanning, use a short path such as `C:\dev\rhythm`, then `npm run clean:install`. |
| Expo Go says the project is incompatible | Update Expo Go to a version that supports SDK 58. |

---

## Known limitations

- Web reminders fire only while a Rhythm tab is open, because there is no push server.
- No offline start on the web yet (no service worker). Once loaded, the web app works offline.
- Phone reminders are local and inexact, and battery optimisation can delay them. They are scheduled 3 days ahead (at most 60) and re-planned when the app opens or data changes, so open the app every few days.
- Sync runs only while the app is open. There is no background sync.
- Deleting your data removes the data, not the sign-in account. Deleting the auth user needs a privileged key, so do it in the Supabase dashboard.
- Editing the *time* of a timer-recorded session is not allowed (delete and re-add instead). Notes, reflections and subject are editable.
- Monthly subject targets are derived from the weekly target.
- Drag-and-drop is replaced by steppers and time fields, which are more reliable and accessible.
- Tested: domain, sync and storage logic (unit and integration tests), SQL policies and the full TypeScript check. UI behaviour and notification delivery depend on your device; please report anything odd.

---

## Contributing notes

Colours only come from the theme (`npm run lint` enforces it), mutations only go through `src/state/actions.ts`, touch targets are at least 48 dp, controls have accessibility labels, and every screen has explicit empty, loading and error states. Run `npm run test:all` and `npm run typecheck` before committing.
