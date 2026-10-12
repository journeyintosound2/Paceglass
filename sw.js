// Service worker: lets Paceglass open offline once it has been visited.
// Network first for the app's own files (so updates show up straight away when online),
// falling back to the cache when offline. Fonts are cached after first use.

const CACHE = 'paceglass-v6';
const SHELL = [
  './',
  'index.html',
  'admin.html',
  'css/styles.css',
  'css/admin.css',
  'js/admin.js',
  'js/app.js',
  'js/cloud.js',
  'js/codes.js',
  'js/firebase-config.js',
  'js/dates.js',
  'js/drinks.js',
  'js/drink-icons.js',
  'js/glass.js',
  'js/insights.js',
  'js/limits.js',
  'js/plan.js',
  'js/stats.js',
  'js/store.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (isFont) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 'no-cache' makes the browser check with GitHub Pages every time instead of reusing its own
  // copy for up to 10 minutes, so a new version shows up the next time the app is opened.
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))),
  );
});
