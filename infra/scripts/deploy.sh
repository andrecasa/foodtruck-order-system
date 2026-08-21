#!/bin/bash
# =============================================================================
# Deploy script - Executar na EC2 após terraform apply
# =============================================================================
set -euo pipefail

APP_DIR="/opt/order-system"
DATA_MOUNT="/mnt/app-data"

echo "============================================"
echo "  Foodtruck Order System - Deploy"
echo "============================================"

# ─────────────────────────────────────────────
# 1. Clonar ou atualizar repositório
# ─────────────────────────────────────────────
if [ ! -d "$APP_DIR/.git" ]; then
  echo ">>> Clonando repositório..."
  # Substitua pela URL do seu repositório
  git clone https://github.com/andrecasa/foodtruck-order-system.git "$APP_DIR"
else
  echo ">>> Atualizando repositório..."
  cd "$APP_DIR"
  git pull origin main
fi

cd "$APP_DIR"

# ─────────────────────────────────────────────
# 2. Configurar .env (se não existir)
# ─────────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo ">>> Criando .env a partir do exemplo..."
  cp .env.example .env
  echo ""
  echo "⚠️  ATENÇÃO: Edite o arquivo .env com as credenciais de produção!"
  echo "   nano $APP_DIR/.env"
  echo ""
fi

# ─────────────────────────────────────────────
# 3. Configurar docker-compose override para volumes
# ─────────────────────────────────────────────
cat > docker-compose.override.yml << EOF
# Override para produção - volumes persistentes no EBS
services:
  db:
    volumes:
      - $DATA_MOUNT/postgres:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/01-init-db.sql:ro
      - ./scripts/create-evolution-db.sh:/docker-entrypoint-initdb.d/02-create-evolution-db.sh:ro

  evolution-api:
    volumes:
      - $DATA_MOUNT/evolution:/evolution/instances

volumes:
  pgdata:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: $DATA_MOUNT/postgres
  evolution_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: $DATA_MOUNT/evolution
EOF

# ─────────────────────────────────────────────
# 4. Instalar Node.js 20 + pnpm (necessários para migrations e onboarding)
# ─────────────────────────────────────────────
if ! command -v node > /dev/null 2>&1; then
  echo ">>> Instalando Node.js 20..."
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
  dnf install -y nodejs
fi
echo ">>> Ativando pnpm (corepack)..."
corepack enable
corepack prepare pnpm@9.15.4 --activate

echo ">>> Instalando dependências (pnpm install)..."
pnpm install --frozen-lockfile

# ─────────────────────────────────────────────
# 5. Gerar chaves do Supabase ANTES do primeiro "up"
# ─────────────────────────────────────────────
# O kong.yml NÃO é versionado; se subirmos os containers sem ele, o Docker cria
# um DIRETÓRIO vazio no bind mount e o Kong entra em loop de restart. O
# generate-keys.sh cria o kong.yml a partir do template e grava as chaves.
# Passa um JWT_SECRET forte (sem argumento, reaproveitaria o valor de exemplo).
echo ">>> Gerando chaves do Supabase (JWT_SECRET/ANON/SERVICE_ROLE + kong.yml)..."
if [ -d kong.yml ]; then
  # Remove um bind-mount fantasma de execuções anteriores mal-ordenadas.
  rmdir kong.yml 2>/dev/null || rm -rf kong.yml
fi
bash ./scripts/generate-keys.sh "$(openssl rand -base64 32)"

# ─────────────────────────────────────────────
# 6. Build e start dos containers (com kong.yml já gerado)
# ─────────────────────────────────────────────
echo ">>> Construindo e iniciando containers..."
docker compose down || true
docker compose up -d --build

echo ">>> Aguardando estabilizar (15s)..."
sleep 15

# ─────────────────────────────────────────────
# 7. Provisionar o primeiro tenant + admin logável (onboarding idempotente)
# ─────────────────────────────────────────────
echo ">>> Provisionando o primeiro tenant (onboarding)..."
if [ -f "./scripts/seed-first-tenant.sh" ]; then
  bash ./scripts/seed-first-tenant.sh
fi

# ─────────────────────────────────────────────
# 8. Verificar saúde dos serviços
# ─────────────────────────────────────────────
echo ""
echo ">>> Verificando serviços..."
docker compose ps

echo ""
echo ">>> Health check do backend..."
for i in $(seq 1 10); do
  if curl -sf http://localhost:4000/api/health > /dev/null; then
    echo "✅ Backend está saudável!"
    break
  fi
  echo "   Tentativa $i/10..."
  sleep 3
done

echo ""
echo "============================================"
echo "  ✅ Deploy concluído!"
echo "============================================"
echo ""
echo "Próximos passos:"
echo "  1. Edite .env com credenciais de produção"
echo "  2. Configure Nginx: sudo nano /etc/nginx/conf.d/order-system.conf"
echo "  3. Ative HTTPS: sudo certbot --nginx -d seu-dominio.com"
echo "  4. Conecte o WhatsApp via Evolution API"
echo ""
