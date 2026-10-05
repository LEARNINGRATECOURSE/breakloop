/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope & {
  // Injected at build time by vite-plugin-pwa (injectManifest strategy)
  __WB_MANIFEST: Array<{ url: string; revision: string | null } | string>;
};

const CACHE_NAME = 'breakloop-v2';

// De-duplicated: cache.addAll() rejects if the same URL appears twice
const precacheUrls = [
  ...new Set(
    ['/', ...self.__WB_MANIFEST.map((entry) => (typeof entry === 'string' ? entry : entry.url))].map(
      (url) => new URL(url, self.location.origin).href
    )
  ),
];

// Install event: precache the built app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(precacheUrls))
      .catch((error) => {
        console.log('Some assets failed to cache, continuing...', error);
      })
  );
  self.skipWaiting();
});

// Activate event: drop caches from older versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached =
      (await caches.match(request)) ||
      (await caches.match('/index.html')) ||
      (await caches.match('/'));
    return cached || Response.error();
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Pages: network first so updates show up; fall back to the cached shell offline.
  // Hashed build assets: cache first.
  event.respondWith(request.mode === 'navigate' ? networkFirst(request) : cacheFirst(request));
});

// Push: reminders sent by the server while the app is closed or in the background
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'BreakLoop';
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: data.body || 'Time for a break!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Same tag as the in-page notification, so one reminder never shows twice
    tag: data.tag || 'breakloop-notification',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    silent: false,
  };

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // An open, visible app already shows its own pop-up and plays its sound
      if (clients.some((c) => c.visibilityState === 'visible')) return;
      return self.registration.showNotification(title, options);
    })
  );
});

// Handle notification clicks: focus an open BreakLoop window or open one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow('/');
    })
  );
});

export {};
