-- Migration 009: Create next_daily_number function with implicit row-level lock
CREATE OR REPLACE FUNCTION next_daily_number(p_date DATE)
RETURNS INT AS $$
DECLARE
  v_number INT;
BEGIN
  INSERT INTO daily_sequences (order_date, last_number)
  VALUES (p_date, 1)
  ON CONFLICT (order_date)
  DO UPDATE SET last_number = daily_sequences.last_number + 1
  RETURNING last_number INTO v_number;

  RETURN v_number;
END;
$$ LANGUAGE plpgsql;
