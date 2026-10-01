/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Makes the app installable and fast to reopen from the home screen.
// - Build assets are versioned by SvelteKit, so they're cached per deploy.
// - Page loads go to the network first (fresh deploys win), falling back to the cached shell offline.
// - Google Fonts are kept across deploys so the app keeps its type offline.
// - API calls (another origin) are never touched.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `tt-${version}`;
const FONTS = 'tt-fonts';
// iOS launch screens and store screenshots are only read when the app is installed, so they aren't precached.
const SKIP = /^\/(splash|screenshots)\/|\.DS_Store$/;
const ASSETS = [...build, ...files.filter((f) => !SKIP.test(f))];

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([...ASSETS, '/'])).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(font(event, url.hostname === 'fonts.gstatic.com'));
    return;
  }
  if (url.origin !== sw.location.origin) return;

  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(req)));
    return;
  }
  if (req.mode === 'navigate') {
    // SPA: every route is served by the same shell.
    event.respondWith(fetch(req).catch(async () => (await caches.match('/')) ?? Response.error()));
  }
});

/** Font files are immutable, so a cached copy always wins; the stylesheet is refreshed in the background. */
async function font(event: FetchEvent, immutable: boolean) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(event.request);
  const refresh = () => fetch(event.request).then(async (res) => {
    if (res.ok) await cache.put(event.request, res.clone());
    return res;
  });
  if (!hit) return refresh();
  if (!immutable) event.waitUntil(refresh().catch(() => {}));
  return hit;
}

// Routine reminders (Web Push). Payload: { title, body, url, tag }.
sw.addEventListener('push', (event) => {
  let data = { title: 'Training Tracker', body: 'Time to train.', url: '/today', tag: 'tt-reminder' };
  try { data = { ...data, ...(event.data?.json() ?? {}) }; } catch { /* plain-text payload */ }
  event.waitUntil(sw.registration.showNotification(data.title, {
    body: data.body, tag: data.tag, icon: '/icon-192.png', badge: '/badge-96.png', data: { url: data.url }
  }));
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/today', sw.location.origin).href;
  event.waitUntil((async () => {
    const wins = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).origin === sw.location.origin);
    if (win) { await win.focus(); return win.navigate(url); }
    return sw.clients.openWindow(url);
  })());
});
