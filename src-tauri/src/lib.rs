mod billing;
mod customers;
mod db;
pub mod inventory;
mod products;
pub mod returns;
mod settings;

use billing::{CreateSaleInput, PaginatedSalesResult, SaleRecord, SaleResult, SalesFilterParams};
use customers::{CreateCustomerInput, Customer, CustomerSearchParams, UpdateCustomerInput};
use db::DbState;
use inventory::{
    PaginatedStockMovements, StockAdjustmentInput, StockConsistencyReport, StockFilterParams,
    StockMovement,
};
use products::{CreateProductInput, Product, ProductFilterParams, UpdateProductInput};
use returns::{
    CreateReturnInput, PaginatedReturnsResult, ReturnableItemInfo, ReturnsFilterParams,
    SalesReturnResult,
};
use serde::{Deserialize, Serialize};
use settings::ShopProfile;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub app_name: String,
    pub version: String,
    pub os: String,
    pub arch: String,
    pub status: String,
}

/// A simple system health check command to verify IPC bridge
/// between the React frontend and Tauri native runtime.
#[tauri::command]
fn get_system_info() -> SystemInfo {
    SystemInfo {
        app_name: "Grocery POS".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        status: "Active & Connected (Offline Desktop Runtime)".to_string(),
    }
}

/// Native command to initialize the local SQLite database, run pending migrations,
/// and return structured status information. Safe to call repeatedly.
#[tauri::command]
fn initialize_database(
    app_handle: AppHandle,
    state: State<'_, DbState>,
) -> Result<db::DatabaseStatus, String> {
    db::init_db(&app_handle, &state)
}

/// Native command to query the current status and health of the SQLite database.
#[tauri::command]
fn get_database_status(state: State<'_, DbState>) -> Result<db::DatabaseStatus, String> {
    db::get_status(&state)
}

// ==========================================
// Product Commands
// ==========================================

/// Native command to insert a new product into the catalog
#[tauri::command]
fn create_product(
    state: State<'_, DbState>,
    input: CreateProductInput,
) -> Result<Product, String> {
    state.with_conn(|conn| products::create_product_db(conn, input))
}

/// Native command to fetch products with optional filters
#[tauri::command]
fn get_products(
    state: State<'_, DbState>,
    filter: Option<ProductFilterParams>,
) -> Result<Vec<Product>, String> {
    state.with_conn(|conn| products::get_products_db(conn, filter))
}

/// Native command to fetch a single product by ID
#[tauri::command]
fn get_product(state: State<'_, DbState>, id: i64) -> Result<Product, String> {
    state.with_conn(|conn| products::get_product_db(conn, id))
}

/// Native command to update an existing product
#[tauri::command]
fn update_product(
    state: State<'_, DbState>,
    input: UpdateProductInput,
) -> Result<Product, String> {
    state.with_conn(|conn| products::update_product_db(conn, input))
}

/// Native command to delete a product by ID (safeguarded by foreign keys)
#[tauri::command]
fn delete_product(state: State<'_, DbState>, id: i64) -> Result<bool, String> {
    state.with_conn(|conn| products::delete_product_db(conn, id))
}

/// Native command to fast-search products by name or barcode
#[tauri::command]
fn search_products(state: State<'_, DbState>, query: String) -> Result<Vec<Product>, String> {
    state.with_conn(|conn| products::search_products_db(conn, query))
}

// ==========================================
// Customer Commands
// ==========================================

/// Native command to insert a new customer record
#[tauri::command]
fn create_customer(
    state: State<'_, DbState>,
    input: CreateCustomerInput,
) -> Result<Customer, String> {
    state.with_conn(|conn| customers::create_customer_db(conn, input))
}

/// Native command to retrieve customers with optional search filter
#[tauri::command]
fn get_customers(
    state: State<'_, DbState>,
    search: Option<CustomerSearchParams>,
) -> Result<Vec<Customer>, String> {
    state.with_conn(|conn| customers::get_customers_db(conn, search))
}

/// Native command to fetch a single customer by primary key ID
#[tauri::command]
fn get_customer(state: State<'_, DbState>, id: i64) -> Result<Customer, String> {
    state.with_conn(|conn| customers::get_customer_db(conn, id))
}

/// Native command to update an existing customer's details
#[tauri::command]
fn update_customer(
    state: State<'_, DbState>,
    input: UpdateCustomerInput,
) -> Result<Customer, String> {
    state.with_conn(|conn| customers::update_customer_db(conn, input))
}

/// Native command to delete a customer safely (blocked if sales history exists)
#[tauri::command]
fn delete_customer(state: State<'_, DbState>, id: i64) -> Result<bool, String> {
    state.with_conn(|conn| customers::delete_customer_db(conn, id))
}

/// Native command to fast-search customers by name or phone
#[tauri::command]
fn search_customers(state: State<'_, DbState>, query: String) -> Result<Vec<Customer>, String> {
    state.with_conn(|conn| customers::search_customers_db(conn, query))
}

// ==========================================
// Billing & POS Commands
// ==========================================

/// Native command to complete an atomic retail sale
#[tauri::command]
fn complete_sale(
    state: State<'_, DbState>,
    input: CreateSaleInput,
) -> Result<SaleResult, String> {
    state.with_conn(|conn| billing::complete_sale_db(conn, input))
}

/// Native command to fetch a sale with line items by invoice number
#[tauri::command]
fn get_sale_by_invoice(
    state: State<'_, DbState>,
    invoice_number: String,
) -> Result<SaleResult, String> {
    state.with_conn(|conn| billing::get_sale_by_invoice_db(conn, &invoice_number))
}

/// Native command to fetch recent sales for counter history/reprinting
#[tauri::command]
fn get_recent_sales(
    state: State<'_, DbState>,
    limit: Option<i64>,
) -> Result<Vec<SaleRecord>, String> {
    state.with_conn(|conn| billing::get_recent_sales_db(conn, limit.unwrap_or(10)))
}

/// Native command to retrieve sales history with search, filtering, sorting, and pagination
#[tauri::command]
fn get_sales_history(
    state: State<'_, DbState>,
    filter: Option<SalesFilterParams>,
) -> Result<PaginatedSalesResult, String> {
    state.with_conn(|conn| billing::get_sales_history_db(conn, filter.unwrap_or_default()))
}

/// Native command to fetch a sale with line items by internal ID
#[tauri::command]
fn get_sale_by_id(
    state: State<'_, DbState>,
    id: i64,
) -> Result<SaleResult, String> {
    state.with_conn(|conn| billing::get_sale_by_id_db(conn, id))
}

// ==========================================
// Settings & Shop Profile Commands
// ==========================================

/// Native command to load shop business profile
#[tauri::command]
fn get_shop_profile(state: State<'_, DbState>) -> Result<ShopProfile, String> {
    state.with_conn(|conn| settings::get_shop_profile_db(conn))
}

/// Native command to update shop business profile
#[tauri::command]
fn save_shop_profile(
    state: State<'_, DbState>,
    profile: ShopProfile,
) -> Result<ShopProfile, String> {
    state.with_conn(|conn| settings::save_shop_profile_db(conn, profile))
}

// ==========================================
// Returns & Refunds Commands
// ==========================================

/// Native command to fetch returnable items for an invoice
#[tauri::command]
fn get_returnable_items(
    state: State<'_, DbState>,
    sale_id: i64,
) -> Result<Vec<ReturnableItemInfo>, String> {
    state.with_conn(|conn| returns::get_returnable_items_db(conn, sale_id))
}

/// Native command to process a sales return and refund atomically
#[tauri::command]
fn create_return(
    state: State<'_, DbState>,
    input: CreateReturnInput,
) -> Result<SalesReturnResult, String> {
    state.with_conn(|conn| returns::create_return_db(conn, input))
}

/// Native command to retrieve sales return history with filters and pagination
#[tauri::command]
fn get_returns_history(
    state: State<'_, DbState>,
    filter: Option<ReturnsFilterParams>,
) -> Result<PaginatedReturnsResult, String> {
    state.with_conn(|conn| returns::get_returns_history_db(conn, filter.unwrap_or_default()))
}

/// Native command to fetch a return record by return number
#[tauri::command]
fn get_return_by_number(
    state: State<'_, DbState>,
    return_number: String,
) -> Result<SalesReturnResult, String> {
    state.with_conn(|conn| returns::get_return_by_number_db(conn, &return_number))
}

// ==========================================
// Stock Ledger & Inventory Commands
// ==========================================

/// Native command to execute a manual stock adjustment
#[tauri::command]
fn create_stock_adjustment(
    state: State<'_, DbState>,
    input: StockAdjustmentInput,
) -> Result<StockMovement, String> {
    state.with_conn(|conn| inventory::create_stock_adjustment_db(conn, input))
}

/// Native command to retrieve stock ledger audit trail
#[tauri::command]
fn get_stock_ledger(
    state: State<'_, DbState>,
    filter: Option<StockFilterParams>,
) -> Result<PaginatedStockMovements, String> {
    state.with_conn(|conn| inventory::get_stock_ledger_db(conn, filter.unwrap_or_default()))
}

/// Native command to verify stock consistency against ledger
#[tauri::command]
fn check_stock_consistency(
    state: State<'_, DbState>,
    product_id: i64,
) -> Result<StockConsistencyReport, String> {
    state.with_conn(|conn| inventory::check_stock_consistency_db(conn, product_id))
}

// ==========================================
// Database Maintenance & Backup Commands
// ==========================================

/// Native command to create a crash-resilient online SQLite backup snapshot
#[tauri::command]
fn export_database_backup(
    app_handle: AppHandle,
    state: State<'_, DbState>,
    destination_path: Option<String>,
) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    state.with_conn(|conn| {
        let backup_dir = match destination_path {
            Some(ref p) => std::path::PathBuf::from(p),
            None => app_data_dir.join("backups"),
        };

        if !backup_dir.exists() {
            std::fs::create_dir_all(&backup_dir)
                .map_err(|e| format!("Failed to create backup directory: {}", e))?;
        }

        let timestamp: String = conn
            .query_row(
                "SELECT strftime('%Y%m%d_%H%M%S', 'now', 'localtime');",
                [],
                |r| r.get(0),
            )
            .unwrap_or_else(|_| "snapshot".to_string());

        let target_file = backup_dir.join(format!("grocerypos_backup_{}.db", timestamp));
        let target_str = target_file.to_string_lossy().to_string();

        conn.execute("VACUUM INTO ?1;", [&target_str])
            .map_err(|e| format!("Failed to perform SQLite vacuum backup: {}", e))?;

        Ok(target_str)
    })
}

/// Native command to safely restore database from a verified SQLite backup snapshot
#[tauri::command]
fn restore_database_backup(
    state: State<'_, DbState>,
    source_file_path: String,
) -> Result<db::DatabaseStatus, String> {
    db::restore_database_from_backup(&state, &source_file_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DbState::new())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Automatically initialize the database and run pending migrations on startup
            let state = app.state::<DbState>();
            if let Err(e) = db::init_db(app.handle(), &state) {
                log::error!("Failed to initialize database on startup: {}", e);
            } else {
                log::info!("Database successfully initialized on startup");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            initialize_database,
            get_database_status,
            create_product,
            get_products,
            get_product,
            update_product,
            delete_product,
            search_products,
            create_customer,
            get_customers,
            get_customer,
            update_customer,
            delete_customer,
            search_customers,
            complete_sale,
            get_sale_by_invoice,
            get_sale_by_id,
            get_recent_sales,
            get_sales_history,
            get_shop_profile,
            save_shop_profile,
            get_returnable_items,
            create_return,
            get_returns_history,
            get_return_by_number,
            create_stock_adjustment,
            get_stock_ledger,
            check_stock_consistency,
            export_database_backup,
            restore_database_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
