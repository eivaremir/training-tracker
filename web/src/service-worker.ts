/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Makes the app installable and fast to reopen from the home screen.
// - Build assets are versioned by SvelteKit, so they're cached per deploy.
// - Page loads go to the network first (fresh deploys win), falling back to the cached shell offline.
// - API calls (another origin) are never touched.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `tt-${version}`;
const ASSETS = [...build, ...files.filter((f) => !f.endsWith('.DS_Store'))];

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([...ASSETS, '/'])).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== sw.location.origin) return;

  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(req)));
    return;
  }
  if (req.mode === 'navigate') {
    // SPA: every route is served by the same shell.
    event.respondWith(fetch(req).catch(async () => (await caches.match('/')) ?? Response.error()));
  }
});

// Routine reminders (Web Push). Payload: { title, body, url, tag }.
sw.addEventListener('push', (event) => {
  let data = { title: 'Training Tracker', body: 'Time to train.', url: '/today', tag: 'tt-reminder' };
  try { data = { ...data, ...(event.data?.json() ?? {}) }; } catch { /* plain-text payload */ }
  event.waitUntil(sw.registration.showNotification(data.title, {
    body: data.body, tag: data.tag, icon: '/icon-192.png', badge: '/favicon-32.png', data: { url: data.url }
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
