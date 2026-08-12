-- Migration 001: Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('atendente', 'preparador')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_unique UNIQUE (email)
);
