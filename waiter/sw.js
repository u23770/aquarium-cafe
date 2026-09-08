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
  // Resolve against this Service Worker's OWN registration scope (i.e. the
  // deployed .../waiter/ path), not against an assumed relative segment —
  // this is correct no matter what path Vercel serves the waiter app from.
  let absUrl;
  try{absUrl=new URL(d.url||'./',self.registration.scope).href}catch{absUrl=self.registration.scope}
  e.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:d.tag||undefined,data:{url:absUrl}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const target=e.notification.data?.url||self.registration.scope;

  e.waitUntil((async()=>{
    try{
      const cs=await clients.matchAll({type:'window',includeUncontrolled:true});
      // Prefer a client already on the Waiter app; only ever look at clients
      // in THIS Service Worker's own scope (matchAll is scoped per-registration,
      // so a Customer/Admin tab from another origin path is never touched).
      const existing=cs.find(c=>'focus' in c);
      if(existing){
        try{
          await existing.focus();
        }catch{
          /* focus can fail if the tab was closed between matchAll() and now —
             fall through to openWindow below */
        }
        if('navigate' in existing){
          try{
            await existing.navigate(target);
            return;
          }catch{
            /* navigate() can reject (e.g. client not fully controlled yet) —
               the tab is still focused, so this is a safe, silent no-op
               rather than an uncaught error */
            return;
          }
        }
        return;
      }
      await clients.openWindow(target);
    }catch(err){
      // Never let a notification click surface an uncaught error — at worst,
      // the click silently does nothing instead of breaking anything.
      console.error('[waiter sw] notificationclick failed:',err);
    }
  })());
});
