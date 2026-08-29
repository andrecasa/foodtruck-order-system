# Design Document

## Overview

Este documento detalha a arquitetura e design técnico do canal de pedidos online para clientes (PWA). A solução adiciona rotas públicas ao backend existente, estende o modelo de dados com slug e nova origin, e entrega o fluxo do cliente **dentro do app existente `apps/mobile`** (React Native + Expo), que já produz saída web/PWA via `react-native-web`. As telas do cliente vivem em um grupo de rotas públicas (`app/(public)/`), reutilizando os componentes, tema, api-client e realtime já existentes.

**Por que dentro do `apps/mobile` e não numa SPA separada em `apps/web`:**
- `apps/mobile` já tem alvo web/PWA configurado (`react-native-web`, `expo start --web`, `expo export --platform web`), biblioteca de componentes completa, sistema de tema/branding, api-client maduro (com refresh de token) e realtime pronto.
- `apps/web` está defasado (sem router, 2 páginas, api-client e tema duplicados). Criar a feature lá reimplementaria UI, tema, realtime e api-client do zero, aprofundando a duplicação já existente entre os dois apps.
- Hospedar no `apps/mobile` maximiza reuso e mantém um único ponto de manutenção para componentes, tema e integração com o backend.

**Princípios:**
- Nenhuma autenticação para o cliente — endpoints públicos com resolução de tenant via slug.
- Reutilização dos services de backend existentes (`order.service.ts` → `createOrder`/`getOrderById`; `menu.service.ts` → `getMenu`) e dos componentes/tema/realtime do `apps/mobile` (frontend). **Nada do `whatsapp.service.ts` é reutilizado** — o bot fica isolado do fluxo web.
- O app do operador (telas autenticadas existentes) não é modificado estruturalmente — apenas: (a) recebe badge para a nova origin, e (b) o auth gate passa a permitir um grupo de rotas públicas.
- **Consistência visual por construção:** como o App Cliente vive no mesmo app do operador e reutiliza os mesmos componentes base (Button, Input, Card, Badge, Typography) e tokens de tema, não há biblioteca paralela nem risco de divergência visual.

**Disposição do `apps/web`:** Fora do escopo desta feature. No curto prazo permanece como está (fila web do operador). No médio prazo, dado que o `apps/mobile` já roda no navegador, recomenda-se avaliar a aposentadoria do `apps/web` para eliminar a duplicação — decisão separada, registrada aqui apenas como direção.

### Modelo de Uso / Pontos de Entrada

Um único `apps/mobile` (nativo + PWA) atende operador e cliente. O contexto é determinado pela **rota de entrada**, não por builds separados:

```
apps/mobile (mesmo código)
├── Nativo (Android/iOS, lojas) ── entra em / → login ──────────── OPERADOR
├── PWA / navegador na raiz  /  ── login (rota autenticada) ────── OPERADOR
└── PWA / navegador em /:slug ─── grupo (public), sem login ────── CLIENTE (via QR/link)
```

- `/` (raiz) → **contexto operador** (login). O cliente nunca acessa a raiz.
- `/:slug` → **contexto cliente** (cardápio público). Acesso exclusivo por link/QR code; o slug (= `provisioning_key`) resolve o tenant e o branding.
- **App nativo das lojas = exclusivo do operador.** O cliente não faz pedidos pelo nativo porque não há ponto de entrada com slug no binário nativo (não há URL de entrada). O cliente usa a web/PWA e pode "instalar" via "adicionar à tela inicial" (sem loja).
- **Auth gate:** como operador e cliente compartilham o mesmo PWA, o gate em `useAuth.tsx` distingue por rota — o grupo `(public)` passa sem login; as demais rotas continuam protegidas.
- **Deep linking** (`/:slug` abrir o app nativo no cardápio) é possível com o expo-router, mas fica FORA do escopo desta feature.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cliente (Navegador)                        │
│                                                                   │
│  /:slug → Cardápio → Carrinho → Confirmação → Acompanhamento    │
│                                                                   │
│  apps/mobile (Expo + react-native-web) — grupo app/(public)/     │
│  expo-router (rotas públicas) + Supabase Realtime                │
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
Cliente            App Cliente            Backend               DB              Realtime
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
App Operador          Backend             Realtime            App Cliente
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

Montado em `/api/public` no Express app. **Sem auth/tenant middleware** — o tenant é resolvido pelo `publicTenantMiddleware` a partir do `:slug`.

```typescript
// Router público (hardening — R11):
//   rateLimit(60/min por IP)  → aplicado a todo /api/public
//   express.json({ limit: '10kb' }) → parser LOCAL do router (não altera o global)
//   publicTenantMiddleware    → resolve tenant por slug

GET  /api/public/:slug/branding   → publicBrandingController
GET  /api/public/:slug/menu       → publicMenuController
POST /api/public/:slug/orders     → publicCreateOrderController
GET  /api/public/:slug/orders/:id → publicOrderStatusController
```

**CORS:** o `index.ts` usa `cors()` global (aberto). Para as rotas públicas, revisar para permitir o(s) domínio(s) do PWA sem abrir além do necessário. Como PWA e API convivem atrás do Nginx (mesmo domínio em produção), na prática o CORS não bloqueia o cliente; a revisão garante que uma futura restrição do CORS global não quebre o fluxo público.

#### Middleware de resolução por slug: `src/middleware/public-tenant.middleware.ts`

```typescript
export interface PublicTenantRequest extends Request {
  tenantId?: string;
  tenantSlug?: string;
}

export async function publicTenantMiddleware(req, res, next) {
  const slug = req.params.slug;
  // 1. Formato inválido (regex) → 400 { error: 'INVALID_SLUG_FORMAT' } (rejeita antes do DB)
  // 2. SELECT id FROM tenants WHERE provisioning_key = $1 AND status = 'ativo'
  //    - não encontrado → 404 { error: 'TENANT_NOT_FOUND' }
  //    - encontrado → req.tenantId = row.id; req.tenantSlug = slug; next()
}
```

Este middleware é aplicado a todas as rotas sob `/api/public/:slug/`.

#### Controller: `src/controllers/public.controller.ts`

**`publicBrandingController`** (R5):
```typescript
// SELECT business_name, logo_url, theme, provisioning_key FROM tenants WHERE id = $1
// Retorna: { businessName, logoUrl, theme, slug: row.provisioning_key,
//            realtimeChannel: `orders:queue:${tenantId}` }
```

**`publicMenuController`** (R2):
```typescript
// Reutiliza getMenu(tenantId, false) de services/menu.service.ts (o MESMO usado
//   pelo endpoint autenticado). NÃO usa nada do whatsapp bot.
//   getMenu(false) já filtra itens E categorias inativas (mi.status='ativo' AND c.status='ativo').
// Mapeia o retorno para o DTO público PublicMenuItem:
//   price -> priceCents; descarta status/createdAt/updatedAt (campos internos)
// Ver nota G2/G3 abaixo sobre o mapeamento e categorySortOrder.
```

**`publicCreateOrderController`** (R3):
```typescript
// Valida body com publicCreateOrderSchema (Zod estrito)
// Resolve primeiro admin ativo do tenant (SELECT ... role='admin' AND status='ativo' ...);
//   se não houver → 422 TENANT_UNAVAILABLE
// Chama createOrder(...); createOrder lança ServiceError(422) para item inválido/inativo
// try/catch mapeando pela propriedade .statusCode do erro (não por instanceof — cada
//   service tem sua própria classe ServiceError; o contrato é o campo statusCode)
// Retorna: { id, dailyNumber, totalAmountCents, status, orderDate, createdAt }
```

**`publicOrderStatusController`** (R4):
```typescript
// Chama getOrderById(tenantId, orderId) — lança ServiceError com .statusCode 404 se não achar
// try/catch: erro com .statusCode 404 → { error: 'ORDER_NOT_FOUND' }
// Filtra campos sensíveis (created_by, payment_status, payment_method)
// Retorna: { id, dailyNumber, customerName, status, totalAmountCents, createdAt, items }
```

#### Validação — Schema público

Definido em `packages/shared/src/validators/public-order.validator.ts` (criado na Task 7, consumido pela Task 5):

```typescript
export const publicCreateOrderSchema = z.object({
  customerName: z.string().min(1).max(100),
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  })).min(1).max(50),
}).strict();  // rejeita campos extras (R11.4)
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
  categoryName: string;
}
// Notas:
// - menu_items não possui coluna `description` no schema atual.
// - Não há `categorySortOrder` por item: getMenu já devolve as categorias
//   pré-ordenadas por sort_order; o cliente só precisa preservar a ordem do array.
//   (A ordenação entre categorias é carregada em PublicMenuCategory.sortOrder.)

export interface PublicMenuCategory {
  name: string;
  sortOrder: number;   // ATENÇÃO: o getMenu atual descarta o sortOrder no .map final
                       // (retorna só { category, items }). O controller público deve
                       // preservar o sortOrder — pequeno ajuste no service OU remapear
                       // no controller. Não confiar apenas na ordem implícita do array.
  items: PublicMenuItem[];
}

export interface PublicBranding {
  businessName: string;
  logoUrl: string | null;
  theme: Record<string, unknown> | null;
  slug: string;             // = tenants.provisioning_key
  realtimeChannel: string;  // orders:queue:{tenantId} — evita expor o UUID
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

### Frontend — App Cliente (dentro de `apps/mobile`)

#### Localização no monorepo

As telas do cliente vivem no `apps/mobile`, num grupo de rotas públicas do expo-router (`app/(public)/`). Elas reutilizam os componentes, tema, api-client e hooks já existentes do app; apenas os componentes/telas realmente novos são criados sob subpastas `customer/`.

```
apps/mobile/
├── app/                                   (expo-router — rotas)
│   ├── _layout.tsx                        (MODIFICAR: auth gate permite grupo (public))
│   ├── login.tsx                          (existente)
│   ├── (tabs)/                            (existente — App Operador)
│   └── (public)/                          (NOVO — App Cliente, sem auth)
│       ├── _layout.tsx                    (layout público: resolve branding por slug)
│       └── [slug]/
│           ├── index.tsx                  (→ MenuScreen do cliente)
│           ├── checkout.tsx               (→ CheckoutScreen)
│           └── pedido/[orderId].tsx       (→ TrackingScreen)
├── src/
│   ├── screens/customer/                  (NOVO — telas do cliente)
│   │   ├── CustomerMenuScreen.tsx         (cardápio + carrinho)
│   │   ├── CustomerCheckoutScreen.tsx     (confirmação com nome)
│   │   └── CustomerTrackingScreen.tsx     (acompanhamento em tempo real)
│   ├── components/                        (REUTILIZAR: Button, Card, Badge, Input, Modal, Typography)
│   │   └── customer/                      (NOVO — componentes específicos do cliente)
│   │       ├── CustomerMenuItem.tsx
│   │       ├── CartSheet.tsx              (bottom sheet do carrinho)
│   │       ├── CartLineItem.tsx
│   │       └── CategorySection.tsx
│   ├── hooks/customer/                    (NOVO)
│   │   ├── usePublicMenu.ts               (fetch do cardápio público)
│   │   ├── usePublicBranding.ts           (branding por slug, sem token)
│   │   ├── useCart.ts                     (estado do carrinho + persistência)
│   │   ├── useCreateOrder.ts
│   │   └── usePublicOrderTracking.ts      (realtime + polling, sem token)
│   ├── services/
│   │   ├── real-client.ts                 (REUTILIZAR + adicionar métodos públicos)
│   │   └── public-client.ts              (NOVO — chamadas às rotas /api/public sem token)
│   └── theme/                             (REUTILIZAR sistema de tema existente)
```

#### Roteamento (expo-router)

O expo-router mapeia arquivos para URLs. O grupo `(public)` não aparece na URL, então as rotas públicas ficam:

| Arquivo | URL no navegador |
|---------|------------------|
| `app/(public)/[slug]/index.tsx` | `/:slug` |
| `app/(public)/[slug]/checkout.tsx` | `/:slug/checkout` |
| `app/(public)/[slug]/pedido/[orderId].tsx` | `/:slug/pedido/:orderId` |

O `app/(public)/_layout.tsx` resolve o branding do tenant a partir do `slug` (via rota pública, sem token) e aplica o tema com o `ThemeProvider` existente, antes de renderizar as telas filhas.

#### Auth gate — permitir rotas públicas

O gate atual em `src/hooks/useAuth.tsx` redireciona qualquer rota que não seja `login` para `/login` quando não há usuário. É preciso relaxá-lo para tratar o grupo `(public)` como não autenticado:

```typescript
// Antes (bloqueia tudo exceto login):
const inAuthGroup = segments[0] === 'login';
if (!user && !inAuthGroup) router.replace('/login');

// Depois (whitelist de grupos públicos):
const PUBLIC_GROUPS = ['login', '(public)'];
const inPublicRoute = PUBLIC_GROUPS.includes(segments[0]);
if (!user && !inPublicRoute) router.replace('/login');
else if (user && segments[0] === 'login') router.replace('/(tabs)');
```

Telas públicas simplesmente têm `user === null` e não dependem de `tenantId`/branding resolvidos pós-login — o branding do cliente vem da rota pública por slug.

#### Fluxo de telas

```
/:slug (CustomerMenuScreen)
  │  [Adicionar itens ao carrinho]
  │  [Abrir CartSheet → revisar]
  │  [Botão "Fazer Pedido"]
  ▼
/:slug/checkout (CustomerCheckoutScreen)
  │  [Digitar nome]
  │  [Confirmar pedido → POST /api/public/:slug/orders]
  ▼
/:slug/pedido/:orderId (CustomerTrackingScreen)
  │  [Exibe número, status, itens]
  │  [Realtime: atualiza status; destaque quando "pronto"]
```

**Nota de design — por que carrinho e checkout são etapas separadas:** O carrinho (bottom sheet) é apenas revisão de itens; o checkout é uma tela dedicada onde o pedido é de fato confirmado e criado. Essa separação é **intencional** e deixa a tela de checkout como o ponto natural para acomodar evolução futura sem redesenhar o fluxo — por exemplo, campo de telefone (para identificar o cliente e ter histórico de pedidos) e pagamento pelo app. No escopo inicial o checkout pede apenas o nome, mas a estrutura de 4 etapas foi escolhida para essa margem de crescimento. Não fundir carrinho + checkout sem considerar esse contexto.

#### Gerenciamento de estado do carrinho

```typescript
// useCart.ts — hook de carrinho com persistência
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

- Persistência: na web, `sessionStorage` (chave `cart:{slug}`) — perdido ao fechar a aba (intencional, evita pedidos "fantasma"). Como o alvo primário do cliente é o navegador, o storage é abstraído por uma pequena camada (`Platform.OS === 'web' ? sessionStorage : in-memory`), mantendo o hook agnóstico de plataforma.
- Atualizado de forma síncrona (sem backend envolvido).

#### Realtime — Acompanhamento

```typescript
// usePublicOrderTracking.ts
// 1. GET /api/public/:slug/orders/:id para estado inicial
// 2. Subscribe no canal Supabase: orders:queue:{tenantId}
//    - Reutiliza o cliente Supabase singleton já existente no apps/mobile
//    - Filtra eventos 'status_updated' onde payload.id === orderId
//    - Atualiza status local
// 3. Fallback: polling a cada 30s caso WebSocket falhe
```

O `apps/mobile` já tem um cliente Supabase para realtime (`src/hooks/useRealtime.ts`). O hook do cliente reutiliza essa infra, mas resolve o canal a partir do slug (rota pública) em vez do `tenantId` da sessão autenticada.

**Decisão:** O endpoint público de branding retorna um campo `realtimeChannel` com o nome completo do canal (`orders:queue:{tenantId}`), evitando expor o UUID do tenant diretamente ao client.

#### PWA (infra já existente)

- Manifest, ícones e service worker já existem em `apps/mobile/public/` (`manifest.json`, `icons/`, `sw.js`). Nada a recriar.
- O manifest é único/global e hoje aponta para o operador (`start_url: "/"`, `short_name: "Food Truck App"`). Um cliente que instalar a partir de `/:slug` reabrirá em `/`. Aceitável (cliente acessa por QR/link, raramente instala); manifest por contexto é evolução futura.
- O tema visual do tenant é aplicado em runtime após resolver o branding — o manifest permanece genérico.
- **Offline:** o `sw.js` existente pode cachear o cardápio (best-effort, não bloqueante).

### App Operador — Alterações Mínimas

Como App Cliente e App Operador vivem no mesmo `apps/mobile`, as mudanças no lado do operador são pontuais:

#### 1. Auth gate (`src/hooks/useAuth.tsx`)

Relaxar o redirect para tratar o grupo `(public)` como rota não autenticada (ver seção "Auth gate — permitir rotas públicas"). É a única mudança estrutural.

#### 2. Badge de origin `'web'`

No `OrderQueueScreen.tsx` (e `PaymentScreen.tsx`), tratar `origin === 'web'`:

```typescript
// Reutiliza as cores do WhatsApp (ambos são pedidos remotos, diferenciados pelo label)
{ origin: 'web', label: 'Online', icon: 'language', bg: BADGE_BG_WHATSAPP, text: BADGE_TEXT_WHATSAPP }
```

#### Nada mais muda no operador

O app já:
- Recebe eventos realtime de `new_order` independente da origin.
- Permite avançar status de qualquer pedido.
- Exibe todos os campos relevantes no card.
- O `SwipeableOriginSelector` (criar pedido) **não muda** — origin `'web'` é exclusivo do cliente.

---

## Data Models

### Tabela `tenants` — `provisioning_key` como slug público

**Decisão:** A coluna `provisioning_key` existente (TEXT UNIQUE) é reutilizada como slug público. Já contém valores URL-friendly definidos no onboarding (ex.: `food-truck-demo`, `pastel-das-meninas`). Não é necessário criar coluna adicional.

**Resolução pública do tenant:**
```sql
SELECT id FROM tenants WHERE provisioning_key = $1 AND status = 'ativo'
```

**Validação de formato no onboarding** (a adicionar no `provisionTenant` service):
- Regex: `^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$` (3-60 chars, lowercase/dígitos/hífens, não começa/termina com hífen).
- Palavras reservadas rejeitadas: `api`, `admin`, `health`, `webhook`, `static`, `public`, `assets`, `login`, `queue`.
- **Idempotência preservada:** a validação de formato roda apenas na **criação de tenant novo**. Uma reprovisão idempotente (mesmo `provisioning_key` já existente) NÃO revalida o formato — caso contrário, tenants antigos com keys fora do novo padrão quebrariam. Ou seja, validar após o lookup `findExistingByKey` retornar nulo (tenant inexistente), não antes.

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
| Body do pedido inválido (Zod estrito) | 400 | `{ error: 'VALIDATION_ERROR', details: [...] }` |
| Item do menu não encontrado ou inativo | 422 | `{ error: 'VALIDATION_ERROR' }` (do `createOrder`) |
| Tenant sem admin ativo | 422 | `{ error: 'TENANT_UNAVAILABLE' }` |
| Pedido não encontrado (GET status) | 404 | `{ error: 'ORDER_NOT_FOUND' }` |
| Rate limit excedido | 429 | `{ error: 'TOO_MANY_REQUESTS' }` |
| Erro interno inesperado | 500 | `{ error: 'INTERNAL_ERROR' }` |

### Frontend — Tratamento de Erros

- **Falha de rede ao carregar cardápio**: Mostra tela de erro com botão "Tentar novamente". Se houver cache do cardápio disponível (offline best-effort — ver PWA), exibe a versão cacheada com banner de aviso; o cache é oportunista e não garantido no export web do Expo.
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

### Testes de Frontend (Jest + Testing Library React Native)

Usar o stack de testes já configurado no `apps/mobile` (`jest-expo` + `@testing-library/react-native`), consistente com os testes de tela existentes.

- **useCart hook**: Adicionar, remover, atualizar quantidade, limpar. Verificar persistência (mock do storage web).
- **CustomerMenuScreen**: Mock da API pública, renderizar categorias e itens corretamente.
- **CustomerCheckoutScreen**: Submissão do formulário, loading state, tratamento de erro.
- **CustomerTrackingScreen**: Atualização de status via mock de evento realtime.
- **Auth gate**: Verificar que rotas do grupo `(public)` NÃO redirecionam para `/login` quando não autenticado, e que rotas do operador continuam protegidas.

### Testes E2E (opcional)

- Fluxo completo do cliente no export web: acessar slug → navegar cardápio → montar carrinho → checkout → ver tracking. Ferramenta a definir conforme o pipeline web do Expo export.
- Verificar responsividade mobile (viewport 375px).

---

## Decisões Técnicas

| Decisão | Justificativa |
|---------|---------------|
| `provisioning_key` como slug (não coluna nova) | Já é UNIQUE, URL-friendly, e definido no onboarding. Evita migration e coluna redundante. |
| Feature no `apps/mobile` (não SPA nova em `apps/web`) | Reutiliza componentes, tema, api-client e realtime existentes. Evita aprofundar a duplicação mobile/web. Um único ponto de manutenção. |
| Grupo de rotas `app/(public)/` (expo-router) | Separa o fluxo público do autenticado sem app novo. Auth gate passa a permitir esse grupo. |
| Storage do carrinho abstraído por plataforma | `sessionStorage` na web (perde ao fechar aba, evita pedidos "fantasma"); in-memory fora da web. Hook agnóstico. |
| Sem autenticação do cliente | Fricção mínima. O operador é a barreira humana (vê o cliente presencialmente). |
| Slug no tenant (não subdomain) | Mais simples de deploy (um único domínio). Subdomínios adicionam complexidade de DNS/SSL. |
| Rate limit leve (60/min por IP) | Padrão de higiene. Sem captcha ou SMS. |
| Campo `realtimeChannel` no branding | Evita expor UUID do tenant ao client. O client usa o nome do canal diretamente. |
| Reutilizar api-client/realtime do `apps/mobile` | Client maduro (refresh de token para o operador; chamadas públicas sem token para o cliente) e cliente Supabase singleton já existentes. |
| Polling fallback (30s) | Resiliência caso WebSocket caia em redes instáveis de food truck. |
| Assets em `/assets/{slug}/` | Convenção unificada. Nginx proxy pro S3 sem passar pelo Express. Slug = provisioning_key. |
| Trade-off aceito: bundle web via react-native-web | Mais pesado e menos idiomático (SEO/semântica) que Vite puro. Irrelevante para cardápio acessado por QR code; o ganho de reuso compensa. |

## Segurança e Hardening (R11)

Sem camadas anti-abuso pesadas (decisão do usuário), apenas higiene básica nas rotas públicas — sem fricção ao cliente:

- **Rate limit** 60 req/min por IP. Requer adicionar a dependência de rate limiting ao backend (não instalada hoje).
- **Body 10KB** no POST de pedido, via parser local do router público (`express.json({ limit })`) — não altera o `express.json()` global.
- **Zod estrito** (`.strict()`) — rejeita campos extras → 400.
- **CORS**: o `index.ts` usa `cors()` global aberto. Revisar para permitir o(s) domínio(s) do PWA. PWA e API convivem atrás do Nginx (mesmo domínio), então na prática não bloqueia; a revisão evita que uma futura restrição do CORS global quebre o fluxo público.
