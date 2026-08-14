const CACHE='aquarium-waiter-v1';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./css/waiter.css','./js/main.js','./manifest.webmanifest']).catch(()=>{})).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||!e.request.url.startsWith(self.location.origin))return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
self.addEventListener('push',e=>{
  let d={title:'Aquarium — New order',body:'You have a new delivery order.',url:'./'};
  try{d={...d,...(e.data?.json()||{})}}catch{}
  e.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon:'icons/icon-192.png',badge:'icons/icon-192.png',data:{url:d.url}}));
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus'in c){c.focus();try{c.navigate(e.notification.data?.url||'./')}catch{}return}}return clients.openWindow(e.notification.data?.url||'./')}))});
