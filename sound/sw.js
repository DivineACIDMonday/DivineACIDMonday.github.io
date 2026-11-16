// Divine Sound Machine: keeps this one page on the phone so it also opens without internet.
// With internet it always fetches the newest version first; only this app is stored, nothing else.
const C = 'dsm-v5', FILES = ['./', './icon-180.png', './icon-192.png', './icon-512.png', './manifest.webmanifest'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('dsm-') && k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin || !u.pathname.startsWith('/sound/')) return;
  const key = r.mode === 'navigate' || u.pathname === '/sound/index.html' ? './' : r;
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(C).then((c) => c.put(key, cp)); } return res; }).catch(() => caches.match(key).then((m) => m || caches.match('./'))));
});
