
const CACHE = 'aquarium-customer-v1';
const SHELL = ['./', './index.html', './css/style.css', './js/main.js', './js/menu.js', './js/cart.js', './js/delivery.js', './js/api.js', './js/auth.js', './js/ui.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
});
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || '' }; }
  const title = data.title || 'Aquarium Café';
  const options = {
    body: data.body || 'You have a new update.',
    icon: data.icon || './icons/icon-192.png',
    badge: data.badge || './icons/icon-192.png',
    tag: data.tag || 'aquarium-notification',
    renotify: true,
    data: { url: data.url || './index.html' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './index.html';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const existing = list.find((c) => 'focus' in c);
    return existing ? existing.focus().then(() => existing.navigate(url)) : clients.openWindow(url);
  }));
});
