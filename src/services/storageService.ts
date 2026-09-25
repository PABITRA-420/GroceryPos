import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './tauriService';
import type { DatabaseStatus } from '../types';

/**
 * Storage Service Abstraction Layer
 *
 * Provides a clean, strongly-typed interface between React UI components
 * and the local SQLite database managed by the Rust/Tauri desktop runtime.
 *
 * Direct database access and raw SQL execution are strictly prohibited in React.
 * All operations pass through typed Tauri IPC commands.
 */
export const storageService = {
  /**
   * Initializes the local SQLite database engine.
   * Resolves the app data directory, applies PRAGMAs, and executes pending migrations.
   * Safe to call repeatedly (idempotent).
   */
  async initializeDatabase(): Promise<DatabaseStatus> {
    if (isTauriEnvironment()) {
      try {
        return await invoke<DatabaseStatus>('initialize_database');
      } catch (err) {
        console.error('Failed to initialize local SQLite database:', err);
        return {
          connected: false,
          file_path: '',
          migrations_applied: 0,
          total_tables: 0,
          wal_enabled: false,
          foreign_keys_enabled: false,
          error: String(err),
        };
      }
    }

    // Fallback for browser preview mode
    return {
      connected: false,
      file_path: 'In-Memory / Browser Preview (Launch desktop app for real SQLite)',
      migrations_applied: 1,
      total_tables: 5,
      wal_enabled: false,
      foreign_keys_enabled: false,
      error: 'Running in browser preview mode. Native SQLite requires desktop runtime.',
    };
  },

  /**
   * Fetches the current live status and health of the SQLite database.
   */
  async getDatabaseStatus(): Promise<DatabaseStatus> {
    if (isTauriEnvironment()) {
      try {
        return await invoke<DatabaseStatus>('get_database_status');
      } catch (err) {
        console.error('Failed to query database status:', err);
        return {
          connected: false,
          file_path: '',
          migrations_applied: 0,
          total_tables: 0,
          wal_enabled: false,
          foreign_keys_enabled: false,
          error: String(err),
        };
      }
    }

    // Fallback for browser preview mode
    return {
      connected: false,
      file_path: 'In-Memory / Browser Preview (Launch desktop app for real SQLite)',
      migrations_applied: 1,
      total_tables: 5,
      wal_enabled: false,
      foreign_keys_enabled: false,
      error: 'Running in browser preview mode.',
    };
  },
};
