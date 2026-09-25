import { invoke } from '@tauri-apps/api/core';
import type { SystemInfo } from '../types';

/**
 * Checks whether the application is running inside the Tauri native desktop window.
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Service to communicate with the native desktop layer.
 * All native Tauri IPC calls should pass through this service layer
 * rather than being called directly in React UI components.
 */
export const tauriService = {
  /**
   * Health check / system status command.
   * Invokes the native `get_system_info` registered in Rust/Tauri.
   */
  async getSystemInfo(): Promise<SystemInfo> {
    if (isTauriEnvironment()) {
      try {
        return await invoke<SystemInfo>('get_system_info');
      } catch (err) {
        console.error('Failed to invoke get_system_info from Tauri:', err);
        return {
          app_name: 'Grocery POS',
          version: '0.1.0',
          os: 'Windows (Native)',
          arch: 'x64',
          status: 'IPC Error: ' + String(err),
        };
      }
    }

    // Fallback when previewing UI directly in a standard browser
    return {
      app_name: 'Grocery POS (Browser Preview Mode)',
      version: '0.1.0',
      os: 'Web Runtime',
      arch: 'Client',
      status: 'Ready for Native Desktop (Launch via Tauri for full native offline capabilities)',
    };
  },
};
