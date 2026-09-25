/**
 * System Information returned by the native desktop runtime
 */
export interface SystemInfo {
  app_name: string;
  version: string;
  os: string;
  arch: string;
  status: string;
}

/**
 * Navigation tabs for the desktop POS
 */
export type NavigationTab =
  | 'dashboard'
  | 'billing'
  | 'products'
  | 'customers'
  | 'purchases'
  | 'sales'
  | 'reports'
  | 'settings';

/**
 * Standard IPC response wrapper for native queries
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * SQLite Local Database Status & Diagnostics
 */
export interface DatabaseStatus {
  connected: boolean;
  file_path: string;
  migrations_applied: number;
  total_tables: number;
  wal_enabled: boolean;
  foreign_keys_enabled: boolean;
  error?: string | null;
}

/**
 * Customer entity for Khata / Billing
 */
export interface Customer {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Payload for creating a new customer
 */
export interface CreateCustomerInput {
  name: string;
  phone?: string | null;
  address?: string | null;
}

/**
 * Payload for updating an existing customer
 */
export interface UpdateCustomerInput {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
}

/**
 * Parameters for querying and searching customers
 */
export interface CustomerSearchParams {
  query?: string | null;
}

/**
 * Product entity for Catalog / Inventory
 */
export interface Product {
  id: number;
  name: string;
  barcode?: string | null;
  category: string;
  unit: string;
  purchase_price: number;
  selling_price: number;
  mrp: number;
  gst_rate: number;
  stock: number;
  minimum_stock: number;
  created_at: string;
  updated_at: string;
}

/**
 * Payload for adding a new product
 */
export interface CreateProductInput {
  name: string;
  barcode?: string | null;
  category?: string | null;
  unit: string;
  purchase_price?: number | null;
  selling_price: number;
  mrp?: number | null;
  gst_rate?: number | null;
  stock?: number | null;
  minimum_stock?: number | null;
}

/**
 * Payload for editing an existing product
 */
export interface UpdateProductInput {
  id: number;
  name: string;
  barcode?: string | null;
  category?: string | null;
  unit: string;
  purchase_price?: number | null;
  selling_price: number;
  mrp?: number | null;
  gst_rate?: number | null;
  stock?: number | null;
  minimum_stock?: number | null;
}

/**
 * Parameters for searching and filtering the product catalog
 */
export interface ProductFilterParams {
  search?: string | null;
  category?: string | null;
  low_stock_only?: boolean | null;
  out_of_stock_only?: boolean | null;
}

/**
 * Sale / Invoice header entity
 */
export interface Sale {
  id: number;
  invoice_number: string;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_mode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT';
  payment_status: 'PAID' | 'PENDING' | 'PARTIAL';
  notes?: string | null;
  created_at: string;
}

/**
 * Itemized line entry for a Sale
 */
export interface SaleItem {
  id: number;
  sale_id: number;
  product_id?: number | null;
  product_name: string;
  barcode?: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  mrp: number;
  gst_rate: number;
  tax_amount: number;
  total_price: number;
}

/**
 * POS Cart item held in React state before checkout
 */
export interface CartItem {
  product_id?: number | null;
  product_name: string;
  barcode?: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  mrp: number;
  gst_rate: number;
  current_stock: number;
}

/**
 * Payload sent to backend to complete a sale transaction
 */
export interface CreateSaleInput {
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  items: {
    product_id?: number | null;
    product_name: string;
    barcode?: string | null;
    unit: string;
    quantity: number;
    unit_price: number;
    mrp: number;
    gst_rate: number;
  }[];
  discount_amount: number;
  payment_mode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT';
  notes?: string | null;
  round_off?: number | null;
}

/**
 * Full sale transaction result with invoice and line items
 */
export interface SaleResult {
  sale: Sale;
  items: SaleItem[];
}

/**
 * Query and filter parameters for paginated sales history
 */
export interface SalesFilterParams {
  search?: string | null;
  payment_mode?: 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'ALL' | string | null;
  date_preset?: 'all' | 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'custom' | null;
  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null;   // YYYY-MM-DD
  page?: number | null;
  page_size?: number | null;
  sort_by?: 'created_at' | 'invoice_number' | 'total_amount' | null;
  sort_direction?: 'asc' | 'desc' | null;
}

/**
 * Compact row item for sales history list table
 */
export interface SaleListItem {
  id: number;
  invoice_number: string;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_mode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT';
  payment_status: 'PAID' | 'PENDING' | 'PARTIAL';
  notes?: string | null;
  created_at: string;
  item_count: number;
  total_quantity: number;
}

/**
 * Server-side paginated sales history result
 */
export interface PaginatedSalesResult {
  sales: SaleListItem[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/**
 * Shop profile and branding configuration stored in SQLite settings
 */
export interface ShopProfile {
  shop_name: string;
  owner_name: string;
  shop_address: string;
  shop_phone: string;
  shop_email?: string | null;
  shop_gstin?: string | null;
  invoice_footer: string;
}

/**
 * Returnable item information for an invoice
 */
export interface ReturnableItemInfo {
  sale_item_id: number;
  product_id?: number | null;
  product_name: string;
  barcode?: string | null;
  unit: string;
  sold_quantity: number;
  already_returned_quantity: number;
  available_return_quantity: number;
  unit_price: number;
  mrp: number;
  gst_rate: number;
  tax_amount: number;
  total_price: number;
}

/**
 * Single item return input payload
 */
export interface ReturnItemInput {
  sale_item_id: number;
  return_quantity: number;
  restock: boolean;
  reason?: string | null;
}

/**
 * Payload to create a sales return
 */
export interface CreateReturnInput {
  sale_id: number;
  items: ReturnItemInput[];
  refund_mode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | string;
  reason: string;
  notes?: string | null;
}

/**
 * Return header record
 */
export interface SalesReturnRecord {
  id: number;
  return_number: string;
  sale_id: number;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  refund_amount: number;
  refund_mode: string;
  reason: string;
  notes?: string | null;
  created_at: string;
}

/**
 * Return line item record
 */
export interface SalesReturnItemRecord {
  id: number;
  return_id: number;
  sale_item_id: number;
  product_id?: number | null;
  product_name: string;
  barcode?: string | null;
  unit: string;
  original_quantity: number;
  return_quantity: number;
  unit_price: number;
  tax_rate: number;
  refund_amount: number;
  restock: boolean;
  reason?: string | null;
}

/**
 * Complete return result
 */
export interface SalesReturnResult {
  return_record: SalesReturnRecord;
  items: SalesReturnItemRecord[];
  original_invoice_number: string;
}

/**
 * Compact return row for returns history list
 */
export interface ReturnListItem {
  id: number;
  return_number: string;
  sale_id: number;
  original_invoice_number: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  refund_amount: number;
  refund_mode: string;
  reason: string;
  created_at: string;
  items_count: number;
}

/**
 * Query filters for returns history
 */
export interface ReturnsFilterParams {
  search?: string | null;
  refund_mode?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  page?: number | null;
  page_size?: number | null;
}

/**
 * Paginated returns result
 */
export interface PaginatedReturnsResult {
  returns: ReturnListItem[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/**
 * Immutable stock movement ledger entry
 */
export interface StockMovement {
  id: number;
  product_id: number;
  product_name: string;
  barcode?: string | null;
  unit: string;
  movement_type: 'OPENING_STOCK' | 'SALE' | 'SALE_RETURN' | 'DAMAGE' | 'EXPIRED' | 'MANUAL_ADJUSTMENT' | 'PURCHASE' | string;
  quantity: number;
  stock_before: number;
  stock_after: number;
  reference_type?: string | null;
  reference_id?: string | null;
  reason?: string | null;
  notes?: string | null;
  created_at: string;
}

/**
 * Input for manual stock adjustment
 */
export interface StockAdjustmentInput {
  product_id: number;
  adjustment_type: 'DAMAGE' | 'EXPIRED' | 'MANUAL_ADJUSTMENT' | 'OPENING_STOCK' | string;
  quantity_change: number;
  reason: string;
  notes?: string | null;
}

/**
 * Filter parameters for stock ledger
 */
export interface StockFilterParams {
  product_id?: number | null;
  movement_type?: string | null;
  search?: string | null;
  date_preset?: 'all' | 'today' | 'last_7_days' | 'this_month' | 'custom' | null;
  start_date?: string | null;
  end_date?: string | null;
  page?: number | null;
  page_size?: number | null;
}

/**
 * Paginated stock movements
 */
export interface PaginatedStockMovements {
  movements: StockMovement[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/**
 * Stock consistency audit report
 */
export interface StockConsistencyReport {
  product_id: number;
  product_name: string;
  current_stock: number;
  ledger_derived_stock?: number | null;
  is_consistent: boolean;
  total_movements_recorded: number;
}


