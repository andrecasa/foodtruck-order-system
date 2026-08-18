#!/bin/bash
# ===================================================
# Generate Supabase JWT Keys
# ===================================================
# Generates JWT_SECRET, ANON_KEY, and SERVICE_ROLE_KEY.
# Updates: .env, kong.yml, apps/mobile/.env
#
# Usage:
#   ./scripts/generate-keys.sh              # new random secret
#   ./scripts/generate-keys.sh "mysecret"   # custom secret
# ===================================================
set -e

# Resolve existing JWT_SECRET from .env
EXISTING_SECRET=""
[ -f .env ] && EXISTING_SECRET=$(grep "^JWT_SECRET=" .env | cut -d= -f2)

# Pick secret: argument > existing > random
if [ -n "$1" ]; then
  JWT_SECRET="$1"
elif [ -n "$EXISTING_SECRET" ]; then
  JWT_SECRET="$EXISTING_SECRET"
else
  JWT_SECRET=$(openssl rand -hex 16)
fi

echo "🔑 JWT_SECRET: ${JWT_SECRET}"

# Generate JWTs using Node.js
KEYS=$(node -e "
const crypto = require('crypto');
const secret = '${JWT_SECRET}';
function b64url(buf) { return buf.toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function jwt(payload) {
  const h = b64url(Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const s = b64url(crypto.createHmac('sha256',secret).update(h+'.'+p).digest());
  return h+'.'+p+'.'+s;
}
const now = Math.floor(Date.now()/1000), exp = now + 315360000;
console.log(jwt({role:'anon',iss:'supabase',iat:now,exp}));
console.log(jwt({role:'service_role',iss:'supabase',iat:now,exp}));
")

ANON_KEY=$(echo "$KEYS" | head -1)
SERVICE_ROLE_KEY=$(echo "$KEYS" | tail -1)

echo "📋 ANON_KEY: ${ANON_KEY:0:40}..."
echo "📋 SERVICE_ROLE_KEY: ${SERVICE_ROLE_KEY:0:40}..."

# --- Update files ---
update_env() {
  local file=$1
  [ -f "$file" ] || return

  # Use sed with a safe delimiter (|) since JWT tokens contain / and +
  # The keys are base64url which only contains [A-Za-z0-9._-] so | is safe
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "$file"
  sed -i "s|^SUPABASE_ANON_KEY=.*|SUPABASE_ANON_KEY=${ANON_KEY}|" "$file"
  sed -i "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}|" "$file"
  sed -i "s|^VITE_SUPABASE_ANON_KEY=.*|VITE_SUPABASE_ANON_KEY=${ANON_KEY}|" "$file"
  sed -i "s|^EXPO_PUBLIC_SUPABASE_ANON_KEY=.*|EXPO_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}|" "$file"

  echo "  ✅ $file"
}

update_env ".env"
update_env "apps/mobile/.env"

if [ -f kong.yml ]; then
  awk -v anon="$ANON_KEY" -v sr="$SERVICE_ROLE_KEY" '
    /username: anon/{fa=1} /username: service_role/{fs=1}
    fa && /- key:/{$0="      - key: "anon; fa=0}
    fs && /- key:/{$0="      - key: "sr; fs=0}
    {print}
  ' kong.yml > kong.yml.tmp && mv kong.yml.tmp kong.yml
  echo "  ✅ kong.yml"
fi

echo ""
echo "Done! Next steps:"
echo "  docker compose down -v"
echo "  docker compose up -d --build"
echo "  sleep 5 && ./scripts/seed-admin.sh"
