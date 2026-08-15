#!/bin/bash
# ===================================================
# Seed Realtime Tenant (manual, for troubleshooting)
# ===================================================
# Normally runs automatically via docker compose (seed-realtime service).
# Use this script only if you need to fix the tenant manually.
#
# Usage:
#   ./scripts/seed-realtime.sh
# ===================================================

set -e

if [ -f .env ]; then
  POSTGRES_HOST=$(grep "^POSTGRES_HOST=" .env | cut -d= -f2)
  POSTGRES_PORT=$(grep "^POSTGRES_PORT=" .env | cut -d= -f2)
  POSTGRES_DB=$(grep "^POSTGRES_DB=" .env | cut -d= -f2)
  POSTGRES_USER=$(grep "^POSTGRES_USER=" .env | cut -d= -f2)
  POSTGRES_PASSWORD=$(grep "^POSTGRES_PASSWORD=" .env | cut -d= -f2)
  JWT_SECRET=$(grep "^JWT_SECRET=" .env | cut -d= -f2)
fi

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-order_system}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
JWT_SECRET="${JWT_SECRET:-super-secret-jwt-token-change-in-production}"

echo "⏳ Aguardando _realtime.tenants..."
for i in $(seq 1 30); do
  EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema = '_realtime' AND table_name = 'tenants';" 2>/dev/null || echo "")
  if [ "$EXISTS" = "1" ]; then break; fi
  if [ $i -eq 30 ]; then echo "❌ Timeout"; exit 1; fi
  sleep 1
done

sleep 3
echo "🔧 Corrigindo tenant..."

PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "ALTER TABLE _realtime.extensions DROP CONSTRAINT IF EXISTS extensions_tenant_external_id_fkey;"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "UPDATE _realtime.tenants SET external_id = 'realtime', jwt_secret = '${JWT_SECRET}' WHERE external_id = 'realtime-dev';"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "UPDATE _realtime.tenants SET jwt_secret = '${JWT_SECRET}' WHERE external_id = 'realtime';"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "UPDATE _realtime.extensions SET tenant_external_id = 'realtime' WHERE tenant_external_id = 'realtime-dev';"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "ALTER TABLE _realtime.extensions ADD CONSTRAINT extensions_tenant_external_id_fkey FOREIGN KEY (tenant_external_id) REFERENCES _realtime.tenants(external_id);"

echo "✅ Tenant corrigido!"
echo "🔄 Reinicie o realtime: docker compose restart realtime"
