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
  gstin?: string | null;
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
  gstin?: string | null;
}

/**
 * Payload for updating an existing customer
 */
export interface UpdateCustomerInput {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
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
  hsn_code?: string | null;
  purchase_price: number;
  selling_price: number;
  mrp: number;
  gst_rate: number;
  stock: number;
  minimum_stock: number;
  expiry_date?: string | null;
  batch_number?: string | null;
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
  hsn_code?: string | null;
  purchase_price?: number | null;
  selling_price: number;
  mrp?: number | null;
  gst_rate?: number | null;
  stock?: number | null;
  minimum_stock?: number | null;
  expiry_date?: string | null;
  batch_number?: string | null;
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
  hsn_code?: string | null;
  purchase_price?: number | null;
  selling_price: number;
  mrp?: number | null;
  gst_rate?: number | null;
  stock?: number | null;
  minimum_stock?: number | null;
  expiry_date?: string | null;
  batch_number?: string | null;
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
  payment_mode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT';
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
  hsn_code?: string | null;
  quantity: number;
  unit_price: number;
  mrp: number;
  gst_rate: number;
  tax_amount: number;
  total_price: number;
  expiry_date?: string | null;
  batch_number?: string | null;
}

/**
 * POS Cart item held in React state before checkout
 */
export interface CartItem {
  product_id?: number | null;
  product_name: string;
  barcode?: string | null;
  unit: string;
  hsn_code?: string | null;
  quantity: number;
  unit_price: number;
  mrp: number;
  gst_rate: number;
  current_stock: number;
  expiry_date?: string | null;
  batch_number?: string | null;
}

/**
 * Split payment detail breakdown
 */
export interface SplitPaymentDetail {
  cash: number;
  upi: number;
  card: number;
  upi_ref?: string;
  card_ref?: string;
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
    hsn_code?: string | null;
    quantity: number;
    unit_price: number;
    mrp: number;
    gst_rate: number;
    expiry_date?: string | null;
    batch_number?: string | null;
  }[];
  discount_amount: number;
  payment_mode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT';
  notes?: string | null;
  round_off?: number | null;
  split_cash?: number | null;
  split_upi?: number | null;
  split_card?: number | null;
  created_at?: string | null;
}

/**
 * Bulk product import item payload
 */
export interface BulkImportProductInput {
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
  hsn_code?: string | null;
  expiry_date?: string | null;
  batch_number?: string | null;
}

/**
 * Bulk product import execution options
 */
export interface BulkImportOptions {
  update_existing_barcodes: boolean;
}

/**
 * Summary result of bulk catalog import
 */
export interface BulkImportSummary {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
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
  payment_mode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT';
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
  shop_upi_id?: string | null;
  invoice_footer: string;
  manager_pin?: string | null;
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

/**
 * Filter criteria for store performance reports & CSV export
 */
export interface BusinessReportFilter {
  date_preset?: 'today' | 'yesterday' | 'this_week' | 'last_7_days' | 'this_month' | 'last_month' | 'this_year' | 'custom' | 'all';
  start_date?: string | null;
  end_date?: string | null;
}

/**
 * Aggregated store KPIs & financial summary
 */
export interface BusinessReportSummary {
  total_invoices: number;
  total_items_sold: number;
  total_sales_revenue: number; // Total spend on sell
  total_purchase_cost: number; // Total spent on buy
  gross_profit: number;
  profit_margin_percent: number;
  total_tax: number;
  total_discount: number;
  payment_cash: number;
  payment_upi: number;
  payment_card: number;
}

/**
 * Customer spend summary record
 */
export interface CustomerSpendItem {
  customer_id?: number | null;
  name: string;
  phone: string;
  address: string;
  total_invoices: number;
  total_spent_on_buying: number;
  total_purchase_cost_to_store: number;
  last_visit: string;
}

/**
 * Product sales velocity & profit record
 */
export interface TopSellingProductItem {
  product_id?: number | null;
  product_name: string;
  category: string;
  barcode?: string | null;
  hsn_code?: string | null;
  unit: string;
  quantity_sold: number;
  total_sales_revenue: number;
  total_purchase_cost: number;
  total_profit: number;
}

/**
 * Complete business report payload bundle
 */
export interface BusinessReportResult {
  period_label: string;
  summary: BusinessReportSummary;
  customers: CustomerSpendItem[];
  top_products: TopSellingProductItem[];
  sales: SaleListItem[];
}

/**
 * GSTR-1 Table 4: B2B Invoices (Sales to GST Registered Customers)
 */
export interface Gstr1B2bItem {
  gstin: string;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  invoice_value: number;
  place_of_supply: string;
  reverse_charge: string;
  applicable_tax_rate: number;
  taxable_value: number;
  central_tax: number;
  state_tax: number;
}

/**
 * GSTR-1 Table 7: B2C (Small) Invoices (Grouped by Tax Rate)
 */
export interface Gstr1B2cItem {
  tax_rate: number;
  taxable_value: number;
  central_tax: number;
  state_tax: number;
  invoice_count: number;
  total_value: number;
}

/**
 * GSTR-1 Table 12: HSN-wise Summary of Outward Supplies
 */
export interface Gstr1HsnItem {
  hsn_code: string;
  description: string;
  uqc: string;
  total_quantity: number;
  total_value: number;
  taxable_value: number;
  central_tax: number;
  state_tax: number;
}

/**
 * Full GSTR-1 Tax Report Envelope
 */
export interface Gstr1ReportResult {
  period_label: string;
  shop_gstin?: string | null;
  shop_name: string;
  total_b2b_invoices: number;
  total_b2b_taxable: number;
  total_b2b_tax: number;
  total_b2c_invoices: number;
  total_b2c_taxable: number;
  total_b2c_tax: number;
  b2b_table4: Gstr1B2bItem[];
  b2c_table7: Gstr1B2cItem[];
  hsn_table12: Gstr1HsnItem[];
}

/**
 * Day-End Cash Drawer Reconciliation (Z-Report / Shift Close)
 */
export interface DayEndSummaryResult {
  report_date: string;
  generated_at: string;
  shop_name: string;
  total_invoices: number;
  total_sales_revenue: number;
  cash_sales: number;
  upi_sales: number;
  card_sales: number;
  split_sales: number;
  total_returns_count: number;
  total_refund_amount: number;
  cash_refund_amount: number;
  net_cash_inflow: number;
}

/**
 * Loose Goods Barcode Sticker Label Configuration
 */
export interface BarcodeLabelConfig {
  product_id?: number | null;
  product_name: string;
  weight_label: string;
  mrp: number;
  selling_price: number;
  packed_date: string;
  best_before?: string;
  batch_no?: string;
  barcode: string;
  quantity: number;
}


