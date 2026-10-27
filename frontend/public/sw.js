/**
 * Life Goals AI Service Worker
 * 
 * Responsibilities:
 * - Offline asset caching for core application shell (HTML, CSS, JS, branding)
 * - Safe offline fallback (offline.html)
 * - CRITICAL SECURITY RULE: Never cache authenticated API requests (/api/v1/*) or sensitive user records.
 * - Cache cleanup on version rotation
 */

const CACHE_NAME = 'life-goals-ai-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/favicon.svg',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
];

// Install: Pre-cache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Purge obsolete cache versions and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Secure caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. SECURITY RULE: Never intercept or cache mutations (POST, PUT, PATCH, DELETE)
  if (request.method !== 'GET') {
    return;
  }

  // 2. SECURITY RULE: Never cache authenticated API requests or endpoints with Authorization headers
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/v1/') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('identitytoolkit') ||
    request.headers.has('Authorization')
  ) {
    // Pass directly to network without writing to or reading from CacheStorage
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({
            error: 'Network connection unavailable',
            code: 'OFFLINE_NO_CACHE',
            details: 'Device is offline. Sensitive API data is not cached locally for security.'
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }

  // 3. HTML Navigation requests: Network-first with offline.html fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If valid response, update cache
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          // Try app shell or offline fallback
          const cache = await caches.open(CACHE_NAME);
          const cachedIndex = await cache.match('/index.html');
          if (cachedIndex) return cachedIndex;

          const cachedOffline = await cache.match('/offline.html');
          if (cachedOffline) return cachedOffline;

          return new Response('Offline - No connection available', { status: 503 });
        })
    );
    return;
  }

  // 4. Static Assets (CSS, JS, Fonts, Images): Cache-first with background revalidation
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache for subsequent visits
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {
          // Ignore background fetch error when offline
        });
        return cachedResponse;
      }

      // If not in cache, fetch from network
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        }
        return networkResponse;
      });
    })
  );
});
