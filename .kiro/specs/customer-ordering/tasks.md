# Implementation Plan

## Overview

As tasks estão ordenadas por dependência. Cada task é autocontida e resulta em código testável. O total estimado é de 12 tasks divididas em 4 fases: Backend (infra + APIs), Shared Package, Frontend (SPA cliente), e Mobile + PWA. Estimativa total: ~7-8 dias.

## Tasks

Fase 1: Backend — Modelo de Dados e APIs Públicas

- [ ] 1. Validação de formato do slug (provisioning_key) no onboarding

**Requisitos cobertos:** R1

**Arquivos a modificar:**
- `apps/backend/src/services/tenant-provision.service.ts`

**Detalhes:**
1. A coluna `provisioning_key` existente (TEXT UNIQUE) será usada como slug público. **Não é necessária nova migration.**
2. Adicionar validação de formato no serviço `provisionTenant`, antes do INSERT:
   - Regex: `^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$` (3-60 chars, lowercase alfanumérico com hífens, não começa/termina com hífen).
   - Rejeitar palavras reservadas: `api`, `admin`, `health`, `webhook`, `static`, `assets`, `public`, `login`, `queue`.
   - Se inválido → incluir `'provisioningKey'` no array de campos inválidos (comportamento existente).
3. Documentar no código que `provisioning_key` serve duplo propósito: chave de idempotência do onboarding E slug público na URL.

**Critério de conclusão:** Provisioning rejeita keys com formato inválido. Keys existentes (`dev-first-tenant`, `pastel-das-meninas`) já são válidos pelo regex. Testes existentes continuam passando.

---

- [ ] 2. Migration — Adicionar origin `'web'` à tabela `orders`

**Requisitos cobertos:** R8

**Arquivos a criar/modificar:**
- `apps/backend/migrations/012_add_web_origin.sql`

**Detalhes:**
1. DROP a constraint CHECK existente na coluna `origin`.
2. Adicionar nova constraint: `CHECK (origin IN ('presencial', 'whatsapp', 'web'))`.

**Critério de conclusão:** Migration executa sem erro. É possível inserir um order com `origin = 'web'` no banco.

---

- [ ] 3. Middleware de resolução de tenant por slug

**Requisitos cobertos:** R1, R2, R3, R4, R5

**Arquivos a criar/modificar:**
- Criar `apps/backend/src/middleware/public-tenant.middleware.ts`

**Detalhes:**
1. Exportar interface `PublicTenantRequest` que estende `Request` com campos `tenantId` e `tenantSlug`.
2. Implementar `publicTenantMiddleware` que:
   - Extrai `slug` de `req.params.slug`.
   - Valida formato do slug (regex check rápido — rejeita antes de bater no DB).
   - Consulta `SELECT id FROM tenants WHERE provisioning_key = $1 AND status = 'ativo'`.
   - Se não encontrar → `res.status(404).json({ error: 'TENANT_NOT_FOUND', message: 'Estabelecimento não encontrado.' })`.
   - Se encontrar → seta `req.tenantId` e `req.tenantSlug`, chama `next()`.
3. Usar o `pool` compartilhado (resolução de tenant é platform-level, não tenant-scoped).

**Critério de conclusão:** Middleware testável isoladamente. Retorna 404 para slugs inválidos/inexistentes. Seta `tenantId` corretamente para slugs válidos.

---

- [ ] 4. Rotas e controllers públicos — Branding e Menu

**Requisitos cobertos:** R2, R5

**Arquivos a criar/modificar:**
- Criar `apps/backend/src/routes/public.routes.ts`
- Criar `apps/backend/src/controllers/public.controller.ts`
- Modificar `apps/backend/src/index.ts` (montar o router em `/api/public`)

**Detalhes:**
1. Criar router Express com `publicTenantMiddleware` aplicado a todas as rotas.
2. Implementar `GET /api/public/:slug/branding`:
   - Consulta `SELECT business_name, logo_url, theme, provisioning_key FROM tenants WHERE id = $1`.
   - Retorna `{ businessName, logoUrl, theme, slug: row.provisioning_key }`.
   - Adicionar campo `realtimeChannel` com valor `orders:queue:{tenantId}` para uso do client no realtime.
3. Implementar `GET /api/public/:slug/menu`:
   - Extrair lógica de `fetchActiveMenuItems` do `whatsapp.service.ts` para um service compartilhado (ou reutilizar diretamente).
   - Consultar itens ativos agrupados por categoria.
   - Retornar array de `{ categoryName, sortOrder, items: [{ id, name, priceCents, categoryName, categorySortOrder }] }`.
4. Não exigir autenticação (sem `authMiddleware`).
5. Aplicar rate limit de 60 req/min por IP nas rotas públicas.

**Critério de conclusão:** Ambos endpoints retornam dados corretos para um slug válido. Retornam 404 para slug inválido. Não exigem Authorization header.

---

- [ ] 5. Controller público — Criação de pedido

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

- [ ] 6. Controller público — Status do pedido

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

Fase 2: Shared Package — Tipos e Constantes

- [ ] 7. Atualizar tipos, constantes e validators no shared package

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

**Diretriz geral:** Todas as telas do cliente (PWA) devem seguir a mesma linguagem visual do app do operador — reutilizar os mesmos componentes base (Button, Input, Card, Badge), tokens de tema (tipografia, cores, espaçamentos, bordas) e padrões de interação. A UI do cliente deve ser visualmente coerente com o app do operador como parte do mesmo produto.

- [ ] 8. Setup de rotas, layout e API client do cliente

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

- [ ] 9. Tela de cardápio e carrinho

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

- [ ] 10. Tela de checkout (confirmação) e acompanhamento

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

Fase 4: Mobile e Finalização

- [ ] 11. Badge "Online" no app mobile

**Requisitos cobertos:** R8, R10

**Arquivos a modificar:**
- `apps/mobile/src/screens/OrderQueueScreen.tsx` (ou componente de card de pedido)

**Detalhes:**
1. Adicionar tratamento para `origin === 'web'` no mapeamento de badge:
   - Label: `"Online"`.
   - Ícone: `'language'` (Material Symbols — globe/web).
   - Reutilizar as constantes existentes `BADGE_BG_WHATSAPP` / `BADGE_TEXT_WHATSAPP` (mesma cor — ambos são pedidos remotos).
2. Atualizar `ORIGIN_ICON` map em `OrderQueueScreen.tsx` para incluir `{ web: 'language' }`.
3. Ajustar ternários de badge em `OrderQueueScreen.tsx` e `PaymentScreen.tsx` para reconhecer `'web'`.
4. `SwipeableOriginSelector` (tela de criar pedido) **não muda** — origin `'web'` é exclusivo para clientes, operador não pode selecionar.
5. Garantir que o card exibe corretamente para pedidos vindos da web.

**Critério de conclusão:** Pedidos criados via web aparecem na fila com badge "Online" (mesma cor do WhatsApp, diferenciados apenas pelo label).

---

- [ ] 12. PWA — Manifest e Service Worker

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

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": [1, 2, 7],
      "description": "Validação de slug, migration web origin e shared package (podem rodar em paralelo)"
    },
    {
      "wave": 2,
      "tasks": [3],
      "description": "Public tenant middleware (depende de task 1)"
    },
    {
      "wave": 3,
      "tasks": [4, 5, 6],
      "description": "Endpoints públicos (dependem de task 3)"
    },
    {
      "wave": 4,
      "tasks": [8],
      "description": "Frontend setup e layout (depende das APIs)"
    },
    {
      "wave": 5,
      "tasks": [9],
      "description": "Cardápio e carrinho (depende de task 8)"
    },
    {
      "wave": 6,
      "tasks": [10, 11, 12],
      "description": "Checkout, tracking, mobile badge e PWA (tasks 11 e 12 podem rodar em paralelo com 8-10)"
    }
  ]
}
```

## Notes

- **Decisão: `provisioning_key` como slug** — A coluna existente `tenants.provisioning_key` (TEXT UNIQUE) é reutilizada como slug público nas URLs. Não há migration para adicionar coluna nova. A Task 1 apenas adiciona validação de formato no onboarding.
- **Convenção de assets** — Imagens públicas ficam em `/assets/{slug}/` (Nginx → S3). O slug no path corresponde ao `provisioning_key` do tenant.
- **Estimativa total:** ~7-8 dias de desenvolvimento.
- Tasks 1, 2 e 7 podem ser executadas em paralelo como ponto de partida.
- Tasks 11 e 12 são independentes do fluxo principal do frontend e podem rodar em paralelo com tasks 8-10.
- Todas as rotas públicas não exigem autenticação, mas aplicam rate limiting.
- O `createOrder` existente já cuida de validação de items, snapshot de preços, transaction, daily_number e broadcast realtime.

| Fase | Tasks | Estimativa |
|------|-------|-----------|
| Backend (Validação + Migration + APIs) | 1-6 | 2-3 dias |
| Shared Package | 7 | 0.5 dia |
| Frontend (SPA) | 8-10 | 3-4 dias |
| Mobile + PWA | 11-12 | 1 dia |
