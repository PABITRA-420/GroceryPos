import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriService';
import type {
  Product,
  CreateProductInput,
  UpdateProductInput,
  ProductFilterParams,
  BulkImportProductInput,
  BulkImportOptions,
  BulkImportSummary,
} from '../types';

/**
 * Common grocery retail units supported across Indian grocery stores & Kirana dukans.
 */
export const GROCERY_UNITS = [
  'Kg',
  'Gram',
  'Litre',
  'ML',
  'Piece',
  'Packet',
  'Pouch',
  'Sachet',
  'Box',
  'Dozen',
  'Bottle',
  'Can',
  'Tin',
  'Jar',
  'Bori / Bag',
  'Quintal (Qtl)',
] as const;

/**
 * Common Indian Grocery GST HSN code references.
 */
export const COMMON_GROCERY_HSN = [
  { code: '1006', description: 'Rice / Chawal (Non-basmati & Basmati)' },
  { code: '1101', description: 'Wheat Flour / Atta / Maida / Suji' },
  { code: '0713', description: 'Pulses / Dal (Toor, Moong, Chana, Masoor)' },
  { code: '1507', description: 'Edible Oils (Mustard, Sunflower, Soyabean)' },
  { code: '0401', description: 'Milk & Dairy (Doodh, Dahi, Paneer)' },
  { code: '0405', description: 'Butter, Dairy Spreads & Ghee' },
  { code: '1701', description: 'Cane Sugar / Chini / Shakkar / Gur' },
  { code: '0910', description: 'Ginger, Saffron, Turmeric & Mixed Spices' },
  { code: '0902', description: 'Tea / Chai Patti' },
  { code: '0901', description: 'Coffee Beans & Powder' },
  { code: '1905', description: 'Biscuits, Bread, Rusks & Bakery' },
  { code: '2106', description: 'Namkeen, Bhujia, Savory Snacks' },
  { code: '3401', description: 'Bathing Soaps, Detergents & Cleaning' },
  { code: '3306', description: 'Toothpaste & Oral Hygiene' },
  { code: '2201', description: 'Packaged Drinking Water' },
  { code: '2103', description: 'Sauces, Ketchup & Condiments' },
] as const;

/**
 * Standard GST tax brackets in India.
 */
export const GST_RATES = [0, 5, 12, 18, 28] as const;

/**
 * In-memory fallback for browser preview mode only.
 * This is never used when running inside the Tauri native desktop application.
 */
let previewProducts: Product[] = [];

/**
 * Product Service Abstraction Layer
 *
 * All React UI components interact with this service to manage the product
 * catalog and inventory. Direct IPC calls and raw SQL in UI components
 * are strictly forbidden.
 */
export const productService = {
  /**
   * Creates a new product in the SQLite database.
   */
  async createProduct(input: CreateProductInput): Promise<Product> {
    if (isTauriEnvironment()) {
      return await invoke<Product>('create_product', { input });
    }

    // In-memory fallback for browser preview
    const newProduct: Product = {
      id: Date.now(),
      name: input.name.trim(),
      barcode: input.barcode?.trim() || null,
      category: input.category?.trim() || 'General',
      unit: input.unit.trim() || 'Kg',
      hsn_code: input.hsn_code?.trim() || null,
      purchase_price: input.purchase_price ?? 0,
      selling_price: input.selling_price,
      mrp: input.mrp ?? input.selling_price,
      gst_rate: input.gst_rate ?? 0,
      stock: input.stock ?? 0,
      minimum_stock: input.minimum_stock ?? 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    previewProducts.push(newProduct);
    return newProduct;
  },

  /**
   * Retrieves products with optional search query and filters.
   */
  async getProducts(filter?: ProductFilterParams): Promise<Product[]> {
    if (isTauriEnvironment()) {
      return await invoke<Product[]>('get_products', { filter: filter || null });
    }

    // In-memory filter for browser preview
    let results = [...previewProducts];
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    }
    if (filter?.category && filter.category !== 'All') {
      results = results.filter((p) => p.category === filter.category);
    }
    if (filter?.out_of_stock_only) {
      results = results.filter((p) => p.stock <= 0);
    } else if (filter?.low_stock_only) {
      results = results.filter((p) => p.stock <= p.minimum_stock && p.stock > 0);
    }
    return results;
  },

  /**
   * Fetches a single product by ID.
   */
  async getProduct(id: number): Promise<Product> {
    if (isTauriEnvironment()) {
      return await invoke<Product>('get_product', { id });
    }

    const found = previewProducts.find((p) => p.id === id);
    if (!found) throw new Error(`Product with ID ${id} not found.`);
    return found;
  },

  /**
   * Updates an existing product.
   */
  async updateProduct(input: UpdateProductInput): Promise<Product> {
    if (isTauriEnvironment()) {
      return await invoke<Product>('update_product', { input });
    }

    const index = previewProducts.findIndex((p) => p.id === input.id);
    if (index === -1) throw new Error(`Product with ID ${input.id} not found.`);

    const current = previewProducts[index];
    const updated: Product = {
      ...current,
      name: input.name.trim(),
      barcode: input.barcode?.trim() || null,
      category: input.category?.trim() || current.category,
      unit: input.unit.trim() || current.unit,
      purchase_price: input.purchase_price ?? current.purchase_price,
      selling_price: input.selling_price,
      mrp: input.mrp ?? current.mrp,
      gst_rate: input.gst_rate ?? current.gst_rate,
      stock: input.stock ?? current.stock,
      minimum_stock: input.minimum_stock ?? current.minimum_stock,
      updated_at: new Date().toISOString(),
    };
    previewProducts[index] = updated;
    return updated;
  },

  /**
   * Deletes a product from the database.
   * Throws a friendly error if protected by foreign key constraints.
   */
  async deleteProduct(id: number): Promise<boolean> {
    if (isTauriEnvironment()) {
      return await invoke<boolean>('delete_product', { id });
    }

    const prevLength = previewProducts.length;
    previewProducts = previewProducts.filter((p) => p.id !== id);
    return previewProducts.length < prevLength;
  },

  /**
   * Searches products by name or barcode.
   */
  async searchProducts(query: string): Promise<Product[]> {
    if (isTauriEnvironment()) {
      return await invoke<Product[]>('search_products', { query });
    }

    const q = query.toLowerCase().trim();
    if (!q) return previewProducts;
    return previewProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  },

  /**
   * Bulk imports an array of products with optional updating of existing barcodes.
   */
  async bulkImportProducts(
    products: BulkImportProductInput[],
    options: BulkImportOptions = { update_existing_barcodes: true }
  ): Promise<BulkImportSummary> {
    if (isTauriEnvironment()) {
      return await invoke<BulkImportSummary>('bulk_import_products', { products, options });
    }

    // In-memory fallback for preview mode
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    products.forEach((p, idx) => {
      const existingIdx = previewProducts.findIndex(
        (existing) => p.barcode && existing.barcode === p.barcode
      );
      if (existingIdx >= 0) {
        if (options.update_existing_barcodes) {
          const prev = previewProducts[existingIdx];
          previewProducts[existingIdx] = {
            ...prev,
            name: p.name || prev.name,
            barcode: p.barcode !== undefined ? p.barcode : prev.barcode,
            category: p.category || prev.category || 'General',
            unit: p.unit || prev.unit,
            purchase_price: p.purchase_price ?? prev.purchase_price,
            selling_price: p.selling_price ?? prev.selling_price,
            mrp: p.mrp ?? prev.mrp,
            gst_rate: p.gst_rate ?? prev.gst_rate,
            minimum_stock: p.minimum_stock ?? prev.minimum_stock,
            stock: (prev.stock || 0) + (p.stock || 0),
            updated_at: new Date().toISOString(),
          };
          updated++;
        } else {
          skipped++;
        }
      } else {
        previewProducts.push({
          id: Date.now() + idx,
          name: p.name,
          barcode: p.barcode || null,
          category: p.category || 'General',
          unit: p.unit || 'Kg',
          purchase_price: p.purchase_price ?? 0,
          selling_price: p.selling_price,
          mrp: p.mrp ?? p.selling_price,
          gst_rate: p.gst_rate ?? 0,
          stock: p.stock ?? 0,
          minimum_stock: p.minimum_stock ?? 0,
          hsn_code: p.hsn_code || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        inserted++;
      }
    });

    return { total: products.length, inserted, updated, skipped, errors };
  },

  /**
   * Generates a CSV content string of products
   */
  exportProductsToCsv(products: Product[]): string {
    const headers = [
      'Barcode',
      'Product Name',
      'Category',
      'Unit',
      'Purchase Price',
      'Selling Price',
      'MRP',
      'GST Rate (%)',
      'Current Stock',
      'Minimum Stock',
      'HSN Code',
    ];
    const escape = (val: unknown) => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows = products.map((p) =>
      [
        escape(p.barcode || ''),
        escape(p.name),
        escape(p.category),
        escape(p.unit),
        escape(p.purchase_price.toFixed(2)),
        escape(p.selling_price.toFixed(2)),
        escape(p.mrp.toFixed(2)),
        escape(p.gst_rate),
        escape(p.stock),
        escape(p.minimum_stock),
        escape(p.hsn_code || ''),
      ].join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  },

  /**
   * Generates a starter CSV template with realistic Indian grocery items
   */
  generateSampleCsvTemplate(): string {
    return [
      'Barcode,Product Name,Category,Unit,Purchase Price,Selling Price,MRP,GST Rate (%),Current Stock,Minimum Stock,HSN Code',
      '8901058852220,Tata Salt 1kg,Spices & Salt,Packet,22.00,28.00,30.00,0,50,10,2501',
      '8901030922881,Aashirvaad Shudh Chakki Atta 5kg,Grains & Flours,Bori / Bag,210.00,245.00,265.00,0,30,5,1101',
      '8906007280014,Fortune Sunlite Sunflower Oil 1L,Edible Oils & Ghee,Pouch,115.00,135.00,145.00,5,40,8,1507',
      '8901262010054,Amul Butter 500g,Dairy & Eggs,Box,240.00,275.00,285.00,12,20,5,0405',
      '8901058850001,Maggi 2-Minute Masala Noodles 70g,Snacks & Biscuits,Packet,11.50,14.00,14.00,12,100,25,1902',
      ',Loose Chana Dal (Desi),Pulses & Dals,Kg,72.00,85.00,90.00,0,100,20,0713',
    ].join('\n');
  },
};
