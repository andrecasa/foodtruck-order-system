#!/bin/bash
# ===================================================
# Create Admin User in Supabase Auth
# ===================================================
# Usage:
#   ./scripts/seed-admin.sh
#   ./scripts/seed-admin.sh email@example.com password123
# ===================================================
set -e

# Load from .env
SUPABASE_URL=$(grep "^SUPABASE_URL=" .env 2>/dev/null | cut -d= -f2)
SUPABASE_ANON_KEY=$(grep "^SUPABASE_ANON_KEY=" .env 2>/dev/null | cut -d= -f2)

SUPABASE_URL="${SUPABASE_URL:-http://localhost:8000}"
EMAIL="${1:-admin@foodtruck.com}"
PASSWORD="${2:-12345678}"

[ -z "$SUPABASE_ANON_KEY" ] && echo "❌ SUPABASE_ANON_KEY not found in .env" && exit 1

echo "⏳ Waiting for Auth..."
for i in $(seq 1 30); do
  curl -s "${SUPABASE_URL}/auth/v1/health" > /dev/null 2>&1 && break
  [ $i -eq 30 ] && echo "❌ Timeout" && exit 1
  sleep 1
done

echo "📧 Creating: ${EMAIL}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"email_confirm\":true}")

CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
  echo "✅ Created! Login: ${EMAIL} / ${PASSWORD}"
elif echo "$BODY" | grep -q "already registered"; then
  echo "ℹ️  Already exists: ${EMAIL}"
else
  echo "❌ Error (${CODE}): ${BODY}"
  exit 1
fi
