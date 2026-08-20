-- Migration 009: Create indices (composite, tenant-scoped)

-- users: unicidade case-insensitive de email por tenant (R2.1, R2.5)
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_lower_idx
  ON users (tenant_id, LOWER(email));

-- users: filtro por role e status dentro do tenant
CREATE INDEX IF NOT EXISTS users_tenant_role_status_idx
  ON users (tenant_id, role, status);

-- categories: unicidade case-insensitive de nome por tenant (R2.2)
CREATE UNIQUE INDEX IF NOT EXISTS categories_tenant_name_lower_idx
  ON categories (tenant_id, LOWER(name));

-- menu_items: unicidade de nome apenas entre itens ativos, por tenant (R2.3)
CREATE UNIQUE INDEX IF NOT EXISTS menu_items_tenant_name_active_idx
  ON menu_items (tenant_id, LOWER(name)) WHERE status = 'ativo';

-- orders: numeração diária única por tenant (R2.4, R3.7)
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_date_number_idx
  ON orders (tenant_id, order_date, daily_number);

-- orders: busca de pedidos ativos para a fila, por tenant
CREATE INDEX IF NOT EXISTS orders_tenant_active_idx
  ON orders (tenant_id, status, created_at)
  WHERE status IN ('aguardando', 'preparando');

-- orders: resumo do dia / consultas por data, por tenant
CREATE INDEX IF NOT EXISTS orders_tenant_date_idx
  ON orders (tenant_id, order_date);

-- order_items: busca dos itens de um pedido, por tenant
CREATE INDEX IF NOT EXISTS order_items_tenant_order_idx
  ON order_items (tenant_id, order_id);

-- whatsapp_sessions: sessões ativas por tenant (para timeout)
CREATE INDEX IF NOT EXISTS whatsapp_sessions_tenant_activity_idx
  ON whatsapp_sessions (tenant_id, last_activity_at);
