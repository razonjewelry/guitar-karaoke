/* Service worker: האפליקציה נשמרת במכשיר ועובדת בלי אינטרנט.
   אסטרטגיה "רשת קודם": כשיש אינטרנט תמיד מקבלים את הגרסה העדכנית (עם timeout של 4 שניות), ואם אין — מהמטמון. */
var VERSION = 'gk-v4';
var FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/util.js', 'js/chords-db.js', 'js/parser.js', 'js/store.js', 'js/fft.js', 'js/chroma.js', 'js/strum.js', 'js/stepper.js', 'js/listen.js',
  'js/catalog.js', 'js/ui-library.js', 'js/ui-player.js', 'js/ui-editor.js', 'js/app.js',
  'data/songs.js', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(VERSION).then(function (cache) {
    var net = new Promise(function (resolve, reject) {
      var timer = setTimeout(reject, 4000);
      fetch(e.request).then(function (res) {
        clearTimeout(timer);
        if (res && res.ok) cache.put(e.request, res.clone());
        resolve(res);
      }, function (err) { clearTimeout(timer); reject(err); });
    });
    return net.catch(function () {
      return cache.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || Response.error(); });
    });
  }));
});
