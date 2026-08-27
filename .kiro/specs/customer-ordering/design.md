# Design Document

## Overview

Este documento detalha a arquitetura e design técnico do canal de pedidos online para clientes (PWA). A solução adiciona rotas públicas ao backend existente, estende o modelo de dados com slug e nova origin, e entrega uma SPA React (dentro de `apps/web`) que funciona como cardápio digital + carrinho + acompanhamento de pedido em tempo real.

**Princípios:**
- Nenhuma autenticação para o cliente — endpoints públicos com resolução de tenant via slug.
- Reutilização máxima do `order.service.ts` existente.
- O app do operador (mobile) não é modificado estruturalmente — apenas recebe badge para nova origin.
- A SPA cliente é uma nova seção dentro de `apps/web` com rotas separadas.
- **Consistência visual:** A PWA do cliente segue a mesma linguagem visual do app do operador — mesmos tokens de tema, mesmos componentes base (Button, Input, Card, Badge), mesma tipografia e espaçamentos. Ambas as interfaces são reconhecíveis como parte do mesmo produto.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cliente (Navegador)                        │
│                                                                   │
│  /:slug → Cardápio → Carrinho → Confirmação → Acompanhamento    │
│                                                                   │
│  React 19 + Vite + React Router + TanStack Query                 │
└──────────────┬───────────────────────────────┬───────────────────┘
               │ HTTP (REST)                   │ WebSocket (Realtime)
               ▼                               ▼
┌──────────────────────────────┐   ┌───────────────────────────────┐
│   Backend Express (público)   │   │   Supabase Realtime            │
│                               │   │   Canal: orders:queue:{tid}    │
│  /api/public/:slug/branding   │   │   Evento: status_updated       │
│  /api/public/:slug/menu       │   └───────────────────────────────┘
│  /api/public/:slug/orders     │
│  /api/public/:slug/orders/:id │
└──────────────┬────────────────┘
               │
               ▼
┌──────────────────────────────┐
│   PostgreSQL (Supabase)       │
│   tenants (+ slug)            │
│   orders (origin: 'web')      │
│   menu_items / categories     │
└───────────────────────────────┘
```

### Diagramas de Sequência

#### Criação de Pedido

```
Cliente              App Web              Backend               DB              Realtime
  │                    │                    │                    │                  │
  │  Abre /:slug       │                    │                    │                  │
  │───────────────────>│                    │                    │                  │
  │                    │  GET /branding     │                    │                  │
  │                    │───────────────────>│  SELECT tenant     │                  │
  │                    │                    │───────────────────>│                  │
  │                    │  { branding }      │                    │                  │
  │                    │<───────────────────│                    │                  │
  │                    │  GET /menu         │                    │                  │
  │                    │───────────────────>│  SELECT items      │                  │
  │                    │                    │───────────────────>│                  │
  │                    │  { categories[] }  │                    │                  │
  │                    │<───────────────────│                    │                  │
  │  Monta carrinho    │                    │                    │                  │
  │  Informa nome      │                    │                    │                  │
  │  Confirma          │                    │                    │                  │
  │───────────────────>│                    │                    │                  │
  │                    │  POST /orders      │                    │                  │
  │                    │───────────────────>│  BEGIN TX           │                  │
  │                    │                    │  next_daily_number  │                  │
  │                    │                    │  INSERT order       │                  │
  │                    │                    │  INSERT items       │                  │
  │                    │                    │  COMMIT             │                  │
  │                    │                    │───────────────────>│                  │
  │                    │                    │                    │  broadcast        │
  │                    │                    │                    │─────────────────>│
  │                    │  { order }         │                    │                  │
  │                    │<───────────────────│                    │                  │
  │  Tela tracking     │                    │                    │                  │
  │<───────────────────│                    │                    │                  │
  │                    │  subscribe(channel)│                    │                  │
  │                    │─────────────────────────────────────────────────────────>│
```

#### Acompanhamento em Tempo Real

```
Operador (Mobile)     Backend             Realtime            App Web (Cliente)
  │                     │                    │                    │
  │  PATCH /orders/:id  │                    │                    │
  │  { status: pronto } │                    │                    │
  │────────────────────>│                    │                    │
  │                     │  UPDATE order      │                    │
  │                     │  broadcast event   │                    │
  │                     │───────────────────>│                    │
  │                     │                    │  status_updated    │
  │                     │                    │───────────────────>│
  │                     │                    │                    │  Atualiza UI
  │  200 OK             │                    │                    │  "PRONTO! 🎉"
  │<────────────────────│                    │                    │
```

---

## Components and Interfaces

### Backend — Rotas Públicas

#### Novo router: `src/routes/public.routes.ts`

Montado em `/api/public` no Express app. **Sem middleware de auth/tenant** — a resolução do tenant é feita pelo controller a partir do `:slug`.

```typescript
// Rotas:
GET  /api/public/:slug/branding   → publicBrandingController
GET  /api/public/:slug/menu       → publicMenuController
POST /api/public/:slug/orders     → publicCreateOrderController
GET  /api/public/:slug/orders/:id → publicOrderStatusController
```

#### Middleware de resolução por slug: `src/middleware/public-tenant.middleware.ts`

```typescript
export interface PublicTenantRequest extends Request {
  tenantId?: string;
  tenantSlug?: string;
}

export async function publicTenantMiddleware(req, res, next) {
  const slug = req.params.slug;
  // Valida formato do slug (regex)
  // SELECT id FROM tenants WHERE provisioning_key = $1 AND status = 'ativo'
  // Se não encontrar → 404 { error: 'TENANT_NOT_FOUND' }
  // Se encontrar → req.tenantId = row.id; req.tenantSlug = slug; next()
}
```

Este middleware é aplicado a todas as rotas sob `/api/public/:slug/`.

#### Controller: `src/controllers/public.controller.ts`

**`publicBrandingController`** (R5):
```typescript
// SELECT business_name, logo_url, theme, provisioning_key FROM tenants WHERE id = $1
// Retorna: { businessName, logoUrl, theme, slug: row.provisioning_key }
```

**`publicMenuController`** (R2):
```typescript
// Reutiliza fetchActiveMenuItems(tenantId) de whatsapp.service.ts
// (extrair para um service compartilhado: menu.service.ts)
// Agrupa por categoria, retorna array de { categoryName, sortOrder, items[] }
```

**`publicCreateOrderController`** (R3):
```typescript
// Valida body com publicCreateOrderSchema (Zod)
// Resolve primeiro admin ativo do tenant (mesma lógica do bot)
// Chama createOrder(tenantId, { customerName, origin: 'web', items, createdBy })
// Retorna: { id, dailyNumber, totalAmountCents, status, orderDate, createdAt }
```

**`publicOrderStatusController`** (R4):
```typescript
// Chama getOrderById(tenantId, orderId)
// Filtra campos sensíveis
// Retorna: { id, dailyNumber, customerName, status, totalAmountCents, createdAt, items }
```

#### Validação — Schema público

```typescript
// packages/shared/src/validators/public-order.validator.ts
export const publicCreateOrderSchema = z.object({
  customerName: z.string().min(1).max(100),
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  })).min(1).max(50),
});
```

Nota: `origin` não é aceito no body — é forçado para `'web'` pelo controller.

### Shared Package — Alterações

#### `packages/shared/src/constants/status.ts`

```typescript
export const ORDER_ORIGINS = ['presencial', 'whatsapp', 'web'] as const;
export type OrderOrigin = (typeof ORDER_ORIGINS)[number];
```

#### `packages/shared/src/validators/order.validator.ts`

```typescript
// Atualizar enum de origin:
origin: z.enum(['presencial', 'whatsapp', 'web']),
```

#### Novos tipos exportados

```typescript
// packages/shared/src/types/public.ts
export interface PublicMenuItem {
  id: string;
  name: string;
  priceCents: number;
  description?: string;
  categoryName: string;
  categorySortOrder: number;
}

export interface PublicMenuCategory {
  name: string;
  sortOrder: number;
  items: PublicMenuItem[];
}

export interface PublicBranding {
  businessName: string;
  logoUrl: string | null;
  theme: Record<string, unknown> | null;
  slug: string;  // maps to tenants.provisioning_key
}

export interface PublicOrderResponse {
  id: string;
  dailyNumber: number;
  customerName: string;
  status: string;
  totalAmountCents: number;
  orderDate: string;
  createdAt: string;
  items: { itemName: string; quantity: number; unitPriceCents: number }[];
}
```

### Frontend — App Web do Cliente

#### Localização no monorepo

A SPA do cliente vive em `apps/web` (já existe com Vite + React 19). As rotas do cliente são separadas das rotas do operador (login/queue):

```
apps/web/src/
├── main.tsx                    (entry point)
├── router.tsx                  (React Router config)
├── pages/
│   ├── operator/              (telas existentes: Login, Queue)
│   │   ├── LoginPage.tsx
│   │   └── QueuePage.tsx
│   └── customer/             (NOVAS telas)
│       ├── MenuPage.tsx       (cardápio + carrinho)
│       ├── CheckoutPage.tsx   (confirmação com nome)
│       └── TrackingPage.tsx   (acompanhamento em tempo real)
├── components/
│   └── customer/             (componentes específicos do cliente)
│       ├── MenuItem.tsx
│       ├── CartDrawer.tsx
│       ├── CartItem.tsx
│       ├── CategorySection.tsx
│       ├── OrderSummary.tsx
│       └── StatusBadge.tsx
├── hooks/
│   └── customer/
│       ├── usePublicMenu.ts   (TanStack Query)
│       ├── usePublicBranding.ts
│       ├── useCart.ts         (estado local + sessionStorage)
│       ├── useCreateOrder.ts  (mutation)
│       └── useOrderTracking.ts (polling + realtime)
├── lib/
│   └── public-api.ts         (HTTP client para rotas públicas)
└── stores/
    └── cart.store.ts          (Zustand ou Context — estado do carrinho)
```

#### Roteamento

```typescript
// React Router v6 config
const routes = [
  // Rotas do operador (existentes)
  { path: '/login', element: <LoginPage /> },
  { path: '/queue', element: <QueuePage /> },

  // Rotas do cliente (NOVAS)
  { path: '/:slug', element: <CustomerLayout />, children: [
    { index: true, element: <MenuPage /> },
    { path: 'checkout', element: <CheckoutPage /> },
    { path: 'pedido/:orderId', element: <TrackingPage /> },
  ]},
];
```

O `CustomerLayout` carrega branding e aplica o tema do tenant via CSS variables.

#### Fluxo de telas

```
/:slug (MenuPage)
  │
  │  [Adicionar itens ao carrinho]
  │  [Abrir carrinho → Ver resumo]
  │  [Botão "Fazer Pedido"]
  │
  ▼
/:slug/checkout (CheckoutPage)
  │
  │  [Digitar nome]
  │  [Confirmar pedido]
  │  [POST /api/public/:slug/orders]
  │
  ▼
/:slug/pedido/:orderId (TrackingPage)
  │
  │  [Exibe número, status, itens]
  │  [Realtime: atualiza status]
  │  [Destaque quando "pronto"]
```

#### Gerenciamento de estado do carrinho

```typescript
// useCart.ts — hook com sessionStorage
interface CartState {
  items: CartItem[];
  addItem(item: PublicMenuItem, qty: number): void;
  removeItem(menuItemId: string): void;
  updateQuantity(menuItemId: string, qty: number): void;
  clear(): void;
  total: number;
  count: number;
}
```

- Armazenado em `sessionStorage` (chave: `cart:{slug}`).
- Perdido ao fechar a aba (intencional — evita pedidos "fantasma" de sessões antigas).
- Atualizado de forma síncrona (sem backend envolvido).

#### Realtime — Acompanhamento

```typescript
// useOrderTracking.ts
// 1. GET /api/public/:slug/orders/:id para estado inicial
// 2. Subscribe no canal Supabase: orders:queue:{tenantId}
//    - Filtra eventos 'status_updated' onde payload.id === orderId
//    - Atualiza status local
// 3. Fallback: polling a cada 30s caso WebSocket falhe
```

O `tenantId` necessário para montar o nome do canal é retornado junto ao branding (campo adicional: `channelId` ou resolve do slug no client). Alternativa: o backend retorna o `tenantId` no response de criação de pedido (campo dedicado para o realtime).

**Decisão:** O endpoint de branding retorna um campo `realtimeChannel` com o nome completo do canal (`orders:queue:{tenantId}`), evitando expor o UUID do tenant diretamente.

#### PWA

- `public/manifest.json` com `start_url: "/"`, `display: "standalone"`.
- O slug do tenant é resolvido no runtime; o manifest é genérico.
- Service Worker (Workbox via `vite-plugin-pwa`) cacheia assets estáticos e a última resposta de `/menu`.
- Fallback offline: exibe cardápio cacheado com banner "Você está offline — preços podem estar desatualizados".

### Mobile App — Alterações Mínimas

#### Badge de origin `'web'`

No `OrderQueueScreen.tsx`, adicionar tratamento para `origin === 'web'`:

```typescript
// Reutiliza as cores do WhatsApp (ambos são pedidos remotos, diferenciados pelo label)
{ origin: 'web', label: 'Online', bg: BADGE_BG_WHATSAPP, text: BADGE_TEXT_WHATSAPP }
```

#### Nenhuma outra alteração

O app mobile já:
- Recebe eventos realtime de `new_order` independente da origin.
- Permite avançar status de qualquer pedido.
- Exibe todos os campos relevantes no card.

---

## Data Models

### Tabela `tenants` — `provisioning_key` como slug público

**Decisão:** A coluna `provisioning_key` existente (TEXT UNIQUE) é reutilizada como slug público. Já contém valores URL-friendly definidos no onboarding (ex.: `dev-first-tenant`, `pastel-das-meninas`). Não é necessário criar coluna adicional.

**Resolução pública do tenant:**
```sql
SELECT id FROM tenants WHERE provisioning_key = $1 AND status = 'ativo'
```

**Validação de formato no onboarding** (a adicionar no `provisionTenant` service):
- Regex: `^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$`
- Mínimo 3, máximo 60 caracteres.
- Somente lowercase, números e hífens. Não pode começar/terminar com hífen.
- Palavras reservadas rejeitadas: `api`, `admin`, `health`, `webhook`, `static`, `public`, `assets`.

**Convenção de assets:** O `provisioning_key` (slug) é usado como namespace no bucket S3:
```
/assets/{provisioning_key}/logo.png
/assets/{provisioning_key}/menu/item-1.jpg
```

### Tabela `orders` — Nova origin `'web'`

```sql
-- Migration 012_add_web_origin.sql
ALTER TABLE orders DROP CONSTRAINT orders_origin_check;
ALTER TABLE orders ADD CONSTRAINT orders_origin_check
  CHECK (origin IN ('presencial', 'whatsapp', 'web'));
```

### Sem novas tabelas

O pedido online não requer tabelas adicionais. O carrinho é client-side (sessionStorage). A sessão do cliente é stateless no backend.

---

## Correctness Properties

1. **Isolamento de tenant**: Endpoints públicos sempre resolvem o tenant via slug. O `tenantRepository` garante que nenhum dado de outro tenant seja acessado.
2. **Snapshot de preço**: O total do pedido é calculado no backend no momento da criação (não confia no total enviado pelo cliente).
3. **Idempotência de slug**: `provisioning_key` é UNIQUE no DB — impossível duplicar. A mesma coluna serve como chave de idempotência do onboarding e como slug público.
4. **Consistência de numeração**: `next_daily_number()` roda dentro da transação — sem gaps mesmo com pedidos concorrentes de web + presencial + whatsapp.
5. **Sem bypass de status**: O cliente não pode mudar o status do pedido — apenas visualiza. Mudanças passam pelo middleware autenticado (operador).
6. **Origin imutável**: O controller força `origin: 'web'` — o client não pode escolher outra origin.

---

## Error Handling

### Rotas Públicas — Erros HTTP

| Cenário | Status | Corpo |
|---------|--------|-------|
| Slug não encontrado ou tenant inativo | 404 | `{ error: 'TENANT_NOT_FOUND' }` |
| Slug com formato inválido | 400 | `{ error: 'INVALID_SLUG_FORMAT' }` |
| Body do pedido inválido (Zod) | 400 | `{ error: 'VALIDATION_ERROR', details: [...] }` |
| Item do menu não encontrado ou inativo | 400 | `{ error: 'INVALID_MENU_ITEM', menuItemId: '...' }` |
| Pedido não encontrado (GET status) | 404 | `{ error: 'ORDER_NOT_FOUND' }` |
| Rate limit excedido | 429 | `{ error: 'TOO_MANY_REQUESTS' }` |
| Erro interno inesperado | 500 | `{ error: 'INTERNAL_ERROR' }` |

### Frontend — Tratamento de Erros

- **Falha de rede ao carregar cardápio**: Exibe cardápio do cache (Service Worker) com banner de aviso. Se não há cache, mostra tela de erro com botão "Tentar novamente".
- **Falha ao criar pedido**: Toast com mensagem amigável + botão de retry. Não limpa o carrinho.
- **WebSocket desconectado**: Fallback para polling a cada 30s. Indicador visual discreto ("Atualizando...").
- **Tenant não encontrado (404)**: Tela dedicada "Estabelecimento não encontrado" com sugestão de verificar o link.

---

## Testing Strategy

### Testes de Propriedade (Property-based)

- **Isolamento de tenant**: Gerar múltiplos tenants com slugs distintos, criar pedidos via rotas públicas, verificar que cada endpoint retorna apenas dados do tenant correto.
- **Consistência de numeração**: Criar pedidos concorrentes (web + presencial + whatsapp) para o mesmo tenant, verificar que `dailyNumber` é sequencial sem gaps.
- **Validação de slug**: Gerar slugs aleatórios e verificar que apenas os conformes ao regex são aceitos.

### Testes de Integração

- **Fluxo completo**: Branding → Menu → Criar pedido → Consultar status. Verifica o happy path end-to-end contra o banco real (test container).
- **Rate limiting**: Enviar requisições acima do limite e verificar resposta 429.
- **Itens inválidos**: Enviar pedido com `menuItemId` inexistente e verificar rejeição.

### Testes de Frontend (Vitest + Testing Library)

- **useCart hook**: Adicionar, remover, atualizar quantidade, limpar. Verificar persistência no sessionStorage.
- **MenuPage**: Mock da API, renderizar categorias e itens corretamente.
- **CheckoutPage**: Submissão do formulário, loading state, tratamento de erro.
- **TrackingPage**: Atualização de status via mock de WebSocket.

### Testes E2E (Playwright)

- Fluxo completo do cliente: acessar slug → navegar cardápio → montar carrinho → checkout → ver tracking.
- Verificar responsividade mobile (viewport 375px).
- Verificar offline fallback (interceptar rede).

---

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| `provisioning_key` como slug (não coluna nova) | Já é UNIQUE, URL-friendly, e definido no onboarding. Evita migration e coluna redundante. |
| SPA dentro de `apps/web` (não app separado) | Reutiliza o Vite config, shared theme, e deploy existentes. Rotas separadas por path. |
| sessionStorage (não localStorage) | Carrinho desaparece ao fechar aba. Evita pedidos "fantasma" de semanas atrás. |
| Sem autenticação do cliente | Fricção mínima. O operador é a barreira humana (vê o cliente presencialmente). |
| Slug no tenant (não subdomain) | Mais simples de deploy (um único domínio). Subdomínios adicionam complexidade de DNS/SSL. |
| Rate limit leve (60/min por IP) | Padrão de higiene. Sem captcha ou SMS. |
| Campo `realtimeChannel` no branding | Evita expor UUID do tenant ao client. O client usa o nome do canal diretamente. |
| TanStack Query para fetching | Caching automático, stale-while-revalidate, retry. Já é dependência do projeto web. |
| Polling fallback (30s) | Resiliência caso WebSocket caia em redes instáveis de food truck. |
| Assets em `/assets/{slug}/` | Convenção unificada. Nginx proxy pro S3 sem passar pelo Express. Slug = provisioning_key. |

## Segurança e Rate Limiting

Mesmo sem camadas de proteção anti-abuso por agora (conforme decisão do usuário), aplicamos o mínimo de higiene:

- **Rate limit global** nas rotas públicas: 60 requests/minuto por IP (Express `express-rate-limit`).
- **Limite de tamanho do body**: 10KB para POST de pedido.
- **Validação estrita** do schema Zod — rejeita campos extras (`z.strict()`).
- **Sem CORS aberto para tudo**: configurar `Access-Control-Allow-Origin` para o domínio do app web em produção.

Essas medidas são padrão e não adicionam fricção ao cliente.
