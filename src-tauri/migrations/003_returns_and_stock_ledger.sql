-- Migration 003: Returns & Refunds + Stock Movement Ledger
-- Preserves complete historical integrity of sales and products

-- 1. Sales Returns Header Table
CREATE TABLE IF NOT EXISTS sales_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT NOT NULL UNIQUE,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    customer_name TEXT,
    customer_phone TEXT,
    refund_amount REAL NOT NULL DEFAULT 0.0,
    refund_mode TEXT NOT NULL DEFAULT 'CASH',
    reason TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 2. Sales Return Items Table
CREATE TABLE IF NOT EXISTS sales_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
    sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
    product_id INTEGER REFERENCES products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    barcode TEXT,
    unit TEXT NOT NULL DEFAULT 'PCS',
    original_quantity REAL NOT NULL,
    return_quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    tax_rate REAL NOT NULL DEFAULT 0.0,
    refund_amount REAL NOT NULL,
    restock INTEGER NOT NULL DEFAULT 1,
    reason TEXT
);

-- 3. Stock Movement Ledger Table
CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_name TEXT NOT NULL,
    barcode TEXT,
    unit TEXT NOT NULL DEFAULT 'PCS',
    movement_type TEXT NOT NULL, -- 'OPENING_STOCK' | 'SALE' | 'SALE_RETURN' | 'DAMAGE' | 'EXPIRED' | 'MANUAL_ADJUSTMENT' | 'PURCHASE'
    quantity REAL NOT NULL,      -- Positive for stock IN, negative for stock OUT
    stock_before REAL NOT NULL,
    stock_after REAL NOT NULL,
    reference_type TEXT,         -- 'SALE' | 'RETURN' | 'ADJUSTMENT' | 'INITIAL'
    reference_id TEXT,           -- invoice_number, return_number, adjustment id, etc.
    reason TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 4. Indexes for fast returns, audit queries, and ledger reconciliation
CREATE INDEX IF NOT EXISTS idx_sales_returns_sale_id ON sales_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_return_number ON sales_returns(return_number);
CREATE INDEX IF NOT EXISTS idx_sales_returns_created_at ON sales_returns(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return_id ON sales_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_sale_item_id ON sales_return_items(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_movement_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
