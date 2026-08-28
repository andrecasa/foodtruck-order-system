# Implementation Plan

## Overview

As tasks estão ordenadas por dependência. Cada task é autocontida e resulta em código testável. O total estimado é de 12 tasks divididas em 4 fases: Backend (infra + APIs), Shared Package, Frontend do Cliente (dentro do `apps/mobile`), e ajustes do App Operador + PWA. A Task 12 (PWA) é opcional — a infra já existe. Estimativa total: ~5.5-7 dias.

**Arquitetura:** O fluxo do cliente é incorporado ao `apps/mobile` (Expo + react-native-web) num grupo de rotas públicas `app/(public)/`, reutilizando componentes, tema, api-client e realtime existentes. Não há SPA nova em `apps/web`. Ver `design.md` para a justificativa e a disposição do `apps/web`.

## Tasks

Fase 1: Backend — Modelo de Dados e APIs Públicas

- [ ] 1. Validação de formato do slug (provisioning_key) no onboarding

**Requisitos cobertos:** R1

**Arquivos a modificar:**
- `apps/backend/src/services/tenant-provision.service.ts`

**Detalhes:**
1. A coluna `provisioning_key` existente (TEXT UNIQUE) será usada como slug público. **Não é necessária nova migration.**
2. Adicionar validação de formato do `provisioning_key` **apenas na criação de tenant novo**:
   - Regex: `^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$` (3-60 chars, lowercase/dígitos/hífens, não começa/termina com hífen).
   - Rejeitar reservadas: `api`, `admin`, `health`, `webhook`, `static`, `assets`, `public`, `login`, `queue`.
   - Se inválido → incluir `'provisioningKey'` no array de campos inválidos (comportamento existente).
3. **Idempotência preservada:** a validação de formato roda SÓ quando `findExistingByKey` retorna nulo (tenant novo). Reprovisão de tenant já existente NÃO revalida o formato — evita quebrar tenants antigos com keys fora do novo padrão.
4. Documentar no código que `provisioning_key` serve duplo propósito: chave de idempotência do onboarding E slug público na URL.

**Critério de conclusão:** Criação de tenant rejeita keys com formato inválido; reprovisão idempotente de tenant existente não revalida. Keys existentes (`dev-first-tenant`, `pastel-das-meninas`) são válidas. Testes existentes continuam passando.

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
   - Valida formato do slug (regex) ANTES de bater no DB → se inválido, `400 { error: 'INVALID_SLUG_FORMAT' }`.
   - Consulta `SELECT id FROM tenants WHERE provisioning_key = $1 AND status = 'ativo'`.
   - Se não encontrar → `404 { error: 'TENANT_NOT_FOUND', message: 'Estabelecimento não encontrado.' }`.
   - Se encontrar → seta `req.tenantId` e `req.tenantSlug`, chama `next()`.
3. Usar o `pool` compartilhado (resolução de tenant é platform-level, não tenant-scoped).

**Critério de conclusão:** Middleware testável isoladamente. Retorna **400** para slug com formato inválido e **404** para slug inexistente/tenant inativo. Seta `tenantId` corretamente para slugs válidos.

---

- [ ] 4. Rotas e controllers públicos — Branding e Menu (+ hardening do router)

**Requisitos cobertos:** R2, R5, R11

**Arquivos a criar/modificar:**
- Criar `apps/backend/src/routes/public.routes.ts`
- Criar `apps/backend/src/controllers/public.controller.ts`
- Modificar `apps/backend/src/index.ts` (montar o router em `/api/public`)

**Detalhes:**
1. Criar router Express com hardening (R11): `rateLimit(60/min por IP)` + `express.json({ limit: '10kb' })` **local do router** (não altera o parser global) + `publicTenantMiddleware`. Instalar a dependência de rate limiting se não existir no backend.
2. Implementar `GET /api/public/:slug/branding`:
   - `SELECT business_name, logo_url, theme, provisioning_key FROM tenants WHERE id = $1`.
   - Retorna `{ businessName, logoUrl, theme, slug: row.provisioning_key, realtimeChannel: 'orders:queue:'+tenantId }`.
3. Implementar `GET /api/public/:slug/menu`:
   - Reutilizar `getMenu(tenantId, false)` de `services/menu.service.ts` (o MESMO do endpoint autenticado). **Não usar nada do `whatsapp.service.ts`.** O `getMenu(false)` já filtra itens e categorias inativas.
   - Mapear o retorno para o DTO público: `price → priceCents`; descartar `status`, `createdAt`, `updatedAt` (campos internos); não incluir `description` (não existe no schema).
   - Preservar `sortOrder` por categoria no output (o `getMenu` atual o descarta no `.map` final — ajustar o service para retornar `sortOrder`, ou remapear no controller).
4. Sem `authMiddleware`.

**Critério de conclusão:** Ambos endpoints retornam dados corretos para slug válido; 400 para formato inválido, 404 para slug inexistente; não exigem Authorization header; rate limit ativo.

---

- [ ] 5. Controller público — Criação de pedido

**Requisitos cobertos:** R3, R8, R10, R11
**Depende de:** Task 7 (consome `publicCreateOrderSchema` do shared package)

**Arquivos a criar/modificar:**
- Modificar `apps/backend/src/controllers/public.controller.ts`

**Detalhes:**
1. Importar `publicCreateOrderSchema` de `@order-system/shared` (o schema é criado na Task 7, não aqui).
2. Implementar `POST /api/public/:slug/orders`:
   - Validar body com `publicCreateOrderSchema` (`.strict()` → payload inválido = 400).
   - Resolver primeiro admin ativo: `SELECT id FROM users WHERE tenant_id = $1 AND role = 'admin' AND status = 'ativo' ORDER BY created_at ASC LIMIT 1`. Se nenhum → `422 { error: 'TENANT_UNAVAILABLE' }`.
   - Chamar `createOrder(tenantId, { customerName, origin: 'web', items, createdBy })` dentro de try/catch: mapear `ServiceError.statusCode` (ex.: item inválido → 422) para a resposta HTTP.
   - Retornar `{ id, dailyNumber, totalAmountCents, status, orderDate, createdAt }`.
3. O `createOrder` existente já faz: validação de items, snapshot de preços, transaction, daily_number, broadcast realtime.

**Critério de conclusão:** Endpoint cria pedido com origin `'web'` (aparece na fila via realtime); 400 para body inválido; 422 para item inválido ou tenant sem admin.

---

- [ ] 6. Controller público — Status do pedido

**Requisitos cobertos:** R4

**Arquivos a criar/modificar:**
- Modificar `apps/backend/src/controllers/public.controller.ts`

**Detalhes:**
1. Implementar `GET /api/public/:slug/orders/:orderId`:
   - Chamar `getOrderById(tenantId, orderId)` em try/catch — ele lança `ServiceError(404)` quando não existe ou é de outro tenant; mapear para `404 { error: 'ORDER_NOT_FOUND' }`.
   - Filtrar campos sensíveis. Retornar apenas: `{ id, dailyNumber, customerName, status, totalAmountCents, createdAt, items: [{ itemName, quantity, unitPriceCents }] }`.
2. Não expor: `created_by`, `payment_status`, `payment_method`.

**Critério de conclusão:** Retorna status correto para pedido existente; 404 (não 500) para pedido inexistente/de outro tenant; não expõe campos sensíveis.

---

Fase 2: Shared Package — Tipos e Constantes

- [ ] 7. Atualizar tipos, constantes e validators no shared package

**Requisitos cobertos:** R8

**Arquivos a criar/modificar:**
- Modificar `packages/shared/src/constants/status.ts` (adicionar `'web'` a `ORDER_ORIGINS`)
- Modificar `packages/shared/src/validators/order.validator.ts` (adicionar `'web'` ao enum de origin)
- Criar `packages/shared/src/validators/public-order.validator.ts` (schema `publicCreateOrderSchema`)
- Criar `packages/shared/src/types/public.ts` (tipos públicos: `PublicMenuItem`, `PublicMenuCategory`, `PublicBranding`, `PublicOrderResponse`)
- Modificar `packages/shared/src/index.ts` (exportar novos tipos e validators)

**Detalhes:**
1. Adicionar `'web'` ao array `ORDER_ORIGINS` e ao tipo `OrderOrigin`.
2. Atualizar `createOrderRequestSchema` para aceitar `'web'` no enum de origin.
3. Criar e exportar `publicCreateOrderSchema` com `.strict()` (dono deste schema — consumido pela Task 5):
   - `customerName`: string, min 1, max 100.
   - `items`: array de `{ menuItemId: uuid, quantity: int 1-99 }`, min 1, max 50.
   - Sem campo `origin` (forçado pelo controller na Task 5). `.strict()` rejeita campos extras (R11.4).
4. Definir e exportar interfaces públicas usadas tanto pelo backend quanto pelo frontend.

**Critério de conclusão:** `pnpm typecheck` passa sem erros. Novos tipos estão disponíveis para import em apps/backend e apps/mobile.

---

## Fase 3: Frontend do Cliente (dentro de `apps/mobile`)

**Diretriz geral:** As telas do cliente vivem no `apps/mobile` (grupo de rotas `app/(public)/`) e devem REUTILIZAR os componentes base existentes (Button, Input, Card, Badge, Typography, Modal) e o sistema de tema. Criar apenas os componentes/telas realmente novos, sob subpastas `customer/`. Como vivem no mesmo app do operador, a coerência visual é garantida por construção.

- [ ] 8. Grupo de rotas público, auth gate, layout e client público

**Requisitos cobertos:** R5, R6

**Arquivos a criar/modificar:**
- Modificar `apps/mobile/src/hooks/useAuth.tsx` (relaxar o auth gate para permitir o grupo `(public)`)
- Criar `apps/mobile/app/(public)/_layout.tsx` (layout público: resolve branding por slug e aplica tema)
- Criar `apps/mobile/app/(public)/[slug]/index.tsx` (rota → `CustomerMenuScreen`)
- Criar `apps/mobile/src/services/public-client.ts` (chamadas às rotas `/api/public` sem token)
- Criar `apps/mobile/src/hooks/customer/usePublicBranding.ts`

**Detalhes:**
1. **Auth gate:** ajustar o redirect em `useAuth.tsx` para tratar `(public)` como rota não autenticada:
   ```typescript
   const PUBLIC_GROUPS = ['login', '(public)'];
   const inPublicRoute = PUBLIC_GROUPS.includes(segments[0]);
   if (!user && !inPublicRoute) router.replace('/login');
   else if (user && segments[0] === 'login') router.replace('/(tabs)');
   ```
2. **`public-client.ts`:** funções sem Authorization header — `fetchPublicBranding(slug)`, `fetchPublicMenu(slug)`, `createPublicOrder(slug, body)`, `fetchPublicOrder(slug, orderId)`. Base URL via `EXPO_PUBLIC_API_URL` (mesmo padrão do `real-client.ts`).
3. **`(public)/_layout.tsx`:** resolve o branding a partir do `slug` da rota (via `usePublicBranding`), aplica o tema com o `ThemeProvider` existente (usar `applyBranding`), e renderiza as telas filhas. Exibe tela de "Estabelecimento não encontrado" se o branding retornar 404.
4. **`usePublicBranding.ts`:** hook que busca branding por slug e retorna `{ branding, realtimeChannel, isLoading, error }`.

**Critério de conclusão:** Acessar `/:slug` no navegador carrega o layout com branding sem exigir login. Slug inválido mostra tela de erro. Rotas do operador continuam protegidas.

---

- [ ] 9. Tela de cardápio e carrinho

**Requisitos cobertos:** R6

**Arquivos a criar/modificar:**
- Criar `apps/mobile/src/screens/customer/CustomerMenuScreen.tsx`
- Criar `apps/mobile/src/components/customer/CategorySection.tsx`
- Criar `apps/mobile/src/components/customer/CustomerMenuItem.tsx`
- Criar `apps/mobile/src/components/customer/CartSheet.tsx`
- Criar `apps/mobile/src/components/customer/CartLineItem.tsx`
- Criar `apps/mobile/src/hooks/customer/usePublicMenu.ts`
- Criar `apps/mobile/src/hooks/customer/useCart.ts`

**Detalhes:**
1. `CustomerMenuScreen`:
   - Fetch menu via `usePublicMenu(slug)` (usa `public-client.ts`).
   - Renderiza categorias com `CategorySection` → lista de `CustomerMenuItem`.
   - Barra inferior fixa com ícone do carrinho, contador de itens e total (reutilizar componentes base + tema).
   - Ao tocar na barra, abre `CartSheet` (bottom sheet do carrinho).
2. `CustomerMenuItem`:
   - Exibe nome e preço formatado via util `formatPrice` existente (`R$ X,XX`).
   - Botão "Adicionar" (reutilizar `Button`) que incrementa quantidade no carrinho.
3. `CartSheet`:
   - Lista de `CartLineItem` com nome, preço, controles +/- de quantidade, botão remover.
   - Total geral no rodapé.
   - Botão "Fazer Pedido" → navega para `/:slug/checkout`. Desabilitado se carrinho vazio.
4. `useCart`:
   - Estado via `useState` + persistência abstraída por plataforma (`Platform.OS === 'web' ? sessionStorage : in-memory`, chave `cart:{slug}`).
   - Funções: `addItem`, `removeItem`, `updateQuantity`, `clear`.
   - Computed: `total`, `count`.

**Critério de conclusão:** Cliente consegue navegar pelo cardápio, adicionar/remover itens, ver o resumo no carrinho. Na web, o carrinho persiste durante a navegação mas desaparece ao fechar a aba. Telas usam os componentes base e o tema existentes.

---

- [ ] 10. Tela de checkout (confirmação) e acompanhamento

**Requisitos cobertos:** R7, R10

**Arquivos a criar/modificar:**
- Criar `apps/mobile/app/(public)/[slug]/checkout.tsx` (rota → `CustomerCheckoutScreen`)
- Criar `apps/mobile/app/(public)/[slug]/pedido/[orderId].tsx` (rota → `CustomerTrackingScreen`)
- Criar `apps/mobile/src/screens/customer/CustomerCheckoutScreen.tsx`
- Criar `apps/mobile/src/screens/customer/CustomerTrackingScreen.tsx`
- Criar `apps/mobile/src/hooks/customer/useCreateOrder.ts`
- Criar `apps/mobile/src/hooks/customer/usePublicOrderTracking.ts`
- Criar `apps/mobile/src/components/customer/OrderSummary.tsx`

**Detalhes:**
1. `CustomerCheckoutScreen`:
   - Exibe resumo do pedido (`OrderSummary`: itens, quantidades, total).
   - Campo de nome do cliente (reutilizar `Input`; obrigatório, validação client-side).
   - Botão "Confirmar Pedido" (reutilizar `Button`) → `createPublicOrder(slug, body)` via `useCreateOrder`.
   - Loading state durante request. Erro amigável com opção de retry (não limpa o carrinho no erro).
   - On success: limpa carrinho, navega para `/:slug/pedido/:orderId`.
2. `CustomerTrackingScreen`:
   - Fetch inicial via `fetchPublicOrder(slug, orderId)`.
   - Exibe: número do pedido (grande, destaque), nome do cliente, itens, total, status atual.
   - `usePublicOrderTracking`: subscribe no canal realtime (nome vindo do branding) reutilizando o cliente Supabase existente; filtra `status_updated` com `payload.id === orderId`. Fallback: polling a cada 30s.
   - Quando status = `pronto`: destaque visual (fundo verde, ícone de check, texto "Seu pedido está pronto!").
   - Quando status = `entregue`: mensagem de conclusão ("Pedido entregue. Obrigado!").
   - Funciona após reload (orderId está na rota).
   - Status renderizado com o `Badge` existente (cores por status do tema).

**Critério de conclusão:** Fluxo completo funciona end-to-end: cardápio → carrinho → nome → confirmar → tela de acompanhamento com atualização em tempo real quando operador muda status.

---

## Fase 4: App Operador e Finalização

- [ ] 11. Badge "Online" no App Operador

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

- [ ] 12. PWA — Verificação (infra já existente) — OPCIONAL

**Requisitos cobertos:** R9

**Contexto:** O PWA já está funcional e configurado manualmente em `apps/mobile/public/` (`manifest.json`, `icons/`, `sw.js`, `index.html`). Esta task NÃO recria essa infra — apenas verifica que ela atende o fluxo do cliente. É opcional e de baixo esforço.

**Arquivos (só se necessário):**
- `apps/mobile/public/manifest.json` (já existe — voltado ao operador hoje)
- `apps/mobile/public/sw.js` (já existe)

**Detalhes:**
1. Verificar que o PWA carrega e funciona ao acessar uma rota de cliente (`/:slug`) — o manifest e o SW existentes já se aplicam globalmente.
2. **Limitação conhecida (documentar, não bloqueia):** o `manifest.json` é único e global. Hoje aponta para o operador (`start_url: "/"`, `short_name: "Food Truck App"`). Um cliente que "instalar" a partir de `/:slug` reabrirá em `/` (login do operador), não no cardápio. Como o cliente acessa por QR/link e raramente instala, isso é aceitável no escopo inicial. Evolução futura: manifest dinâmico ou `start_url` por contexto — fora de escopo.
3. **Offline (nice-to-have):** o `sw.js` já existe; avaliar se cacheia o cardápio do cliente de forma útil. Ajuste opcional, não bloqueante.

**Critério de conclusão:** Confirmado que o cliente acessa e usa o fluxo pelo navegador/PWA. Limitação do manifest global documentada. Nenhuma recriação de infra PWA necessária.

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": [1, 2, 7],
      "description": "Validação de slug no onboarding, migration da origin 'web' e shared package (tipos/constantes/validators). Independentes entre si — podem rodar em paralelo."
    },
    {
      "wave": 2,
      "tasks": [3],
      "description": "Middleware de resolução de tenant por slug (base para todas as rotas públicas)."
    },
    {
      "wave": 3,
      "tasks": [4, 5, 6],
      "description": "Endpoints públicos + hardening do router (rate limit, body 10kb, CORS) na task 4. Dependem da task 3; a task 5 também depende da task 7 (publicCreateOrderSchema)."
    },
    {
      "wave": 4,
      "tasks": [8],
      "description": "Grupo de rotas público, auth gate, layout e client público no apps/mobile (depende das APIs das waves 2-3)."
    },
    {
      "wave": 5,
      "tasks": [9],
      "description": "Cardápio e carrinho (depende da task 8)."
    },
    {
      "wave": 6,
      "tasks": [10, 11, 12],
      "description": "Checkout+tracking (depende da task 9). Badge no operador (11) e PWA (12) são independentes e podem rodar em paralelo com 8-10."
    }
  ]
}
```

## Notes

- **Decisão: `provisioning_key` como slug** — A coluna existente `tenants.provisioning_key` (TEXT UNIQUE) é reutilizada como slug público nas URLs. Não há migration para adicionar coluna nova. A Task 1 apenas adiciona validação de formato no onboarding.
- **Convenção de assets** — Imagens públicas ficam em `/assets/{slug}/` (Nginx → S3). O slug no path corresponde ao `provisioning_key` do tenant.
- **Feature incorporada ao `apps/mobile`** — o fluxo do cliente vive no grupo `app/(public)/` do app existente, reutilizando componentes, tema, api-client e realtime. Não há SPA nova em `apps/web` (que permanece fora de escopo; ver `design.md`).
- **Estimativa total:** ~5.5-7 dias de desenvolvimento (menor que a abordagem SPA separada, pelo reuso; Task 12 opcional pois o PWA já existe).
- Tasks 1, 2 e 7 podem ser executadas em paralelo como ponto de partida.
- Task 11 é independente do fluxo principal do frontend e pode rodar em paralelo com tasks 8-10.
- **Task 12 é opcional** — a infra PWA (`manifest.json`, `icons/`, `sw.js`) já existe em `apps/mobile/public/`; a task apenas verifica adequação ao fluxo do cliente e documenta a limitação do manifest global.
- **Hardening (R11)** é feito no router público (Task 4): rate limit por IP (instalar dependência se faltar), `express.json` local de 10kb (sem tocar o parser global) e revisão do CORS (`cors()` global aberto hoje). Zod `.strict()` no schema (Task 7).
- Rotas públicas não exigem autenticação.
- Erros de service (`ServiceError`) devem ser capturados e mapeados nos controllers públicos (Tasks 5 e 6) — não deixar vazar como 500.
- O `createOrder` existente já cuida de validação de items, snapshot de preços, transaction, daily_number e broadcast realtime.

| Fase | Tasks | Estimativa |
|------|-------|-----------|
| Backend (Validação + Migration + APIs) | 1-6 | 2-3 dias |
| Shared Package | 7 | 0.5 dia |
| Frontend do Cliente (apps/mobile) | 8-10 | 2.5-3 dias |
| App Operador (badge) + PWA (verificação, opcional) | 11-12 | ~0.5 dia |
| **Total** | **12 tasks (12 opcional)** | **~5.5-7 dias** |
