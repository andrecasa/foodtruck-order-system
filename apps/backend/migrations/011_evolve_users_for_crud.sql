-- Migration 011: Evolve users table for CRUD
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativo'
  CHECK (status IN ('ativo', 'inativo'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Adicionar role 'admin' ao CHECK constraint existente
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'atendente', 'preparador'));

-- Remover coluna encrypted_password (credenciais ficam no Supabase Auth)
ALTER TABLE users DROP COLUMN IF EXISTS encrypted_password;

-- Índice para busca case-insensitive de email
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

-- Índice para filtro por role e status
CREATE INDEX IF NOT EXISTS users_role_status_idx ON users (role, status);
