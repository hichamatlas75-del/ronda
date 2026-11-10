const CACHE_NAME = 'ronda-cache-v9';

const CARD_ASSETS = [];
for (let i = 0; i < 40; i++) {
  CARD_ASSETS.push(`./cards/${i}.png`);
}
CARD_ASSETS.push('./cards/back.png');
['copas', 'oros', 'bastos', 'espadas'].forEach(s => {
  CARD_ASSETS.push(`./cards/${s}_0.png`);
  CARD_ASSETS.push(`./cards/${s}_8.png`);
  CARD_ASSETS.push(`./cards/${s}_9.png`);
});
CARD_ASSETS.push('./cards/wild.png');
CARD_ASSETS.push('./cards/wild_d4.png');

const ASSETS = [
  './',
  './index.html',
  './ronda.html',
  './uno-maroc.html',
  './ronda-engine.js',
  './uno-engine.js',
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
  './audio/darija/uno.mp3',
  './audio/darija/uno_missed.mp3',
  './audio/darija/skip.mp3',
  './audio/darija/reverse.mp3',
  './audio/darija/draw2.mp3',
  './audio/darija/draw4.mp3',
  './audio/darija/wild.mp3',
  './audio/darija/uno_win.mp3',
  './audio/darija/uno_lose.mp3',
  './audio/fr/ronda.mp3',
  './audio/fr/tringa.mp3',
  './audio/fr/missa.mp3',
  './audio/fr/bount.mp3',
  './audio/fr/win.mp3',
  './audio/fr/lose.mp3',
  './audio/fr/uno.mp3',
  './audio/fr/uno_missed.mp3',
  './audio/fr/skip.mp3',
  './audio/fr/reverse.mp3',
  './audio/fr/draw2.mp3',
  './audio/fr/draw4.mp3',
  './audio/fr/wild.mp3',
  './audio/fr/uno_win.mp3',
  './audio/fr/uno_lose.mp3',
  './audio/sfx/slap.mp3',
  './audio/sfx/deal.mp3',
  './audio/sfx/capture.mp3',
  './audio/sfx/chime.mp3',
  './audio/sfx/swoosh.mp3',
  './audio/sfx/block.mp3',
  './audio/sfx/alert.mp3',
  ...CARD_ASSETS
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
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
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
