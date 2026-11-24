const CACHE_VERSION='triple20-test-shell-20261124-130';
const DATA_CACHE='triple20-test-data-20261124-130';
const APP_SHELL=[
  './','./index.html','./styles.css','./data-schema.js','./cloud-partitions.js','./app-dialog.js','./double-ko.js','./tournament-engine.js','./stats-station.js','./dartvision-lab.js','./app.js','./pwa.js','./manifest.webmanifest','./brand-assets/tyroldarts-logo-white.png','./brand-assets/dca-social-share.png',
  './icons/triple20-icon-192.png','./icons/triple20-icon-512.png','./icons/apple-touch-icon.png','./icons/triple20-icon.svg',
];
const OPTIONAL_EXTERNAL=[
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_VERSION).then(async cache=>{
    // Eine einzelne fehlende oder vorübergehend nicht erreichbare Datei darf
    // die komplette PWA- und Push-Installation nicht mehr verhindern.
    await Promise.allSettled(APP_SHELL.map(async url=>{const request=new Request(url,{cache:'reload'}),response=await fetch(request);if(response.ok)await cache.put(request,response)}));
    await Promise.allSettled(OPTIONAL_EXTERNAL.map(async url=>{const request=new Request(url,{mode:'no-cors'}),response=await fetch(request);await cache.put(request,response)}));
  }).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('triple20-test-')&&![CACHE_VERSION,DATA_CACHE].includes(key)).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});

async function networkFirst(request,fallback='./index.html'){
  const cache=await caches.open(DATA_CACHE);
  try{const response=await fetch(request);if(response?.ok)cache.put(request,response.clone());return response}
  catch{
    // Die Programmdateien werden im Shell-Cache ohne Versionsparameter
    // vorinstalliert, index.html ruft sie jedoch bewusst mit ?v=... auf.
    // Offline muss deshalb derselbe Pfad unabhängig vom Suchparameter gelten;
    // andernfalls würde bei einem Skript fälschlich index.html zurückgegeben.
    return (await cache.match(request,{ignoreSearch:true}))||(await caches.match(request,{ignoreSearch:true}))||(await caches.match(fallback,{ignoreSearch:true}))||Response.error()
  }
}

async function staleWhileRevalidate(request){
  const cache=await caches.open(DATA_CACHE),cached=await caches.match(request);
  const update=fetch(request).then(response=>{if(response?.ok||response?.type==='opaque')cache.put(request,response.clone());return response}).catch(()=>null);
  return cached||await update||Response.error();
}

self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(request.mode==='navigate'){event.respondWith(networkFirst(request));return}
  if(url.origin===self.location.origin){
    // Versionsabhaengige Programmdateien duerfen nie aus einem aelteren Cache
    // mit einer neuen index.html gemischt werden. Genau diese Mischung legt die
    // Navigation lahm, obwohl sich der Hamburger optisch noch oeffnen laesst.
    if(/\.(?:html|css|js)$/i.test(url.pathname)){event.respondWith(networkFirst(request));return}
    event.respondWith(caches.match(request).then(cached=>cached||staleWhileRevalidate(request)));return;
  }
  if(url.hostname==='cdn.jsdelivr.net'){event.respondWith(staleWhileRevalidate(request))}
});

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});

self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{}}catch{data={body:event.data?.text()||''}}
  const title=data.title||'Triple20',options={body:data.body||'Neue Nachricht vom Dartclub.',icon:'./icons/triple20-icon-192.png',badge:'./icons/triple20-icon-192.png',tag:data.tag||'triple20-message',renotify:true,data:{url:data.url||'./'},actions:[{action:'open',title:'In Triple20 öffnen'}]};
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();const target=new URL(event.notification.data?.url||'./',self.location.origin).href;
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{for(const client of windows){if('focus'in client){client.navigate(target);return client.focus()}}return clients.openWindow?clients.openWindow(target):undefined}));
});
