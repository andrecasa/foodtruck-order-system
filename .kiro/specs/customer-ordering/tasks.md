# Implementation Tasks

## Visão Geral

As tasks estão ordenadas por dependência. Cada task é autocontida e resulta em código testável. O total estimado é de ~10 tasks divididas em 3 fases: Backend (infra + APIs), Shared Package, e Frontend (SPA cliente).

---

## Fase 1: Backend — Modelo de Dados e APIs Públicas

### Task 1: Migration — Adicionar coluna `slug` à tabela `tenants`

**Requisitos cobertos:** R1

**Arquivos a criar/modificar:**
- `apps/backend/migrations/011_add_tenant_slug.sql`

**Detalhes:**
1. Criar migration que adiciona coluna `slug TEXT` à tabela `tenants`.
2. Gerar slugs para tenants existentes a partir de `business_name` (lowercase, substituir espaços por hífens, remover caracteres especiais).
3. Adicionar constraint `NOT NULL` após popular os dados existentes.
4. Adicionar constraint `UNIQUE` na coluna.
5. Adicionar constraint CHECK com regex: `slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'`.

**Critério de conclusão:** Migration executa sem erro. Tenants existentes possuem slugs válidos e únicos.

---

### Task 2: Migration — Adicionar origin `'web'` à tabela `orders`

**Requisitos cobertos:** R8

**Arquivos a criar/modificar:**
- `apps/backend/migrations/012_add_web_origin.sql`

**Detalhes:**
1. DROP a constraint CHECK existente na coluna `origin`.
2. Adicionar nova constraint: `CHECK (origin IN ('presencial', 'whatsapp', 'web'))`.

**Critério de conclusão:** Migration executa sem erro. É possível inserir um order com `origin = 'web'` no banco.

---

### Task 3: Middleware de resolução de tenant por slug

**Requisitos cobertos:** R1, R2, R3, R4, R5

**Arquivos a criar/modificar:**
- Criar `apps/backend/src/middleware/public-tenant.middleware.ts`

**Detalhes:**
1. Exportar interface `PublicTenantRequest` que estende `Request` com campos `tenantId` e `tenantSlug`.
2. Implementar `publicTenantMiddleware` que:
   - Extrai `slug` de `req.params.slug`.
   - Valida formato do slug (regex check rápido — rejeita antes de bater no DB).
   - Consulta `SELECT id FROM tenants WHERE slug = $1 AND status = 'ativo'`.
   - Se não encontrar → `res.status(404).json({ error: 'TENANT_NOT_FOUND', message: 'Estabelecimento não encontrado.' })`.
   - Se encontrar → seta `req.tenantId` e `req.tenantSlug`, chama `next()`.
3. Usar o `pool` compartilhado (resolução de tenant é platform-level, não tenant-scoped).

**Critério de conclusão:** Middleware testável isoladamente. Retorna 404 para slugs inválidos/inexistentes. Seta `tenantId` corretamente para slugs válidos.

---

### Task 4: Rotas e controllers públicos — Branding e Menu

**Requisitos cobertos:** R2, R5

**Arquivos a criar/modificar:**
- Criar `apps/backend/src/routes/public.routes.ts`
- Criar `apps/backend/src/controllers/public.controller.ts`
- Modificar `apps/backend/src/index.ts` (montar o router em `/api/public`)

**Detalhes:**
1. Criar router Express com `publicTenantMiddleware` aplicado a todas as rotas.
2. Implementar `GET /api/public/:slug/branding`:
   - Consulta `SELECT business_name, logo_url, theme, slug FROM tenants WHERE id = $1`.
   - Retorna `{ businessName, logoUrl, theme, slug }`.
   - Adicionar campo `realtimeChannel` com valor `orders:queue:{tenantId}` para uso do client no realtime.
3. Implementar `GET /api/public/:slug/menu`:
   - Extrair lógica de `fetchActiveMenuItems` do `whatsapp.service.ts` para um service compartilhado (ou reutilizar diretamente).
   - Consultar itens ativos agrupados por categoria.
   - Retornar array de `{ categoryName, sortOrder, items: [{ id, name, priceCents, categoryName, categorySortOrder }] }`.
4. Não exigir autenticação (sem `authMiddleware`).
5. Aplicar rate limit de 60 req/min por IP nas rotas públicas.

**Critério de conclusão:** Ambos endpoints retornam dados corretos para um slug válido. Retornam 404 para slug inválido. Não exigem Authorization header.

---

### Task 5: Controller público — Criação de pedido

**Requisitos cobertos:** R3, R8, R10

**Arquivos a criar/modificar:**
- Modificar `apps/backend/src/controllers/public.controller.ts`
- Criar `packages/shared/src/validators/public-order.validator.ts`

**Detalhes:**
1. Criar schema Zod `publicCreateOrderSchema` no shared package:
   - `customerName`: string, min 1, max 100.
   - `items`: array de `{ menuItemId: uuid, quantity: int 1-99 }`, min 1, max 50.
   - Sem campo `origin` (forçado pelo controller).
2. Implementar `POST /api/public/:slug/orders`:
   - Validar body com `publicCreateOrderSchema`.
   - Resolver primeiro admin ativo do tenant: `SELECT id FROM users WHERE tenant_id = $1 AND role = 'admin' AND status = 'ativo' ORDER BY created_at ASC LIMIT 1`.
   - Se não houver admin ativo → `422 { error: 'TENANT_UNAVAILABLE' }`.
   - Chamar `createOrder(tenantId, { customerName, origin: 'web', items, createdBy })`.
   - Retornar `{ id, dailyNumber, totalAmountCents, status, orderDate, createdAt }`.
3. O `createOrder` existente já faz: validação de items, snapshot de preços, transaction, daily_number, broadcast realtime.

**Critério de conclusão:** Endpoint cria pedido com origin `'web'`. Pedido aparece na fila do operador via realtime. Retorna 422 para itens inválidos.

---

### Task 6: Controller público — Status do pedido

**Requisitos cobertos:** R4

**Arquivos a criar/modificar:**
- Modificar `apps/backend/src/controllers/public.controller.ts`

**Detalhes:**
1. Implementar `GET /api/public/:slug/orders/:orderId`:
   - Chamar `getOrderById(tenantId, orderId)`.
   - Se não encontrar (ou pertence a outro tenant) → 404.
   - Filtrar campos sensíveis. Retornar apenas: `{ id, dailyNumber, customerName, status, totalAmountCents, createdAt, items: [{ itemName, quantity, unitPriceCents }] }`.
2. Não expor: `created_by`, `payment_status`, `payment_method`, `order_date` interno.

**Critério de conclusão:** Retorna status correto para pedido existente. Retorna 404 para pedido de outro tenant. Não expõe campos sensíveis.

---

## Fase 2: Shared Package — Tipos e Constantes

### Task 7: Atualizar tipos, constantes e validators no shared package

**Requisitos cobertos:** R8

**Arquivos a criar/modificar:**
- Modificar `packages/shared/src/constants/status.ts` (adicionar `'web'` a `ORDER_ORIGINS`)
- Modificar `packages/shared/src/validators/order.validator.ts` (adicionar `'web'` ao enum de origin)
- Criar `packages/shared/src/types/public.ts` (tipos públicos: `PublicMenuItem`, `PublicMenuCategory`, `PublicBranding`, `PublicOrderResponse`)
- Modificar `packages/shared/src/index.ts` (exportar novos tipos e validator)

**Detalhes:**
1. Adicionar `'web'` ao array `ORDER_ORIGINS` e ao tipo `OrderOrigin`.
2. Atualizar `createOrderRequestSchema` para aceitar `'web'` no enum de origin.
3. Exportar `publicCreateOrderSchema` do novo arquivo de validator.
4. Definir e exportar interfaces públicas usadas tanto pelo backend quanto pelo frontend.

**Critério de conclusão:** `pnpm typecheck` passa sem erros. Novos tipos estão disponíveis para import em apps/backend e apps/web.

---

## Fase 3: Frontend — SPA do Cliente

### Task 8: Setup de rotas, layout e API client do cliente

**Requisitos cobertos:** R6, R5

**Arquivos a criar/modificar:**
- Modificar `apps/web/src/router.tsx` (adicionar rotas `/:slug`, `/:slug/checkout`, `/:slug/pedido/:orderId`)
- Criar `apps/web/src/pages/customer/CustomerLayout.tsx`
- Criar `apps/web/src/lib/public-api.ts` (HTTP client para rotas públicas)
- Criar `apps/web/src/hooks/customer/usePublicBranding.ts`

**Detalhes:**
1. Configurar React Router com rotas do cliente aninhadas sob `/:slug` com `CustomerLayout` como wrapper.
2. `CustomerLayout`:
   - Chama `GET /api/public/:slug/branding` via TanStack Query.
   - Exibe header com nome e logo do estabelecimento.
   - Aplica tema do tenant via CSS custom properties no `:root`.
   - Renderiza `<Outlet />` para as páginas filhas.
   - Exibe 404 amigável se branding retornar erro.
3. `public-api.ts`:
   - Funções: `fetchBranding(slug)`, `fetchMenu(slug)`, `createOrder(slug, body)`, `fetchOrderStatus(slug, orderId)`.
   - Base URL configurável via env var `VITE_API_URL`.

**Critério de conclusão:** Acessar `/:slug` carrega o layout com branding. Slug inválido mostra tela de erro 404.

---

### Task 9: Tela de cardápio e carrinho

**Requisitos cobertos:** R6

**Arquivos a criar/modificar:**
- Criar `apps/web/src/pages/customer/MenuPage.tsx`
- Criar `apps/web/src/components/customer/CategorySection.tsx`
- Criar `apps/web/src/components/customer/MenuItem.tsx`
- Criar `apps/web/src/components/customer/CartDrawer.tsx`
- Criar `apps/web/src/components/customer/CartItem.tsx`
- Criar `apps/web/src/hooks/customer/usePublicMenu.ts`
- Criar `apps/web/src/hooks/customer/useCart.ts`

**Detalhes:**
1. `MenuPage`:
   - Fetch menu via `usePublicMenu(slug)` (TanStack Query).
   - Renderiza categorias com `CategorySection` → lista de `MenuItem`.
   - Barra inferior fixa com ícone do carrinho, contador de itens e total.
   - Ao clicar na barra, abre `CartDrawer` (drawer/modal lateral ou bottom sheet).
2. `MenuItem`:
   - Exibe nome e preço formatado (`R$ X,XX`).
   - Botão "Adicionar" que incrementa quantidade no carrinho.
3. `CartDrawer`:
   - Lista de `CartItem` com nome, preço, controles +/- de quantidade, botão remover.
   - Total geral no rodapé.
   - Botão "Fazer Pedido" (navega para `/checkout`). Desabilitado se carrinho vazio.
4. `useCart`:
   - Estado via `useState` + sync com `sessionStorage` (chave: `cart:{slug}`).
   - Funções: `addItem`, `removeItem`, `updateQuantity`, `clear`.
   - Computed: `total`, `count`.

**Critério de conclusão:** Cliente consegue navegar pelo cardápio, adicionar/remover itens, ver o resumo no carrinho. Carrinho persiste durante navegação entre páginas mas desaparece ao fechar a aba.

---

### Task 10: Tela de checkout (confirmação) e acompanhamento

**Requisitos cobertos:** R7, R10

**Arquivos a criar/modificar:**
- Criar `apps/web/src/pages/customer/CheckoutPage.tsx`
- Criar `apps/web/src/pages/customer/TrackingPage.tsx`
- Criar `apps/web/src/hooks/customer/useCreateOrder.ts`
- Criar `apps/web/src/hooks/customer/useOrderTracking.ts`
- Criar `apps/web/src/components/customer/OrderSummary.tsx`
- Criar `apps/web/src/components/customer/StatusBadge.tsx`

**Detalhes:**
1. `CheckoutPage`:
   - Exibe resumo do pedido (itens, quantidades, total).
   - Campo de texto para nome do cliente (obrigatório, validação client-side).
   - Botão "Confirmar Pedido" → chama `POST /api/public/:slug/orders`.
   - Loading state durante request. Erro amigável com opção de retry.
   - On success: limpa carrinho, navega para `/:slug/pedido/:orderId`.
2. `TrackingPage`:
   - Fetch inicial via `GET /api/public/:slug/orders/:orderId`.
   - Exibe: número do pedido (grande, destaque), nome do cliente, itens, total, status atual.
   - Subscribe no canal realtime (nome obtido do branding cacheado): filtra eventos `status_updated` com `payload.id === orderId`.
   - Fallback: polling a cada 30 segundos.
   - Quando status = `pronto`: destaque visual (fundo verde, ícone de check, texto "Seu pedido está pronto!").
   - Quando status = `entregue`: mensagem de conclusão ("Pedido entregue. Obrigado!").
   - Funciona após reload (orderId está na URL).
3. `StatusBadge`:
   - Componente visual com cor e label por status: aguardando (amarelo), preparando (laranja), pronto (verde), entregue (cinza).

**Critério de conclusão:** Fluxo completo funciona end-to-end: cardápio → carrinho → nome → confirmar → tela de acompanhamento com atualização em tempo real quando operador muda status.

---

## Fase 4: Mobile e Finalização

### Task 11: Badge "Online" no app mobile

**Requisitos cobertos:** R8, R10

**Arquivos a modificar:**
- `apps/mobile/src/screens/OrderQueueScreen.tsx` (ou componente de card de pedido)

**Detalhes:**
1. Adicionar tratamento para `origin === 'web'` no mapeamento de badge:
   - Label: `"Online"`.
   - Cor: `#2563EB` (azul).
2. Garantir que o card exibe corretamente para pedidos vindos da web.

**Critério de conclusão:** Pedidos criados via web aparecem na fila com badge "Online" azul distinto dos outros.

---

### Task 12: PWA — Manifest e Service Worker

**Requisitos cobertos:** R9

**Arquivos a criar/modificar:**
- Criar/modificar `apps/web/public/manifest.json`
- Configurar `vite-plugin-pwa` no `apps/web/vite.config.ts`
- Criar ícones PWA (192x192, 512x512) genéricos

**Detalhes:**
1. Configurar `manifest.json` com:
   - `name`: "Faça seu Pedido" (genérico — tema do tenant é aplicado via JS).
   - `short_name`: "Pedido".
   - `start_url`: "/".
   - `display`: "standalone".
   - `theme_color` e `background_color` padrão (sobrescritos pelo tema do tenant).
   - Ícones genéricos.
2. Instalar e configurar `vite-plugin-pwa`:
   - Workbox em modo `generateSW`.
   - Precache de assets estáticos (JS, CSS, fontes).
   - Runtime caching: StaleWhileRevalidate para `/api/public/*/menu` e `/api/public/*/branding`.
3. Fallback offline:
   - Se fetch do menu falhar e houver cache → exibir cardápio cacheado com banner "Offline".
   - Se não houver cache → tela genérica "Sem conexão".

**Critério de conclusão:** App pode ser "instalada" no celular via prompt do navegador. Cardápio carrega do cache quando offline. Lighthouse PWA score > 80.

---

## Ordem de Execução Recomendada

```
Task 1 (slug migration)
Task 2 (web origin migration)
  ↓
Task 7 (shared package updates)  ← pode rodar em paralelo com tasks 1-2
  ↓
Task 3 (public tenant middleware)
  ↓
Task 4 (branding + menu endpoints)
Task 5 (create order endpoint)
Task 6 (order status endpoint)
  ↓
Task 8 (frontend setup + layout)
  ↓
Task 9 (cardápio + carrinho)
  ↓
Task 10 (checkout + tracking)
  ↓
Task 11 (mobile badge)         ← pode rodar em paralelo com tasks 8-10
Task 12 (PWA)                  ← pode rodar em paralelo com task 11
```

---

## Estimativa

| Fase | Tasks | Estimativa |
|------|-------|-----------|
| Backend (Migrations + APIs) | 1-6 | 2-3 dias |
| Shared Package | 7 | 0.5 dia |
| Frontend (SPA) | 8-10 | 3-4 dias |
| Mobile + PWA | 11-12 | 1 dia |
| **Total** | **12 tasks** | **~7-8 dias** |
