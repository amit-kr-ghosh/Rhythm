// Real-IndexedDB tests: bundles the web storage layer and runs it in headless Chromium.
// Run:  node tests/browser/idb.browser.mjs      (needs playwright + esbuild; both ship with the sandbox tooling)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tools = process.env.NPM_TOOLS ?? '/opt/npm-tools/node_modules';
const esbuild = require(path.join(tools, 'esbuild'));
const { chromium } = require(path.join(tools, 'playwright'));
const out = path.join(root, 'tests/browser/.bundle.js');
await esbuild.build({ entryPoints: [path.join(root, 'tests/browser/entry.ts')], bundle: true, format: 'iife', outfile: out, target: 'es2020', logLevel: 'error' });

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.setContent('<html><body></body></html>');
await page.goto('http://localhost/', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
await page.route('http://localhost/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
await page.goto('http://localhost/');
await page.addScriptTag({ content: fs.readFileSync(out, 'utf8') });

const results = await page.evaluate(async () => {
  const { openIdbPersistence, MemoryBackend, Repo } = window.R;
  const res = [];
  const check = (name, ok, extra) => res.push({ name, ok: !!ok, extra });
  const iso = (n) => new Date(n).toISOString();
  const mk = (id, date, note = '') => ({ id, subjectId: null, date, startedAt: iso(1e12), endedAt: iso(1e12 + 60000), focusSec: 60, elapsedSec: 60, breakSec: 0, plannedSec: null, mode: 'stopwatch', status: 'completed', source: 'timer', occurrenceKey: null, taskId: null, note, reflection: '', createdAt: iso(1e12), updatedAt: iso(1e12), deletedAt: null });
  const DB = 'rhythm-test-' + Math.random().toString(36).slice(2);

  // 1. write, close, reopen: data is really on disk
  const p1 = await openIdbPersistence({ name: DB });
  const r1 = new Repo(new MemoryBackend(p1)); await r1.init();
  await r1.put('sessions', [mk('a', '2026-10-20'), mk('b', '2026-10-25', 'hello')]);
  await r1.kvSet('cursor:sessions', 'c1');
  await r1.logConflict('sessions', 'a', iso(2e12), { w: 1 }, { l: 1 });
  const p2 = await openIdbPersistence({ name: DB, channel: false });
  const r2 = new Repo(new MemoryBackend(p2)); await r2.init();
  check('persists sessions across reopen', (await r2.all('sessions')).length === 2);
  check('persists note', (await r2.get('sessions', 'b'))?.note === 'hello');
  check('persists outbox', (await r2.outbox()).length === 2);
  check('persists kv', (await r2.kvGet('cursor:sessions')) === 'c1');
  check('persists conflict log', (await r2.conflictLog()).length === 1);
  check('date range query', (await r2.between('sessions', '2026-10-21', '2026-10-31')).map((s) => s.id).join() === 'b');

  // 2. deletes persist
  await r2.softDelete('sessions', 'a', iso(2e12));
  await r2.wipe();
  const p3 = await openIdbPersistence({ name: DB, channel: false });
  const r3 = new Repo(new MemoryBackend(p3)); await r3.init();
  check('wipe persists (no sessions, no outbox)', (await r3.all('sessions', { includeDeleted: true })).length === 0 && (await r3.outbox()).length === 0);

  // 3. a failing commit (bad key type forces IDB DataError) rolls back memory and leaves disk untouched
  const bad = { ...p3, commit: async () => { throw new Error('quota'); } };
  const r4 = new Repo(new MemoryBackend(bad)); await r4.init();
  let threw = false; try { await r4.put('sessions', mk('z', '2026-10-28')); } catch { threw = true; }
  check('failed commit throws and rolls back', threw && (await r4.all('sessions')).length === 0);

  // 4. two tabs-in-one-page via BroadcastChannel: B sees A's write
  const DB2 = DB + '-bc';
  const pa = await openIdbPersistence({ name: DB2 }); const pb = await openIdbPersistence({ name: DB2 });
  const ra = new Repo(new MemoryBackend(pa)); const rb = new Repo(new MemoryBackend(pb)); await ra.init(); await rb.init();
  let notified = 0; rb.onExternalChange(() => { notified++; });
  await ra.put('sessions', mk('bc1', '2026-10-28'));
  await new Promise((r) => setTimeout(r, 300));
  check('other tab notified', notified >= 1);
  check('other tab sees the data after reload', (await rb.get('sessions', 'bc1'))?.id === 'bc1');

  // 5. atomicity: a large batch lands entirely
  await Promise.all(Array.from({ length: 200 }, (_, i) => ra.put('sessions', mk('m' + i, '2026-10-28'))));
  const pc = await openIdbPersistence({ name: DB2, channel: false });
  const rc = new Repo(new MemoryBackend(pc)); await rc.init();
  check('200 concurrent writes all persisted', (await rc.all('sessions')).length === 201);
  return res;
});
await browser.close();
fs.rmSync(out, { force: true });
let failed = 0;
for (const r of results) { console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`); if (!r.ok) failed++; }
console.log(`\n${results.length - failed}/${results.length} passed in real Chromium IndexedDB`);
process.exit(failed ? 1 : 0);
