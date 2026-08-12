-- Migration 007: Create whatsapp_sessions table
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  phone_number TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'saudacao' CHECK (state IN ('saudacao', 'selecionando', 'resumo')),
  cart JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
