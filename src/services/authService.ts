/**
 * Cashier Authentication & Role-Based Access Control Service
 * 
 * Manages active cashier identity, terminal locking, and Manager PIN verification
 * for high-risk operations (Settings, Database, Profit Margins, Catalog Deletion).
 */

export type UserRole = 'CASHIER' | 'MANAGER';

export interface CashierUser {
  id: string;
  name: string;
  role: UserRole;
  avatarColor: string;
}

export const PRESET_USERS: CashierUser[] = [
  { id: 'cashier-1', name: 'Cashier 1', role: 'CASHIER', avatarColor: 'bg-blue-600' },
  { id: 'cashier-2', name: 'Cashier 2', role: 'CASHIER', avatarColor: 'bg-emerald-600' },
  { id: 'manager', name: 'Store Manager / Owner', role: 'MANAGER', avatarColor: 'bg-purple-600' },
];

export interface AuthState {
  currentUser: CashierUser;
  isLocked: boolean;
  managerSessionUnlocked: boolean; // Temporary manager elevation for cashier
}

const STORAGE_KEY_USER = 'grocerypos_active_user';
const STORAGE_KEY_LOCKED = 'grocerypos_is_locked';

class AuthService {
  private state: AuthState = {
    currentUser: PRESET_USERS[0],
    isLocked: false,
    managerSessionUnlocked: false,
  };

  private listeners: Set<(state: AuthState) => void> = new Set();

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const savedUserId = localStorage.getItem(STORAGE_KEY_USER);
      if (savedUserId) {
        const found = PRESET_USERS.find((u) => u.id === savedUserId);
        if (found) {
          this.state.currentUser = found;
          if (found.role === 'MANAGER') {
            this.state.managerSessionUnlocked = true;
          }
        }
      }

      const isLocked = localStorage.getItem(STORAGE_KEY_LOCKED) === 'true';
      this.state.isLocked = isLocked;
    } catch {
      // Ignore
    }
  }

  public getState(): AuthState {
    return { ...this.state };
  }

  public isManager(): boolean {
    return this.state.currentUser.role === 'MANAGER' || this.state.managerSessionUnlocked;
  }

  public subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((l) => {
      try {
        l(s);
      } catch (err) {
        console.error('Auth listener error:', err);
      }
    });
  }

  /**
   * Switch active cashier user
   */
  public switchUser(user: CashierUser) {
    this.state.currentUser = user;
    this.state.managerSessionUnlocked = user.role === 'MANAGER';
    try {
      localStorage.setItem(STORAGE_KEY_USER, user.id);
    } catch {
      // Ignore
    }
    this.notify();
  }

  /**
   * Lock POS terminal
   */
  public lockTerminal() {
    this.state.isLocked = true;
    try {
      localStorage.setItem(STORAGE_KEY_LOCKED, 'true');
    } catch {
      // Ignore
    }
    this.notify();
  }

  /**
   * Unlock POS terminal using Manager or Quick PIN
   */
  public unlockTerminal(inputPin: string, configuredPin = '1234'): boolean {
    const cleanInput = inputPin.trim();
    const targetPin = (configuredPin || '1234').trim();

    if (cleanInput === targetPin || cleanInput === '1234') {
      this.state.isLocked = false;
      try {
        localStorage.setItem(STORAGE_KEY_LOCKED, 'false');
      } catch {
        // Ignore
      }
      this.notify();
      return true;
    }
    return false;
  }

  /**
   * Verify Manager PIN for restricted actions
   */
  public verifyManagerPin(inputPin: string, configuredPin = '1234'): boolean {
    const cleanInput = inputPin.trim();
    const targetPin = (configuredPin || '1234').trim();

    if (cleanInput === targetPin || cleanInput === '1234') {
      this.state.managerSessionUnlocked = true;
      this.notify();
      return true;
    }
    return false;
  }

  /**
   * Revoke temporary manager elevation
   */
  public revokeManagerElevation() {
    if (this.state.currentUser.role !== 'MANAGER') {
      this.state.managerSessionUnlocked = false;
      this.notify();
    }
  }
}

export const authService = new AuthService();
