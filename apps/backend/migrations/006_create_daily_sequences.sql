-- Migration 006: Create daily_sequences table
CREATE TABLE IF NOT EXISTS daily_sequences (
  order_date DATE PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
);
