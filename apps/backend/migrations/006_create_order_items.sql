-- Migration 006: Create order_items table (tenant-scoped)
-- tenant_id é denormalizado (além de order_id) para que o helper de acesso
-- possa filtrar diretamente por tenant sem depender sempre de JOIN em orders.
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL,
  menu_item_id UUID NOT NULL,
  item_name TEXT NOT NULL,
  unit_price_cents INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  -- FK composta garante que o item pertence a um pedido do mesmo tenant.
  -- ON DELETE CASCADE preserva o comportamento do MVP ao remover um pedido.
  CONSTRAINT order_items_order_tenant_fk
    FOREIGN KEY (order_id, tenant_id) REFERENCES orders(id, tenant_id) ON DELETE CASCADE,
  -- FK composta garante que o item de cardápio referenciado é do mesmo tenant
  CONSTRAINT order_items_menu_item_tenant_fk
    FOREIGN KEY (menu_item_id, tenant_id) REFERENCES menu_items(id, tenant_id)
);
