-- Migration 010: Seed categories and menu items

-- Categories
INSERT INTO categories (id, name, sort_order) VALUES
  ('a1b2c3d4-1111-4000-8000-000000000001', 'Pastéis Salgados', 1),
  ('a1b2c3d4-2222-4000-8000-000000000002', 'Pastéis Doces', 2),
  ('a1b2c3d4-3333-4000-8000-000000000003', 'Bebidas', 3)
ON CONFLICT (name) DO NOTHING;

-- Menu Items - Pastéis Salgados
INSERT INTO menu_items (id, name, price_cents, category_id, status) VALUES
  ('b1b2c3d4-0001-4000-8000-000000000001', 'Pastel de Carne', 750, 'a1b2c3d4-1111-4000-8000-000000000001', 'ativo'),
  ('b1b2c3d4-0002-4000-8000-000000000002', 'Pastel de Queijo', 700, 'a1b2c3d4-1111-4000-8000-000000000001', 'ativo'),
  ('b1b2c3d4-0003-4000-8000-000000000003', 'Pastel de Frango', 750, 'a1b2c3d4-1111-4000-8000-000000000001', 'ativo'),
  ('b1b2c3d4-0004-4000-8000-000000000004', 'Pastel de Pizza', 800, 'a1b2c3d4-1111-4000-8000-000000000001', 'ativo')
ON CONFLICT (id) DO NOTHING;

-- Menu Items - Pastéis Doces
INSERT INTO menu_items (id, name, price_cents, category_id, status) VALUES
  ('b1b2c3d4-0005-4000-8000-000000000005', 'Pastel de Chocolate', 800, 'a1b2c3d4-2222-4000-8000-000000000002', 'ativo'),
  ('b1b2c3d4-0006-4000-8000-000000000006', 'Pastel de Doce de Leite', 800, 'a1b2c3d4-2222-4000-8000-000000000002', 'ativo')
ON CONFLICT (id) DO NOTHING;

-- Menu Items - Bebidas
INSERT INTO menu_items (id, name, price_cents, category_id, status) VALUES
  ('b1b2c3d4-0007-4000-8000-000000000007', 'Caldo de Cana 300ml', 600, 'a1b2c3d4-3333-4000-8000-000000000003', 'ativo'),
  ('b1b2c3d4-0008-4000-8000-000000000008', 'Refrigerante Lata', 500, 'a1b2c3d4-3333-4000-8000-000000000003', 'ativo'),
  ('b1b2c3d4-0009-4000-8000-000000000009', 'Água Mineral', 300, 'a1b2c3d4-3333-4000-8000-000000000003', 'ativo')
ON CONFLICT (id) DO NOTHING;
