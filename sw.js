/* sw.js — Service Worker pour Ronda PWA (mode hors-ligne complet) */
const CACHE_NAME = 'ronda-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './ronda.html',
  './ronda-engine.js',
  './ronda-sound.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './audio/darija/ronda.mp3',
  './audio/darija/tringa.mp3',
  './audio/darija/missa.mp3',
  './audio/darija/bount.mp3',
  './audio/darija/win.mp3',
  './audio/darija/lose.mp3',
  './audio/fr/ronda.mp3',
  './audio/fr/tringa.mp3',
  './audio/fr/missa.mp3',
  './audio/fr/bount.mp3',
  './audio/fr/win.mp3',
  './audio/fr/lose.mp3',
  './audio/sfx/slap.mp3',
  './audio/sfx/deal.mp3',
  './audio/sfx/capture.mp3',
  './audio/sfx/chime.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('Some assets could not be cached immediately:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // En arrière-plan, essayer de mettre à jour le cache (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
