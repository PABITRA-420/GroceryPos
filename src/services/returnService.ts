import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriService';
import type {
  CreateReturnInput,
  PaginatedReturnsResult,
  ReturnableItemInfo,
  ReturnsFilterParams,
  SalesReturnResult,
} from '../types';

/**
 * Translates backend return error messages into clear, friendly merchant notifications
 */
export function formatReturnErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    if (error.includes('Cannot return') && error.includes('available to return')) {
      return error;
    }
    if (error.includes('No items selected for return')) {
      return 'Please specify a return quantity greater than 0 for at least one item.';
    }
    if (error.includes('does not belong to invoice')) {
      return 'Selected item is not part of this invoice.';
    }
    if (error.includes('Return reason is mandatory')) {
      return 'Please provide a reason for the return (e.g., Defective, Customer Changed Mind).';
    }
    return error;
  }
  if (error instanceof Error) {
    return formatReturnErrorMessage(error.message);
  }
  return 'The return could not be processed. No changes were made.';
}

// In-memory mock data for browser preview testing
let previewReturns: SalesReturnResult[] = [];

/**
 * Return & Refund Service Abstraction Layer
 */
export const returnService = {
  /**
   * Fetch line items eligible for return on a given invoice
   */
  async getReturnableItems(saleId: number): Promise<ReturnableItemInfo[]> {
    if (isTauriEnvironment()) {
      return await invoke<ReturnableItemInfo[]>('get_returnable_items', { saleId });
    }
    // Browser mock fallback
    return [];
  },

  /**
   * Process a sales return and refund atomically
   */
  async createReturn(input: CreateReturnInput): Promise<SalesReturnResult> {
    if (isTauriEnvironment()) {
      return await invoke<SalesReturnResult>('create_return', { input });
    }

    // Browser mock
    const newReturn: SalesReturnResult = {
      return_record: {
        id: Date.now(),
        return_number: `RET-${Date.now().toString().slice(-6)}`,
        sale_id: input.sale_id,
        customer_id: null,
        customer_name: 'Customer',
        customer_phone: null,
        refund_amount: 100,
        refund_mode: input.refund_mode,
        reason: input.reason,
        notes: input.notes,
        created_at: new Date().toISOString(),
      },
      items: input.items.map((item, idx) => ({
        id: Date.now() + idx,
        return_id: Date.now(),
        sale_item_id: item.sale_item_id,
        product_id: null,
        product_name: 'Returned Item',
        barcode: null,
        unit: 'PCS',
        original_quantity: item.return_quantity,
        return_quantity: item.return_quantity,
        unit_price: 100,
        tax_rate: 0,
        refund_amount: 100,
        restock: item.restock,
        reason: item.reason,
      })),
      original_invoice_number: 'INV-000001',
    };
    previewReturns.unshift(newReturn);
    return newReturn;
  },

  /**
   * Retrieve returns history with filters and pagination
   */
  async getReturnsHistory(filter?: ReturnsFilterParams): Promise<PaginatedReturnsResult> {
    if (isTauriEnvironment()) {
      return await invoke<PaginatedReturnsResult>('get_returns_history', { filter });
    }

    // Browser mock
    return {
      returns: previewReturns.map((r) => ({
        id: r.return_record.id,
        return_number: r.return_record.return_number,
        sale_id: r.return_record.sale_id,
        original_invoice_number: r.original_invoice_number,
        customer_name: r.return_record.customer_name,
        customer_phone: r.return_record.customer_phone,
        refund_amount: r.return_record.refund_amount,
        refund_mode: r.return_record.refund_mode,
        reason: r.return_record.reason,
        created_at: r.return_record.created_at,
        items_count: r.items.length,
      })),
      total_count: previewReturns.length,
      page: 1,
      page_size: 20,
      total_pages: 1,
    };
  },

  /**
   * Fetch full return receipt details by return number
   */
  async getReturnByNumber(returnNumber: string): Promise<SalesReturnResult> {
    if (isTauriEnvironment()) {
      return await invoke<SalesReturnResult>('get_return_by_number', { returnNumber });
    }
    const found = previewReturns.find((r) => r.return_record.return_number === returnNumber);
    if (!found) {
      throw new Error(`Return ${returnNumber} not found`);
    }
    return found;
  },
};
