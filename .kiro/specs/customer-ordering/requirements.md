# Requirements Document

## Introduction

Canal de pedidos online para clientes, acessível via navegador (PWA), como alternativa gratuita ao bot WhatsApp/Evolution API. O cliente acessa um link público do estabelecimento (ex.: QR code na barraca ou link em redes sociais), visualiza o cardápio, monta o carrinho e confirma o pedido — tudo sem autenticação. O pedido entra na mesma fila do operador com origin `'web'`, e o cliente pode acompanhar o status em tempo real.

**Decisão de arquitetura:** A feature é incorporada ao app existente `apps/mobile` (React Native + Expo), que já gera saída web/PWA via `react-native-web`. O fluxo do cliente vive em um grupo de rotas públicas (`app/(public)/`) dentro do mesmo app, reutilizando os componentes, tema, api-client e realtime já existentes. Isso evita a duplicação de código que existiria ao criar uma SPA separada em `apps/web`. Ver seção de design para detalhes e para a disposição do `apps/web`.

### Modelo de Uso / Pontos de Entrada

O mesmo `apps/mobile` atende operador e cliente; o que difere é o **ponto de entrada** (rota):

| Perfil | Alvo | Ponto de entrada | Status |
|--------|------|------------------|--------|
| Operador | App nativo (Android/iOS) | Login | Funcional hoje |
| Operador | PWA / navegador | Login (rota autenticada) | Funcional hoje |
| Cliente | PWA / navegador | Link/QR com slug → `/:slug` (grupo `(public)`) | Esta feature |

Regras do modelo:
- A rota `/` (raiz) pertence ao **contexto operador** — cai no login. O cliente NUNCA acessa a raiz.
- A rota `/:slug` pertence ao **contexto cliente** — cardápio público, sem login. Acesso exclusivo via link/QR code.
- O **app nativo das lojas é exclusivo do operador**. O cliente não usa o app nativo porque não há ponto de entrada com slug nele (sem URL de entrada). O cliente usa a web/PWA (pode "instalar" via "adicionar à tela inicial", sem passar por loja).
- **Deep linking** para abrir o cardápio no app nativo (`/:slug` → app) fica como possibilidade futura, FORA do escopo desta feature.

## Glossary

- **Cardápio Público**: Página web acessível sem autenticação que exibe os itens ativos do cardápio de um tenant, agrupados por categoria.
- **Slug**: Identificador textual URL-friendly e único de um tenant (ex.: `pastel-das-meninas`), usado para resolver o tenant em rotas públicas. Corresponde à coluna `provisioning_key` da tabela `tenants`.
- **Carrinho**: Conjunto de itens selecionados pelo cliente antes de confirmar o pedido, armazenado localmente no navegador (sessionStorage).
- **Pedido Online**: Pedido criado pelo cliente via Cardápio Público, com origin `'web'` e status inicial `'aguardando'`.
- **Tela de Acompanhamento**: Página pós-confirmação que exibe o status do pedido em tempo real via Supabase Realtime.
- **PWA**: Progressive Web App — a saída web do `apps/mobile` (via `react-native-web`) pode ser "instalada" no celular como se fosse um app nativo.
- **App Cliente**: O conjunto de telas públicas do cliente, servidas pelo grupo de rotas `app/(public)/` dentro do `apps/mobile`, acessíveis via navegador sem autenticação.
- **App Operador**: As telas autenticadas existentes do `apps/mobile` (fila, cardápio, pagamentos, usuários) usadas pelo operador.

---

## Requirements

### Requirement 1: Slug do Tenant

**User Story:** Como operador, quero que meu estabelecimento tenha um identificador público (slug) na URL, para que clientes possam acessar meu cardápio online por um link amigável.

**Decisão de design:** A coluna `provisioning_key` existente na tabela `tenants` é reutilizada como slug público. Esta coluna já é `TEXT UNIQUE`, contém valores URL-friendly (ex.: `food-truck-demo`, `pastel-das-meninas`) e é definida no onboarding do tenant. Não será criada uma coluna adicional.

#### Acceptance Criteria

1. THE coluna `tenants.provisioning_key` SHALL ser usada como slug público para resolver o tenant em rotas públicas. O valor já é UNIQUE e URL-friendly.
2. THE Sistema SHALL validar que o `provisioning_key` informado no onboarding é URL-friendly (lowercase, alfanumérico com hífens, 3-60 caracteres), rejeitando valores com caracteres inválidos ou reservados (`api`, `admin`, `health`, `webhook`, `static`, `assets`).
3. THE slug (provisioning_key) SHALL ser imutável após a primeira definição, exceto por um Platform Admin.
4. WHEN um request público chega com um slug inválido ou inexistente, THE Sistema SHALL retornar HTTP 404 com mensagem amigável.

---

### Requirement 2: API Pública do Cardápio

**User Story:** Como cliente, quero visualizar o cardápio de um estabelecimento sem precisar fazer login, para que eu possa escolher o que pedir.

#### Acceptance Criteria

1. THE Backend SHALL expor um endpoint `GET /api/public/:slug/menu` que retorna os itens ativos do cardápio agrupados por categoria, ordenados por `category.sort_order` e `item.name`. Reutiliza o service `getMenu(tenantId, false)` existente (mesmo do endpoint autenticado), que já filtra itens E categorias inativas — não usa nada do WhatsApp bot.
2. THE endpoint SHALL resolver o tenant a partir do `:slug` da URL (não de autenticação).
3. THE endpoint SHALL retornar HTTP 404 se o slug não corresponder a um tenant ativo.
4. THE resposta SHALL agrupar por categoria (com `name` e `sortOrder`) e, para cada item, incluir `id`, `name`, `priceCents` e `categoryName`. NÃO SHALL expor campos internos do item (`status`, timestamps).
5. THE endpoint SHALL ser acessível sem autenticação (sem Bearer token).
6. THE endpoint NÃO SHALL expor informações internas do tenant (IDs de admin, configurações, evolution_instance_name).

---

### Requirement 3: API Pública de Criação de Pedido

**User Story:** Como cliente, quero confirmar meu pedido online sem precisar criar uma conta, para que o processo seja rápido e sem fricção.

#### Acceptance Criteria

1. THE Backend SHALL expor um endpoint `POST /api/public/:slug/orders` que cria um pedido com origin `'web'`.
2. THE request body SHALL conter: `customerName` (string, 1-100 chars) e `items` (array de `{ menuItemId: UUID, quantity: 1-99 }`, mín. 1 item).
3. THE endpoint SHALL resolver o tenant a partir do `:slug`.
4. THE endpoint SHALL validar que todos os `menuItemId` existem e estão ativos no tenant resolvido. Se algum item for inválido/inativo, SHALL retornar HTTP 422 (mesmo comportamento do `createOrder` existente).
5. THE endpoint SHALL calcular `total_amount_cents` a partir dos preços atuais dos itens (snapshot no momento do pedido) — o total nunca vem do cliente.
6. THE endpoint SHALL usar `next_daily_number(tenantId, date)` para gerar a numeração sequencial.
7. THE endpoint SHALL atribuir `created_by` ao primeiro admin ativo do tenant. Se não houver admin ativo, SHALL retornar HTTP 422.
8. THE resposta SHALL retornar o pedido criado incluindo: `id`, `dailyNumber`, `totalAmountCents`, `status`, `orderDate`, `createdAt`.
9. THE endpoint SHALL emitir evento realtime `new_order` no canal do tenant para que o operador veja o pedido imediatamente.
10. THE endpoint SHALL ser acessível sem autenticação, mas SHALL aplicar rate limiting e limite de tamanho de body (ver R11).

---

### Requirement 4: API Pública de Acompanhamento do Pedido

**User Story:** Como cliente, quero acompanhar o status do meu pedido em tempo real após confirmá-lo, para saber quando está pronto.

#### Acceptance Criteria

1. THE Backend SHALL expor um endpoint `GET /api/public/:slug/orders/:orderId` que retorna o status atual de um pedido.
2. THE resposta SHALL incluir: `id`, `dailyNumber`, `customerName`, `status`, `totalAmountCents`, `createdAt`, `items` (nome e quantidade).
3. THE endpoint NÃO SHALL expor campos internos (`created_by`, `payment_status`, `payment_method`).
4. THE endpoint SHALL retornar 404 se o pedido não pertencer ao tenant do slug.
5. O cliente SHALL poder se inscrever no canal realtime para receber eventos `status_updated` sem autenticação. O nome do canal é fornecido pelo endpoint de branding (campo `realtimeChannel`), evitando que o client precise montar o nome a partir do tenantId.

---

### Requirement 5: Branding Público do Tenant

**User Story:** Como cliente, quero ver o nome e a identidade visual do estabelecimento na página de pedido, para ter certeza de que estou no lugar certo.

#### Acceptance Criteria

1. THE Backend SHALL expor um endpoint `GET /api/public/:slug/branding` que retorna informações públicas do tenant.
2. THE resposta SHALL incluir: `businessName`, `logoUrl`, `theme` (cores configuradas pelo tenant), `slug` e `realtimeChannel` (nome do canal para o cliente acompanhar o pedido).
3. THE endpoint NÃO SHALL expor: `id` (UUID interno bruto), `evolution_instance_name`, `whatsapp_config`. Nota: o `provisioning_key` é o próprio `slug` público e é retornado como tal.
4. THE endpoint SHALL retornar 404 para slugs inexistentes ou tenants inativos.

---

### Requirement 6: Interface do Cliente — Cardápio e Carrinho

**User Story:** Como cliente, quero navegar pelo cardápio, adicionar itens ao carrinho e ver o resumo antes de confirmar, para fazer meu pedido de forma intuitiva.

**Diretriz de UI:** O App Cliente SHALL reutilizar os componentes base existentes do `apps/mobile` (Button, Input, Card, Badge, Typography, Modal) e o mesmo sistema de tema. Como vive no mesmo app do operador, a coerência visual é garantida por construção — não há biblioteca de componentes paralela.

#### Acceptance Criteria

1. THE App Cliente SHALL exibir a tela de cardápio ao acessar a rota pública `/(public)/:slug` (URL `/:slug` no navegador).
2. THE tela SHALL exibir o nome e logo do estabelecimento (branding) no topo.
3. THE cardápio SHALL ser agrupado por categoria com títulos visuais separando as seções.
4. EACH item SHALL exibir: nome, preço formatado em BRL (`R$ X,XX`) e um botão de adicionar ao carrinho.
5. THE carrinho SHALL ser acessível via ícone flutuante ou barra inferior mostrando a quantidade de itens e o total.
6. THE tela do carrinho SHALL exibir: lista de itens com nome, quantidade (editável com +/-), preço unitário, subtotal por item e total geral.
7. THE cliente SHALL poder remover itens do carrinho.
8. THE carrinho SHALL persistir localmente no navegador via `sessionStorage` (na web) — perdido ao fechar aba, segurança contra pedidos abandonados.
9. WHEN o carrinho está vazio, o botão de confirmar SHALL estar desabilitado.

---

### Requirement 7: Interface do Cliente — Confirmação e Acompanhamento

**User Story:** Como cliente, quero confirmar meu pedido informando meu nome e depois acompanhar o status, para saber quando buscar.

**Diretriz de UI:** Reutiliza os componentes e o tema do `apps/mobile` (ver R6).

**Nota de design — checkout separado do carrinho (intencional):** O checkout é uma tela dedicada (distinta do carrinho, que só revisa itens), onde o pedido é confirmado e criado. No escopo inicial pede apenas o nome, mas a separação foi escolhida deliberadamente para acomodar evolução futura sem redesenhar o fluxo — telefone (identificação/histórico do cliente) e pagamento pelo app. Manter as 4 etapas (cardápio → carrinho → checkout → tracking) por esse motivo.

#### Acceptance Criteria

1. BEFORE confirmar o pedido, THE App Cliente SHALL solicitar o nome do cliente (campo obrigatório, 1-100 chars).
2. WHEN o cliente confirma, THE App Cliente SHALL chamar `POST /api/public/:slug/orders` e exibir loading.
3. ON sucesso, THE App Cliente SHALL navegar para a tela de acompanhamento exibindo: número do pedido (`dailyNumber`), nome do cliente, lista de itens, total e status atual.
4. THE tela de acompanhamento SHALL se inscrever no canal realtime e atualizar o status automaticamente quando o operador mudar (aguardando → preparando → pronto → entregue).
5. WHEN o status muda para `pronto`, THE App Cliente SHALL exibir destaque visual (animação, cor verde, ícone) indicando que o pedido está pronto para retirada.
6. THE tela de acompanhamento SHALL funcionar mesmo após reload da página (o `orderId` é mantido na URL/rota).
7. ON erro de criação, THE App Cliente SHALL exibir mensagem amigável e permitir tentar novamente.

---

### Requirement 8: Origin `'web'` no Sistema

**User Story:** Como operador, quero distinguir pedidos online dos presenciais e WhatsApp na minha fila, para organizar a produção.

#### Acceptance Criteria

1. THE constraint CHECK da coluna `origin` na tabela `orders` SHALL ser alterado para incluir `'web'`: `CHECK (origin IN ('presencial', 'whatsapp', 'web'))`.
2. THE constante `ORDER_ORIGINS` em `packages/shared` SHALL incluir `'web'`.
3. THE tipo `OrderOrigin` SHALL incluir `'web'`.
4. THE `createOrderRequestSchema` SHALL aceitar `'web'` como origin válido.
5. THE App Operador (fila de pedidos) SHALL exibir badge "Online" para pedidos com origin `'web'`.
6. THE operador SHALL poder gerenciar pedidos `'web'` da mesma forma que os demais (mudar status, registrar pagamento).

---

### Requirement 9: PWA e Acessibilidade

**User Story:** Como cliente, quero poder "instalar" o link de pedido como um app no meu celular e usá-lo de forma acessível, independente do dispositivo.

#### Acceptance Criteria

1. THE PWA SHALL ter manifest e ícones. **Já atendido** por `apps/mobile/public/` (`manifest.json`, `icons/`, `sw.js`). Limitação conhecida: manifest global aponta para o operador (`start_url: "/"`); manifest por contexto fica como evolução futura.
2. THE App Cliente SHALL ser responsivo (mobile-first), de 320px a 1440px.
3. THE App Cliente SHALL seguir WCAG 2.1 AA para contraste e navegação por teclado (os componentes base já seguem).
4. THE App Cliente PODE funcionar offline de forma degradada (cardápio em cache com aviso). Não bloqueante — suporte de service worker no export web do Expo é limitado.
5. THE App Cliente SHALL carregar em tempo aceitável em 3G, ciente do trade-off do bundle `react-native-web` (ver design).

---

### Requirement 10: Integração com Fila Existente

**User Story:** Como operador, quero que pedidos online entrem na mesma fila que os presenciais e WhatsApp, para não precisar de uma tela separada.

#### Acceptance Criteria

1. WHEN um pedido `'web'` é criado, THE Sistema SHALL emitir evento realtime `new_order` no mesmo canal usado por pedidos presenciais e WhatsApp.
2. THE pedido `'web'` SHALL aparecer na `OrderQueueScreen` do app mobile com todos os mesmos campos e ações.
3. THE fila SHALL manter a ordenação por `created_at ASC` independente da origin.
4. THE operador SHALL poder avançar status de pedidos `'web'` normalmente (aguardando → preparando → pronto → entregue).
5. WHEN o status de um pedido `'web'` muda, THE evento realtime `status_updated` SHALL ser emitido para que o cliente acompanhe na tela de acompanhamento.

---

### Requirement 11: Hardening das Rotas Públicas

**User Story:** Como responsável pela plataforma, quero que as rotas públicas tenham proteções básicas, para evitar abuso sem adicionar fricção ao cliente.

#### Acceptance Criteria

1. THE rotas `/api/public/*` SHALL aplicar rate limiting por IP (padrão: 60 req/min). A dependência de rate limiting SHALL ser adicionada ao backend caso ainda não exista.
2. THE `POST /api/public/:slug/orders` SHALL aplicar limite de tamanho de body (padrão: 10KB), sem alterar o parser global das demais rotas.
3. THE CORS das rotas `/api/public/*` SHALL permitir o(s) domínio(s) do PWA. Como PWA e API podem estar no mesmo domínio (via Nginx), a configuração de CORS SHALL ser revista para não bloquear o cliente nem abrir além do necessário.
4. THE validação de body SHALL rejeitar campos extras (Zod estrito), retornando HTTP 400 em caso de payload inválido.
