import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Repo } from '../src/data/repo';
import { MemoryBackend } from '../src/data/memoryBackend';
import { SqliteBackend } from '../src/data/sqliteBackend';
import { openMemoryDriver } from './helpers/nodeDriver';
import { FakePersistence } from './helpers/fakePersistence';
import { session, task, subjects, DSA } from './factories';
import { SEED_EPOCH } from '../src/domain/defaults';
import type { Backend } from '../src/data/backend';

/** The same scripted scenario must give identical observable results on SQLite (mobile) and memory+IndexedDB-style persistence (web). */
const makers: Record<string, () => Backend> = {
  sqlite: () => new SqliteBackend(openMemoryDriver()),
  web: () => new MemoryBackend(new FakePersistence()),
};

async function scenario(b: Backend) {
  let now = 1000;
  const repo = new Repo(b, () => now);
  await repo.init();
  const out: unknown[] = [];
  const s1 = session({ date: '2026-10-20', id: 'a1' }); const s2 = session({ date: '2026-10-25', id: 'a2' }); const s3 = session({ date: '2026-11-02', id: 'a3' });
  await repo.put('sessions', [s1, s2, s3]);
  now = 2000;
  await repo.put('sessions', { ...s2, note: 'v2', updatedAt: '2026-10-26T00:00:00.000Z' });
  out.push((await repo.between('sessions', '2026-10-21', '2026-10-31')).map((x) => [x.id, x.note]));
  out.push((await repo.outbox()).map((o) => [o.entityId, o.createdAt, o.status, o.attempts]));
  await repo.softDelete('sessions', 'a1', '2026-10-27T00:00:00.000Z');
  out.push((await repo.all('sessions')).map((x) => x.id).sort());
  out.push((await repo.all('sessions', { includeDeleted: true })).map((x) => x.id).sort());
  const op = (await repo.outbox())[0]!;
  await repo.saveOpFailure({ ...op, attempts: 3, lastError: 'boom', nextAttemptAt: 9999, status: 'failed' });
  out.push(await repo.outboxCounts());
  out.push(await repo.retryFailed(), await repo.outboxCounts());
  await repo.completeOp((await repo.outbox())[0]!);
  out.push((await repo.outbox()).length);
  await repo.kvSet('k', 'v'); await repo.kvSet('k', 'v2'); out.push(await repo.kvGet('k'), await repo.kvGet('missing'));
  await repo.kvDelete('k'); out.push(await repo.kvGet('k'));
  for (let i = 0; i < 205; i++) await repo.logConflict('sessions', `x${i}`, '2026-10-28T00:00:00.000Z', { w: i }, { l: i });
  const log = await repo.conflictLog(500);
  out.push(log.length, log[0]!.entityId, log[log.length - 1]!.entityId);
  const t = task({ id: 't1', updatedAt: SEED_EPOCH });
  await repo.put('tasks', t, { enqueue: false });
  out.push(await repo.purgeUntouchedSeeds('tasks'), (await repo.all('tasks')).length);
  await repo.put('subjects', subjects(), { enqueue: false });
  out.push(await repo.enqueueAll() >= 0);
  await repo.wipe(['theme']);
  out.push((await repo.all('sessions')).length, (await repo.outbox()).length, await repo.kvGet('schema_version'));
  return out;
}

test('backend parity: SQLite and web (memory + durable store) produce identical results', async () => {
  const a = await scenario(makers.sqlite!()); const b = await scenario(makers.web!());
  assert.deepEqual(b, a);
});

test('web backend: a failed durable commit rolls the transaction back completely', async () => {
  const disk = new FakePersistence();
  const repo = new Repo(new MemoryBackend(disk)); await repo.init();
  const s = session({ id: 'r1', date: '2026-10-28' });
  disk.failNextCommit = true;
  await assert.rejects(repo.put('sessions', s), /disk full/);
  assert.equal((await repo.all('sessions')).length, 0, 'memory rolled back');
  assert.equal((await repo.outbox()).length, 0, 'no queued op without its data');
  await repo.put('sessions', s);
  assert.equal((await repo.all('sessions')).length, 1);
});

test('web backend: data survives a restart (new backend over the same durable store)', async () => {
  const disk = new FakePersistence();
  const r1 = new Repo(new MemoryBackend(disk)); await r1.init();
  await r1.put('sessions', session({ id: 'p1', date: '2026-10-28' })); await r1.kvSet('cursor:sessions', 'c1');
  for (let i = 0; i < 3; i++) await r1.logConflict('sessions', `c${i}`, '2026-10-28T00:00:00.000Z', {}, {});
  const r2 = new Repo(new MemoryBackend(disk)); await r2.init();
  assert.equal((await r2.get('sessions', 'p1'))?.id, 'p1');
  assert.equal((await r2.outbox()).length, 1);
  assert.equal(await r2.kvGet('cursor:sessions'), 'c1');
  await r2.logConflict('sessions', 'c3', '2026-10-28T00:00:00.000Z', {}, {});
  assert.deepEqual((await r2.conflictLog()).map((c) => c.entityId), ['c3', 'c2', 'c1', 'c0'], 'conflict ids continue after restart');
});

test('web backend: concurrent transactions are serialised and never interleave', async () => {
  const repo = new Repo(new MemoryBackend(new FakePersistence())); await repo.init();
  await Promise.all(Array.from({ length: 30 }, (_, i) => repo.put('sessions', session({ id: `c${i}`, date: '2026-10-28' }))));
  assert.equal((await repo.all('sessions')).length, 30);
  assert.equal((await repo.outbox()).length, 30);
});

test('web backend: another tab\'s commit triggers a reload and notifies listeners', async () => {
  const disk = new FakePersistence();
  const tabA = new MemoryBackend(disk); const tabB = new MemoryBackend(disk);
  disk.peers.add(disk); // announce() reaches every subscriber of the shared store
  const a = new Repo(tabA); const b = new Repo(tabB); await a.init(); await b.init();
  let notified = 0; b.onExternalChange(() => { notified++; });
  await a.put('sessions', session({ id: 'x1', date: '2026-10-28' }));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(notified >= 1);
  assert.equal((await b.get('sessions', 'x1'))?.id, 'x1');
});
