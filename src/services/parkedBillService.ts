import type { CartItem, Customer } from '../types';

export interface ParkedBill {
  id: string;
  token_number: number;
  cart: CartItem[];
  customer: Customer | null;
  customer_phone_input: string;
  new_customer_name: string;
  new_customer_address: string;
  discount_amount: number;
  payment_mode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT';
  payment_notes: string;
  total_amount: number;
  items_count: number;
  parked_at: string; // ISO string
}

const STORAGE_KEY = 'grocerypos_parked_bills';
const TOKEN_KEY = 'grocerypos_parked_token_seq';

export const parkedBillService = {
  /**
   * Retrieves all parked bills from persistent local storage
   */
  getParkedBills(): ParkedBill[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as ParkedBill[];
    } catch (err) {
      console.error('Failed to parse parked bills:', err);
      return [];
    }
  },

  /**
   * Gets the count of currently parked bills
   */
  getParkedCount(): number {
    return this.getParkedBills().length;
  },

  /**
   * Gets the next auto-incremented token number (1..99 reset daily)
   */
  getNextTokenNumber(): number {
    try {
      const current = parseInt(localStorage.getItem(TOKEN_KEY) || '0', 10);
      const next = current >= 999 ? 1 : current + 1;
      localStorage.setItem(TOKEN_KEY, next.toString());
      return next;
    } catch {
      return Math.floor(Math.random() * 900) + 100;
    }
  },

  /**
   * Parks the current cart and POS state
   */
  parkBill(payload: {
    cart: CartItem[];
    customer: Customer | null;
    customer_phone_input: string;
    new_customer_name: string;
    new_customer_address: string;
    discount_amount: number;
    payment_mode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT';
    payment_notes: string;
    total_amount: number;
  }): ParkedBill {
    const list = this.getParkedBills();
    const token = this.getNextTokenNumber();
    const itemsCount = payload.cart.reduce((sum, item) => sum + item.quantity, 0);

    const newParked: ParkedBill = {
      id: `hold_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      token_number: token,
      cart: payload.cart,
      customer: payload.customer,
      customer_phone_input: payload.customer_phone_input,
      new_customer_name: payload.new_customer_name,
      new_customer_address: payload.new_customer_address,
      discount_amount: payload.discount_amount,
      payment_mode: payload.payment_mode,
      payment_notes: payload.payment_notes,
      total_amount: payload.total_amount,
      items_count: itemsCount,
      parked_at: new Date().toISOString(),
    };

    const updated = [newParked, ...list];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newParked;
  },

  /**
   * Recalls and removes a parked bill from storage
   */
  recallParkedBill(id: string): ParkedBill | null {
    const list = this.getParkedBills();
    const target = list.find((b) => b.id === id) || null;
    if (target) {
      const filtered = list.filter((b) => b.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
    return target;
  },

  /**
   * Deletes a parked bill without restoring it
   */
  discardParkedBill(id: string): void {
    const list = this.getParkedBills();
    const filtered = list.filter((b) => b.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  },

  /**
   * Clears all parked bills
   */
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};
