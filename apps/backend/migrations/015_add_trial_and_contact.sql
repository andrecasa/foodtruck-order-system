-- Migration 015: Adiciona colunas de teste gratuito (trial), conversão e
-- contato comercial à tabela tenants (R11.2, R12.6).
-- Colunas nuláveis (exceto subscription_status) para migração sem downtime, no
-- padrão de 012_add_order_location.sql: tenants legados não têm trial nem
-- contato comercial e não podem ser bloqueados por isso. O Trial_Guard trata
-- trial_ends_at = NULL como "sem trial" ⇒ não bloqueia.
ALTER TABLE tenants
  -- R11: instante de expiração do Trial_Period. Nulável para não quebrar
  -- tenants legados (sem trial).
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  -- R11.2/R12.6: indicador de conversão, ortogonal a status (ativo/inativo).
  -- Um tenant em teste permanece status = 'ativo'; "convertido" ≡ 'active'.
  -- Default 'trial' cobre novos tenants; legados recebem 'trial' mas, com
  -- trial_ends_at = NULL, não são bloqueados por trial.
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial', 'active', 'canceled')),
  -- R11.2 Contato_Comercial: nome do responsável, distinto do administrador.
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  -- R11.2 Contato_Comercial: telefone/WhatsApp (dígitos E.164 normalizados).
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;
