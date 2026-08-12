-- Migration 008: Create indices

-- Busca de pedidos ativos para a fila
CREATE INDEX IF NOT EXISTS idx_orders_active ON orders (status, created_at)
  WHERE status IN ('aguardando', 'preparando');

-- Resumo do dia / consultas por data
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders (order_date);

-- Numeração sequencial por dia (constraint de unicidade)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_daily_number ON orders (order_date, daily_number);

-- Busca de item por nome (case-insensitive, para validação de duplicatas entre ativos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_name ON menu_items (LOWER(name))
  WHERE status = 'ativo';

-- Sessões WhatsApp ativas (para timeout)
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_activity ON whatsapp_sessions (last_activity_at);
