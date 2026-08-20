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
# 4. Build e start dos containers
# ─────────────────────────────────────────────
echo ">>> Construindo e iniciando containers..."
docker compose down || true
docker compose up -d --build

echo ">>> Aguardando estabilizar (15s)..."
sleep 15

# ─────────────────────────────────────────────
# 5. Provisionar o primeiro tenant + admin logável (onboarding idempotente)
# ─────────────────────────────────────────────
echo ">>> Provisionando o primeiro tenant (onboarding)..."
if [ -f "./scripts/seed-first-tenant.sh" ]; then
  bash ./scripts/seed-first-tenant.sh
fi

# ─────────────────────────────────────────────
# 6. Verificar saúde dos serviços
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
