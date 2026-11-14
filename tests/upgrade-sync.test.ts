import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend } from './helpers/storage';
import { FakeCloud } from './helpers/fakeCloud';
import { Repo } from '../src/data/repo';
import { SyncEngine } from '../src/data/syncEngine';
import { applyDefaultsV2, applyDesignV3 } from '../src/data/upgrade';
import { CLOUD_TABLE } from '../src/domain/sync';
import { DEFAULTS_V2_KEY, SEED_EPOCH, buildDefaultPlans, buildDefaultPreferences, subjectId } from '../src/domain/defaults';
import { resolveDay } from '../src/domain/schedule';
import { studyDay } from '../src/domain/study';
import { legacySubjects, legacyTemplates } from './legacy-defaults';
import { session } from './factories';

const stamp = <T extends { createdAt: string; updatedAt: string }>(e: T): T => ({ ...e, createdAt: SEED_EPOCH, updatedAt: SEED_EPOCH });
const COMM = subjectId('english');
const NOW = new Date('2026-10-31T06:00:00.000Z'); // Saturday 11:30 IST

/** A device that was seeded by the v1 app: untouched defaults (never uploaded) plus one real session. */
async function v1Device(cloud: FakeCloud) {
  const repo = new Repo(makeBackend(), () => NOW.getTime());
  await repo.init();
  await repo.put('subjects', legacySubjects(SEED_EPOCH).map(stamp), { enqueue: false });
  await repo.put('plans', buildDefaultPlans(SEED_EPOCH).map(stamp), { enqueue: false });
  await repo.put('templates', legacyTemplates('2026-10-01', SEED_EPOCH).map(stamp), { enqueue: false });
  await repo.put('preferences', stamp({ ...buildDefaultPreferences(SEED_EPOCH), theme: 'dark' as const, dailyStudyTargetMin: 480, weeklyStudyTargetMin: 3360 }), { enqueue: false });
  await repo.kvSet('seeded', '1');
  const old = session({ date: '2026-10-20', subjectId: COMM, minutes: 40 });
  await repo.put('sessions', old);
  const engine = new SyncEngine(repo, cloud.client(), { now: () => NOW.getTime(), random: () => 0 });
  return { repo, engine, old };
}

test('upgrade on a v1 install: persisted locally, history intact, flag set', async () => {
  const { repo, old } = await v1Device(new FakeCloud());
  await applyDefaultsV2(repo, NOW);
  const subjects = await repo.all('subjects');
  assert.deepEqual(subjects.filter((s) => !s.archived).map((s) => s.name).sort(), ['AI/ML', 'Communication', 'DSA', 'RBI Preparation']);
  assert.equal(subjects.find((s) => s.name === 'Backend Development')!.archived, true);
  assert.equal((await repo.get('preferences', 'preferences'))!.dailyStudyTargetMin, 390);
  // The timetable is no longer part of the app: the upgrade leaves any stored timetable data exactly as it was.
  const templates = await repo.all('templates');
  assert.equal(templates.filter((t) => !t.deletedAt && t.effectiveTo === null).length, legacyTemplates('2026-10-01', SEED_EPOCH).length, 'no timetable rows added, closed or rewritten');
  assert.equal(resolveDay('2026-11-02', templates, []).length, resolveDay('2026-11-02', legacyTemplates('2026-10-01', SEED_EPOCH), []).length, 'old timetable untouched');
  assert.equal((await repo.get('sessions', old.id))!.focusSec, 40 * 60, 'session untouched');
  assert.equal(await repo.kvGet(DEFAULTS_V2_KEY), '1');
});

test('upgrade is idempotent: a second run (e.g. next launch) changes nothing and adds no duplicates', async () => {
  const { repo } = await v1Device(new FakeCloud());
  await applyDefaultsV2(repo, NOW);
  const before = JSON.stringify([(await repo.all('templates')).length, (await repo.all('subjects')).length, (await repo.outbox()).length]);
  await applyDefaultsV2(repo, NOW);
  assert.equal(JSON.stringify([(await repo.all('templates')).length, (await repo.all('subjects')).length, (await repo.outbox()).length]), before);
  // even with the flag cleared, the planner sees v2 rows and does nothing
  await repo.kvDelete(DEFAULTS_V2_KEY);
  await applyDefaultsV2(repo, NOW);
  assert.equal(JSON.stringify([(await repo.all('templates')).length, (await repo.all('subjects')).length]), JSON.stringify(JSON.parse(before).slice(0, 2)));
});

test('upgrade syncs to Supabase and a second device converges on the same subjects and sessions', async () => {
  const cloud = new FakeCloud();
  const a = await v1Device(cloud);
  await applyDefaultsV2(a.repo, NOW);
  const st = await a.engine.syncNow();
  assert.equal(st.state, 'idle'); assert.equal(st.pending, 0);
  const subs = cloud.rows(CLOUD_TABLE.subjects);
  assert.equal(subs.find((r) => r.id === COMM)!.name, 'Communication'); assert.equal(subs.find((r) => r.id === COMM)!.daily_target_min, 30);
  assert.equal(cloud.rows(CLOUD_TABLE.sessions).length, 1);

  const repoB = new Repo(makeBackend(), () => NOW.getTime());
  await repoB.init();
  const b = new SyncEngine(repoB, cloud.client(), { now: () => NOW.getTime(), random: () => 0 });
  await b.syncNow();
  const bt = await repoB.all('templates');
  assert.equal(new Set(bt.map((t) => t.id)).size, bt.length, 'no duplicate timetable rows');
  const subjectsB = await repoB.all('subjects');
  const day = studyDay('2026-10-20', subjectsB, await repoB.all('sessions'), { ...buildDefaultPreferences(NOW.toISOString()), targetHistory: [] });
  assert.equal(day.rows.find((r) => r.subjectId === COMM)!.actualSec, 40 * 60, 'old English Speaking time counts for Communication');
});

test('a session saved twice (double tap / retry / two devices) is stored once', async () => {
  const cloud = new FakeCloud();
  const { repo, engine } = await v1Device(cloud);
  const s = session({ date: '2026-10-31', subjectId: subjectId('dsa'), minutes: 30 });
  await repo.put('sessions', s); await repo.put('sessions', s);
  await engine.syncNow(); await engine.syncNow();
  assert.equal(cloud.rows(CLOUD_TABLE.sessions).filter((r) => r.id === s.id).length, 1);
  assert.equal((await repo.all('sessions')).filter((x) => x.id === s.id).length, 1);
});

test('design v3: an untouched dark default switches to light exactly once; a later dark choice is respected', async () => {
  const { repo } = await v1Device(new FakeCloud());
  assert.equal((await repo.get('preferences', 'preferences'))!.theme, 'dark');
  assert.equal(await applyDesignV3(repo, NOW), true);
  assert.equal((await repo.get('preferences', 'preferences'))!.theme, 'light');
  const p = (await repo.get('preferences', 'preferences'))!;
  await repo.put('preferences', { ...p, theme: 'dark', updatedAt: new Date(NOW.getTime() + 1000).toISOString() });
  assert.equal(await applyDesignV3(repo, NOW), false);
  assert.equal((await repo.get('preferences', 'preferences'))!.theme, 'dark');
});
