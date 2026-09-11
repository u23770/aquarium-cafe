const CACHE = 'aquarium-customer-v1';
const APP_SHELL = ['./', './index.html', './css/style.css', './js/main.js', './manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL).catch(()=>{})).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return r; }).catch(()=>caches.match(e.request).then(r=>r || caches.match('./index.html'))));
});
self.addEventListener('message', e => { if(e.data?.type==='SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('push', e => {
  let d = { title: 'Aquarium Cafe', body: 'Your order status was updated.', url: './' };
  try { d = { ...d, ...(e.data?.json() || {}) }; } catch {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: d.url || './' },
    tag: d.tag || 'aquarium-order'
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) {
      if ('focus' in c) { c.focus(); try { c.navigate(url); } catch {} return; }
    }
    return clients.openWindow(url);
  }));
});
