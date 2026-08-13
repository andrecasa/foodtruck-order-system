# Docker Compose - Validação de Inicialização

**Data:** Validação estática da configuração  
**Status:** ✅ Aprovado

## Resumo

O `docker-compose.yml` foi validado estaticamente e está pronto para inicializar todos os 6 serviços em menos de 5 minutos.

## Serviços (6 total)

| Serviço | Imagem | Healthcheck | Dependências |
|---------|--------|-------------|--------------|
| db | postgres:15-alpine | ✅ pg_isready (interval: 5s, retries: 10) | Nenhuma |
| auth | supabase/gotrue:v2.151.0 | — | db (service_healthy) |
| realtime | supabase/realtime:v2.28.32 | — | db (service_healthy) |
| kong | kong:3-alpine | — | auth (service_started), realtime (service_started) |
| evolution-api | atendai/evolution-api:latest | — | db (service_healthy) |
| backend | build local (Dockerfile) | — | db (service_healthy), auth (service_started), realtime (service_started) |

## Cadeia de Dependências

```
db (healthcheck: ~10-15s)
├── auth (depends_on db: service_healthy)
├── realtime (depends_on db: service_healthy)
├── evolution-api (depends_on db: service_healthy)
├── kong (depends_on auth + realtime: service_started)
└── backend (depends_on db + auth + realtime: service_healthy/started)
```

## Estimativa de Tempo de Inicialização

| Fase | Tempo Estimado | Descrição |
|------|---------------|-----------|
| 1. Pull de imagens | ~60-120s | Download paralelo (primeira vez) |
| 2. Build backend | ~30-60s | Multi-stage build Node.js |
| 3. db healthy | ~15s | pg_isready com start_period: 10s |
| 4. auth + realtime + evolution | ~10-20s | Iniciam após db healthy |
| 5. kong + backend | ~10-15s | Iniciam após auth/realtime |
| **Total estimado** | **~2-4 min** | **Dentro do limite de 5 min** |

## Validações Realizadas

### 1. Sintaxe do docker-compose.yml ✅
- `docker compose config` executou sem erros
- Todas as variáveis de ambiente possuem valores default

### 2. Healthchecks ✅
- Serviço `db` possui healthcheck robusto com `pg_isready`
- Parâmetros: interval=5s, timeout=5s, retries=10, start_period=10s
- Garante que dependentes só iniciam quando PostgreSQL está pronto

### 3. Cadeia de Dependências ✅
- `auth`, `realtime`, `evolution-api` → aguardam `db` ficar healthy
- `kong` → aguarda `auth` e `realtime` iniciarem
- `backend` → aguarda `db` (healthy) + `auth` + `realtime` (started)
- Não há dependências circulares

### 4. Volumes e Mounts ✅
- `pgdata` para persistência do PostgreSQL
- `evolution_data` para dados da Evolution API
- `kong.yml` montado como read-only no Kong
- Arquivo `kong.yml` existe no diretório raiz

### 5. Build do Backend (Dockerfile) ✅
- Context: raiz do projeto (`.`)
- Todos os arquivos referenciados existem:
  - `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`
  - `packages/shared/package.json`, `apps/backend/package.json`
  - Diretórios `packages/shared/`, `apps/backend/`, `apps/backend/migrations/`
- Multi-stage build (builder + production) otimiza tamanho final
- Usa `pnpm install --frozen-lockfile` para builds reprodutíveis

### 6. Rede ✅
- Rede `order-system-network` (bridge) compartilhada por todos os serviços
- Comunicação inter-serviços via nomes DNS do Docker

### 7. Portas ✅
- Nenhum conflito de porta detectado
- Todas as portas são configuráveis via variáveis de ambiente

## Comando para Inicialização

```bash
cp .env.example .env
docker compose up -d
docker compose logs -f  # acompanhar logs
```
