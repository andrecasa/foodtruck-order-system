-- Migration 004: Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_number INT NOT NULL,
  customer_name TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('presencial', 'whatsapp')),
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'preparando', 'pronto', 'entregue')),
  payment_status TEXT NOT NULL DEFAULT 'pendente' CHECK (payment_status IN ('pendente', 'pago')),
  payment_method TEXT CHECK (payment_method IN ('dinheiro', 'pix', 'cartão') OR payment_method IS NULL),
  total_amount_cents INT NOT NULL,
  order_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);
