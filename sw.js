// Service Worker for Section 6 PWA (v21 - Dynamic Task TA Sync & Ahmed Kord Update)
// ----------------------------------------------------
const CACHE_NAME = 'section6-hub-v21';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './academic-calendar.png',
  './grade-distribution.png',
  './vendor/tailwind.js',
  './vendor/lucide.min.js',
  './vendor/confetti.browser.min.js',
  './vendor/html2canvas.min.js'
];

// 1. Install & Precache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW v3] Precaching core assets...');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Activate & Purge All Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW v3] Deleting stale cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Message Event (Allow instant skip waiting on user demand)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Fetch Handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (e.g. POST to Google Apps Script)
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle Google Apps Script requests
  if (url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ status: 'offline', message: 'أنت في وضع عدم الاتصال حالياً (Offline Mode)' }),
          { headers: { 'Content-Type': 'application/json;charset=utf-8' } }
        );
      })
    );
    return;
  }

  // STRATEGY A: For Navigation / HTML pages -> NETWORK-FIRST with CACHE FALLBACK
  // This guarantees that any updates you push to GitHub are received immediately by the phone!
  const isHtmlRequest = event.request.mode === 'navigate' ||
                        event.request.destination === 'document' ||
                        url.pathname.endsWith('.html') ||
                        url.pathname.endsWith('/');

  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          // If network fails (offline), serve cached index.html immediately!
          return caches.match(event.request) || caches.match('./index.html') || caches.match('./');
        })
    );
    return;
  }

  // STRATEGY B: For Static Assets (JS, CSS, Icons, Images) -> STALE-WHILE-REVALIDATE
  // Instant load from cache, while updating the cache in background if connected!
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and not in cache, fallback
          return null;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
