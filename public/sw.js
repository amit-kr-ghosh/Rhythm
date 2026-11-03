/* Rhythm service worker.
 *
 * Its jobs are deliberately small:
 *  1. Show notifications. Android Chrome (and installed PWAs) only allow `registration.showNotification`, not `new Notification()`.
 *  2. Route a tap on a notification back to the app (focus an open tab and tell it where to go, or open the app).
 *  3. Display Web Push messages if a push service is ever connected. Nothing sends them yet; the handler is here so adding a
 *     push sender later needs no client change.
 * It does not cache anything and does not intercept fetches, so it can never serve a stale app.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const ROUTES = { timer: '/focus', occurrence: '/', task: '/', habit: '/', goals: '/', summary: '/', quote: '/motivation' };

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.url || ROUTES[data.type] || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        await client.focus();
        client.postMessage({ type: 'rhythm-notification-click', data });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

self.addEventListener('push', (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch (e) { p = { title: 'Rhythm', body: event.data ? event.data.text() : '' }; }
  const title = p.title || 'Rhythm';
  event.waitUntil(self.registration.showNotification(title, {
    body: p.body || '', tag: p.tag || undefined, renotify: !!p.tag, icon: '/icon-192.png', badge: '/badge-96.png',
    vibrate: [200, 100, 200, 100, 400], requireInteraction: true, silent: false, data: p.data || {},
  }));
});
