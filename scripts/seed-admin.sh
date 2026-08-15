#!/bin/bash
# ===================================================
# Seed Admin User
# ===================================================
# Creates the initial admin user in Supabase Auth.
# Run AFTER docker compose up -d and services are healthy.
#
# Usage:
#   ./scripts/seed-admin.sh
#   ./scripts/seed-admin.sh custom@email.com mypassword
# ===================================================

set -e

# Load vars from .env
if [ -f .env ]; then
  SUPABASE_URL=$(grep "^SUPABASE_URL=" .env | cut -d= -f2)
  SUPABASE_ANON_KEY=$(grep "^SUPABASE_ANON_KEY=" .env | cut -d= -f2)
fi

SUPABASE_URL="${SUPABASE_URL:-http://localhost:8000}"
ADMIN_EMAIL="${1:-admin@foodtruck.com}"
ADMIN_PASSWORD="${2:-12345678}"

if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "❌ SUPABASE_ANON_KEY não encontrada. Rode ./scripts/generate-keys.sh primeiro."
  exit 1
fi

echo "⏳ Aguardando Supabase Auth..."
for i in $(seq 1 30); do
  if curl -s "${SUPABASE_URL}/auth/v1/health" > /dev/null 2>&1; then break; fi
  if [ $i -eq 30 ]; then echo "❌ Timeout"; exit 1; fi
  sleep 1
done

echo "✅ Auth disponível"
echo "📧 Criando: ${ADMIN_EMAIL}"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\",\"email_confirm\":true}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "✅ Usuário criado! Email: ${ADMIN_EMAIL} / Senha: ${ADMIN_PASSWORD}"
  echo "ℹ️  Primeiro login atribui role 'admin' automaticamente."
elif echo "$BODY" | grep -q "already registered"; then
  echo "ℹ️  Usuário ${ADMIN_EMAIL} já existe."
else
  echo "❌ Erro (HTTP ${HTTP_CODE}): ${BODY}"
  exit 1
fi
