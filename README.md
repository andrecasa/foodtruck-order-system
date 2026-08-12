# 🚚 Foodtruck Order System

Sistema de pedidos MVP para food truck, com app mobile para o operador, painel web para o preparador e bot WhatsApp para clientes.

## Visão Geral

| Componente | Tecnologia | Descrição |
|---|---|---|
| **Mobile** | Expo + React Native | App do operador: criar pedidos, gerenciar fila, pagamentos, resumo do dia |
| **Web** | Vite + React | Painel do preparador: fila em tempo real com avanço de status |
| **Backend** | Express + Node.js | API REST com autenticação JWT e eventos Realtime |
| **Bot WhatsApp** | Evolution API | Atendimento automatizado via máquina de estados |
| **Shared** | TypeScript + Zod | Tipos, validadores e constantes compartilhados |

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
- **pnpm** >= 9.0.0
- **Docker** e **Docker Compose** (para infra local)
- **Expo CLI** (para desenvolvimento mobile)

## Instalação

```bash
# Clonar o repositório
git clone git@github.com:andrecasa/foodtruck-order-system.git
cd foodtruck-order-system

# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
cp .env.example .env
```

## Executando

### Modo Protótipo (sem backend)

Ideal para desenvolvimento de UI. Usa dados mockados:

```bash
# No .env, garanta:
# PROTOTYPE_MODE=true

# App mobile
pnpm dev:mobile

# Painel web do preparador
pnpm dev:web
```

### Modo Completo (com infraestrutura)

```bash
# Subir serviços (PostgreSQL, Auth, Realtime, Kong, Evolution API)
docker compose up -d

# Executar migrations
pnpm --filter @order-system/backend migrate

# Backend
pnpm dev:backend

# App mobile
pnpm dev:mobile

# Painel web
pnpm dev:web
```

## Scripts Disponíveis

| Comando | Descrição |
|---|---|
| `pnpm dev:backend` | Inicia backend com hot-reload |
| `pnpm dev:web` | Inicia painel web (Vite) |
| `pnpm dev:mobile` | Inicia app mobile (Expo) |
| `pnpm build` | Build de todos os packages |
| `pnpm test` | Executa testes em todos os packages |
| `pnpm typecheck` | Verificação de tipos em todos os packages |
| `pnpm lint` | Lint em todos os packages |

## Estrutura do Projeto

```
.
├── apps/
│   ├── backend/          # API REST (Express + TypeScript)
│   │   ├── migrations/   # SQL migrations
│   │   └── src/
│   ├── mobile/           # App operador (Expo + React Native)
│   │   └── src/
│   └── web/              # Painel preparador (Vite + React)
│       └── src/
├── packages/
│   └── shared/           # Tipos, validadores, constantes
├── docker-compose.yml
├── .env.example
└── pnpm-workspace.yaml
```

## White Label / Temas

O sistema suporta customização visual via tokens de tema. Para criar um novo tema:

1. Crie um arquivo JSON com os tokens que deseja sobrescrever
2. Configure a variável de ambiente correspondente:
   - **Web:** `VITE_THEME_CONFIG_PATH=./path/to/theme.json`
   - **Mobile:** `EXPO_PUBLIC_THEME_CONFIG='{"colors":{"primary":"#FF6B00"}}'`

Tokens disponíveis: cores, tipografia, espaçamentos e border-radius. Veja `docs/design-system.md` para a lista completa.

## Bot WhatsApp

O bot utiliza a [Evolution API](https://github.com/EvolutionAPI/evolution-api) para integração com WhatsApp:

1. Garanta que o serviço `evolution` está rodando via Docker Compose
2. Acesse `http://localhost:8080` para gerar o QR Code de conexão
3. Escaneie com o WhatsApp do food truck
4. O bot responde automaticamente: exibe cardápio, aceita pedidos e confirma

**Fluxo:** Saudação → Seleção de itens → Resumo → Confirmação → Pedido criado

## API Endpoints

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/login` | Login (retorna JWT, sessão 8h) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/menu` | Listar cardápio ativo |
| POST | `/api/menu` | Criar item |
| PUT | `/api/menu/:id` | Atualizar item |
| POST | `/api/orders` | Criar pedido |
| PATCH | `/api/orders/:id/status` | Avançar status |
| POST | `/api/orders/:id/payment` | Registrar pagamento |
| GET | `/api/summary/today` | Resumo do dia |
| GET | `/api/health` | Health check |

## Tecnologias

- **Runtime:** Node.js 20+
- **Linguagem:** TypeScript 5.7
- **Monorepo:** pnpm Workspaces
- **Mobile:** Expo SDK 52, React Native 0.76
- **Web:** Vite, React 18
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
