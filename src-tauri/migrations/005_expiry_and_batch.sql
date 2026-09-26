-- Migration 005: Add Expiry Date and Batch Number for FMCG & Packaged Goods
ALTER TABLE products ADD COLUMN expiry_date TEXT;
ALTER TABLE products ADD COLUMN batch_number TEXT;
ALTER TABLE sale_items ADD COLUMN expiry_date TEXT;
ALTER TABLE sale_items ADD COLUMN batch_number TEXT;
CREATE INDEX IF NOT EXISTS idx_products_expiry ON products(expiry_date);
