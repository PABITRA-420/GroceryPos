/**
 * Internet Time Synchronization & Online Status Service
 *
 * Provides accurate network-synchronized time across POS invoices, receipts,
 * and day-end operations. If the user's host machine clock is skewed, out of sync,
 * or running with dead CMOS/wrong timezone, this service detects internet availability,
 * computes the real network time offset, and ensures bill timestamps remain strictly
 * accurate and synchronized.
 *
 * Robust Fallbacks:
 * 1. Cloudflare CDN Trace endpoint (global edge server Unix epoch timestamp, sub-second accuracy)
 * 2. TimeAPI / WorldTimeAPI endpoints (timezone structured date-time)
 * 3. Fallback to system Date with cached clock offset when offline
 */

type TimeListener = (date: Date, isSynced: boolean, isOnline: boolean) => void;

class TimeSyncService {
  private clockOffsetMs: number = 0;
  private isSynced: boolean = false;
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private listeners: Set<TimeListener> = new Set();
  private syncTimer: any = null;
  private liveTicker: any = null;
  private lastSyncTime: number = 0;

  constructor() {
    this.loadCachedOffset();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.syncWithInternetTime();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notifyListeners();
      });

      // Initial synchronization
      this.syncWithInternetTime();

      // Periodically sync time every 10 minutes when online
      this.syncTimer = setInterval(() => {
        if (this.isOnline) {
          this.syncWithInternetTime();
        }
      }, 10 * 60 * 1000);

      // Start 1-second live ticker for UI clocks
      this.liveTicker = setInterval(() => {
        this.notifyListeners();
      }, 1000);
    }
  }

  private loadCachedOffset(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('pos_network_time_offset');
        if (saved !== null) {
          const parsed = parseInt(saved, 10);
          if (!isNaN(parsed)) {
            this.clockOffsetMs = parsed;
          }
        }
      }
    } catch {
      // Ignore local storage error in restricted contexts
    }
  }

  private saveCachedOffset(offset: number): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pos_network_time_offset', String(offset));
      }
    } catch {
      // Ignore local storage error
    }
  }

  /**
   * Fetches high-accuracy Unix epoch timestamp from reliable network endpoints.
   */
  public async syncWithInternetTime(): Promise<boolean> {
    const fetchWithTimeout = async (url: string, timeoutMs = 3000): Promise<Response> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(id);
        return res;
      } catch (e) {
        clearTimeout(id);
        throw e;
      }
    };

    const startTime = Date.now();

    // Strategy 1: Cloudflare trace (ultra-fast, zero-rate-limit global CDN edge timestamp)
    try {
      const res = await fetchWithTimeout('https://cloudflare.com/cdn-cgi/trace', 2500);
      if (res.ok) {
        const text = await res.text();
        const tsMatch = text.match(/ts=([\d.]+)/);
        if (tsMatch && tsMatch[1]) {
          const serverEpochMs = Math.round(parseFloat(tsMatch[1]) * 1000);
          const roundTrip = Date.now() - startTime;
          const adjustedServerTime = serverEpochMs + Math.round(roundTrip / 2);
          this.clockOffsetMs = adjustedServerTime - Date.now();
          this.isSynced = true;
          this.isOnline = true;
          this.lastSyncTime = Date.now();
          this.saveCachedOffset(this.clockOffsetMs);
          this.notifyListeners();
          return true;
        }
      }
    } catch {
      // Proceed to fallback
    }

    // Strategy 2: TimeAPI for Asia/Kolkata
    try {
      const res = await fetchWithTimeout('https://timeapi.io/api/time/current/zone?timeZone=Asia/Kolkata', 3000);
      if (res.ok) {
        const data = await res.json();
        if (data.dateTime) {
          const serverEpochMs = new Date(data.dateTime).getTime();
          const roundTrip = Date.now() - startTime;
          const adjustedServerTime = serverEpochMs + Math.round(roundTrip / 2);
          this.clockOffsetMs = adjustedServerTime - Date.now();
          this.isSynced = true;
          this.isOnline = true;
          this.lastSyncTime = Date.now();
          this.saveCachedOffset(this.clockOffsetMs);
          this.notifyListeners();
          return true;
        }
      }
    } catch {
      // Proceed to fallback
    }

    // Fallback: Could not sync right now, retain offline/cached state
    this.isSynced = this.clockOffsetMs !== 0;
    this.notifyListeners();
    return false;
  }

  /**
   * Returns current synchronized JavaScript Date object
   */
  public getNow(): Date {
    return new Date(Date.now() + this.clockOffsetMs);
  }

  /**
   * Returns local date-time string in SQL format "YYYY-MM-DD HH:MM:SS"
   */
  public getNowLocalSqlString(): string {
    const d = this.getNow();
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Returns local date-time in ISO format with local timezone preservation
   */
  public getNowLocalIsoString(): string {
    const d = this.getNow();
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  /**
   * Status indicators
   */
  public getStatus() {
    return {
      isOnline: this.isOnline,
      isSynced: this.isSynced,
      offsetSeconds: Math.round(this.clockOffsetMs / 1000),
      lastSyncTime: this.lastSyncTime,
    };
  }

  /**
   * Subscribe to live clock tick and sync status updates
   */
  public subscribe(listener: TimeListener): () => void {
    this.listeners.add(listener);
    listener(this.getNow(), this.isSynced, this.isOnline);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const now = this.getNow();
    this.listeners.forEach((listener) => {
      try {
        listener(now, this.isSynced, this.isOnline);
      } catch (e) {
        console.error('TimeSync listener error:', e);
      }
    });
  }

  public destroy(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.liveTicker) clearInterval(this.liveTicker);
    this.listeners.clear();
  }
}

export const timeSyncService = new TimeSyncService();
