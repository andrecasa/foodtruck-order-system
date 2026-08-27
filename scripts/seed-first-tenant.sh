#!/bin/bash
# ===================================================
# Seed First Tenant (dev/bootstrap)
# ===================================================
# Provisiona um PRIMEIRO TENANT completo e logável de ponta a ponta:
# cria o tenant, semeia um cardápio inicial, cria o admin no Supabase Auth E a
# linha correspondente em `users` (com tenant_id e role='admin') — tudo de forma
# transacional e idempotente. Substitui o antigo ./scripts/seed-admin.sh, que
# criava apenas o usuário no Auth (sem tenant_id) e resultava em HTTP 401
# TENANT_RESOLUTION_FAILED ao logar no modelo multi-tenant.
#
# É um atalho de conveniência que apenas encapsula o onboarding oficial
# (`pnpm --filter @order-system/backend create-tenant`), lendo as credenciais do
# admin do .env (ADMIN_EMAIL / ADMIN_PASSWORD) e usando um preset de cardápio
# padrão. Para clientes reais, prefira o onboarding direto (create-tenant /
# POST /api/platform/tenants) com o cardápio do cliente.
#
# Requisitos: DB + Supabase acessíveis e migrations aplicadas (o backend aplica
# na inicialização). Requer pnpm.
#
# Idempotente: reexecutar com a mesma TENANT_PROVISIONING_KEY não cria um tenant
# duplicado.
#
# Usage:
#   ./scripts/seed-first-tenant.sh
#   ./scripts/seed-first-tenant.sh email@example.com password123
# ===================================================
set -e

# Load admin credentials from .env (falling back to generic defaults).
ENV_ADMIN_EMAIL=$(grep "^ADMIN_EMAIL=" .env 2>/dev/null | cut -d= -f2)
ENV_ADMIN_PASSWORD=$(grep "^ADMIN_PASSWORD=" .env 2>/dev/null | cut -d= -f2)

# Admin credentials: CLI arg > .env (ADMIN_EMAIL/ADMIN_PASSWORD) > generic default.
# Generic, tenant-agnostic defaults (no client name/brand/domain).
EMAIL="${1:-${ENV_ADMIN_EMAIL:-admin@example.com}}"
PASSWORD="${2:-${ENV_ADMIN_PASSWORD:-changeme123}}"

# Tenant/onboarding parameters (override via env if desired). All generic.
PROVISIONING_KEY="${TENANT_PROVISIONING_KEY:-dev-first-tenant}"
BUSINESS_NAME="${TENANT_BUSINESS_NAME:-Order System}"
EVOLUTION_INSTANCE="${TENANT_EVOLUTION_INSTANCE:-dev-first-tenant}"
ADMIN_NAME="${TENANT_ADMIN_NAME:-Administrador}"

# Minimal generic starter menu (inline JSON). Customize per client via the
# onboarding CLI's --menu-preset flag instead of editing this bootstrap.
MENU_PRESET='{"categories":[{"name":"Geral","sortOrder":0,"items":[{"name":"Item inicial","priceCents":1000}]}]}'

echo "🌱 Provisionando primeiro tenant \"${BUSINESS_NAME}\" (admin: ${EMAIL})..."

pnpm --filter @order-system/backend create-tenant -- \
  --provisioning-key="${PROVISIONING_KEY}" \
  --business-name="${BUSINESS_NAME}" \
  --evolution-instance="${EVOLUTION_INSTANCE}" \
  --admin-name="${ADMIN_NAME}" \
  --admin-email="${EMAIL}" \
  --admin-password="${PASSWORD}" \
  --menu-preset="${MENU_PRESET}"

echo "✅ Pronto! Login: ${EMAIL} / ${PASSWORD}"
