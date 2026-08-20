-- Migration 001: Create tenants and platform_admins tables
-- Multi-tenant root table. Must be created before any tenant-scoped table
-- that references it (R1.12).

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL CHECK (char_length(business_name) BETWEEN 1 AND 120),
  logo_url TEXT,
  theme JSONB,                                  -- ThemeConfig parcial (override sobre o neutro)
  evolution_instance_name TEXT UNIQUE,          -- mapeia instância WhatsApp → tenant (R8.1)
  whatsapp_config JSONB,                         -- número, credenciais/refs adicionais
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  provisioning_key TEXT UNIQUE,                 -- idempotência de onboarding (R9.9)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform_Admin: gerencia tenants, não pertence a nenhum tenant (R10).
-- id referencia o usuário no Supabase Auth.
CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
