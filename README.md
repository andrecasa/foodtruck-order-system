# 🚚 Foodtruck Order System

Sistema de pedidos MVP para food truck, com app mobile para o operador, painel web para o preparador e bot WhatsApp para clientes.

## Visão Geral

| Componente | Tecnologia | Descrição |
|---|---|---|
| **Mobile** | Expo + React Native | App do operador: criar pedidos, gerenciar fila, pagamentos, cardápio, gestão de usuários |
| **Web** | Vite + React | Painel do preparador: fila em tempo real com avanço de status e notificações de pagamento |
| **Backend** | Express + Node.js | API REST com autenticação JWT, eventos Realtime e CRUD completo |
| **Bot WhatsApp** | Evolution API | Atendimento automatizado via máquina de estados |
| **Shared** | TypeScript + Zod | Tipos, validadores e constantes compartilhados |

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
- **Fila em tempo real** — Pedidos atualizados via Supabase Realtime (WebSocket)
- **Filtros por status** — Aguardando, Preparando, Pronto, Entregue
- **Avanço de status** — Botões contextuais por status (Iniciar Preparo, Marcar Pronto, etc.)
- **Notificação de pagamento** — Badge atualizado em tempo real quando pagamento é registrado
- **Banner de conexão** — Indicador visual quando a conexão Realtime é perdida

### Realtime (Supabase Broadcast)
- Canal `orders:queue` — Novos pedidos, mudanças de status, edição de itens
- Canal `orders:payment` — Registros de pagamento
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
# 1. Gerar chaves JWT (atualiza .env, kong.yml, apps/mobile/.env)
./scripts/generate-keys.sh

# 2. Subir tudo (seed-realtime cria tenant automaticamente)
docker compose down -v
docker compose up -d --build

# 3. Aguardar estabilizar
sleep 15

# 4. Criar usuário admin (padrão: admin@foodtruck.com / 12345678)
./scripts/seed-admin.sh

# 5. Iniciar apps
pnpm dev:mobile    # App mobile (Expo) — rodar de apps/mobile/
pnpm dev:mobile --clear    # App mobile (Expo) — rodar de apps/mobile/
pnpm dev:web       # Painel web (porta 3000)
```

> **Nota:** Configure `PROTOTYPE_MODE=false` no `.env` para modo completo.

### Resetar Ambiente

```bash
docker compose down -v
docker compose up -d --build
sleep 15
./scripts/seed-admin.sh
```

### Scripts

| Script | Descrição |
|---|---|
| `./scripts/generate-keys.sh` | Gera JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY. Atualiza `.env`, `kong.yml`, `apps/mobile/.env` |
| `./scripts/seed-admin.sh` | Cria usuário admin no Supabase Auth (padrão: admin@foodtruck.com / 12345678) |

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

## Estrutura do Projeto

```
.
├── apps/
│   ├── backend/          # API REST (Express + TypeScript)
│   │   ├── migrations/   # SQL migrations (executadas na inicialização)
│   │   └── src/
│   │       ├── bot/          # WhatsApp bot (Evolution API)
│   │       ├── config/       # Database e Supabase config
│   │       ├── controllers/  # Route handlers
│   │       ├── middleware/   # Auth e rate-limit
│   │       ├── routes/       # Express routes
│   │       └── __tests__/    # Unit + property-based tests
│   ├── mobile/           # App operador (Expo + React Native)
│   │   └── src/
│   │       ├── components/   # Design System components
│   │       ├── mocks/        # Dados mockados (modo protótipo)
│   │       ├── screens/      # Telas da aplicação
│   │       ├── services/     # API client (real + mock)
│   │       └── theme/        # ThemeProvider e tokens
│   └── web/              # Painel preparador (Vite + React)
│       └── src/
│           ├── components/   # Design System components
│           ├── mocks/        # Dados mockados (modo protótipo)
│           ├── services/     # API client (real + mock)
│           └── theme/        # ThemeProvider e tokens
├── packages/
│   └── shared/           # Tipos, validadores Zod, constantes
├── docker-compose.yml    # PostgreSQL, Auth, Realtime, Kong, Evolution API
├── kong.yml              # Configuração do API Gateway
├── .env.example          # Variáveis de ambiente com valores padrão
└── pnpm-workspace.yaml   # Configuração do monorepo
```

## White Label / Temas

O sistema suporta customização visual completa via **design tokens**. Qualquer food truck pode personalizar cores, tipografia, espaçamentos e bordas sem alterar código-fonte — apenas fornecendo um JSON de override parcial. O tema é aplicado em runtime, sem necessidade de rebuild.

### Tokens Configuráveis

| Categoria | Tokens | Descrição |
|---|---|---|
| **colors** | `primary`, `secondary`, `background`, `text`, `success`, `warning`, `error`, `aguardando`, `preparando`, `pronto`, `textSecondary`, `surface`, `divider` | Paleta de cores da marca e status de pedidos |
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

### Passo a Passo: Criar Tema para Outro Food Truck

1. **Crie o arquivo de tema** — Crie um arquivo JSON (ex: `themes/taco-loco.json`) com os tokens que deseja sobrescrever. Pode ser um override parcial (ex: apenas cores).

2. **Configure a variável de ambiente:**

   - **Web (painel do preparador):** Adicione no `.env`:
     ```bash
     VITE_THEME_CONFIG_PATH=./themes/taco-loco.json
     ```
     Ou, para injeção em runtime sem rebuild, adicione ao `index.html` antes do bundle:
     ```html
     <script>
       window.__THEME_CONFIG__ = { "businessName": "Taco Loco", "colors": { "primary": "#E65100" } };
     </script>
     ```

   - **Mobile (app do operador):** Adicione no `.env`:
     ```bash
     EXPO_PUBLIC_THEME_CONFIG='{"businessName":"Taco Loco","colors":{"primary":"#E65100","secondary":"#BF360C"}}'
     ```

3. **Reinicie o servidor de desenvolvimento** (ou, em produção, reinicie o container/processo). Nenhum rebuild é necessário quando usado via `window.__THEME_CONFIG__`.

4. **Verifique o contraste** — Garanta que as combinações de cor atendem WCAG AA (razão de contraste ≥ 4.5:1 para texto).

### Como o Tema é Carregado em Runtime

O carregamento é **síncrono** e ocorre antes de qualquer componente ser renderizado:

**Web** — Ordem de resolução (primeiro encontrado vence):
1. `window.__THEME_CONFIG__` — objeto injetado no HTML pelo servidor (sem rebuild)
2. `VITE_THEME_CONFIG_PATH` — variável de build que aponta para um JSON
3. Tema padrão (fallback)

**Mobile** — Ordem de resolução:
1. `EXPO_PUBLIC_THEME_CONFIG` — variável de ambiente com JSON string
2. Tema padrão (fallback)

Em ambos os casos, o override parcial é mesclado (deep merge) com o tema padrão. O `ThemeProvider` aplica os tokens globalmente antes de renderizar componentes filhos, garantindo que a interface nunca pisque com o tema errado.

### Referência Completa

Para a documentação completa de tokens com valores padrão, regras de implementação, componentes e exemplos visuais, consulte [`docs/design-system.md`](docs/design-system.md).

## Bot WhatsApp

O bot utiliza a [Evolution API](https://github.com/EvolutionAPI/evolution-api) (self-hosted) para integração com WhatsApp. Abaixo estão as instruções completas para conectar, configurar e operar o bot.

### Pré-requisitos

- Docker Compose rodando com todos os serviços saudáveis (`docker compose up -d`)
- Serviço `evolution-api` ativo e acessível na porta 8080
- Backend rodando (porta 4000) — necessário para receber webhooks
- Variáveis configuradas no `.env`:
  - `EVOLUTION_API_URL=http://localhost:8080`
  - `EVOLUTION_API_KEY=change-me-evolution-api-key` (altere para uma chave segura)
  - `EVOLUTION_INSTANCE_NAME=order-system`

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
curl -X PUT http://localhost:8080/webhook/set/order-system \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "http://backend:4000/api/webhook/evolution",
      "webhookByEvents": false,
      "events": ["MESSAGES_UPSERT"]
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
| GET | `/api/summary/today` | Resumo do dia (America/Sao_Paulo) |
| POST | `/api/webhook/evolution` | Webhook da Evolution API (WhatsApp) |
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
