-- Migration 013: Índice parcial para o mapa de calor mensal (heatmap).
-- O endpoint GET /api/summary/monthly/heatmap varre os pedidos do mês que têm
-- coordenada (latitude/longitude não nulas), agregando por coordenada. Um índice
-- parcial em (tenant_id, order_date) restrito a linhas geolocalizadas mantém a
-- varredura eficiente conforme o volume mensal cresce, sem inchar o índice com
-- os pedidos sem localização (presenciais/whatsapp).
CREATE INDEX IF NOT EXISTS orders_tenant_date_geolocated_idx
  ON orders (tenant_id, order_date)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
