-- Migration 003: Create categories table (tenant-scoped)
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Necessário para a FK composta (menu_items → categories) garantir coerência de tenant
  CONSTRAINT categories_id_tenant_unique UNIQUE (id, tenant_id)
);
