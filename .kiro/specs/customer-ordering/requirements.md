# Requirements Document

## Introdução

Canal de pedidos online para clientes, acessível via navegador (PWA), como alternativa gratuita ao bot WhatsApp/Evolution API. O cliente acessa um link público do estabelecimento (ex.: QR code na barraca ou link em redes sociais), visualiza o cardápio, monta o carrinho e confirma o pedido — tudo sem autenticação. O pedido entra na mesma fila do operador com origin `'web'`, e o cliente pode acompanhar o status em tempo real.

## Glossário

- **Cardápio Público**: Página web acessível sem autenticação que exibe os itens ativos do cardápio de um tenant, agrupados por categoria.
- **Slug**: Identificador textual URL-friendly e único de um tenant (ex.: `pastel-das-meninas`), usado para resolver o tenant em rotas públicas.
- **Carrinho**: Conjunto de itens selecionados pelo cliente antes de confirmar o pedido, armazenado localmente no navegador (sessionStorage).
- **Pedido Online**: Pedido criado pelo cliente via Cardápio Público, com origin `'web'` e status inicial `'aguardando'`.
- **Tela de Acompanhamento**: Página pós-confirmação que exibe o status do pedido em tempo real via Supabase Realtime.
- **PWA**: Progressive Web App — a aplicação web do cliente pode ser "instalada" no celular como se fosse um app nativo.

---

## Requirements

### Requirement 1: Slug do Tenant

**User Story:** Como operador, quero que meu estabelecimento tenha um identificador público (slug) na URL, para que clientes possam acessar meu cardápio online por um link amigável.

#### Acceptance Criteria

1. THE tabela `tenants` SHALL possuir uma coluna `slug TEXT UNIQUE NOT NULL` contendo um identificador URL-friendly (lowercase, alfanumérico com hífens, 3-60 caracteres).
2. THE Sistema SHALL validar o slug no momento da criação/atualização do tenant, rejeitando valores com caracteres inválidos, duplicados ou reservados (`api`, `admin`, `health`, `webhook`, `static`).
3. THE slug SHALL ser imutável após a primeira definição, exceto por um Platform Admin.
4. WHEN um request público chega com um slug inválido ou inexistente, THE Sistema SHALL retornar HTTP 404 com mensagem amigável.

---

### Requirement 2: API Pública do Cardápio

**User Story:** Como cliente, quero visualizar o cardápio de um estabelecimento sem precisar fazer login, para que eu possa escolher o que pedir.

#### Acceptance Criteria

1. THE Backend SHALL expor um endpoint `GET /api/public/:slug/menu` que retorna os itens ativos do cardápio agrupados por categoria, ordenados por `category.sort_order` e `item.name`.
2. THE endpoint SHALL resolver o tenant a partir do `:slug` da URL (não de autenticação).
3. THE endpoint SHALL retornar HTTP 404 se o slug não corresponder a um tenant ativo.
4. THE resposta SHALL incluir para cada item: `id`, `name`, `priceCents`, `description` (quando disponível), `categoryName` e `categorySortOrder`.
5. THE endpoint SHALL ser acessível sem autenticação (sem Bearer token).
6. THE endpoint NÃO SHALL expor informações internas do tenant (IDs de admin, configurações, evolution_instance_name).

---

### Requirement 3: API Pública de Criação de Pedido

**User Story:** Como cliente, quero confirmar meu pedido online sem precisar criar uma conta, para que o processo seja rápido e sem fricção.

#### Acceptance Criteria

1. THE Backend SHALL expor um endpoint `POST /api/public/:slug/orders` que cria um pedido com origin `'web'`.
2. THE request body SHALL conter: `customerName` (string, 1-100 chars) e `items` (array de `{ menuItemId: UUID, quantity: 1-99 }`, mín. 1 item).
3. THE endpoint SHALL resolver o tenant a partir do `:slug`.
4. THE endpoint SHALL validar que todos os `menuItemId` existem e estão ativos no tenant resolvido.
5. THE endpoint SHALL calcular `total_amount_cents` a partir dos preços atuais dos itens (snapshot no momento do pedido).
6. THE endpoint SHALL usar `next_daily_number(tenantId, date)` para gerar a numeração sequencial.
7. THE endpoint SHALL atribuir `created_by` ao primeiro admin ativo do tenant (mesmo comportamento do bot WhatsApp).
8. THE resposta SHALL retornar o pedido criado incluindo: `id`, `dailyNumber`, `totalAmountCents`, `status`, `orderDate`, `createdAt`.
9. THE endpoint SHALL emitir evento realtime `new_order` no canal `orders:queue:{tenantId}` para que o operador veja o pedido imediatamente.
10. THE endpoint SHALL ser acessível sem autenticação.

---

### Requirement 4: API Pública de Acompanhamento do Pedido

**User Story:** Como cliente, quero acompanhar o status do meu pedido em tempo real após confirmá-lo, para saber quando está pronto.

#### Acceptance Criteria

1. THE Backend SHALL expor um endpoint `GET /api/public/:slug/orders/:orderId` que retorna o status atual de um pedido.
2. THE resposta SHALL incluir: `id`, `dailyNumber`, `customerName`, `status`, `totalAmountCents`, `createdAt`, `items` (nome e quantidade).
3. THE endpoint NÃO SHALL expor campos internos (`created_by`, `payment_status`, `payment_method`).
4. THE endpoint SHALL retornar 404 se o pedido não pertencer ao tenant do slug.
5. O cliente SHALL poder se inscrever no canal realtime `orders:queue:{tenantId}` para receber eventos `status_updated` sem autenticação.

---

### Requirement 5: Branding Público do Tenant

**User Story:** Como cliente, quero ver o nome e a identidade visual do estabelecimento na página de pedido, para ter certeza de que estou no lugar certo.

#### Acceptance Criteria

1. THE Backend SHALL expor um endpoint `GET /api/public/:slug/branding` que retorna informações públicas do tenant.
2. THE resposta SHALL incluir: `businessName`, `logoUrl`, `theme` (cores configuradas pelo tenant) e `slug`.
3. THE endpoint NÃO SHALL expor: `id` (UUID interno), `evolution_instance_name`, `whatsapp_config`, `provisioning_key`.
4. THE endpoint SHALL retornar 404 para slugs inexistentes ou tenants inativos.

---

### Requirement 6: Interface Web do Cliente — Cardápio e Carrinho

**User Story:** Como cliente, quero navegar pelo cardápio, adicionar itens ao carrinho e ver o resumo antes de confirmar, para fazer meu pedido de forma intuitiva.

#### Acceptance Criteria

1. THE App Web SHALL exibir a tela de cardápio ao acessar `/:slug` (ou `/cardapio/:slug`).
2. THE tela SHALL exibir o nome e logo do estabelecimento (branding) no topo.
3. THE cardápio SHALL ser agrupado por categoria com títulos visuais separando as seções.
4. EACH item SHALL exibir: nome, preço formatado em BRL (`R$ X,XX`) e um botão de adicionar ao carrinho.
5. THE carrinho SHALL ser acessível via ícone flutuante ou barra inferior mostrando a quantidade de itens e o total.
6. THE tela do carrinho SHALL exibir: lista de itens com nome, quantidade (editável com +/-), preço unitário, subtotal por item e total geral.
7. THE cliente SHALL poder remover itens do carrinho.
8. THE carrinho SHALL persistir no `sessionStorage` do navegador (perdido ao fechar aba — segurança contra pedidos abandonados).
9. WHEN o carrinho está vazio, o botão de confirmar SHALL estar desabilitado.

---

### Requirement 7: Interface Web do Cliente — Confirmação e Acompanhamento

**User Story:** Como cliente, quero confirmar meu pedido informando meu nome e depois acompanhar o status, para saber quando buscar.

#### Acceptance Criteria

1. BEFORE confirmar o pedido, THE App Web SHALL solicitar o nome do cliente (campo obrigatório, 1-100 chars).
2. WHEN o cliente confirma, THE App Web SHALL chamar `POST /api/public/:slug/orders` e exibir loading.
3. ON sucesso, THE App Web SHALL navegar para a tela de acompanhamento exibindo: número do pedido (`dailyNumber`), nome do cliente, lista de itens, total e status atual.
4. THE tela de acompanhamento SHALL se inscrever no canal realtime e atualizar o status automaticamente quando o operador mudar (aguardando → preparando → pronto → entregue).
5. WHEN o status muda para `pronto`, THE App Web SHALL exibir destaque visual (animação, cor verde, ícone) indicando que o pedido está pronto para retirada.
6. THE tela de acompanhamento SHALL funcionar mesmo após reload da página (o `orderId` é mantido na URL).
7. ON erro de criação, THE App Web SHALL exibir mensagem amigável e permitir tentar novamente.

---

### Requirement 8: Origin `'web'` no Sistema

**User Story:** Como operador, quero distinguir pedidos online dos presenciais e WhatsApp na minha fila, para organizar a produção.

#### Acceptance Criteria

1. THE constraint CHECK da coluna `origin` na tabela `orders` SHALL ser alterado para incluir `'web'`: `CHECK (origin IN ('presencial', 'whatsapp', 'web'))`.
2. THE constante `ORDER_ORIGINS` em `packages/shared` SHALL incluir `'web'`.
3. THE tipo `OrderOrigin` SHALL incluir `'web'`.
4. THE `createOrderRequestSchema` SHALL aceitar `'web'` como origin válido.
5. THE App Mobile (fila do operador) SHALL exibir badge "Online" com cor distinta para pedidos com origin `'web'`.
6. THE operador SHALL poder gerenciar pedidos `'web'` da mesma forma que os demais (mudar status, registrar pagamento).

---

### Requirement 9: PWA e Acessibilidade

**User Story:** Como cliente, quero poder "instalar" o link de pedido como um app no meu celular e usá-lo de forma acessível, independente do dispositivo.

#### Acceptance Criteria

1. THE App Web do cliente SHALL incluir um `manifest.json` configurado para PWA (nome, ícones, theme_color, start_url com o slug do tenant).
2. THE App Web SHALL ser responsivo (mobile-first) e funcionar em telas de 320px a 1440px.
3. THE App Web SHALL seguir WCAG 2.1 nível AA para contraste de cores e navegação por teclado.
4. THE App Web SHALL funcionar offline de forma degradada (exibir última versão do cardápio em cache via Service Worker, com aviso de que está offline).
5. THE App Web SHALL carregar em menos de 3 segundos em conexão 3G (Lighthouse performance > 80).

---

### Requirement 10: Integração com Fila Existente

**User Story:** Como operador, quero que pedidos online entrem na mesma fila que os presenciais e WhatsApp, para não precisar de uma tela separada.

#### Acceptance Criteria

1. WHEN um pedido `'web'` é criado, THE Sistema SHALL emitir evento realtime `new_order` no mesmo canal usado por pedidos presenciais e WhatsApp.
2. THE pedido `'web'` SHALL aparecer na `OrderQueueScreen` do app mobile com todos os mesmos campos e ações.
3. THE fila SHALL manter a ordenação por `created_at ASC` independente da origin.
4. THE operador SHALL poder avançar status de pedidos `'web'` normalmente (aguardando → preparando → pronto → entregue).
5. WHEN o status de um pedido `'web'` muda, THE evento realtime `status_updated` SHALL ser emitido para que o cliente acompanhe na tela de acompanhamento.
