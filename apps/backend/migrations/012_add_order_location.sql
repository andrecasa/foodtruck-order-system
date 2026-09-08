-- Migration 012: Adiciona coordenadas de geolocalização (latitude/longitude) aos pedidos.
-- Colunas nuláveis: pedidos presenciais/whatsapp e os já existentes não têm
-- coordenadas, e a captura no cliente é opcional (o usuário pode negar a
-- permissão de localização do navegador/dispositivo).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION
    CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION
    CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180));
