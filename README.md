# 🚚 Order System — Plataforma White-Label Multi-Tenant

Plataforma **white-label multi-tenant** de pedidos para food trucks: um único build/stack atende múltiplos clientes (tenants), cada um com seus próprios dados, cardápio, usuários, branding e WhatsApp — totalmente isolados. Inclui app mobile para o operador, painel web para o preparador e bot WhatsApp para clientes.

## Visão Geral

| Componente | Tecnologia | Descrição |
|---|---|---|
| **Mobile** | Expo + React Native | App do operador: criar pedidos, gerenciar fila, pagamentos, cardápio, gestão de usuários. Branding por tenant aplicado após login |
| **Web** | Vite + React | Painel do preparador: fila em tempo real com avanço de status e notificações de pagamento. Branding por tenant aplicado após login |
| **Backend** | Express + Node.js | API REST multi-tenant com autenticação JWT, resolução de tenant por requisição, eventos Realtime e CRUD completo |
| **Bot WhatsApp** | Evolution API | Atendimento automatizado via máquina de estados, com instância e cardápio por tenant |
| **Shared** | TypeScript + Zod | Tipos, validadores e constantes compartilhados |

## Multi-Tenancy

O sistema roda sobre um **banco/stack único compartilhado**, com uma coluna `tenant_id` em toda tabela com escopo de tenant. Cada tenant (cliente) é uma organização isolada com seus próprios usuários, cardápio, pedidos, branding e configuração de WhatsApp.

- **Isolamento na camada de aplicação** — Todo acesso a dados com escopo de tenant passa por um helper centralizado (`TenantRepository`) que injeta `tenant_id` em toda consulta. Nenhum service monta SQL de tenant manualmente, e uma verificação de arquitetura impede que services acessem o pool diretamente.
- **Resolução de tenant por requisição** — Um middleware resolve o `tenant_id` a partir do usuário autenticado e o propaga a todas as camadas. Requisições sem tenant válido ou de tenant inativo são rejeitadas (401/403).
- **Unicidade composta por tenant** — E-mail de usuário, nome de categoria, item de cardápio ativo e numeração diária de pedidos são únicos **dentro de cada tenant** (o mesmo valor pode coexistir em tenants distintos).
- **Numeração diária por tenant** — Cada tenant tem sua própria sequência diária de pedidos, reiniciada a cada dia e independente do movimento de outros clientes.
- **Papéis** — `Platform_Admin` gerencia tenants (rotas `/api/platform/*`); `Tenant_Admin` / `Tenant_User` operam apenas dentro do próprio tenant.
- **Escala-alvo** — Onboarding leve e self-service, pensado para 100–200 clientes.

> Acesso cross-tenant a um registro de outro cliente responde como se o registro não existisse (HTTP 404), sem vazar sua existência.

## Funcionalidades

### App Mobile (Operador)
- **Criar pedidos** — Selecionar itens do cardápio, definir origem (presencial/WhatsApp), cliente
- **Editar itens do pedido** — Adicionar/remover itens enquanto status é "aguardando"
- **Pagamento** — Registrar pagamento (PIX, Cartão, Dinheiro) com confirmação modal
- **Fila de pedidos** — Visualizar e avançar status dos pedidos em tempo real
- **Gestão de cardápio** — Criar, editar, ativar/desativar itens do menu
- **Gestão de usuários** — CRUD completo com filtros por role, toggle de status, edição de email/senha
- **Resumo do dia** — Totais de vendas, pedidos e métodos de pagamento

### Painel Web (Preparador)
- **Fila em tempo real** — Pedidos atualizados via Supabase Realtime (WebSocket), no canal do próprio tenant
- **Filtros por status** — Aguardando, Preparando, Pronto, Entregue
- **Avanço de status** — Botões contextuais por status (Iniciar Preparo, Marcar Pronto, etc.)
- **Notificação de pagamento** — Badge atualizado em tempo real quando pagamento é registrado
- **Banner de conexão** — Indicador visual quando a conexão Realtime é perdida

### Plataforma (Platform_Admin)
- **Onboarding de tenant** — Provisiona um novo cliente (tenant + cardápio inicial + admin + instância WhatsApp) sem alteração de código nem redeploy
- **Provisionamento transacional** — Rollback total em caso de falha e idempotência por chave de provisionamento (reenvio não duplica o tenant)
- **Trilha de auditoria** — Operações de plataforma registram o ator e a ação
- **Interfaces** — Script CLI (`create-tenant`) e endpoint `POST /api/platform/tenants` (protegido por `platformAdminMiddleware`)

### Branding por Tenant (White-Label)
- **Tema aplicado após o login** — Cada tenant vê seu próprio nome, logo e paleta, resolvidos em runtime do backend (`GET /api/tenant/branding`) — sem build por cliente
- **Tema neutro de plataforma** — Aplicado antes de autenticar e como fallback em caso de falha/timeout na obtenção do branding
- **Web e mobile** — Ambos os apps buscam e aplicam o branding do tenant antes de renderizar as telas autenticadas

### Realtime (Supabase Broadcast)
- Canais namespaced por tenant: `orders:queue:{tenantId}` — Novos pedidos, mudanças de status, edição de exclusão
- `orders:payment:{tenantId}` — Registros de pagamento
- Inscrição lazy por canal (sem pré-warm global) para escalar com N tenants
- Reconexão automática com reload de dados
- Debounce de estado "stale" para evitar flickering

## Arquitetura

```
┌─────────────┐   ┌─────────────┐   ┌─────────────────┐
│  App Mobile │   │  Painel Web │   │  Bot WhatsApp   │
│  (Expo)     │   │  (Vite)     │   │  (Evolution API)│
└──────┬──────┘   └──────┬──────┘   └────────┬────────┘
       │                 │                    │
       └────────────┬────┴────────────────────┘
                    │
            ┌───────▼───────┐
            │   Kong (GW)   │
            └───────┬───────┘
                    │
       ┌────────────┼────────────┐
       │            │            │
┌──────▼──────┐ ┌──▼───┐ ┌─────▼─────┐
│   Backend   │ │ Auth │ │ Realtime  │
│  (Express)  │ │(GoTrue)│ │(WebSocket)│
└──────┬──────┘ └──┬───┘ └─────┬─────┘
       │            │           │
       └────────────┼───────────┘
                    │
            ┌───────▼───────┐
            │  PostgreSQL   │
            └───────────────┘
```

## Pré-requisitos

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0 (`corepack enable` para ativar)
- **Docker** e **Docker Compose** v2 (para infra local)
- **Expo CLI** (para desenvolvimento mobile: `npx expo`)

## Instalação

```bash
# Clonar o repositório
git clone git@github.com:andrecasa/foodtruck-order-system.git
cd foodtruck-order-system

# Instalar dependências (usa pnpm workspaces)
pnpm install

# Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env conforme necessário (valores padrão funcionam para dev local)
```

## Executando

### Desenvolvimento Local

```bash
# 1. Gerar chaves JWT (atualiza .env, kong.yml, apps/mobile/.env)
./scripts/generate-keys.sh

# 2. Subir tudo (seed-realtime cria tenant automaticamente)
docker compose down -v
docker compose up -d --build

# 3. Aguardar estabilizar
sleep 15

# 4. Provisionar o primeiro tenant + admin logável (onboarding idempotente)
#    Cria o tenant, cardápio inicial, o admin no Auth E a linha em `users`
#    com tenant_id. Credenciais do admin vêm do .env (ADMIN_EMAIL/ADMIN_PASSWORD).
./scripts/seed-first-tenant.sh

# 5. Iniciar apps
pnpm dev:mobile    # App mobile (Expo)
pnpm dev:mobile --clear    # App mobile (Expo) com cache limpo
pnpm dev:web       # Painel web (porta 3000)
```

### Resetar Ambiente

```bash
docker compose down -v
docker compose up -d --build
sleep 15
./scripts/seed-first-tenant.sh
```

### Provisionar um Tenant (Onboarding)

Cada cliente é criado via onboarding — sem alteração de código nem redeploy. O provisionamento é transacional (rollback total em falha) e idempotente pela `provisioning_key`.

**Via CLI** (a partir de `apps/backend`, requer DB + Supabase acessíveis):

```bash
pnpm create-tenant -- \
  --provisioning-key=taco-loco-001 \
  --business-name="Taco Loco" \
  --evolution-instance=taco-loco \
  --admin-name="Maria" \
  --admin-email=maria@tacoloco.com \
  --admin-password='S3nh@Forte' \
  --menu-preset=./presets/pastel-das-meninas.json
```

**Via endpoint de plataforma** (protegido por `platformAdminMiddleware`):

```bash
curl -X POST http://localhost:4000/api/platform/tenants \
  -H "Authorization: Bearer <TOKEN_DE_PLATFORM_ADMIN>" \
  -H "Content-Type: application/json" \
  -d @tenant.json
```

O onboarding cria o tenant (branding, tema, timezone, instância WhatsApp), semeia o cardápio inicial, provisiona um admin ativo e registra a instância Evolution + webhook.

> **"Pastel das Meninas"** é apenas o primeiro tenant, provisionado a partir de um preset de onboarding (`presets/pastel-das-meninas.json`) via `pnpm provision-pastel`, e não mais um seed global de schema.

### Scripts

| Script | Descrição |
|---|---|
| `./scripts/generate-keys.sh` | Gera JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY. Atualiza `.env`, `kong.yml`, `apps/mobile/.env` |
| `./scripts/seed-first-tenant.sh` | Bootstrap de dev: provisiona o primeiro tenant + admin logável (onboarding idempotente) usando `ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env` |
| `pnpm create-tenant` | Provisiona um novo tenant via CLI (onboarding) |
| `pnpm provision-pastel` | Provisiona o tenant "Pastel das Meninas" a partir do preset de onboarding |

> **Nota (multi-tenant):** não existe mais um "seed" que cria apenas o usuário no Supabase Auth — no modelo multi-tenant, um usuário sem linha em `users` com `tenant_id` não resolve tenant e é rejeitado com **HTTP 401** (`TENANT_RESOLUTION_FAILED`) pelo `tenantMiddleware`. Todo admin logável deve vir do **onboarding** (auth user + linha em `users` com `tenant_id` e `role='admin'`). Para dev, `./scripts/seed-first-tenant.sh` faz esse bootstrap de ponta a ponta; para clientes reais, use `pnpm create-tenant` ou `POST /api/platform/tenants`.

### Rebuildar Backend

```bash
docker compose up -d --build backend
```

## Scripts Disponíveis

| Comando | Descrição |
|---|---|
| `pnpm dev:backend` | Inicia backend com hot-reload (fora do Docker) |
| `pnpm dev:web` | Inicia painel web (Vite) |
| `pnpm dev:mobile` | Inicia app mobile (Expo) |
| `pnpm build` | Build de todos os packages |
| `pnpm test` | Executa testes em todos os packages |
| `pnpm typecheck` | Verificação de tipos em todos os packages |
| `pnpm lint` | Lint em todos os packages |

## Testes

O projeto utiliza **Vitest** (backend, web, shared) e **Jest** (mobile) com testes unitários e property-based (fast-check).

### Rodar todos os testes

```bash
pnpm test
```

### Rodar por pacote

```bash
pnpm --filter @order-system/backend test    # Backend (78 suites, 526 tests)
pnpm --filter @order-system/mobile test     # Mobile (21 suites, 76 tests)
pnpm --filter @order-system/web test        # Web (4 suites, 37 tests)
pnpm --filter @order-system/shared test     # Shared (4 suites, 82 tests)
```

Entre os testes property-based estão as **propriedades de isolamento multi-tenant** (leitura/escrita cross-tenant, numeração diária por tenant, injeção obrigatória de `tenant_id`, roteamento/isolamento do WhatsApp, fallback de branding e idempotência/atomicidade de onboarding).

### Rodar um arquivo específico

```bash
# Vitest (backend, web, shared)
cd apps/backend && npx vitest run src/__tests__/unit/order-controller.test.ts

# Jest (mobile)
cd apps/mobile && npx jest src/__tests__/unit/login-screen.test.tsx
```

### Modo watch (re-executa ao salvar)

```bash
# Vitest
cd apps/backend && npx vitest

# Jest
cd apps/mobile && npx jest --watch
```

### Saída detalhada (verbose)

```bash
cd apps/backend && npx vitest run --reporter=verbose
cd apps/mobile && npx jest --verbose
```

### Relatório de cobertura

```bash
cd apps/backend && npx vitest run --coverage
cd apps/mobile && npx jest --coverage
cd apps/web && npx vitest run --coverage
```

Gera uma pasta `coverage/` com um `index.html` que pode ser aberto no navegador para visualizar quais linhas estão cobertas.

### Estrutura de testes

| Pacote | Framework | Tipos de teste | Localização |
|--------|-----------|----------------|-------------|
| backend | Vitest + fast-check | Unitários + property-based | `apps/backend/src/__tests__/` |
| mobile | Jest + fast-check | Unitários + property-based | `apps/mobile/src/__tests__/` |
| web | Vitest + fast-check | Integração + property-based | `apps/web/src/__tests__/` |
| shared | Vitest | Unitários (validators, constantes) | `packages/shared/src/__tests__/` |

## Estrutura do Projeto

```
.
├── apps/
│   ├── backend/          # API REST (Express + TypeScript)
│   │   ├── migrations/   # SQL migrations multi-tenant (executadas na inicialização)
│   │   ├── presets/      # Presets de onboarding (ex: pastel-das-meninas.json)
│   │   ├── scripts/      # CLIs de plataforma (create-tenant, provision-pastel)
│   │   └── src/
│   │       ├── bot/          # WhatsApp bot (Evolution API) + WebhookRouter por tenant
│   │       ├── config/       # Database e Supabase config
│   │       ├── controllers/  # Route handlers
│   │       ├── db/           # TenantRepository (helper central de isolamento)
│   │       ├── middleware/   # Auth, tenant, platformAdmin, rate-limit
│   │       ├── presets/      # Preset de onboarding tipado
│   │       ├── routes/       # Express routes (negócio + /api/platform)
│   │       ├── services/     # Serviços de domínio + tenant-provision
│   │       ├── theme/        # Tema neutro de plataforma (branding)
│   │       └── __tests__/    # Unit + property-based tests (isolamento multi-tenant)
│   ├── mobile/           # App operador (Expo + React Native)
│   │   └── src/
│   │       ├── __tests__/    # Unit + property-based tests
│   │       ├── components/   # Design System components
│   │       ├── screens/      # Telas da aplicação
│   │       ├── services/     # API client
│   │       └── theme/        # ThemeProvider e tokens
│   └── web/              # Painel preparador (Vite + React)
│       └── src/
│           ├── __tests__/    # Integration + property-based tests
│           ├── components/   # Design System components
│           ├── services/     # API client
│           └── theme/        # ThemeProvider e tokens
├── packages/
│   └── shared/           # Tipos, validadores Zod, constantes
├── docker-compose.yml    # PostgreSQL, Auth, Realtime, Kong, Evolution API
├── kong.yml              # Configuração do API Gateway
├── .env.example          # Variáveis de ambiente com valores padrão
└── pnpm-workspace.yaml   # Configuração do monorepo
```

## White Label / Temas

O sistema suporta customização visual completa via **design tokens**. Cada tenant personaliza cores, tipografia, espaçamentos e bordas sem alterar código-fonte — o branding é armazenado no tenant e resolvido em runtime pelo backend (`GET /api/tenant/branding`) após o login, sem necessidade de rebuild nem build por cliente. O tema padrão é neutro (sem marca) e serve de base para o deep merge e de fallback.

### Tokens Configuráveis

| Categoria | Tokens | Descrição |
|---|---|---|
| **colors** | `primary`, `secondary`, `background`, `text`, `success`, `warning`, `error` | Paleta base da marca |
| **colors** (status) | `aguardando`, `preparando`, `pronto`, `entregue` | Cores de status de pedidos |
| **colors** (UI) | `textSecondary`, `surface`, `divider` | Cores de interface |
| **colors** (financeiro) | `received`, `pending`, `revenue` | Cores de cards financeiros |
| **colors** (superfícies) | `surfacePrimary`, `surfaceRevenue`, `surfaceReceived`, `surfacePending` | Backgrounds tintados de sub-cards |
| **typography.fontFamily** | `fontFamily` | Família tipográfica (ex: `"Inter"`, `"Poppins"`) |
| **typography.sizes** | `xs` (10), `sm` (12), `md` (14), `lg` (16), `xl` (20), `xxl` (32) | Escala tipográfica em px |
| **typography.weights** | `regular` (400), `medium` (500), `bold` (600) | Pesos tipográficos |
| **spacing** | `xs` (4), `sm` (8), `md` (16), `lg` (24), `xl` (32) | Espaçamentos em px |
| **borderRadius** | `sm` (8), `md` (12), `lg` (24), `full` (9999) | Raios de borda em px |

Além dos tokens visuais, você pode definir `businessName` (nome exibido na interface) e `logo` (URL do logotipo).

### Exemplo de Tema Customizado

```json
{
  "businessName": "Taco Loco",
  "logo": "/assets/taco-loco-logo.png",
  "colors": {
    "primary": "#E65100",
    "secondary": "#BF360C",
    "background": "#FFF8E1",
    "text": "#3E2723",
    "success": "#2E7D32",
    "warning": "#F9A825",
    "error": "#C62828",
    "aguardando": "#F9A825",
    "preparando": "#1565C0",
    "pronto": "#2E7D32",
    "textSecondary": "#795548",
    "surface": "#FFFFFF",
    "divider": "#D7CCC8"
  },
  "typography": {
    "fontFamily": "Poppins",
    "sizes": { "xs": 10, "sm": 12, "md": 14, "lg": 16, "xl": 20, "xxl": 32 },
    "weights": { "regular": 400, "medium": 500, "bold": 700 }
  },
  "spacing": { "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32 },
  "borderRadius": { "sm": 8, "md": 12, "lg": 20, "full": 9999 }
}
```

> **Nota:** Você não precisa informar todos os tokens. O sistema faz **deep merge** com o tema padrão — apenas os campos informados são sobrescritos.

### Passo a Passo: Definir o Branding de um Tenant

O branding é uma propriedade do tenant. Basta fornecê-lo no onboarding e ele será aplicado automaticamente após o login, em web e mobile.

1. **Monte o override de tema** — Um JSON parcial (`Partial<ThemeConfig>`) com os tokens que deseja sobrescrever (pode ser apenas cores). Pode incluir também `businessName` e `logo`.

2. **Informe no provisionamento do tenant** — Passe o `businessName`, `logoUrl` e `theme` ao provisionar o tenant (via `create-tenant` / `POST /api/platform/tenants`). Esses valores ficam armazenados na tabela `tenants`.

3. **Pronto** — No próximo login de um usuário desse tenant, web e mobile buscam `GET /api/tenant/branding` e aplicam o tema (deep merge sobre o neutro) antes de renderizar as telas autenticadas. Nenhum rebuild é necessário.

4. **Verifique o contraste** — Garanta que as combinações de cor atendem WCAG AA (razão de contraste ≥ 4.5:1 para texto).

### Como o Tema é Carregado em Runtime

**Web e Mobile** — Fluxo idêntico:
1. Antes de autenticar, aplica-se o **tema neutro de plataforma** (sem marca).
2. Após o login, o app busca `GET /api/tenant/branding` e faz **deep merge** do tema do tenant sobre o neutro, aplicando-o antes de renderizar as telas autenticadas.
3. Em falha ou timeout, mantém-se o tema neutro (o app continua utilizável). O mobile ainda cacheia o último tema para partida rápida.

O `ThemeProvider` aplica os tokens antes de renderizar os componentes filhos (na web, via CSS custom properties), garantindo que a interface nunca pisque com o tema errado.

> O override parcial é sempre mesclado (deep merge) com o tema neutro — apenas os campos informados são sobrescritos.

### Referência Completa

Para a documentação completa de tokens com valores padrão, regras de implementação, componentes e exemplos visuais, consulte [`docs/design-system.md`](docs/design-system.md).

## Bot WhatsApp

O bot utiliza a [Evolution API](https://github.com/EvolutionAPI/evolution-api) (self-hosted) para integração com WhatsApp. Abaixo estão as instruções completas para conectar, configurar e operar o bot.

> **WhatsApp por tenant** — Cada tenant possui **exatamente uma** instância Evolution (mapeada por `tenants.evolution_instance_name`, UNIQUE) e seu próprio número. O `WebhookRouter` extrai o campo `instance` do payload e resolve o tenant correto; sessões, cardápio e atribuição de pedido são todos escopados a esse tenant. A instância de cada tenant é normalmente criada durante o onboarding. Os exemplos abaixo usam o nome de instância genérico `order-system` como referência — substitua pelo `evolution_instance_name` do tenant desejado.

### Pré-requisitos

- Docker Compose rodando com todos os serviços saudáveis (`docker compose up -d`)
- Serviço `evolution-api` ativo e acessível na porta 8080
- Backend rodando (porta 4000) — necessário para receber webhooks
- Variáveis configuradas no `.env`:
  - `EVOLUTION_API_URL=http://localhost:8080`
  - `EVOLUTION_API_KEY=change-me-evolution-api-key` (altere para uma chave segura)
  - `EVOLUTION_INSTANCE_NAME=default-instance` (fallback/plataforma; a instância real de cada cliente vem de `tenants.evolution_instance_name`)

Verifique que a Evolution API está saudável:

```bash
curl http://localhost:8080
# Deve retornar informações da API
```

### Acessar o Painel da Evolution API

1. Abra no navegador: **http://localhost:8080/manager**
2. Faça login com a API Key configurada em `EVOLUTION_API_KEY`

### Criar Instância WhatsApp

1. No painel (ou via API), crie uma nova instância com o nome definido em `EVOLUTION_INSTANCE_NAME` (padrão: `order-system`):

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "order-system",
    "integration": "WHATSAPP-BAILEYS",
    "qrcode": true
  }'
```

2. A resposta retornará um QR Code (base64) ou você pode visualizá-lo no painel.

### Conectar via QR Code

1. Acesse a instância criada no painel ou faça a requisição:

```bash
curl -X GET http://localhost:8080/instance/connect/order-system \
  -H "apikey: SUA_API_KEY"
```

2. Escaneie o QR Code com o WhatsApp do celular do food truck:
   - Abra o WhatsApp → **Dispositivos conectados** → **Conectar dispositivo**
   - Aponte a câmera para o QR Code exibido
3. Aguarde a confirmação de conexão (status muda para `open`)

### Configurar Webhook

O webhook é o canal pelo qual a Evolution API envia as mensagens recebidas para o backend processar. Configure-o apontando para o endpoint do backend:

**Para ambiente Docker (serviços na mesma rede):**

```bash
  curl -X POST "http://localhost:8080/webhook/set/pastel-das-meninas" \
  -H "apikey: 6pWzwWOJQeX7e8heE2UDpTZ6IKPvjsPK1qyC3HhscgM=" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "http://localhost:4000/api/webhook/evolution",
      "webhookByEvents": false,
      "events": [
        "MESSAGES_UPSERT"
      ]
    }
  }'
```

**Para desenvolvimento local (backend fora do Docker):**

```bash
curl -X PUT http://localhost:8080/webhook/set/order-system \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "http://host.docker.internal:4000/api/webhook/evolution",
      "webhookByEvents": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

> **Nota:** Use `http://backend:4000` quando o backend roda dentro do Docker Compose (nome do serviço na rede interna). Use `http://host.docker.internal:4000` ou `http://localhost:4000` quando o backend roda fora do Docker.

### Fluxo do Bot

O bot opera como uma máquina de estados com 3 estágios:

```
┌────────────┐     ┌──────────────┐     ┌──────────┐
│  Saudação  │────▶│  Selecionando │────▶│  Resumo  │
│            │     │  (carrinho)   │     │          │
└────────────┘     └──────────────┘     └──────────┘
                         │    ▲                │
                         │    └────────────────┘
                         │         (MAIS)
                         ▼
                   ┌──────────┐
                   │ Cancelar │
                   └──────────┘
```

1. **Saudação** — Cliente envia qualquer mensagem. O bot responde com saudação personalizada (usa o nome do WhatsApp) e exibe o cardápio numerado.
2. **Selecionando** — Cliente envia números para adicionar itens ao carrinho. Formatos aceitos:
   - `1` → 1 unidade do item 1
   - `1 2` → 2 unidades do item 1
   - `2x1` → 2 unidades do item 1
   - Vários itens separados por vírgula: `1, 2 3, 3x2`
   - Digitar `PRONTO` para ver o resumo
   - Digitar `CANCELAR` para cancelar
3. **Resumo** — O bot exibe o resumo com itens, quantidades e total. Comandos:
   - `CONFIRMAR` → Cria o pedido (origin=whatsapp) e exibe número do pedido
   - `CANCELAR` → Cancela e encerra sessão
   - `MAIS` → Volta para seleção de itens

### Gerenciamento de Sessão

- Cada conversa cria uma sessão no banco de dados (`whatsapp_sessions`)
- Timeout de inatividade: **10 minutos** — após este período, a sessão expira automaticamente e o cliente recebe aviso
- Ao confirmar ou cancelar um pedido, a sessão é encerrada
- Nova mensagem após sessão expirada inicia o fluxo novamente

### Troubleshooting

| Problema | Causa Provável | Solução |
|---|---|---|
| QR Code não aparece | Instância já conectada ou API key inválida | Verifique status da instância: `GET /instance/connectionState/order-system` |
| Bot não responde | Webhook não configurado ou backend offline | Verifique webhook com `GET /webhook/find/order-system` e confirme que o backend está rodando |
| "Sessão expirada" frequente | Timeout de 10 min sem atividade | Comportamento normal; cliente deve enviar nova mensagem |
| Erro ao enviar mensagem | Instância desconectada | Reconecte via QR Code: `GET /instance/connect/order-system` |
| Pedido não criado | Erro no banco de dados | Verifique logs do backend: `docker compose logs backend` |
| Evolution API inacessível | Container parado | Reinicie: `docker compose restart evolution-api` |
| API Key rejeitada | Key do `.env` diferente da configurada | Confira `EVOLUTION_API_KEY` no `.env` e reinicie os containers |

### Reconexão

Se o WhatsApp desconectar (troca de celular, logout, etc.):

1. Verifique o status: `GET http://localhost:8080/instance/connectionState/order-system`
2. Se `state: close`, reconecte gerando novo QR Code:
   ```bash
   curl -X GET http://localhost:8080/instance/connect/order-system \
     -H "apikey: SUA_API_KEY"
   ```
3. Escaneie novamente com o WhatsApp

## API Endpoints

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/login` | Login (retorna JWT, sessão 8h) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/session` | Verificar sessão atual |
| GET | `/api/menu` | Listar cardápio ativo (agrupado por categoria) |
| POST | `/api/menu` | Criar item no cardápio |
| PUT | `/api/menu/:id` | Atualizar item |
| PATCH | `/api/menu/:id/status` | Ativar/desativar item |
| POST | `/api/orders` | Criar pedido (presencial ou whatsapp) |
| GET | `/api/orders` | Listar pedidos do dia (filtro por status) |
| PATCH | `/api/orders/:id/status` | Avançar status do pedido |
| POST | `/api/orders/:id/payment` | Registrar pagamento |
| PUT | `/api/orders/:id/items` | Editar itens de um pedido (status aguardando) |
| GET | `/api/users` | Listar usuários (filtro por role/status) |
| GET | `/api/users/:id` | Buscar usuário por ID |
| POST | `/api/users` | Criar usuário |
| PUT | `/api/users/:id` | Atualizar usuário (nome, email, role) |
| DELETE | `/api/users/:id` | Excluir usuário |
| PATCH | `/api/users/:id/status` | Ativar/desativar usuário |
| POST | `/api/users/:id/reset-password` | Resetar senha do usuário |
| GET | `/api/summary/today` | Resumo do dia (America/Sao_Paulo), escopado ao tenant |
| GET | `/api/tenant/branding` | Branding do tenant autenticado (businessName, logo, tema) |
| POST | `/api/platform/tenants` | Provisionar um novo tenant (Platform_Admin) |
| GET | `/api/platform/tenants` | Listar tenants (Platform_Admin) |
| POST | `/api/webhook/evolution` | Webhook da Evolution API (WhatsApp), roteado por instância → tenant |
| GET | `/api/health` | Health check |

> Todas as rotas de negócio (`/api/menu`, `/api/orders`, `/api/users`, `/api/summary`, `/api/categories`, `/api/tenant/*`) passam por `auth → syncUser → tenant` e são automaticamente escopadas ao tenant do usuário. As rotas `/api/platform/*` usam `platformAdminMiddleware` e **não** passam pelo middleware de tenant.

## Tecnologias

- **Runtime:** Node.js 20+
- **Linguagem:** TypeScript 5.7
- **Monorepo:** pnpm Workspaces
- **Mobile:** Expo SDK 52, React Native 0.76
- **Web:** Vite, React 19
- **Backend:** Express 4
- **Banco:** PostgreSQL 15
- **Auth:** Supabase GoTrue (self-hosted)
- **Realtime:** Supabase Realtime (WebSocket)
- **WhatsApp:** Evolution API
- **Validação:** Zod
- **Testes:** Vitest + fast-check (property-based)
- **Infra:** Docker Compose

## Licença

Projeto privado - todos os direitos reservados.
