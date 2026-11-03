// Real-browser tests for the web alert layer: runs the REAL watcher, Web Audio synth, service worker and notification code in
// headless Chromium (only react-native is swapped for a stub). Run:  node tests/browser/alerts.browser.mjs
// What this cannot prove: how a specific phone's OS treats a frozen tab, or iOS Safari behaviour. See README → Alerts.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tools = process.env.NPM_TOOLS ?? '/opt/npm-tools/node_modules';
const esbuild = require(path.join(tools, 'esbuild'));
const { chromium } = require(path.join(tools, 'playwright'));

const outDir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'rhythm-alerts-'));
await esbuild.build({
  entryPoints: [path.join(root, 'tests/browser/alerts-entry.ts')], bundle: true, format: 'iife', outfile: path.join(outDir, 'bundle.js'), target: 'es2020', logLevel: 'error',
  nodePaths: [tools], resolveExtensions: ['.web.ts', '.web.tsx', '.ts', '.tsx', '.js'], alias: { 'react-native': path.join(root, 'tests/browser/rn-shim.ts') },
});
fs.copyFileSync(path.join(root, 'public/sw.js'), path.join(outDir, 'sw.js'));
for (const f of ['icon-192.png', 'badge-96.png']) fs.copyFileSync(path.join(root, 'public', f), path.join(outDir, f));
fs.writeFileSync(path.join(outDir, 'index.html'), '<!doctype html><html><head><title>Rhythm</title></head><body><button id="b">tap</button><script src="/bundle.js"></script></body></html>');
const server = http.createServer((req, res) => {
  const f = path.join(outDir, req.url === '/' || !fs.existsSync(path.join(outDir, req.url.split('?')[0])) ? 'index.html' : req.url.split('?')[0]);
  const type = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://localhost:${server.address().port}`;

const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok, extra }); };

const initScript = () => {
  // Headless Chromium reports Notification.permission 'denied' and refuses showNotification even when the permission is granted,
  // so the display call is recorded instead. This verifies WHEN we notify and WITH WHAT, not that the OS draws it.
  window.__shown = [];
  Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
  ServiceWorkerRegistration.prototype.showNotification = async function (title, opts) { window.__shown.push({ title, ...opts }); };
  window.__osc = 0; window.__wl = { req: 0, rel: 0 }; window.__wlS = [];
  const co = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () { window.__osc++; return co.apply(this, arguments); };
  if (navigator.wakeLock) {
    const rq = navigator.wakeLock.request.bind(navigator.wakeLock);
    navigator.wakeLock.request = async (t) => { window.__wl.req++; const s = await rq(t); window.__wlS.push(s); return s; };
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.grantPermissions(['notifications', 'screen-wake-lock'], { origin });
await ctx.addInitScript(initScript);

async function boot(page) {
  await page.goto(origin + '/');
  await page.evaluate(async () => {
    const R = window.R;
    window.__taps = [];
    R.notifications.initNotifications((d) => window.__taps.push(d));
    R.store.set((s) => ({ ready: true, data: { ...s.data, notif: { ...s.data.notif, enabled: true, breaks: true }, prefs: { ...s.data.prefs, timer: { ...s.data.prefs.timer, breakReminders: true } } } }));
    await R.startAlertWatcher();
    await navigator.serviceWorker.ready;
  });
}
const setHidden = (page, hidden) => page.evaluate((h) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
  document.hasFocus = () => !h;
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);
const startPomo = (page, id, focusMs = 1500, breakMs = 1500, ago = 0) => page.evaluate(({ id, focusMs, breakMs, ago }) => {
  const R = window.R; const now = Date.now() - ago;
  R.store.set({ timer: R.startTimer({ mode: 'pomodoro', focusMs, breakMs, subjectId: null, occurrenceKey: null, taskId: null }, id, now) });
}, { id, focusMs, breakMs, ago });
const notifTitles = (page) => page.evaluate(() => window.__shown.map((n) => n.title));
const clearNotifs = (page) => page.evaluate(() => { window.__shown.length = 0; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 1. every sound renders audibly, bounded, and silent afterwards (offline render of the real synth) ---------- */
{
  const page = await ctx.newPage(); await boot(page);
  const rows = await page.evaluate(async () => {
    const R = window.R; const out = [];
    for (const id of R.SOUND_IDS) for (const kind of ['focus_done', 'break_done']) {
      const spec = R.soundForEvent(id, kind); const rate = 22050; const secs = Math.ceil(R.soundLength(spec)) + 2;
      const c = new OfflineAudioContext(1, rate * secs, rate);
      const g = c.createGain(); g.gain.value = 1; g.connect(c.destination);
      R.scheduleSound(c, g, spec, 0);
      const buf = (await c.startRendering()).getChannelData(0);
      let peak = 0, tailPeak = 0; const tailFrom = Math.floor((R.soundLength(spec) + 0.2) * rate);
      for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; if (i > tailFrom && a > tailPeak) tailPeak = a; }
      out.push({ id, kind, peak, tailPeak });
    }
    return out;
  });
  for (const r of rows) check(`sound ${r.id}/${r.kind}: audible (peak ${r.peak.toFixed(2)}), no clipping, silent after it ends`, r.peak > 0.08 && r.peak <= 1 && r.tailPeak < 0.001);
  await page.close();
}

/* ---------- 2. audio is locked until a gesture, then unlocks ---------- */
{
  const page = await ctx.newPage(); await boot(page);
  const before = await page.evaluate(() => window.R.alerts.audioStatus());
  await page.click('#b');
  await wait(200);
  const after = await page.evaluate(() => window.R.alerts.audioStatus());
  check('audio starts locked (browser autoplay policy) and unlocks after the first tap', before === 'needs-tap' && after === 'ready', `${before} -> ${after}`);
  await page.close();
}

/* ---------- 3. foreground: pomodoro boundary → on-screen alert + sound, no system notification ---------- */
const page = await ctx.newPage(); await boot(page); await page.click('#b'); await wait(150);
await page.evaluate(() => window.R.store.set({ alertPrefs: { ...window.R.DEFAULT_ALERT_PREFS, repeat: 3, vibrate: false } }));
await startPomo(page, 'fg-1');
await wait(2200);
{
  const st = await page.evaluate(() => ({ alert: window.R.store.get().alert, osc: window.__osc }));
  check('foreground: focus-complete alert raised on time, not marked late', st.alert?.kind === 'focus_done' && st.alert.late === false && /Focus complete/.test(st.alert.title), JSON.stringify(st.alert));
  check('foreground: chime scheduled 3× (chime = 4 notes × 3 voices × 3 repeats = 36 oscillators)', st.osc === 36, `osc=${st.osc}`);
  check('foreground: no redundant system notification while the page is in front', (await notifTitles(page)).length === 0);
}
await wait(1500);
{
  const st = await page.evaluate(() => window.R.store.get().alert);
  check('foreground: next boundary (break over) replaces the card', st?.kind === 'break_done' && st.title === 'Break over', JSON.stringify(st));
}
await page.evaluate(() => { window.R.dismissAlert(); window.R.store.set({ timer: null }); });
check('dismiss clears the alert', (await page.evaluate(() => window.R.store.get().alert)) === null);

/* ---------- 4. hidden tab: system notification via the service worker + flashing title ---------- */
await clearNotifs(page);
await setHidden(page, true);
await startPomo(page, 'bg-1');
await wait(2200);
{
  const titles = await notifTitles(page);
  check('hidden tab: system notification shown through the service worker', titles.includes('Focus complete'), JSON.stringify(titles));
  const n = await page.evaluate(() => window.__shown[0]);
  check('hidden tab: notification carries tag, route data, icon and body', n && n.tag === 'timer:bg-1:focus_done:1' && n.data?.type === 'timer' && /break/i.test(n.body) && n.icon === '/icon-192.png' && n.requireInteraction === true && n.silent === false, JSON.stringify(n));
  await wait(1100);
  const titleSeen = await page.evaluate(() => new Promise((res) => { const seen = new Set(); let i = 0; const iv = setInterval(() => { seen.add(document.title); if (++i > 12) { clearInterval(iv); res([...seen]); } }, 200); }));
  check('hidden tab: tab title flashes the alert and shows the live countdown otherwise', titleSeen.some((t) => /Focus complete|Break over/.test(t)) && titleSeen.some((t) => /Rhythm/.test(t)), JSON.stringify(titleSeen));
  await setHidden(page, false);
  await wait(300);
  const t2 = await page.evaluate(() => document.title);
  check('returning to the tab stops the flashing', !/Focus complete|Break over/.test(t2), t2);
}
await page.evaluate(() => { window.R.dismissAlert(); window.R.store.set({ timer: null }); });
await wait(200);
check('title is restored when no timer is running', (await page.evaluate(() => document.title)) === 'Rhythm');

/* ---------- 5. settings that must be honoured ---------- */
await clearNotifs(page); await setHidden(page, true);
await page.evaluate(() => window.R.store.set((s) => ({ data: { ...s.data, notif: { ...s.data.notif, breaks: false } } })));
await startPomo(page, 'off-1', 1000, 1000);
await wait(1800);
check('"Breaks & focus complete" off: no system notification (card still shows)', (await notifTitles(page)).length === 0 && (await page.evaluate(() => window.R.store.get().alert?.kind)) === 'focus_done');
await page.evaluate(() => { window.R.dismissAlert(); window.R.store.set((s) => ({ timer: null, data: { ...s.data, notif: { ...s.data.notif, breaks: true } } })); });
{
  const before = await page.evaluate(() => window.__osc);
  await setHidden(page, false);
  await page.evaluate(() => window.R.store.set({ alertPrefs: { ...window.R.DEFAULT_ALERT_PREFS, sound: false } }));
  await startPomo(page, 'mute-1', 1000, 1000);
  await wait(1800);
  const st = await page.evaluate(() => ({ a: window.R.store.get().alert?.kind, osc: window.__osc }));
  check('sound off: alert card shows but no audio is produced', st.a === 'focus_done' && st.osc === before, `osc ${before}->${st.osc}`);
  await page.evaluate(() => { window.R.dismissAlert(); window.R.store.set({ timer: null, alertPrefs: { ...window.R.DEFAULT_ALERT_PREFS, vibrate: false } }); });
}

/* ---------- 6. pause stops the clock; late discovery is silent; reload does not replay ---------- */
{
  await page.evaluate(() => window.R.store.set({ alert: null }));
  const before = await page.evaluate(() => window.__osc);
  await startPomo(page, 'pause-1', 1500, 1500);
  await wait(600);
  await page.evaluate(() => { const R = window.R; R.store.set({ timer: R.pause(R.store.get().timer, Date.now()) }); });
  await wait(2200);
  const st = await page.evaluate(() => ({ a: window.R.store.get().alert, osc: window.__osc }));
  check('paused timer never alerts, however long it stays paused', st.a === null && st.osc === before);
  await page.evaluate(() => window.R.store.set({ timer: null }));

  await startPomo(page, 'late-1', 25 * 60_000, 5 * 60_000, 26 * 60_000); // focus ended a minute ago
  await wait(300);
  const late = await page.evaluate(() => ({ a: window.R.store.get().alert, osc: window.__osc }));
  check('late: boundary noticed a minute after the fact → silent banner, no sound', late.a?.late === true && late.a.kind === 'focus_done' && late.osc === before, JSON.stringify(late.a));
  await page.evaluate(() => window.R.store.set({ timer: null, alert: null }));

  await startPomo(page, 'reload-1', 1000, 1000);
  await wait(1500);
  await page.evaluate(() => window.R.store.set({ alert: null }));
  const saved = await page.evaluate(() => JSON.stringify(window.R.store.get().timer));
  await page.reload(); await boot(page);
  await page.evaluate((t) => window.R.store.set({ timer: JSON.parse(t) }), saved);
  await wait(500);
  const replay = await page.evaluate(() => window.R.store.get().alert);
  check('reload mid-timer does not replay a boundary that was already shown', replay === null || replay.id !== 'reload-1:focus_done:1', JSON.stringify(replay));
  await page.evaluate(() => window.R.store.set({ timer: null, alert: null }));
}

/* ---------- 7. two tabs, one timer: sound and notification happen once ---------- */
{
  await clearNotifs(page);
  await page.evaluate(() => window.R.store.set({ alertPrefs: { ...window.R.DEFAULT_ALERT_PREFS, repeat: 1, vibrate: false } }));
  const page2 = await ctx.newPage(); await boot(page2); await page2.click('#b');
  await page2.evaluate(() => window.R.store.set({ alertPrefs: { ...window.R.DEFAULT_ALERT_PREFS, repeat: 1, vibrate: false } }));
  await page.bringToFront(); await page.click('#b');
  const o1 = await page.evaluate(() => window.__osc), o2 = await page2.evaluate(() => window.__osc);
  await Promise.all([startPomo(page, 'dup-1', 1200, 1200), startPomo(page2, 'dup-1', 1200, 1200)]);
  await wait(2000);
  const d1 = (await page.evaluate(() => window.__osc)) - o1, d2 = (await page2.evaluate(() => window.__osc)) - o2;
  check('two tabs: the chime plays in exactly one of them (12 oscillators total for one play)', d1 + d2 === 12, `tab1 ${d1}, tab2 ${d2}`);
  const a1 = await page.evaluate(() => window.R.store.get().alert?.kind), a2 = await page2.evaluate(() => window.R.store.get().alert?.kind);
  check('two tabs: both still show the on-screen alert', a1 === 'focus_done' && a2 === 'focus_done', `${a1}/${a2}`);
  const titles = await notifTitles(page);
  check('two tabs: at most one system notification', titles.filter((t) => t === 'Focus complete').length <= 1, JSON.stringify(titles));
  await page.evaluate(() => { window.R.dismissAlert(); window.R.store.set({ timer: null }); });
  await page2.close();
}

/* ---------- 8. wake lock, notification tap routing, test alert ---------- */
{
  await page.bringToFront();
  const held = () => page.evaluate(() => ({ req: window.__wl.req, held: window.__wlS.filter((x) => !x.released).length }));
  const w0 = await held();
  await startPomo(page, 'wl-1', 20_000, 5_000);
  await wait(500);
  const w1 = await held();
  await page.evaluate(() => window.R.store.set({ timer: null }));
  await wait(500);
  const w2 = await held();
  check('screen wake lock is taken when a timer runs and released when it ends', w1.req === w0.req + 1 && w1.held === 1 && w2.held === 0, JSON.stringify({ w0, w1, w2 }));

  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'rhythm-notification-click', data: { type: 'timer', id: 'x' } } })));
  check('a notification tap relayed by the service worker reaches the app router', JSON.stringify(await page.evaluate(() => window.__taps.at(-1))) === '{"type":"timer","id":"x"}');

  await clearNotifs(page); await setHidden(page, true);
  await page.evaluate(() => window.R.testAlert(1));
  await wait(1700);
  check('"Test alert" runs the real path: card + system notification when the tab is hidden', (await notifTitles(page)).includes('Test alert') && (await page.evaluate(() => window.R.store.get().alert?.kind)) === 'test');
  await setHidden(page, false);
}

await browser.close(); server.close();
let bad = 0;
for (const r of results) { console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `   [${r.extra ?? ''}]`}`); if (!r.ok) bad++; }
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
