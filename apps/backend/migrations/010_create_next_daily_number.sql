-- Migration 010: Create next_daily_number(tenant_id, date) function (tenant-scoped)
-- Numeração diária de pedidos com escopo por (tenant_id, order_date) (R3).
--
-- Atribui o próximo número diário sequencial de um Tenant em uma data, incrementando
-- em exatamente 1 o maior número já atribuído àquele Tenant naquela data (R3.2).
-- O primeiro pedido de um Tenant em uma data recebe o número 1 (R3.4); a sequência
-- reinicia em 1 a cada nova order_date (R3.6). O uso de INSERT ... ON CONFLICT ...
-- DO UPDATE ... RETURNING garante atribuição atômica e única sob concorrência (R3.7),
-- apoiado na PK composta (tenant_id, order_date) de daily_sequences.
--
-- p_tenant_id NOT NULL: invocar sem um tenant válido resulta em erro e nenhum número
-- é atribuído (R3.8), pois a coluna tenant_id de daily_sequences é NOT NULL e a FK
-- para tenants(id) rejeita valores inexistentes.
CREATE OR REPLACE FUNCTION next_daily_number(p_tenant_id UUID, p_date DATE)
RETURNS INT AS $$
DECLARE
  v_number INT;
BEGIN
  INSERT INTO daily_sequences (tenant_id, order_date, last_number)
  VALUES (p_tenant_id, p_date, 1)
  ON CONFLICT (tenant_id, order_date)
  DO UPDATE SET last_number = daily_sequences.last_number + 1
  RETURNING last_number INTO v_number;

  RETURN v_number;
END;
$$ LANGUAGE plpgsql;
