/**
 * Electronic Weighing Scale Serial Integration Service
 * 
 * Supports standard Indian retail grocery RS-232 / USB COM port weighing scales
 * (Essae, Phoenix, Citizen, Sansui, CAS, WEP, Eagle).
 * Standard protocol: 9600 baud (configurable 2400, 4800, 9600), 8-N-1.
 * Uses Web Serial API (navigator.serial) with automatic fallback and Simulation Mode.
 */

export interface ScaleReading {
  weightKg: number;
  rawString: string;
  isStable: boolean;
  unit: 'kg' | 'g';
  timestamp: number;
}

export type ScaleConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ScaleConfig {
  baudRate: number;
  protocol: 'standard' | 'essae' | 'phoenix' | 'raw';
  simulationMode: boolean;
}

const STORAGE_KEY = 'grocerypos_scale_config';

class WeighingScaleService {
  private status: ScaleConnectionStatus = 'disconnected';
  private port: any = null;
  private reader: any = null;
  private keepReading = false;
  private latestReading: ScaleReading = {
    weightKg: 0,
    rawString: '0.000',
    isStable: true,
    unit: 'kg',
    timestamp: Date.now(),
  };

  private tareOffsetKg = 0;
  private listeners: Set<(reading: ScaleReading) => void> = new Set();
  private statusListeners: Set<(status: ScaleConnectionStatus, errorMsg?: string) => void> = new Set();
  private lastErrorMessage = '';

  private config: ScaleConfig = {
    baudRate: 9600,
    protocol: 'standard',
    simulationMode: false,
  };

  constructor() {
    this.loadConfig();
  }

  private loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch {
      // Ignore parsing errors
    }
  }

  public saveConfig(config: Partial<ScaleConfig>) {
    this.config = { ...this.config, ...config };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // Ignore
    }
  }

  public getConfig(): ScaleConfig {
    return { ...this.config };
  }

  public getStatus(): ScaleConnectionStatus {
    return this.status;
  }

  public getLatestReading(): ScaleReading {
    return { ...this.latestReading };
  }

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  /**
   * Subscribe to live weight stream
   */
  public onWeightChange(listener: (reading: ScaleReading) => void): () => void {
    this.listeners.add(listener);
    // Send immediate initial value
    listener(this.latestReading);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to connection status changes
   */
  public onStatusChange(listener: (status: ScaleConnectionStatus, errorMsg?: string) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status, this.lastErrorMessage);
    return () => this.statusListeners.delete(listener);
  }

  private notifyWeight(reading: ScaleReading) {
    this.latestReading = reading;
    this.listeners.forEach((listener) => {
      try {
        listener(reading);
      } catch (err) {
        console.error('Scale listener error:', err);
      }
    });
  }

  private notifyStatus(status: ScaleConnectionStatus, errorMsg = '') {
    this.status = status;
    this.lastErrorMessage = errorMsg;
    this.statusListeners.forEach((listener) => {
      try {
        listener(status, errorMsg);
      } catch (err) {
        console.error('Scale status listener error:', err);
      }
    });
  }

  /**
   * Parse ASCII raw string emitted by electronic scales
   * Examples:
   *  Essae: "ST,GS,+001.250kg\r\n"
   *  Phoenix: "+001.250 kg\r\n"
   *  Generic: "WN 1.250 kg" or "1.250\r\n"
   */
  public parseScaleData(raw: string): number | null {
    if (!raw) return null;
    const clean = raw.trim();

    // Look for weight digits with decimal point
    // Matches e.g. "+001.250", "1.250", "0.500", "2.000"
    const match = clean.match(/([+-]?\d+(?:\.\d+)?)/);
    if (!match) return null;

    const val = parseFloat(match[1]);
    if (isNaN(val)) return null;

    // Check if unit is in grams
    const isGrams = /g\b/i.test(clean) && !/kg\b/i.test(clean);
    const weightInKg = isGrams ? val / 1000 : val;

    return Math.max(0, Math.round(weightInKg * 1000) / 1000);
  }

  /**
   * Connect to physical serial weighing scale via Web Serial API
   */
  public async connect(): Promise<boolean> {
    if (this.config.simulationMode) {
      this.notifyStatus('connected');
      return true;
    }

    if (!this.isSupported()) {
      const err = 'Web Serial API is not supported in this environment. Falling back to Simulation Mode.';
      this.notifyStatus('error', err);
      return false;
    }

    try {
      this.notifyStatus('connecting');

      const serial = (navigator as any).serial;
      // Request user to select COM port
      this.port = await serial.requestPort();

      await this.port.open({
        baudRate: this.config.baudRate || 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 255,
      });

      this.notifyStatus('connected');
      this.startReadingLoop();
      return true;
    } catch (err: any) {
      console.error('Failed to open serial weighing scale:', err);
      const msg = err?.message || 'Failed to connect to weighing scale port';
      this.notifyStatus('error', msg);
      return false;
    }
  }

  /**
   * Disconnect the scale
   */
  public async disconnect(): Promise<void> {
    this.keepReading = false;
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // Ignore
      }
      this.reader = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch {
        // Ignore
      }
      this.port = null;
    }

    this.notifyStatus('disconnected');
  }

  /**
   * Continuously read data packets from serial stream
   */
  private async startReadingLoop() {
    this.keepReading = true;
    let buffer = '';

    while (this.port && this.port.readable && this.keepReading) {
      try {
        this.reader = this.port.readable.getReader();
        const decoder = new TextDecoder();

        while (this.keepReading) {
          const { value, done } = await this.reader.read();
          if (done) break;

          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Split on newline or carriage return
            if (buffer.includes('\n') || buffer.includes('\r')) {
              const lines = buffer.split(/[\r\n]+/);
              buffer = lines.pop() || ''; // Keep partial line

              for (const line of lines) {
                if (line.trim().length > 0) {
                  const parsed = this.parseScaleData(line);
                  if (parsed !== null) {
                    const netWeight = Math.max(0, Math.round((parsed - this.tareOffsetKg) * 1000) / 1000);
                    const isStable = !line.includes('US') && !line.includes('MOT'); // 'US' = unstable
                    this.notifyWeight({
                      weightKg: netWeight,
                      rawString: line.trim(),
                      isStable,
                      unit: 'kg',
                      timestamp: Date.now(),
                    });
                  }
                }
              }
            }
          }
        }
      } catch (err: any) {
        if (this.keepReading) {
          console.error('Serial scale read error:', err);
          this.notifyStatus('error', err?.message || 'Serial read interrupted');
        }
        break;
      } finally {
        if (this.reader) {
          try {
            this.reader.releaseLock();
          } catch {
            // Ignore
          }
          this.reader = null;
        }
      }
    }
  }

  /**
   * Zero / Tare the weighing scale
   */
  public tare(): void {
    if (this.latestReading) {
      this.tareOffsetKg = this.latestReading.weightKg + this.tareOffsetKg;
      this.notifyWeight({
        ...this.latestReading,
        weightKg: 0,
        rawString: 'TARED 0.000 kg',
      });
    }
  }

  /**
   * Reset Tare offset
   */
  public resetTare(): void {
    this.tareOffsetKg = 0;
  }

  /**
   * Simulate a weight reading (useful for testing and environments without hardware scale)
   */
  public setSimulatedWeight(kg: number): void {
    const cleanKg = Math.max(0, Math.round(kg * 1000) / 1000);
    this.notifyWeight({
      weightKg: cleanKg,
      rawString: `SIM:${cleanKg.toFixed(3)}kg`,
      isStable: true,
      unit: 'kg',
      timestamp: Date.now(),
    });
  }
}

export const weighingScaleService = new WeighingScaleService();
