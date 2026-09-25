-- Migration 002: Optimized indexes for Sales History searches and payment filtering
CREATE INDEX IF NOT EXISTS idx_sales_payment_mode ON sales(payment_mode);
CREATE INDEX IF NOT EXISTS idx_sales_customer_phone ON sales(customer_phone);
CREATE INDEX IF NOT EXISTS idx_sales_customer_name ON sales(customer_name);
