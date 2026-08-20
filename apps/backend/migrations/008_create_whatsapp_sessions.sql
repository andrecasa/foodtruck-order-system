-- Migration 008: Create whatsapp_sessions table (tenant-scoped)
-- PK composta (tenant_id, phone_number): o mesmo phone_number pode existir em
-- até um registro por tenant distinto (R8.7).
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  phone_number TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'saudacao' CHECK (state IN ('saudacao', 'selecionando', 'resumo')),
  cart JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, phone_number)
);
