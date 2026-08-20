-- Migration 004: Create menu_items table (tenant-scoped)
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  price_cents INT NOT NULL CHECK (price_cents BETWEEN 1 AND 999999),
  category_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- FK composta garante que o item e sua categoria pertencem ao mesmo tenant
  CONSTRAINT menu_items_category_tenant_fk
    FOREIGN KEY (category_id, tenant_id) REFERENCES categories(id, tenant_id),
  -- Necessário para a FK composta (order_items → menu_items) garantir coerência de tenant
  CONSTRAINT menu_items_id_tenant_unique UNIQUE (id, tenant_id)
);
