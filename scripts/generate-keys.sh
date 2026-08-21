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

# kong.yml não é versionado (contém as chaves) e é gerado a partir do template.
# Um `docker compose up` feito ANTES de o kong.yml existir cria um DIRETÓRIO
# vazio no bind mount; detectamos e removemos esse resíduo para não travar aqui.
if [ -d kong.yml ]; then
  echo "  ⚠️  kong.yml era um diretório (bind mount fantasma) — removendo"
  rmdir kong.yml 2>/dev/null || rm -rf kong.yml
fi

if [ -f kong.yml.example ]; then
  # Sempre regenera a partir do template, garantindo placeholders limpos.
  cp kong.yml.example kong.yml

  # Substituição robusta via sed (as chaves são base64url: só [A-Za-z0-9._-],
  # portanto seguras com o delimitador |).
  sed -i \
    -e "s|REPLACE_WITH_ANON_KEY|${ANON_KEY}|g" \
    -e "s|REPLACE_WITH_SERVICE_ROLE_KEY|${SERVICE_ROLE_KEY}|g" \
    kong.yml

  # Falha explícita se algum placeholder sobrou (evita subir o Kong quebrado).
  if grep -q "REPLACE_WITH_" kong.yml; then
    echo "  ❌ kong.yml ainda contém placeholders após a substituição" >&2
    exit 1
  fi
  echo "  ✅ kong.yml"
else
  echo "  ⚠️  kong.yml.example não encontrado — kong.yml não foi gerado" >&2
fi

echo ""
echo "Done! Next steps:"
echo "  docker compose down -v"
echo "  docker compose up -d --build"
echo "  sleep 15 && ./scripts/seed-first-tenant.sh"
