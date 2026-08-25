-- Migration 005: Create orders table (tenant-scoped)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  daily_number INT NOT NULL,
  customer_name TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('presencial', 'whatsapp')),
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'preparando', 'pronto', 'entregue')),
  payment_status TEXT NOT NULL DEFAULT 'pendente' CHECK (payment_status IN ('pendente', 'pago')),
  payment_method TEXT CHECK (payment_method IN ('dinheiro', 'pix', 'cartão débito', 'cartão crédito') OR payment_method IS NULL),
  total_amount_cents INT NOT NULL,
  order_date DATE NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  -- FK composta garante que o pedido e seu criador pertencem ao mesmo tenant
  CONSTRAINT orders_created_by_tenant_fk
    FOREIGN KEY (created_by, tenant_id) REFERENCES users(id, tenant_id),
  -- Necessário para a FK composta (order_items → orders) garantir coerência de tenant
  CONSTRAINT orders_id_tenant_unique UNIQUE (id, tenant_id)
);
