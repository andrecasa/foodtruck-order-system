#!/bin/bash
# ===================================================
# Generate Supabase JWT Keys
# ===================================================
# Generates JWT_SECRET (32 hex chars), ANON_KEY, and SERVICE_ROLE_KEY.
# Updates .env and kong.yml automatically.
#
# Usage:
#   ./scripts/generate-keys.sh              # generates new random secret
#   ./scripts/generate-keys.sh "mysecret"   # uses custom secret (must be 32 hex chars)
# ===================================================

set -e

# Load existing JWT_SECRET from .env
if [ -f .env ]; then
  EXISTING_SECRET=$(grep "^JWT_SECRET=" .env | cut -d= -f2)
fi

# Use provided, existing, or generate new (32 hex chars = 16 bytes = AES-128 compatible)
if [ -n "$1" ]; then
  JWT_SECRET="$1"
elif [ -n "$EXISTING_SECRET" ]; then
  JWT_SECRET="$EXISTING_SECRET"
else
  JWT_SECRET=$(openssl rand -hex 16)
fi

echo "🔑 JWT_SECRET: ${JWT_SECRET}"
echo ""

# Generate tokens using Node.js
KEYS=$(node -e "
const crypto = require('crypto');
const secret = '${JWT_SECRET}';
function base64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function makeJWT(payload) {
  const header = base64url(Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = base64url(crypto.createHmac('sha256', secret).update(header + '.' + body).digest());
  return header + '.' + body + '.' + sig;
}
const now = Math.floor(Date.now() / 1000);
const exp = now + 315360000;
console.log(makeJWT({role:'anon',iss:'supabase',iat:now,exp:exp}));
console.log(makeJWT({role:'service_role',iss:'supabase',iat:now,exp:exp}));
")

ANON_KEY=$(echo "$KEYS" | head -1)
SERVICE_ROLE_KEY=$(echo "$KEYS" | tail -1)

echo "📋 SUPABASE_ANON_KEY=${ANON_KEY}"
echo ""
echo "📋 SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}"
echo ""

# Update .env
if [ -f .env ]; then
  awk -v val="$JWT_SECRET" '/^JWT_SECRET=/{$0="JWT_SECRET="val}1' .env > .env.tmp && mv .env.tmp .env
  awk -v val="$ANON_KEY" '/^SUPABASE_ANON_KEY=/{$0="SUPABASE_ANON_KEY="val}1' .env > .env.tmp && mv .env.tmp .env
  awk -v val="$SERVICE_ROLE_KEY" '/^SUPABASE_SERVICE_ROLE_KEY=/{$0="SUPABASE_SERVICE_ROLE_KEY="val}1' .env > .env.tmp && mv .env.tmp .env
  awk -v val="$ANON_KEY" '/^VITE_SUPABASE_ANON_KEY=/{$0="VITE_SUPABASE_ANON_KEY="val}1' .env > .env.tmp && mv .env.tmp .env
  awk -v val="$ANON_KEY" '/^EXPO_PUBLIC_SUPABASE_ANON_KEY=/{$0="EXPO_PUBLIC_SUPABASE_ANON_KEY="val}1' .env > .env.tmp && mv .env.tmp .env
  echo "✅ .env atualizado!"
fi

# Update kong.yml
if [ -f kong.yml ]; then
  awk -v anon="$ANON_KEY" -v sr="$SERVICE_ROLE_KEY" '
    /username: anon/{found_anon=1}
    /username: service_role/{found_sr=1}
    found_anon && /- key:/{$0="      - key: "anon; found_anon=0}
    found_sr && /- key:/{$0="      - key: "sr; found_sr=0}
    {print}
  ' kong.yml > kong.yml.tmp && mv kong.yml.tmp kong.yml
  echo "✅ kong.yml atualizado!"
fi

echo ""
echo "⚠️  Agora execute:"
echo "   docker compose down -v"
echo "   docker compose up -d --build"
echo "   sleep 15 && docker compose restart realtime"
echo "   sleep 5 && ./scripts/seed-admin.sh"
