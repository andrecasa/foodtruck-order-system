-- Migration 012: Add 'web' origin to orders table (R8)
-- Estende a constraint CHECK da coluna `origin` para incluir pedidos online ('web'),
-- além dos já existentes 'presencial' e 'whatsapp'.
--
-- A constraint original foi criada inline (sem nome explícito) na migration 005:
--   origin TEXT NOT NULL CHECK (origin IN ('presencial', 'whatsapp'))
-- O Postgres auto-gera o nome `orders_origin_check` para esse CHECK. Ainda assim,
-- para robustez, o bloco abaixo descobre e remove QUALQUER constraint CHECK que
-- referencie a coluna `origin` da tabela `orders`, independentemente do nome, antes
-- de recriar uma constraint nomeada com o conjunto de valores atualizado.

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Descobre o nome de qualquer CHECK constraint que valide a coluna `origin`.
  SELECT con.conname
    INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
   AND att.attnum = ANY (con.conkey)
  WHERE rel.relname = 'orders'
    AND con.contype = 'c'
    AND att.attname = 'origin'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END
$$;

-- (Re)cria a constraint com nome explícito e o conjunto de valores atualizado.
ALTER TABLE orders
  ADD CONSTRAINT orders_origin_check
  CHECK (origin IN ('presencial', 'whatsapp', 'web'));
