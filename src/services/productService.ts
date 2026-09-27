import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriService';
import type {
  Product,
  CreateProductInput,
  UpdateProductInput,
  ProductFilterParams,
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
};
