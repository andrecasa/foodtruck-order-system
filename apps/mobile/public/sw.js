/**
 * Service Worker — Food Truck PWA
 *
 * Estratégia:
 * - Assets estáticos (JS, CSS, fontes, imagens): stale-while-revalidate
 *   (responde do cache imediatamente E busca a versão nova em background,
 *   atualizando o cache — o usuário nunca fica mais de um reload atrás da
 *   versão publicada; substitui a antiga estratégia cache-first, que prendia
 *   o usuário no bundle antigo).
 * - Navegação (HTML): network-first com fallback offline.
 * - API/Realtime: network-only (dados em tempo real, não faz sentido cachear).
 *
 * CACHE_NAME é versionado: bump a cada release para que o handler `activate`
 * descarte automaticamente os caches de versões anteriores.
 */

const CACHE_VERSION = 'v5';
const CACHE_NAME = `foodtruck-${CACHE_VERSION}`;

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

  // Assets estáticos: stale-while-revalidate.
  // Responde do cache de imediato (se houver) enquanto busca a versão nova da
  // rede em paralelo e atualiza o cache para o próximo carregamento. Se não há
  // cache ainda, aguarda a rede.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            // Só cacheia responses válidas de mesma origem.
            if (response && response.ok && url.origin === self.location.origin) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached); // offline: cai no cache, se existir

        return cached || networkFetch;
      })
    )
  );
});
