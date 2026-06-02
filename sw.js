// Simple offline-shell service worker. Caches the app files + CDN libs so the app
// opens even with no signal. Bump CACHE to force an update after editing files.
const CACHE = 'whatnot-pwa-v1';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/exifr/dist/full.umd.js',
  'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { mode: 'no-cors' })))).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  // Never cache image-upload requests (the relay) — always go to network.
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      // runtime-cache same-origin + the two CDN libs
      const copy = res.clone();
      caches.open(CACHE).then((c) => { try { c.put(e.request, copy); } catch (_) {} });
      return res;
    }).catch(() => hit))
  );
});
