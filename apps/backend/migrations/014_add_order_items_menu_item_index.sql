-- Migration 014: Índice de apoio ao ranking "Top produtos mais vendidos".
-- Os endpoints GET /api/summary/top-products/{daily,monthly} agregam order_items
-- por menu_item_id (SUM(quantity)) dentro de um período, fazendo JOIN com orders
-- (filtro por order_date) e menu_items (nome/categoria). O índice existente em
-- order_items é (tenant_id, order_id), que não ajuda o agrupamento por produto.
-- Este índice em (tenant_id, menu_item_id) mantém a agregação eficiente conforme
-- o volume de itens cresce. É aditivo e idempotente.
CREATE INDEX IF NOT EXISTS order_items_tenant_menu_item_idx
  ON order_items (tenant_id, menu_item_id);
