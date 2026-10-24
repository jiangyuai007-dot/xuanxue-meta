/**
 * 玄机 PWA Service Worker（web/sw.js · v2.3 Network-First 防旧缓存锁死版）
 *
 * 策略：
 *   1. 静态资源（HTML / CSS / JS）一律采用 Network-First（网络优先，实时拉取最新样式与脚本，仅断网时回退离线缓存），
 *      彻底杜绝版本更新后手机端被旧版 CSS/JS 缓存锁死的问题；
 *   2. 激活时自动清理所有旧版缓存（v2.0 / v2.1 / v2.2）；
 *   3. POST /api/paipan 与 /api/hepan 采用 Network-First + 请求体摘要缓存，断网时可重放已排过的命盘。
 */

const CACHE_STATIC = 'xuanji-static-v2.3';
const CACHE_API = 'xuanji-api-v2.3';

const PRECACHE_URLS = [
  '/bazi.html',
  '/liuyao.html',
  '/qimen.html',
  '/ziwei.html',
  '/hepan.html',
  '/mine.html',
  '/style.css?v=20261024a',
  '/fonts/subset.css',
  '/app.js?v=20261024a',
  '/bazi-drill.js?v=20261024a',
  '/hepan-drill.js?v=20261024a',
  '/cloud-history.js?v=20261024a',
  '/mine.js?v=20261024a',
  '/poster.js?v=20261024a',
  '/icon.svg',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
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

  // 1) POST /api/paipan 或 /api/hepan：网络优先，断网回退缓存
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
        } catch {
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

  if (url.pathname.startsWith('/api/')) return;

  // 3) 静态资源（HTML/CSS/JS）：严格 Network-First（网络优先，杜绝旧缓存锁死 UI），断网时回退缓存
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(async (netRes) => {
        if (netRes && netRes.ok) {
          const cache = await caches.open(CACHE_STATIC);
          cache.put(req, netRes.clone()).catch(() => {});
        }
        return netRes;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_STATIC);
        return (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true })) || new Response('Offline', { status: 503 });
      })
  );
});
