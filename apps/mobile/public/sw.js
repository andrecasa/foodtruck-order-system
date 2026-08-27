/**
 * Service Worker — Food Truck Operador PWA
 *
 * Estratégia:
 * - Assets estáticos (JS, CSS, fontes, imagens): cache-first
 * - Navegação (HTML): network-first com fallback offline
 * - API calls: network-only (dados em tempo real, não faz sentido cachear)
 */

const CACHE_NAME = 'operador-v1';

// Assets essenciais para o shell do app funcionar offline
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
];

// ─── Install: pré-cacheia o shell mínimo ───────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Ativa imediatamente sem esperar abas antigas fecharem
  self.skipWaiting();
});

// ─── Activate: limpa caches antigos ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  // Toma controle de todas as abas abertas
  self.clients.claim();
});

// ─── Fetch: estratégia por tipo de request ─────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API e WebSocket: nunca cachear (dados em tempo real)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/realtime/')) {
    return;
  }

  // Navegação (HTML): network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
    return;
  }

  // Assets estáticos: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Só cacheia responses válidas de mesma origem
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
