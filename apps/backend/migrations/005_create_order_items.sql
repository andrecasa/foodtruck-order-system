-- Migration 005: Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  item_name TEXT NOT NULL,
  unit_price_cents INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 99)
);
