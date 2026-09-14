/* ============================================================
   就醫導航 ED SmartFlow — Service Worker
   ------------------------------------------------------------
   每次發布新版，把 APP_VERSION 加一版號即可。
   版號一變 → cache 名稱改變 → 瀏覽器偵測到新 SW →
   前端顯示「有新版本」→ 使用者按更新 → SKIP_WAITING → 重新載入。
   ============================================================ */
const APP_VERSION = 'v0.2.0';
const SHELL_CACHE = `edsf-shell-${APP_VERSION}`;
const RUNTIME_CACHE = `edsf-runtime-${APP_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => c.addAll(SHELL))
      .catch(() => {})            // 單一資源失敗不應讓整包安裝失敗
  );
  // 不呼叫 skipWaiting()：新版本停在 waiting，由使用者決定何時更新
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

/* 前端按下「立即更新」時送來 */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data && e.data.type === 'GET_VERSION') {
    e.source && e.source.postMessage({ type: 'VERSION', version: APP_VERSION });
  }
});

const isFont = u => u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 各醫院即時資訊、導航、健保署頁面一律走網路，不快取
  if (url.origin !== location.origin && !isFont(url)) return;

  // 導覽請求：網路優先，離線時回退到快取的 index.html
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const preload = await e.preloadResponse;
        if (preload) return preload;
        const net = await fetch(req);
        const c = await caches.open(SHELL_CACHE);
        c.put('./index.html', net.clone());
        return net;
      } catch (_) {
        const c = await caches.open(SHELL_CACHE);
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // 字型與靜態資源：快取優先，背景更新
  e.respondWith((async () => {
    const cacheName = isFont(url) ? RUNTIME_CACHE : SHELL_CACHE;
    const c = await caches.open(cacheName);
    const hit = await c.match(req);
    const net = fetch(req).then(r => {
      if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
      return r;
    }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
