import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriService';
import type {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerSearchParams,
} from '../types';

/**
 * In-memory fallback for browser preview mode only.
 * This is never used when running inside the Tauri native desktop application.
 */
let previewCustomers: Customer[] = [];

/**
 * Customer Service Abstraction Layer
 *
 * All React UI components interact with this service to manage the customer
 * directory. Direct IPC calls and raw SQL in UI components are strictly forbidden.
 */
export const customerService = {
  /**
   * Creates a new customer in the SQLite database.
   */
  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    if (isTauriEnvironment()) {
      return await invoke<Customer>('create_customer', { input });
    }

    // In-memory fallback for browser preview
    const cleanPhone = input.phone?.replace(/[\s-]/g, '').trim() || null;
    if (cleanPhone && previewCustomers.some((c) => c.phone === cleanPhone)) {
      throw new Error('Customer with this phone number already exists.');
    }

    const newCustomer: Customer = {
      id: Date.now(),
      name: input.name.trim(),
      phone: cleanPhone,
      address: input.address?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    previewCustomers.push(newCustomer);
    return newCustomer;
  },

  /**
   * Retrieves customers, optionally filtering by search query (name or phone).
   */
  async getCustomers(search?: CustomerSearchParams): Promise<Customer[]> {
    if (isTauriEnvironment()) {
      return await invoke<Customer[]>('get_customers', { search: search || null });
    }

    let results = [...previewCustomers];
    if (search?.query) {
      const q = search.query.toLowerCase().trim();
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q))
      );
    }
    return results;
  },

  /**
   * Fetches a single customer by primary key ID.
   */
  async getCustomer(id: number): Promise<Customer> {
    if (isTauriEnvironment()) {
      return await invoke<Customer>('get_customer', { id });
    }

    const found = previewCustomers.find((c) => c.id === id);
    if (!found) throw new Error(`Customer with ID ${id} not found.`);
    return found;
  },

  /**
   * Updates an existing customer's details.
   */
  async updateCustomer(input: UpdateCustomerInput): Promise<Customer> {
    if (isTauriEnvironment()) {
      return await invoke<Customer>('update_customer', { input });
    }

    const index = previewCustomers.findIndex((c) => c.id === input.id);
    if (index === -1) throw new Error(`Customer with ID ${input.id} not found.`);

    const cleanPhone = input.phone?.replace(/[\s-]/g, '').trim() || null;
    if (
      cleanPhone &&
      previewCustomers.some((c) => c.id !== input.id && c.phone === cleanPhone)
    ) {
      throw new Error('Customer with this phone number already exists.');
    }

    const current = previewCustomers[index];
    const updated: Customer = {
      ...current,
      name: input.name.trim(),
      phone: cleanPhone,
      address: input.address?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    previewCustomers[index] = updated;
    return updated;
  },

  /**
   * Deletes a customer by ID safely.
   */
  async deleteCustomer(id: number): Promise<boolean> {
    if (isTauriEnvironment()) {
      return await invoke<boolean>('delete_customer', { id });
    }

    const prevLen = previewCustomers.length;
    previewCustomers = previewCustomers.filter((c) => c.id !== id);
    return previewCustomers.length < prevLen;
  },

  /**
   * Searches customers by name or phone substring.
   */
  async searchCustomers(query: string): Promise<Customer[]> {
    if (isTauriEnvironment()) {
      return await invoke<Customer[]>('search_customers', { query });
    }

    const q = query.toLowerCase().trim();
    if (!q) return previewCustomers;
    return previewCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q))
    );
  },
};
