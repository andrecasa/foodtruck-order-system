-- Migration 011: Replace 'cartão' with 'cartão débito' and 'cartão crédito'
--
-- 1. Migrate existing 'cartão' rows to 'cartão débito' (no production data,
--    but the constraint must be relaxed first to allow the UPDATE).
-- 2. Drop the old CHECK constraint.
-- 3. Add the new CHECK constraint with the two card subtypes.

-- Step 1: relax the constraint temporarily so the UPDATE can run
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;

-- Step 2: migrate legacy value
UPDATE orders
  SET payment_method = 'cartão débito'
  WHERE payment_method = 'cartão';

-- Step 3: recreate the constraint with the new allowed values
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IN ('dinheiro', 'pix', 'cartão débito', 'cartão crédito') OR payment_method IS NULL);
