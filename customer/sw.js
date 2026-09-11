const CACHE = 'aquarium-customer-v4';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './css/design-polish.css',
  './css/premium-navbar-hero.css',
  './css/preloader-logo.css',
  './css/menu-premium.css',
  './css/delivery-premium.css',
  './css/delivery-select-ui.css',
  './js/main.js',
  './js/lang.js',
  './js/theme.js',
  './js/menu.js',
  './js/cart.js',
  './js/delivery.js',
  './js/delivery-select-ui.js',
  './js/auth.js',
  './js/gallery.js',
  './js/reviews.js',
  './js/api.js',
  './js/ui.js',
  './shared/i18n.js',
  './shared/appearance.js',
  './shared/config.js',
  './shared/db.js',
  './shared/media.js',
  './manifest.webmanifest',
  './images/restaurant-logo-preloader.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(APP_SHELL.map((url) => c.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (e) => {
  let d = { title: 'Aquarium Cafe', body: 'Your order status was updated.', url: './' };
  try { d = { ...d, ...(e.data?.json() || {}) }; } catch {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    icon: 'images/restaurant-logo-preloader.jpg',
    badge: 'images/restaurant-logo-preloader.jpg',
    data: { url: d.url || './' },
    tag: d.tag || 'aquarium-order'
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) {
      if ('focus' in c) {
        c.focus();
        try { c.navigate(url); } catch {}
        return;
      }
    }
    return clients.openWindow(url);
  }));
});
