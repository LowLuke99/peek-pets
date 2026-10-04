// Service worker for the installed (HTTPS) app. It keeps a full copy of the pet so the
// home-screen app opens and plays solo even when the PC is off. The companion lists
// every file + a version hash at /api/assets; when the hash changes we re-cache.
// Only registered on https: (service workers don't exist on plain LAN http).

const CACHE = 'peekpets-app';
const VERSION_KEY = '/__peekpets_version';

self.addEventListener('install', (event) => {
  event.waitUntil(precache().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data === 'refresh') event.waitUntil(precache().catch(() => {}));
});

async function precache() {
  const res = await fetch('/api/assets', { cache: 'no-store' });
  if (!res.ok) return;
  const { version, files } = await res.json();
  const cache = await caches.open(CACHE);
  const current = await cache.match(VERSION_KEY);
  if (current && (await current.text()) === version) return;
  await cache.addAll(files.map((f) => new Request(f, { cache: 'reload' })));
  await cache.put(VERSION_KEY, new Response(version));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws' || url.pathname === '/ca.crt') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? '/index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    // Cache first (instant + offline); refresh the copy in the background when online.
    const network = fetch(req)
      .then((r) => {
        if (r.ok && req.mode !== 'navigate') cache.put(req, r.clone());
        return r;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) ?? new Response('Peek Pets is offline and not cached yet.', { status: 503 });
  })());
});
