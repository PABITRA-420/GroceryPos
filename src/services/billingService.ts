import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriService';
import { timeSyncService } from './timeSyncService';
import type {
  CreateSaleInput,
  SaleResult,
  Sale,
  ShopProfile,
  SalesFilterParams,
  PaginatedSalesResult,
  SaleListItem,
  BusinessReportFilter,
  BusinessReportResult,
  Gstr1ReportResult,
  DayEndSummaryResult,
} from '../types';

/**
 * Default fallback shop profile when unconfigured
 */
const DEFAULT_SHOP_PROFILE: ShopProfile = {
  shop_name: 'Apna Grocery Store',
  owner_name: '',
  shop_address: 'Main Market, Local City',
  shop_phone: '',
  shop_email: null,
  shop_gstin: null,
  invoice_footer: 'Thank you for shopping with us! Please visit again.',
};

// In-memory state for browser preview mode only
let previewProfile: ShopProfile = { ...DEFAULT_SHOP_PROFILE };
let previewSales: SaleResult[] = [];

/**
 * Translates backend error messages into clear, friendly merchant notifications
 */
export function formatBillingErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    if (error.includes('Only') && error.includes('available in stock')) {
      return error;
    }
    if (error.includes('no longer exists')) {
      return 'One or more items in the cart no longer exist in inventory.';
    }
    if (error.includes('Stock changed') || error.includes('another operation')) {
      return 'Stock was changed by another operation. Please review the cart and try again.';
    }
    if (error.includes('Discount') && error.includes('exceed subtotal')) {
      return 'Discount amount cannot exceed the cart subtotal.';
    }
    if (error.includes('UNIQUE constraint failed: sales.invoice_number')) {
      return 'Invoice number conflict occurred. Please click Complete Sale again.';
    }
    return error;
  }
  if (error instanceof Error) {
    return formatBillingErrorMessage(error.message);
  }
  return 'The sale could not be completed. No changes were made.';
}

/**
 * Deterministically parses a SQLite or ISO timestamp (e.g. "2026-09-24 20:42:00")
 * into Indian retail date and time components:
 * Date: DD/MM/YYYY (e.g. 24/09/2026)
 * Time: HH:MM AM/PM (e.g. 08:42 PM)
 *
 * Guaranteed to NEVER generate date/time from the current system time.
 */
export function formatSaleDateTime(createdAt: string): { date: string; time: string } {
  if (!createdAt || typeof createdAt !== 'string') {
    return { date: '—', time: '—' };
  }

  const trimmed = createdAt.trim();

  // If the timestamp has UTC indicator 'Z' or timezone offset, parse via Date to render local time
  const hasTimezone = trimmed.includes('Z') || /[+-]\d{2}(?::?\d{2})?$/.test(trimmed);
  if (hasTimezone) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return {
        date: `${day}/${month}/${year}`,
        time: `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`,
      };
    }
  }

  // Try standard regex match for "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS" (already local)
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, year, month, day, hourStr, minStr] = match;
    let timeFormatted = '—';
    if (hourStr !== undefined && minStr !== undefined) {
      let h = parseInt(hourStr, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      timeFormatted = `${String(h).padStart(2, '0')}:${minStr} ${ampm}`;
    }
    return {
      date: `${day}/${month}/${year}`,
      time: timeFormatted,
    };
  }

  // Fallback to JS Date object
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return {
      date: `${day}/${month}/${year}`,
      time: `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`,
    };
  }

  return { date: trimmed, time: '—' };
}

/**
 * Clean quantity representation for integer or loose decimal retail goods
 * (e.g. 2, 2.5, 0.75, 1.25)
 */
export function formatQuantity(qty: number): string {
  if (Number.isInteger(qty)) {
    return qty.toString();
  }
  return parseFloat(qty.toFixed(3)).toString();
}

/**
 * Currency formatting helper for Indian Rupee representation (e.g. ₹1,250.00)
 */
export function formatCurrency(amount: number): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

/**
 * Billing Service Abstraction Layer
 *
 * All React UI components communicate through this service layer. Direct IPC
 * calls and raw SQL in UI components are strictly forbidden.
 */
export const billingService = {
  /**
   * Completes a sale transaction atomically in SQLite.
   * Decrements product inventory, inserts sale and sale_items records,
   * and generates a sequential invoice number.
   */
  async completeSale(input: CreateSaleInput): Promise<SaleResult> {
    if (isTauriEnvironment()) {
      return await invoke<SaleResult>('complete_sale', { input });
    }

    // In-memory simulation for browser preview mode (Inclusive GST)
    const subtotal = input.items.reduce(
      (sum, item) => sum + Math.round(item.quantity * item.unit_price * 100) / 100,
      0
    );
    const tax_amount = input.items.reduce((sum, item) => {
      if (item.gst_rate > 0) {
        const lineTotal = Math.round(item.quantity * item.unit_price * 100) / 100;
        const base = lineTotal / (1 + item.gst_rate / 100);
        return sum + (lineTotal - base);
      }
      return sum;
    }, 0);
    const roundedTaxAmount = Math.round(tax_amount * 100) / 100;
    const rawNet = subtotal - input.discount_amount;
    const roundOff = input.round_off ?? (Math.round(rawNet) - rawNet);
    const total_amount = Math.max(0, Math.round((rawNet + roundOff) * 100) / 100);
    const invoiceNumber = `INV-${String(previewSales.length + 1).padStart(6, '0')}`;
    const saleId = Date.now();

    const sale: Sale = {
      id: saleId,
      invoice_number: invoiceNumber,
      customer_id: input.customer_id || null,
      customer_name: input.customer_name || 'Walk-in Customer',
      customer_phone: input.customer_phone || null,
      subtotal: Math.round(subtotal * 100) / 100,
      discount_amount: input.discount_amount,
      tax_amount: roundedTaxAmount,
      total_amount,
      payment_mode: input.payment_mode,
      payment_status: 'PAID',
      notes: input.notes || null,
      created_at: input.created_at || timeSyncService.getNowLocalSqlString(),
    };

    const items = input.items.map((item, idx) => {
      const lineTotal = Math.round(item.quantity * item.unit_price * 100) / 100;
      const itemTax = item.gst_rate > 0
        ? Math.round((lineTotal - lineTotal / (1 + item.gst_rate / 100)) * 100) / 100
        : 0;
      return {
        id: saleId + idx + 1,
        sale_id: saleId,
        product_id: item.product_id || null,
        product_name: item.product_name,
        barcode: item.barcode || null,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.unit_price,
        mrp: item.mrp,
        gst_rate: item.gst_rate,
        tax_amount: itemTax,
        total_price: lineTotal,
      };
    });

    const result: SaleResult = { sale, items };
    previewSales.unshift(result);
    return result;
  },

  /**
   * Retrieves an invoice and line items by invoice number
   */
  async getSaleByInvoice(invoiceNumber: string): Promise<SaleResult> {
    if (isTauriEnvironment()) {
      return await invoke<SaleResult>('get_sale_by_invoice', { invoiceNumber });
    }

    const found = previewSales.find((s) => s.sale.invoice_number === invoiceNumber);
    if (!found) {
      throw new Error(`Invoice '${invoiceNumber}' not found.`);
    }
    return found;
  },

  /**
   * Fetches recent sales for counter history / reprinting
   */
  async getRecentSales(limit = 10): Promise<Sale[]> {
    if (isTauriEnvironment()) {
      return await invoke<Sale[]>('get_recent_sales', { limit });
    }
    return previewSales.slice(0, limit).map((s) => s.sale);
  },

  /**
   * Retrieves a sale by its internal ID
   */
  async getSaleById(id: number): Promise<SaleResult> {
    if (isTauriEnvironment()) {
      return await invoke<SaleResult>('get_sale_by_id', { id });
    }

    const found = previewSales.find((s) => s.sale.id === id);
    if (!found) {
      throw new Error(`Sale with ID #${id} not found.`);
    }
    return found;
  },

  /**
   * Retrieves paginated sales history with server-side filters and sorting
   */
  async getSalesHistory(filter: SalesFilterParams = {}): Promise<PaginatedSalesResult> {
    if (isTauriEnvironment()) {
      return await invoke<PaginatedSalesResult>('get_sales_history', { filter });
    }

    // In-memory fallback simulation for browser preview mode
    let filtered = [...previewSales];

    // Search query
    if (filter.search?.trim()) {
      const q = filter.search.trim().toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.sale.invoice_number.toLowerCase().includes(q) ||
          (item.sale.customer_name && item.sale.customer_name.toLowerCase().includes(q)) ||
          (item.sale.customer_phone && item.sale.customer_phone.includes(q))
      );
    }

    // Payment mode
    if (filter.payment_mode && filter.payment_mode !== 'ALL') {
      const mode = filter.payment_mode.toUpperCase();
      filtered = filtered.filter((item) => item.sale.payment_mode.toUpperCase() === mode);
    }

    // Date preset / range
    if (filter.date_preset && filter.date_preset !== 'all') {
      const today = new Date().toISOString().slice(0, 10);
      if (filter.date_preset === 'today') {
        filtered = filtered.filter((item) => item.sale.created_at.slice(0, 10) === today);
      }
    } else if (filter.start_date || filter.end_date) {
      if (filter.start_date) {
        filtered = filtered.filter((item) => item.sale.created_at.slice(0, 10) >= filter.start_date!);
      }
      if (filter.end_date) {
        filtered = filtered.filter((item) => item.sale.created_at.slice(0, 10) <= filter.end_date!);
      }
    }

    // Sort
    const sortCol = filter.sort_by || 'created_at';
    const isAsc = filter.sort_direction === 'asc';
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortCol === 'total_amount') {
        comparison = a.sale.total_amount - b.sale.total_amount;
      } else if (sortCol === 'invoice_number') {
        comparison = a.sale.invoice_number.localeCompare(b.sale.invoice_number);
      } else {
        comparison = new Date(a.sale.created_at).getTime() - new Date(b.sale.created_at).getTime();
      }
      return isAsc ? comparison : -comparison;
    });

    const page = Math.max(1, filter.page || 1);
    const pageSize = Math.min(100, Math.max(1, filter.page_size || 20));
    const totalCount = filtered.length;
    const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);
    const startIdx = (page - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);

    const salesList: SaleListItem[] = pageItems.map((item) => ({
      id: item.sale.id,
      invoice_number: item.sale.invoice_number,
      customer_id: item.sale.customer_id,
      customer_name: item.sale.customer_name,
      customer_phone: item.sale.customer_phone,
      subtotal: item.sale.subtotal,
      discount_amount: item.sale.discount_amount,
      tax_amount: item.sale.tax_amount,
      total_amount: item.sale.total_amount,
      payment_mode: item.sale.payment_mode,
      payment_status: item.sale.payment_status,
      notes: item.sale.notes,
      created_at: item.sale.created_at,
      item_count: item.items.length,
      total_quantity: item.items.reduce((sum, i) => sum + i.quantity, 0),
    }));

    return {
      sales: salesList,
      total_count: totalCount,
      page,
      page_size: pageSize,
      total_pages: totalPages,
    };
  },

  /**
   * Loads the current shop business profile from SQLite settings
   */
  async getShopProfile(): Promise<ShopProfile> {
    if (isTauriEnvironment()) {
      return await invoke<ShopProfile>('get_shop_profile');
    }
    return { ...previewProfile };
  },

  /**
   * Saves the shop business profile in SQLite settings
   */
  async saveShopProfile(profile: ShopProfile): Promise<ShopProfile> {
    if (isTauriEnvironment()) {
      return await invoke<ShopProfile>('save_shop_profile', { profile });
    }
    previewProfile = { ...profile };
    return { ...previewProfile };
  },

  /**
   * Generates comprehensive business performance reports, customer spend analytics,
   * product velocity, and sales records for daily, monthly, yearly, or custom date ranges.
   */
  async getBusinessReport(filter: BusinessReportFilter = {}): Promise<BusinessReportResult> {
    if (isTauriEnvironment()) {
      return await invoke<BusinessReportResult>('get_business_report', { filter });
    }

    // In-memory simulation for browser preview mode
    const preset = filter.date_preset || 'today';
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let filtered = [...previewSales];
    if (preset === 'today') {
      filtered = filtered.filter((s) => s.sale.created_at.slice(0, 10) === todayStr);
    } else if (filter.start_date || filter.end_date) {
      if (filter.start_date) {
        filtered = filtered.filter((s) => s.sale.created_at.slice(0, 10) >= filter.start_date!);
      }
      if (filter.end_date) {
        filtered = filtered.filter((s) => s.sale.created_at.slice(0, 10) <= filter.end_date!);
      }
    }

    const total_invoices = filtered.length;
    let total_items_sold = 0;
    let total_sales_revenue = 0;
    let total_purchase_cost = 0;
    let total_tax = 0;
    let total_discount = 0;
    let payment_cash = 0;
    let payment_upi = 0;
    let payment_card = 0;

    const customerMap = new Map<string, {
      customer_id?: number | null;
      name: string;
      phone: string;
      address: string;
      total_invoices: number;
      total_spent_on_buying: number;
      total_purchase_cost_to_store: number;
      last_visit: string;
    }>();

    const productMap = new Map<string, {
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
    }>();

    for (const item of filtered) {
      total_sales_revenue += item.sale.total_amount;
      total_tax += item.sale.tax_amount;
      total_discount += item.sale.discount_amount;

      if (item.sale.payment_mode === 'CASH') payment_cash += item.sale.total_amount;
      else if (item.sale.payment_mode === 'UPI') payment_upi += item.sale.total_amount;
      else if (item.sale.payment_mode === 'CARD') payment_card += item.sale.total_amount;

      // Customer mapping
      const custKey = item.sale.customer_phone || item.sale.customer_name || 'Walk-in';
      const existingCust = customerMap.get(custKey) || {
        customer_id: item.sale.customer_id,
        name: item.sale.customer_name || 'Walk-in Customer',
        phone: item.sale.customer_phone || '',
        address: '',
        total_invoices: 0,
        total_spent_on_buying: 0,
        total_purchase_cost_to_store: 0,
        last_visit: item.sale.created_at,
      };
      existingCust.total_invoices += 1;
      existingCust.total_spent_on_buying += item.sale.total_amount;
      customerMap.set(custKey, existingCust);

      // Line items
      for (const line of item.items) {
        total_items_sold += line.quantity;
        const lineCost = line.quantity * (line.unit_price * 0.7); // Approximate 30% margin fallback
        total_purchase_cost += lineCost;

        const prodKey = `${line.product_name}_${line.unit}`;
        const existingProd = productMap.get(prodKey) || {
          product_id: line.product_id,
          product_name: line.product_name,
          category: 'General',
          barcode: line.barcode,
          hsn_code: line.hsn_code,
          unit: line.unit,
          quantity_sold: 0,
          total_sales_revenue: 0,
          total_purchase_cost: 0,
          total_profit: 0,
        };
        existingProd.quantity_sold += line.quantity;
        existingProd.total_sales_revenue += line.total_price;
        existingProd.total_purchase_cost += lineCost;
        existingProd.total_profit += (line.total_price - lineCost);
        productMap.set(prodKey, existingProd);
      }
    }

    const gross_profit = Math.round((total_sales_revenue - total_purchase_cost) * 100) / 100;
    const profit_margin_percent = total_sales_revenue > 0
      ? Math.round((gross_profit / total_sales_revenue) * 10000) / 100
      : 0;

    const customers = Array.from(customerMap.values()).sort(
      (a, b) => b.total_spent_on_buying - a.total_spent_on_buying
    );

    const top_products = Array.from(productMap.values()).sort(
      (a, b) => b.quantity_sold - a.quantity_sold
    );

    const salesList: SaleListItem[] = filtered.map((item) => ({
      id: item.sale.id,
      invoice_number: item.sale.invoice_number,
      customer_id: item.sale.customer_id,
      customer_name: item.sale.customer_name,
      customer_phone: item.sale.customer_phone,
      subtotal: item.sale.subtotal,
      discount_amount: item.sale.discount_amount,
      tax_amount: item.sale.tax_amount,
      total_amount: item.sale.total_amount,
      payment_mode: item.sale.payment_mode,
      payment_status: item.sale.payment_status,
      notes: item.sale.notes,
      created_at: item.sale.created_at,
      item_count: item.items.length,
      total_quantity: item.items.reduce((sum, i) => sum + i.quantity, 0),
    }));

    return {
      period_label: preset,
      summary: {
        total_invoices,
        total_items_sold: Math.round(total_items_sold * 1000) / 1000,
        total_sales_revenue: Math.round(total_sales_revenue * 100) / 100,
        total_purchase_cost: Math.round(total_purchase_cost * 100) / 100,
        gross_profit,
        profit_margin_percent,
        total_tax: Math.round(total_tax * 100) / 100,
        total_discount: Math.round(total_discount * 100) / 100,
        payment_cash: Math.round(payment_cash * 100) / 100,
        payment_upi: Math.round(payment_upi * 100) / 100,
        payment_card: Math.round(payment_card * 100) / 100,
      },
      customers,
      top_products,
      sales: salesList,
    };
  },

  /**
   * Generates GSTR-1 compliant tax report (Table 4 B2B, Table 7 B2C, Table 12 HSN)
   */
  async getGstr1Report(filter?: BusinessReportFilter): Promise<Gstr1ReportResult> {
    if (isTauriEnvironment()) {
      return await invoke<Gstr1ReportResult>('get_gstr1_report', { filter });
    }
    return {
      period_label: filter?.date_preset || 'Current Period',
      shop_gstin: previewProfile.shop_gstin,
      shop_name: previewProfile.shop_name,
      total_b2b_invoices: 0,
      total_b2b_taxable: 0,
      total_b2b_tax: 0,
      total_b2c_invoices: previewSales.length,
      total_b2c_taxable: previewSales.reduce((sum, s) => sum + s.sale.subtotal, 0),
      total_b2c_tax: previewSales.reduce((sum, s) => sum + s.sale.tax_amount, 0),
      b2b_table4: [],
      b2c_table7: [
        {
          tax_rate: 5,
          taxable_value: previewSales.reduce((sum, s) => sum + s.sale.subtotal, 0),
          central_tax: previewSales.reduce((sum, s) => sum + s.sale.tax_amount / 2, 0),
          state_tax: previewSales.reduce((sum, s) => sum + s.sale.tax_amount / 2, 0),
          invoice_count: previewSales.length,
          total_value: previewSales.reduce((sum, s) => sum + s.sale.total_amount, 0),
        },
      ],
      hsn_table12: [],
    };
  },

  /**
   * Day-End Cash Drawer Reconciliation (Z-Report)
   */
  async getDayEndSummary(targetDate?: string): Promise<DayEndSummaryResult> {
    if (isTauriEnvironment()) {
      return await invoke<DayEndSummaryResult>('get_day_end_summary', { targetDate });
    }
    const todaySales = previewSales;
    const cashSales = todaySales.filter(s => s.sale.payment_mode === 'CASH').reduce((sum, s) => sum + s.sale.total_amount, 0);
    const upiSales = todaySales.filter(s => s.sale.payment_mode === 'UPI').reduce((sum, s) => sum + s.sale.total_amount, 0);
    const cardSales = todaySales.filter(s => s.sale.payment_mode === 'CARD').reduce((sum, s) => sum + s.sale.total_amount, 0);
    const totalSales = todaySales.reduce((sum, s) => sum + s.sale.total_amount, 0);
    return {
      report_date: targetDate || new Date().toISOString().slice(0, 10),
      generated_at: new Date().toISOString(),
      shop_name: previewProfile.shop_name,
      total_invoices: todaySales.length,
      total_sales_revenue: totalSales,
      cash_sales: cashSales,
      upi_sales: upiSales,
      card_sales: cardSales,
      split_sales: 0,
      total_returns_count: 0,
      total_refund_amount: 0,
      cash_refund_amount: 0,
      net_cash_inflow: cashSales,
    };
  },
};
