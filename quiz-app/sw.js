/* 小兵题库离线缓存：全部资源为静态文件，装完即可离线使用 */
var CACHE = 'xb-quiz-v4';
var ASSETS = [
  './',
  './index.html',
  './quiz-data.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// 页面与脚本走「网络优先」，保证每次更新都能拿到新版本；断网时回落缓存
function isShell(url) {
  return /(\/|\.html|\.js|\.json)$/.test(url.pathname);
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var req = e.request;

  if (isShell(new URL(req.url))) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match('./index.html'); });
    })
  );
});
