import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend } from './helpers/storage';
import { FakeCloud } from './helpers/fakeCloud';
import { Repo } from '../src/data/repo';
import { SyncEngine, normalizeRemote } from '../src/data/syncEngine';
import { session, task, subjects, DSA, NOW_ISO } from './factories';
import { toSession } from '../src/domain/sessions';
import type { StudySession } from '../src/domain/types';

async function device(cloud: FakeCloud, t0 = 1_000_000) {
  let now = t0;
  const repo = new Repo(makeBackend(), () => now);
  await repo.init();
  const engine = new SyncEngine(repo, cloud.client(), { now: () => now, random: () => 0 });
  return { repo, engine, tick: (ms: number) => { now += ms; }, setNow: (n: number) => { now = n; } };
}
const iso = (ms: number) => new Date(ms).toISOString();

test('repo: put stores the entity and queues exactly one op per entity (coalesced)', async () => {
  const { repo } = await device(new FakeCloud());
  const s = session({ date: '2026-10-28' });
  await repo.put('sessions', s);
  await repo.put('sessions', { ...s, note: 'edited', updatedAt: iso(Date.parse(s.updatedAt) + 1000) });
  const q = await repo.outbox();
  assert.equal(q.length, 1);
  assert.equal((q[0]!.payload as unknown as StudySession).note, 'edited');
  assert.equal((await repo.get('sessions', s.id))?.note, 'edited');
});

test('repo: date-range query uses the indexed date column and ignores tombstones', async () => {
  const { repo } = await device(new FakeCloud());
  const a = session({ date: '2026-10-01' }), b = session({ date: '2026-10-15' }), c = session({ date: '2026-11-02' });
  await repo.put('sessions', [a, b, c]);
  await repo.softDelete('sessions', b.id, NOW_ISO);
  const got = await repo.between('sessions', '2026-10-01', '2026-10-31');
  assert.deepEqual(got.map((x) => x.id), [a.id]);
  assert.equal((await repo.all('sessions', { includeDeleted: true })).length, 3);
});

test('sync: queued changes reach the cloud with snake_case + user_id and the queue empties', async () => {
  const cloud = new FakeCloud(); const d = await device(cloud);
  const s = session({ date: '2026-10-28' });
  await d.repo.put('sessions', s);
  const st = await d.engine.syncNow();
  assert.equal(st.state, 'idle'); assert.equal(st.pending, 0);
  const row = cloud.rows('study_sessions')[0]!;
  assert.equal(row.user_id, 'user-1'); assert.equal(row.focus_sec, s.focusSec); assert.equal(row.started_at, s.startedAt);
});

test('offline: nothing is lost, status is offline, and data syncs once the network returns', async () => {
  const cloud = new FakeCloud(); const d = await device(cloud);
  cloud.offline = true;
  await d.repo.put('sessions', session({ date: '2026-10-28' }));
  let st = await d.engine.syncNow();
  assert.equal(st.state, 'offline'); assert.equal(st.pending, 1);
  assert.equal((await d.repo.all('sessions')).length, 1);
  cloud.offline = false;
  st = await d.engine.syncNow();
  assert.equal(st.state, 'idle'); assert.equal(st.pending, 0);
  assert.equal(cloud.rows('study_sessions').length, 1);
});

test('retries never create duplicate sessions (same id upserts the same row)', async () => {
  const cloud = new FakeCloud(); const d = await device(cloud);
  const s = session({ date: '2026-10-28' });
  await d.repo.put('sessions', s);
  // Request succeeds server-side but the client never hears back → op stays queued → resent.
  const real = cloud.client().upsert;
  let first = true;
  const flaky = { ...cloud.client(), upsert: async (...a: Parameters<typeof real>) => { await real(...a); if (first) { first = false; throw { message: 'Network request failed' }; } } };
  const engine = new SyncEngine(d.repo, flaky, { now: () => 1_000_000, random: () => 0 });
  await engine.syncNow(); // lost response
  assert.equal((await d.repo.outbox()).length, 1);
  await engine.syncNow(); // retry
  assert.equal((await d.repo.outbox()).length, 0);
  assert.equal(cloud.rows('study_sessions').length, 1);
});

test('permanent rejection isolates the bad row; good rows sync; failed row is kept and retryable', async () => {
  const cloud = new FakeCloud(); const d = await device(cloud);
  const [a, b, c] = [session({ date: '2026-10-28' }), session({ date: '2026-10-28', startMin: 700 }), session({ date: '2026-10-28', startMin: 900 })];
  await d.repo.put('sessions', [a, b, c]);
  cloud.rejectIds.add(b.id);
  let st = await d.engine.syncNow();
  assert.equal(cloud.rows('study_sessions').length, 2);
  assert.equal(st.state, 'error'); assert.equal(st.failed, 1);
  const q = await d.repo.outbox();
  assert.equal(q[0]!.entityId, b.id); assert.equal(q[0]!.status, 'failed');
  assert.ok(q[0]!.lastError);
  assert.equal((await d.repo.get('sessions', b.id))?.id, b.id, 'local copy preserved');
  cloud.rejectIds.clear();
  st = await d.engine.retryFailed();
  assert.equal(st.failed, 0); assert.equal(cloud.rows('study_sessions').length, 3);
});

test('5xx: ops stay pending with exponential backoff, then succeed', async () => {
  const cloud = new FakeCloud(); const d = await device(cloud, 1_000_000);
  await d.repo.put('tasks', task({ title: 'x' }));
  cloud.server5xx = true;
  await d.engine.syncNow();
  const q1 = (await d.repo.outbox())[0]!;
  assert.equal(q1.status, 'pending'); assert.equal(q1.attempts, 1); assert.ok(q1.nextAttemptAt > 1_000_000);
  cloud.server5xx = false;
  const calls = cloud.upsertCalls;
  await d.engine.syncNow(); // still inside backoff window → not attempted
  assert.equal(cloud.upsertCalls, calls);
  d.tick(60_000);
  await d.engine.syncNow();
  assert.equal((await d.repo.outbox()).length, 0);
});

test('expired token: refresh then resend once', async () => {
  const cloud = new FakeCloud(); const d = await device(cloud);
  await d.repo.put('tasks', task());
  cloud.expireTokenOnce = true;
  const st = await d.engine.syncNow();
  assert.equal(st.state, 'idle'); assert.equal(cloud.rows('tasks').length, 1);
});

test('an edit made while a push is in flight is not lost', async () => {
  const cloud = new FakeCloud(); const d = await device(cloud);
  const s = session({ date: '2026-10-28' });
  await d.repo.put('sessions', s);
  cloud.onUpsert = () => { cloud.onUpsert = null; void d.repo.put('sessions', { ...s, note: 'typed during sync', updatedAt: iso(Date.parse(s.updatedAt) + 5000) }); };
  await d.engine.syncNow();
  await new Promise((r) => setTimeout(r, 20));
  const q = await d.repo.outbox();
  assert.equal(q.length, 1, 'newer edit still queued');
  await d.engine.syncNow();
  assert.equal(cloud.rows('study_sessions')[0]!.note, 'typed during sync');
});

test('two devices: B receives A\'s data; timestamps are normalised so identical rows are no-ops', async () => {
  const cloud = new FakeCloud();
  const A = await device(cloud), B = await device(cloud);
  const s = session({ date: '2026-10-28' });
  await A.repo.put('sessions', s); await A.engine.syncNow();
  let changed: string[] = [];
  const eb = new SyncEngine(B.repo, cloud.client(), { now: () => 2_000_000, onRemoteChange: (k) => { changed = k; } });
  await eb.syncNow();
  assert.deepEqual(changed, ['sessions']);
  assert.deepEqual(await B.repo.get('sessions', s.id), s);
  changed = [];
  await eb.syncNow();
  assert.deepEqual(changed, [], 'second pull changes nothing');
});

test('conflict: concurrent offline edits resolve last-writer-wins and the loser is kept in the conflict log', async () => {
  const cloud = new FakeCloud();
  const A = await device(cloud), B = await device(cloud);
  const base = task({ title: 'Read chapter' });
  await A.repo.put('tasks', base); await A.engine.syncNow(); await B.engine.syncNow();
  const t1 = '2026-10-28T10:00:00.000Z', t2 = '2026-10-28T10:05:00.000Z';
  await A.repo.put('tasks', { ...base, title: 'A edit', updatedAt: t1 });
  await B.repo.put('tasks', { ...base, title: 'B edit (newer)', updatedAt: t2 });
  await B.engine.syncNow(); // B pushes first
  await A.engine.syncNow(); // A's push is stale → ignored; pull brings B's version
  assert.equal((await A.repo.get('tasks', base.id))?.title, 'B edit (newer)');
  const log = await A.repo.conflictLog();
  assert.equal(log.length >= 1, true);
  assert.equal((log[0]!.loser as { title: string }).title, 'A edit');
  assert.equal(cloud.rows('tasks')[0]!.title, 'B edit (newer)');
});

test('a row backdated by device clock skew is still pulled (cursor uses server_updated_at)', async () => {
  const cloud = new FakeCloud();
  const A = await device(cloud), B = await device(cloud);
  await A.repo.put('tasks', task({ title: 'first' })); await A.engine.syncNow();
  await B.engine.syncNow();
  const old = task({ title: 'backdated', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' });
  await A.repo.put('tasks', old); await A.engine.syncNow();
  await B.engine.syncNow();
  assert.equal((await B.repo.all('tasks')).some((t) => t.title === 'backdated'), true);
});

test('tombstones sync: a delete on one device removes the item on the other', async () => {
  const cloud = new FakeCloud();
  const A = await device(cloud), B = await device(cloud);
  const t = task({ title: 'temp' });
  await A.repo.put('tasks', t); await A.engine.syncNow(); await B.engine.syncNow();
  assert.equal((await B.repo.all('tasks')).length, 1);
  await A.repo.softDelete('tasks', t.id, '2026-10-28T12:00:00.000Z'); await A.engine.syncNow(); await B.engine.syncNow();
  assert.equal((await B.repo.all('tasks')).length, 0);
});

test('connect: first sign-in uploads existing offline data; a different account requires an explicit decision', async () => {
  const cloud = new FakeCloud(); cloud.signedIn = null;
  const d = await device(cloud);
  await d.repo.put('subjects', subjects());
  await d.repo.put('sessions', session({ date: '2026-10-28', subjectId: DSA }));
  await d.repo.outbox().then(async (q) => { for (const o of q) await d.repo.completeOp(o); }); // pretend earlier queue was cleared
  cloud.signedIn = 'user-1';
  assert.equal(await d.engine.connect('user-1'), 'connected');
  await d.engine.syncNow();
  assert.equal(cloud.rows('study_sessions').length, 1);
  assert.equal(cloud.rows('subjects').length, 5);
  // Different account on the same device:
  cloud.signedIn = 'user-2';
  assert.equal(await d.engine.connect('user-2'), 'needs_decision');
  assert.equal((await d.repo.all('sessions')).length, 1, 'nothing discarded while waiting for the decision');
  await d.repo.put('tasks', task()); // unsynced change exists
  await assert.rejects(() => d.engine.connect('user-2', 'replace'), /Unsynced/);
  assert.equal(await d.engine.connect('user-2', 'merge'), 'connected');
});

test('signed out: status reflects it and the queue keeps growing safely', async () => {
  const cloud = new FakeCloud(); cloud.signedIn = null;
  const d = await device(cloud);
  await d.repo.put('tasks', task());
  const st = await d.engine.syncNow();
  assert.equal(st.state, 'signed_out'); assert.equal(st.pending, 1);
});

test('normalizeRemote converts Postgres timestamps and leaves other fields alone', () => {
  const out = normalizeRemote({ updatedAt: '2026-10-28T11:00:00+00:00', startedAt: '2026-10-28T11:00:00.5+00:00', date: '2026-10-28', note: 'x', deletedAt: null });
  assert.equal(out.updatedAt, '2026-10-28T11:00:00.000Z'); assert.equal(out.startedAt, '2026-10-28T11:00:00.500Z');
  assert.equal(out.date, '2026-10-28'); assert.equal(out.deletedAt, null);
});

test('toSession output round-trips through SQLite JSON unchanged', async () => {
  const { repo } = await device(new FakeCloud());
  const s = toSession({ ...session({ date: '2026-10-28' }) } as never, NOW_ISO);
  await repo.put('sessions', s);
  assert.deepEqual(await repo.get('sessions', s.id), s);
});
