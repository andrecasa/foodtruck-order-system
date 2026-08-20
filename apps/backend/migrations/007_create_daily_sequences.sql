-- Migration 007: Create daily_sequences table (tenant-scoped)
-- PK composta (tenant_id, order_date): contadores diários independentes por tenant (R3).
CREATE TABLE IF NOT EXISTS daily_sequences (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_date DATE NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, order_date)
);
