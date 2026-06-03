/* Goleio PWA Service Worker - Etapa 54 */
const GOLEIO_SW_VERSION = '56.0.0';
const STATIC_CACHE = `goleio-static-v${GOLEIO_SW_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './cronometro-placar.html',
  './sorteador-rapido.html',
  './assets/logos/favicon-48x48.png',
  './assets/logos/apple-touch-icon.png',
  './assets/logos/goleio-icon-72.png',
  './assets/logos/goleio-icon-96.png',
  './assets/logos/goleio-icon-128.png',
  './assets/logos/goleio-icon-144.png',
  './assets/logos/goleio-icon-152.png',
  './assets/logos/goleio-icon-192.png',
  './assets/logos/goleio-icon-256.png',
  './assets/logos/goleio-icon-384.png',
  './assets/logos/goleio-icon-512.png'
];

function shouldBypass(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return true;
  if (url.hostname.includes('supabase.co')) return true;
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) return true;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL.map((asset) => new Request(asset, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('goleio-static-v') && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => clients.forEach((client) => client.postMessage({ type: 'GOLEIO_SW_ACTIVATED', version: GOLEIO_SW_VERSION })))
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'GOLEIO_SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return cache.match('./index.html');
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const freshPromise = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => null);
  return cached || freshPromise || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (shouldBypass(request)) return;

  const url = new URL(request.url);
  if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
