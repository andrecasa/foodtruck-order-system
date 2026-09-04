-- Migration 011: Create password_reset_codes table (tenant-scoped)
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  code_hash TEXT NOT NULL,               -- hash do código; nunca texto puro (R3.4)
  expires_at TIMESTAMPTZ NOT NULL,       -- geração + 15 min (R3.3)
  used_at TIMESTAMPTZ,                   -- nulo enquanto não utilizado/invalidado (R3.7)
  attempts INT NOT NULL DEFAULT 0,       -- tentativas incorretas; limite 5 (R3.6/R6.4)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- FK composta garante coerência de tenant com o usuário (R8.2/R8.5)
  -- reaproveita users_id_tenant_unique (id, tenant_id) da migração 002
  CONSTRAINT password_reset_codes_user_tenant_fk
    FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id) ON DELETE CASCADE
);

-- Busca do código ativo por usuário+tenant (validação e invalidação)
CREATE INDEX IF NOT EXISTS password_reset_codes_user_tenant_active_idx
  ON password_reset_codes (user_id, tenant_id, created_at)
  WHERE used_at IS NULL;

-- Suporte à busca por expiração (limpeza / seleção de candidato)
CREATE INDEX IF NOT EXISTS password_reset_codes_expires_idx
  ON password_reset_codes (expires_at);
