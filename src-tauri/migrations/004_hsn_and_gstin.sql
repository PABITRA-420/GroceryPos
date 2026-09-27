-- Migration 004: Add HSN code for Indian GST compliance and GSTIN for B2B customers
ALTER TABLE products ADD COLUMN hsn_code TEXT;
ALTER TABLE sale_items ADD COLUMN hsn_code TEXT;
ALTER TABLE customers ADD COLUMN gstin TEXT;
CREATE INDEX IF NOT EXISTS idx_products_hsn ON products(hsn_code);
CREATE INDEX IF NOT EXISTS idx_customers_gstin ON customers(gstin);
