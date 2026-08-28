const CACHE='boat-radar-v4';
const CORE=['/','/index.html?v=4','/styles.css?v=4','/app.js?v=4','/manifest.json'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(CORE)).catch(() => Promise.resolve())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Never intercept API requests. Let the browser talk directly to Render.
  if (new URL(req.url).pathname.startsWith('/api/')) {
    return;
  }

  // Network-first for navigation and app files, with safe cache fallback.
  event.respondWith(
    fetch(req)
      .then(response => {
        if (response && response.ok && req.method === 'GET') {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const home = await caches.match('/index.html?v=4') || await caches.match('/');
          if (home) return home;
        }
        return new Response('Offline', {status: 503, statusText: 'Offline'});
      })
  );
});
