/* Only the explicit offline screen and generated demo tiles are cached. Never cache API/auth responses. */
const CACHE='firecase-field-v1';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.type==='CLAIM')self.clients.claim()});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET')return;
 const offlineAsset=['/offline.html','/offline.js','/offline.css'].includes(url.pathname)||url.pathname.startsWith('/offline-map/');
 if(offlineAsset){event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));return}
 if(event.request.mode==='navigate'&&url.pathname==='/')event.respondWith(fetch(event.request).catch(async()=>{const cache=await caches.open(CACHE);return (await cache.match('/offline.html'))||Response.error()}));
});
