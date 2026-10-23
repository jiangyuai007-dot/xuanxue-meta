/**
 * 玄机 PWA Service Worker（web/sw.js）
 *
 * 策略：
 *   1. 核心静态骨架（HTML / CSS / JS / 子集字体 / 图标）预缓存 + Stale-While-Revalidate，秒开无白屏；
 *   2. /api/cities 与 /api/report/css 支持离线缓存回退；
 *   3. POST /api/paipan 与 /api/hepan 采用 Network-First + 请求体摘要缓存，断网时可重放已排过的命盘。
 */

const CACHE_STATIC = 'xuanji-static-v3';
const CACHE_API = 'xuanji-api-v3';

const PRECACHE_URLS = [
  '/bazi.html',
  '/liuyao.html',
  '/qimen.html',
  '/ziwei.html',
  '/hepan.html',
  '/mine.html',
  '/style.css',
  '/fonts/subset.css',
  '/app.js',
  '/bazi-drill.js',
  '/hepan-drill.js',
  '/cloud-history.js',
  '/mine.js',
  '/poster.js',
  '/icon.svg',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_STATIC && k !== CACHE_API)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function hashText(str) {
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1) POST /api/paipan 或 /api/hepan：网络优先，成功后按 body 哈希写入离线缓存，断网时回退缓存
  if (req.method === 'POST' && (url.pathname === '/api/paipan' || url.pathname === '/api/hepan')) {
    event.respondWith(
      (async () => {
        const cloned = req.clone();
        let bodyRaw = '';
        try {
          bodyRaw = await cloned.text();
        } catch {
          bodyRaw = '';
        }
        const keyUrl = `${url.origin}${url.pathname}?offline_key=${await hashText(bodyRaw)}`;
        try {
          const netRes = await fetch(req);
          if (netRes && netRes.ok) {
            const cache = await caches.open(CACHE_API);
            cache.put(keyUrl, netRes.clone()).catch(() => {});
          }
          return netRes;
        } catch (err) {
          const cache = await caches.open(CACHE_API);
          const hit = await cache.match(keyUrl);
          if (hit) return hit;
          return new Response(
            JSON.stringify({ ok: false, error: '当前处于离线状态，且本地尚无该生辰的离线排盘缓存' }),
            { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  if (req.method !== 'GET') return;

  // 2) GET /api/cities 与 /api/report/css：网络优先，离线回退缓存
  if (url.pathname === '/api/cities' || url.pathname === '/api/report/css') {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res && res.ok) {
            const c = await caches.open(CACHE_API);
            c.put(req, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const c = await caches.open(CACHE_API);
          return (await c.match(req)) || new Response('', { status: 503 });
        })
    );
    return;
  }

  // 其余 /api/* 请求直接走网络
  if (url.pathname.startsWith('/api/')) return;

  // 3) 静态资源：Stale-While-Revalidate（优先返回缓存并后台更新，保证切换页面无白屏）
  event.respondWith(
    caches.open(CACHE_STATIC).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fetchPromise = fetch(req)
        .then((netRes) => {
          if (netRes && netRes.ok) {
            cache.put(req, netRes.clone()).catch(() => {});
          }
          return netRes;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
