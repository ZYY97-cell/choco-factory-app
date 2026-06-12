// ===== 巧克力工厂 PWA Service Worker v4 =====
// 激进缓存策略：安装即清空所有旧缓存，网络优先
const CACHE_NAME = 'choco-factory-v4';

// 安装 - 不预缓存，立即激活
self.addEventListener('install', event => {
  self.skipWaiting();
});

// 激活 - 删除所有旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

// 请求 - 网络优先，成功后更新缓存
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/')) return;
  event.respondWith(
    fetch(event.request).then(response => {
      var r = response.clone();
      caches.open(CACHE_NAME).then(c => c.put(event.request, r));
      return response;
    }).catch(() => caches.match(event.request))
  );
});
