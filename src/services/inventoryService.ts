import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriService';
import type {
  DatabaseStatus,
  PaginatedStockMovements,
  StockAdjustmentInput,
  StockConsistencyReport,
  StockFilterParams,
  StockMovement,
} from '../types';

/**
 * Translates backend inventory error messages into friendly UI notifications
 */
export function formatInventoryErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    if (error.includes('Insufficient stock to reduce') || error.includes('Negative stock is prohibited')) {
      return error;
    }
    if (error.includes('Product not found')) {
      return 'The selected product was not found in inventory.';
    }
    if (error.includes('Reason is required')) {
      return 'Please specify an adjustment reason.';
    }
    return error;
  }
  if (error instanceof Error) {
    return formatInventoryErrorMessage(error.message);
  }
  return 'Stock adjustment failed. No changes were made.';
}

// In-memory mock ledger for browser mode
let previewLedger: StockMovement[] = [];

/**
 * Inventory & Stock Ledger Service Abstraction Layer
 */
export const inventoryService = {
  /**
   * Execute a manual stock adjustment (Damage, Expired, Stock Correction)
   */
  async createStockAdjustment(input: StockAdjustmentInput): Promise<StockMovement> {
    if (isTauriEnvironment()) {
      return await invoke<StockMovement>('create_stock_adjustment', { input });
    }

    const mockMovement: StockMovement = {
      id: Date.now(),
      product_id: input.product_id,
      product_name: 'Product Sample',
      barcode: null,
      unit: 'PCS',
      movement_type: input.adjustment_type,
      quantity: input.quantity_change,
      stock_before: 10,
      stock_after: 10 + input.quantity_change,
      reference_type: 'MANUAL',
      reference_id: null,
      reason: input.reason,
      notes: input.notes,
      created_at: new Date().toISOString(),
    };
    previewLedger.unshift(mockMovement);
    return mockMovement;
  },

  /**
   * Retrieve paginated stock ledger history
   */
  async getStockLedger(filter?: StockFilterParams): Promise<PaginatedStockMovements> {
    if (isTauriEnvironment()) {
      return await invoke<PaginatedStockMovements>('get_stock_ledger', { filter });
    }

    return {
      movements: previewLedger,
      total_count: previewLedger.length,
      page: 1,
      page_size: 20,
      total_pages: 1,
    };
  },

  /**
   * Verify consistency between current product stock and ledger movements
   */
  async checkStockConsistency(productId: number): Promise<StockConsistencyReport> {
    if (isTauriEnvironment()) {
      return await invoke<StockConsistencyReport>('check_stock_consistency', { productId });
    }

    return {
      product_id: productId,
      product_name: 'Product Sample',
      current_stock: 10,
      ledger_derived_stock: 10,
      is_consistent: true,
      total_movements_recorded: previewLedger.filter((m) => m.product_id === productId).length,
    };
  },

  /**
   * Export an online crash-resilient SQLite backup snapshot
   */
  async exportDatabaseBackup(destinationPath?: string): Promise<string> {
    if (isTauriEnvironment()) {
      return await invoke<string>('export_database_backup', { destinationPath });
    }
    return 'browser_preview_mock_backup.db';
  },

  /**
   * Safely restore database from an authenticated SQLite backup file
   */
  async restoreDatabaseBackup(sourceFilePath: string): Promise<DatabaseStatus> {
    if (isTauriEnvironment()) {
      return await invoke<DatabaseStatus>('restore_database_backup', { sourceFilePath });
    }
    return {
      connected: true,
      file_path: sourceFilePath,
      migrations_applied: 3,
      total_tables: 9,
      wal_enabled: true,
      foreign_keys_enabled: true,
      error: null,
    };
  },
};

