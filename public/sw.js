const APP_CACHE = 'clip-kit-wasm-app-v3';
const WASM_CACHE = 'clip-kit-wasm-core-v3';
const FONT_CACHE = 'clip-kit-wasm-fonts-v3';

const APP_SHELL_URLS = [
  './',
  './index.html',
  './licenses.html',
  './manifest.webmanifest',
  './icons/favicon.svg',
];

/**
 * GitHub Pages 等のカスタムHTTPヘッダー非対応ホスティング上でも
 * SharedArrayBuffer / @ffmpeg/core-mt マルチスレッド並列化を有効にするため、
 * 同一オリジン応答へ COOP / COEP / CORP ヘッダーを自動付与する。
 */
function withCoiHeaders(response) {
  if (!response || response.status === 0 || response.type === 'opaque') {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const validCaches = new Set([APP_CACHE, WASM_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !validCaches.has(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  const url = new URL(request.url);

  // Google Fonts: ensure CORP compatibility under COEP
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return withCoiHeaders(cached);
        try {
          const response = await fetch(request);
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return withCoiHeaders(response);
        } catch {
          return cached ? withCoiHeaders(cached) : Response.error();
        }
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Cache-first for large immutable FFmpeg WASM core assets (both ST & MT)
  if (url.pathname.includes('/vendor/ffmpeg-core')) {
    event.respondWith(
      caches.open(WASM_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return withCoiHeaders(cached);
        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return withCoiHeaders(response);
      })
    );
    return;
  }

  // Navigation requests: network-first + COI headers + offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(APP_CACHE).then((cache) => cache.put(request, copy));
          }
          return withCoiHeaders(response);
        })
        .catch(async () => {
          const cache = await caches.open(APP_CACHE);
          const fallback = (await cache.match(request)) || (await cache.match('./index.html'));
          return fallback ? withCoiHeaders(fallback) : Response.error();
        })
    );
    return;
  }

  // Static JS/CSS/icon bundles: stale-while-revalidate + COI headers
  event.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const networkPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return withCoiHeaders(response);
        })
        .catch(() => (cached ? withCoiHeaders(cached) : Response.error()));
      return cached ? withCoiHeaders(cached) : networkPromise;
    })
  );
});
