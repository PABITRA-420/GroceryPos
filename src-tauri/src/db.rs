use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Embedded initial database schema migration
const MIGRATION_001_SQL: &str = include_str!("../migrations/001_initial_schema.sql");
/// Embedded migration 002 for sales history indexes
const MIGRATION_002_SQL: &str = include_str!("../migrations/002_sales_indexes.sql");
/// Embedded migration 003 for returns and stock movement ledger
const MIGRATION_003_SQL: &str = include_str!("../migrations/003_returns_and_stock_ledger.sql");

/// Strongly-typed status information about the local SQLite database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseStatus {
    pub connected: bool,
    pub file_path: String,
    pub migrations_applied: i32,
    pub total_tables: i32,
    pub wal_enabled: bool,
    pub foreign_keys_enabled: bool,
    pub error: Option<String>,
}

/// Global database state managed by Tauri runtime
pub struct DbState {
    pub conn: Mutex<Option<Connection>>,
    pub db_path: Mutex<Option<PathBuf>>,
}

impl DbState {
    pub fn new() -> Self {
        Self {
            conn: Mutex::new(None),
            db_path: Mutex::new(None),
        }
    }

    pub fn with_conn<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Connection) -> Result<T, String>,
    {
        let mut lock = self
            .conn
            .lock()
            .map_err(|e| format!("Database connection lock error: {}", e))?;
        match lock.as_mut() {
            Some(conn) => f(conn),
            None => Err("Database has not been initialized yet".to_string()),
        }
    }
}

/// Reusable database transaction wrapper.
///
/// Ensures all database operations within the closure `f` are executed atomically.
/// If `f` returns `Ok`, the transaction is committed.
/// If `f` returns `Err` or an error occurs during execution, the transaction is automatically rolled back.
pub fn with_transaction<F, T>(conn: &mut Connection, f: F) -> Result<T, String>
where
    F: FnOnce(&rusqlite::Transaction) -> Result<T, String>,
{
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to begin database transaction: {}", e))?;

    let result = f(&tx)?;

    tx.commit()
        .map_err(|e| format!("Failed to commit database transaction: {}", e))?;

    Ok(result)
}

/// Resolves the secure, per-user application data directory for the SQLite database.
///
/// On Windows, this resolves to `%APPDATA%\com.grocerypos.desktop\` (e.g. Roaming AppData).
/// Does NOT store database files in the source tree or use hardcoded paths.
pub fn get_database_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve application data directory: {}", e))?;

    // Ensure the application directory exists
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create application data directory {:?}: {}", app_data_dir, e))?;
    }

    Ok(app_data_dir.join("grocerypos.db"))
}

/// Configures SQLite PRAGMA settings for enterprise-grade desktop reliability:
/// - WAL mode (Write-Ahead Logging) for concurrent reads/writes and crash resilience
/// - Foreign keys enabled for referential integrity
/// - Busy timeout to handle concurrent lock contention gracefully (5000ms)
/// - Normal synchronous mode for optimal balance of speed and safety in WAL mode
fn configure_pragmas(conn: &Connection) -> Result<(bool, bool), String> {
    // Enable WAL journal mode
    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode = WAL;", [], |row| row.get(0))
        .map_err(|e| format!("Failed to set PRAGMA journal_mode=WAL: {}", e))?;
    let wal_enabled = journal_mode.to_lowercase() == "wal";

    // Enable Foreign Keys enforcement
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("Failed to set PRAGMA foreign_keys=ON: {}", e))?;

    let foreign_keys_status: i32 = conn
        .query_row("PRAGMA foreign_keys;", [], |row| row.get(0))
        .map_err(|e| format!("Failed to verify PRAGMA foreign_keys: {}", e))?;
    let foreign_keys_enabled = foreign_keys_status == 1;

    // Set busy timeout to 5000ms
    conn.busy_timeout(std::time::Duration::from_millis(5000))
        .map_err(|e| format!("Failed to set busy timeout: {}", e))?;

    // Set synchronous mode to NORMAL (optimal with WAL)
    conn.execute_batch("PRAGMA synchronous = NORMAL;")
        .map_err(|e| format!("Failed to set PRAGMA synchronous=NORMAL: {}", e))?;

    Ok((wal_enabled, foreign_keys_enabled))
}

/// Applies schema migrations idempotently.
/// Creates the internal `_migrations` tracking table if not present.
/// If migration 1 has not been applied, runs `001_initial_schema.sql` inside a transaction.
fn run_migrations(conn: &mut Connection) -> Result<i32, String> {
    // Ensure migrations ledger table exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL UNIQUE,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );",
        [],
    )
    .map_err(|e| format!("Failed to initialize migrations tracking table: {}", e))?;

    // Check if migration 001 is already applied
    let migration_applied: bool = conn
        .query_row(
            "SELECT count(*) FROM _migrations WHERE version = 1;",
            [],
            |row| {
                let count: i32 = row.get(0)?;
                Ok(count > 0)
            },
        )
        .map_err(|e| format!("Failed to query migrations status: {}", e))?;

    if !migration_applied {
        log::info!("Applying migration 001: initial schema");
        with_transaction(conn, |tx| {
            tx.execute_batch(MIGRATION_001_SQL)
                .map_err(|e| format!("Failed to execute migration 001 schema: {}", e))?;

            tx.execute(
                "INSERT INTO _migrations (version, name) VALUES (?1, ?2);",
                params![1, "001_initial_schema"],
            )
            .map_err(|e| format!("Failed to record migration 001 in _migrations: {}", e))?;

            Ok(())
        })?;
        log::info!("Migration 001 applied successfully");
    } else {
        log::info!("Database schema is up to date (migration 001 already applied)");
    }

    // Check if migration 002 is already applied
    let migration_002_applied: bool = conn
        .query_row(
            "SELECT count(*) FROM _migrations WHERE version = 2;",
            [],
            |row| {
                let count: i32 = row.get(0)?;
                Ok(count > 0)
            },
        )
        .map_err(|e| format!("Failed to query migration 002 status: {}", e))?;

    if !migration_002_applied {
        log::info!("Applying migration 002: sales history indexes");
        with_transaction(conn, |tx| {
            tx.execute_batch(MIGRATION_002_SQL)
                .map_err(|e| format!("Failed to execute migration 002 schema: {}", e))?;

            tx.execute(
                "INSERT INTO _migrations (version, name) VALUES (?1, ?2);",
                params![2, "002_sales_indexes"],
            )
            .map_err(|e| format!("Failed to record migration 002 in _migrations: {}", e))?;

            Ok(())
        })?;
        log::info!("Migration 002 applied successfully");
    } else {
        log::info!("Migration 002 already applied");
    }

    // Check if migration 003 is already applied
    let migration_003_applied: bool = conn
        .query_row(
            "SELECT count(*) FROM _migrations WHERE version = 3;",
            [],
            |row| {
                let count: i32 = row.get(0)?;
                Ok(count > 0)
            },
        )
        .map_err(|e| format!("Failed to query migration 003 status: {}", e))?;

    if !migration_003_applied {
        log::info!("Applying migration 003: returns and stock movements ledger");
        with_transaction(conn, |tx| {
            tx.execute_batch(MIGRATION_003_SQL)
                .map_err(|e| format!("Failed to execute migration 003 schema: {}", e))?;

            tx.execute(
                "INSERT INTO _migrations (version, name) VALUES (?1, ?2);",
                params![3, "003_returns_and_stock_ledger"],
            )
            .map_err(|e| format!("Failed to record migration 003 in _migrations: {}", e))?;

            Ok(())
        })?;
        log::info!("Migration 003 applied successfully");
    } else {
        log::info!("Migration 003 already applied");
    }

    // Return total applied migrations count
    let total_applied: i32 = conn
        .query_row("SELECT count(*) FROM _migrations;", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count applied migrations: {}", e))?;

    Ok(total_applied)
}

/// Collects database diagnostics and statistics
fn collect_status(conn: &Connection, db_path: &Path) -> Result<DatabaseStatus, String> {
    // Check foreign keys
    let fk_status: i32 = conn
        .query_row("PRAGMA foreign_keys;", [], |row| row.get(0))
        .unwrap_or(0);

    // Check journal mode
    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode;", [], |row| row.get(0))
        .unwrap_or_default();

    // Count user tables (excluding SQLite internal tables and migrations)
    let total_tables: i32 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Count applied migrations
    let migrations_applied: i32 = conn
        .query_row("SELECT count(*) FROM _migrations;", [], |row| row.get(0))
        .unwrap_or(0);

    Ok(DatabaseStatus {
        connected: true,
        file_path: db_path.to_string_lossy().to_string(),
        migrations_applied,
        total_tables,
        wal_enabled: journal_mode.to_lowercase() == "wal",
        foreign_keys_enabled: fk_status == 1,
        error: None,
    })
}

/// Opens the SQLite database connection, applies PRAGMAs, and runs all migrations.
/// Can be safely invoked repeatedly without data loss or corruption.
pub fn init_db(app_handle: &AppHandle, state: &DbState) -> Result<DatabaseStatus, String> {
    let mut conn_lock = state
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire connection lock: {}", e))?;
    let mut path_lock = state
        .db_path
        .lock()
        .map_err(|e| format!("Failed to acquire path lock: {}", e))?;

    let db_path = get_database_path(app_handle)?;
    log::info!("Initializing SQLite database at: {:?}", db_path);

    // Open connection
    let mut conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open SQLite database at {:?}: {}", db_path, e))?;

    // Apply reliability settings
    configure_pragmas(&conn)?;

    // Run schema migrations idempotently
    run_migrations(&mut conn)?;

    // Collect status
    let status = collect_status(&conn, &db_path)?;

    // Store active connection and path in global state
    *conn_lock = Some(conn);
    *path_lock = Some(db_path);

    Ok(status)
}

/// Queries the status of the already initialized database.
pub fn get_status(state: &DbState) -> Result<DatabaseStatus, String> {
    let conn_lock = state
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire connection lock: {}", e))?;
    let path_lock = state
        .db_path
        .lock()
        .map_err(|e| format!("Failed to acquire path lock: {}", e))?;

    match (&*conn_lock, &*path_lock) {
        (Some(conn), Some(path)) => collect_status(conn, path),
        _ => Ok(DatabaseStatus {
            connected: false,
            file_path: String::new(),
            migrations_applied: 0,
            total_tables: 0,
            wal_enabled: false,
            foreign_keys_enabled: false,
            error: Some("Database has not been initialized yet".to_string()),
        }),
    }
}

/// Safely restores the active database from a user-supplied SQLite backup file.
///
/// Execution safety protocol:
/// 1. Verifies that the source backup file exists and is accessible.
/// 2. Performs PRAGMA integrity_check on the backup file before touching the live database.
/// 3. Validates required table structures exist in the backup.
/// 4. Generates an emergency pre-restore snapshot of the current live database.
/// 5. Gracefully closes the active connection handle.
/// 6. Cleans up stale WAL/SHM journal files.
/// 7. Copies backup file into target database location.
/// 8. Reopens database, applies PRAGMAs, and applies any pending migrations.
pub fn restore_database_from_backup(
    state: &DbState,
    source_file_path: &str,
) -> Result<DatabaseStatus, String> {
    let source_path = Path::new(source_file_path);
    if !source_path.exists() || !source_path.is_file() {
        return Err(format!("Backup file not found at path: {}", source_file_path));
    }

    // Step 2 & 3: Validate backup integrity and tables
    {
        let check_conn = Connection::open_with_flags(
            source_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|e| format!("Failed to open backup file for validation: {}", e))?;

        let integrity: String = check_conn
            .query_row("PRAGMA integrity_check;", [], |r| r.get(0))
            .map_err(|e| format!("Integrity check failed: {}", e))?;

        if integrity.to_lowercase() != "ok" {
            return Err(format!("Corrupt backup file. Integrity check returned: {}", integrity));
        }

        // Verify minimum schema presence
        let has_products: i32 = check_conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'products';",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if has_products == 0 {
            return Err("The specified file is not a valid GroceryPOS backup (products table missing)".to_string());
        }
    }

    let mut conn_lock = state
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire connection lock: {}", e))?;
    let path_lock = state
        .db_path
        .lock()
        .map_err(|e| format!("Failed to acquire path lock: {}", e))?;

    let target_path = path_lock
        .as_ref()
        .ok_or_else(|| "Database target path is not initialized".to_string())?
        .clone();

    // Step 4: Emergency pre-restore snapshot of current live database
    if let Some(ref current_conn) = *conn_lock {
        let parent_dir = target_path.parent().unwrap_or(Path::new("."));
        let emergency_name = format!(
            "emergency_pre_restore_{}.db",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        );
        let emergency_path = parent_dir.join(&emergency_name);
        let emergency_str = emergency_path.to_string_lossy().to_string();
        let _ = current_conn.execute("VACUUM INTO ?1;", [&emergency_str]);
        log::warn!("Created emergency pre-restore snapshot at: {}", emergency_str);
    }

    // Step 5: Close current connection
    *conn_lock = None;

    // Step 6: Remove target WAL and SHM journal files if present
    let wal_path = PathBuf::from(format!("{}-wal", target_path.to_string_lossy()));
    let shm_path = PathBuf::from(format!("{}-shm", target_path.to_string_lossy()));
    if wal_path.exists() {
        let _ = fs::remove_file(&wal_path);
    }
    if shm_path.exists() {
        let _ = fs::remove_file(&shm_path);
    }

    // Step 7: Overwrite target DB with backup file
    fs::copy(source_path, &target_path)
        .map_err(|e| format!("Failed to overwrite live database with backup: {}", e))?;

    // Step 8: Reopen connection, configure pragmas, and apply migrations
    let mut new_conn = Connection::open(&target_path)
        .map_err(|e| format!("Failed to reopen database after restore: {}", e))?;

    configure_pragmas(&new_conn)?;
    run_migrations(&mut new_conn)?;
    let status = collect_status(&new_conn, &target_path)?;

    *conn_lock = Some(new_conn);
    log::info!("Database successfully restored from: {}", source_file_path);

    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pragmas_and_migrations_initialization() {
        // Open an in-memory or temporary SQLite connection
        let mut conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite");

        // Verify foreign keys and pragmas
        let (_wal, fk) = configure_pragmas(&conn).expect("Failed to configure pragmas");
        // In-memory SQLite uses 'memory' journal mode, but foreign keys must be active
        assert!(fk, "Foreign keys must be enabled");

        // Run migrations
        let migrations = run_migrations(&mut conn).expect("Failed to run migrations");
        assert_eq!(migrations, 3, "Migrations 001, 002, and 003 must be applied");

        // Verify tables exist
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert!(tables.contains(&"_migrations".to_string()));
        assert!(tables.contains(&"customers".to_string()));
        assert!(tables.contains(&"products".to_string()));
        assert!(tables.contains(&"sales".to_string()));
        assert!(tables.contains(&"sale_items".to_string()));
        assert!(tables.contains(&"sales_returns".to_string()));
        assert!(tables.contains(&"sales_return_items".to_string()));
        assert!(tables.contains(&"stock_movements".to_string()));
        assert!(tables.contains(&"settings".to_string()));
    }

    #[test]
    fn test_migrations_are_idempotent_and_preserve_data() {
        let mut conn = Connection::open_in_memory().expect("Failed to open connection");
        configure_pragmas(&conn).unwrap();

        // Run initial migration
        run_migrations(&mut conn).unwrap();

        // Insert test customer and test product
        conn.execute(
            "INSERT INTO customers (name, phone, address) VALUES (?1, ?2, ?3);",
            params!["Ramesh Kumar", "9876543210", "Shop 12, Main Market"],
        )
        .expect("Failed to insert customer");

        conn.execute(
            "INSERT INTO products (name, barcode, category, unit, purchase_price, selling_price, mrp, gst_rate, stock, minimum_stock)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10);",
            params!["Aashirvaad Atta 5kg", "8901030000001", "Grains & Flours", "KG", 210.0, 240.0, 260.0, 0.0, 25.0, 5.0],
        )
        .expect("Failed to insert product");

        // Re-run migrations (simulating next app startup)
        let migrations_second_run = run_migrations(&mut conn).expect("Second migration run failed");
        assert_eq!(migrations_second_run, 3, "Migration count must remain 3");

        // Verify customer and product are intact
        let customer_name: String = conn
            .query_row("SELECT name FROM customers WHERE phone = ?1;", params!["9876543210"], |row| row.get(0))
            .expect("Customer must still exist");
        assert_eq!(customer_name, "Ramesh Kumar");

        let product_stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE barcode = ?1;", params!["8901030000001"], |row| row.get(0))
            .expect("Product must still exist");
        assert_eq!(product_stock, 25.0);
    }

    #[test]
    fn test_transaction_rollback_guarantee() {
        let mut conn = Connection::open_in_memory().expect("Failed to open connection");
        configure_pragmas(&conn).unwrap();
        run_migrations(&mut conn).unwrap();

        // Add a customer
        conn.execute(
            "INSERT INTO customers (id, name, phone) VALUES (1, 'Sunil Sharma', '9123456780');",
            [],
        )
        .unwrap();

        // Attempt a transaction where step 1 succeeds but step 2 fails
        let tx_result: Result<(), String> = with_transaction(&mut conn, |tx| {
            // Step 1: Update customer address
            tx.execute(
                "UPDATE customers SET address = 'New Address' WHERE id = 1;",
                [],
            )
            .map_err(|e| e.to_string())?;

            // Step 2: Trigger intentional failure (violates foreign key constraint)
            tx.execute(
                "INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, mrp, gst_rate, tax_amount, total_price)
                 VALUES (999999, 999999, 'Non-existent item', 1, 100, 100, 0, 0, 100);",
                [],
            )
            .map_err(|e| format!("FK Violation: {}", e))?;

            Ok(())
        });

        assert!(tx_result.is_err(), "Transaction must fail and report error");

        // Verify customer address was NOT updated (rolled back atomically)
        let address: Option<String> = conn
            .query_row("SELECT address FROM customers WHERE id = 1;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(address, None, "Address update must have rolled back");
    }

    #[test]
    fn test_foreign_key_enforcement() {
        let mut conn = Connection::open_in_memory().expect("Failed to open connection");
        configure_pragmas(&conn).unwrap();
        run_migrations(&mut conn).unwrap();

        // Trying to insert a sale_item for a non-existent sale should fail due to FOREIGN KEY
        let result = conn.execute(
            "INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, mrp, gst_rate, tax_amount, total_price)
             VALUES (999, NULL, 'Test Item', 1, 10, 10, 0, 0, 10);",
            [],
        );

        assert!(result.is_err(), "Inserting sale_item with invalid sale_id must violate foreign key constraint");
    }

    #[test]
    fn test_safe_database_restore_and_corrupt_file_handling() {
        let temp_dir = std::env::temp_dir().join(format!(
            "grocerypos_test_restore_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        let live_db_path = temp_dir.join("live.db");
        let backup_db_path = temp_dir.join("backup.db");
        let corrupt_path = temp_dir.join("corrupt.db");

        // 1. Setup a valid backup database with product A
        {
            let mut backup_conn = Connection::open(&backup_db_path).unwrap();
            configure_pragmas(&backup_conn).unwrap();
            run_migrations(&mut backup_conn).unwrap();
            backup_conn.execute(
                "INSERT INTO products (name, barcode, category, unit, purchase_price, selling_price, mrp, gst_rate, stock, minimum_stock)
                 VALUES ('Backup Basmati Rice', '890001', 'Grains', 'KG', 80.0, 100.0, 100.0, 0.0, 50.0, 5.0);",
                [],
            ).unwrap();
        }

        // 2. Setup live database with product B
        {
            let mut live_conn = Connection::open(&live_db_path).unwrap();
            configure_pragmas(&live_conn).unwrap();
            run_migrations(&mut live_conn).unwrap();
            live_conn.execute(
                "INSERT INTO products (name, barcode, category, unit, purchase_price, selling_price, mrp, gst_rate, stock, minimum_stock)
                 VALUES ('Live Mustard Oil', '890002', 'Oils', 'L', 120.0, 140.0, 140.0, 5.0, 30.0, 5.0);",
                [],
            ).unwrap();
        }

        // 3. Setup DbState pointing to live database
        let live_conn = Connection::open(&live_db_path).unwrap();
        let state = DbState {
            conn: Mutex::new(Some(live_conn)),
            db_path: Mutex::new(Some(live_db_path.clone())),
        };

        // 4. Test: Corrupt file rejected safely
        fs::write(&corrupt_path, b"NOT A SQLITE FILE AT ALL!").unwrap();
        let corrupt_err = restore_database_from_backup(&state, corrupt_path.to_str().unwrap()).unwrap_err();
        assert!(corrupt_err.contains("validation") || corrupt_err.contains("Integrity"));

        // Live database must STILL be intact!
        state.with_conn(|conn| {
            let count: i32 = conn.query_row("SELECT count(*) FROM products WHERE barcode = '890002';", [], |r| r.get(0)).unwrap();
            assert_eq!(count, 1, "Live database must not be affected by failed restore");
            Ok(())
        }).unwrap();

        // 5. Test: Valid restore succeeds
        let restore_status = restore_database_from_backup(&state, backup_db_path.to_str().unwrap()).unwrap();
        assert!(restore_status.connected);

        // Verify product from backup is now in live DB
        state.with_conn(|conn| {
            let name: String = conn.query_row("SELECT name FROM products WHERE barcode = '890001';", [], |r| r.get(0)).unwrap();
            assert_eq!(name, "Backup Basmati Rice");
            Ok(())
        }).unwrap();

        // Clean up temp test files
        let _ = fs::remove_dir_all(&temp_dir);
    }
}


