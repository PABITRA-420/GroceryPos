use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// Strongly-typed Product model matching the SQLite `products` schema
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Product {
    pub id: i64,
    pub name: String,
    pub barcode: Option<String>,
    pub category: String,
    pub unit: String,
    pub purchase_price: f64,
    pub selling_price: f64,
    pub mrp: f64,
    pub gst_rate: f64,
    pub stock: f64,
    pub minimum_stock: f64,
    pub created_at: String,
    pub updated_at: String,
    pub hsn_code: Option<String>,
    pub expiry_date: Option<String>,
    pub batch_number: Option<String>,
}

/// Input payload for creating a new product
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CreateProductInput {
    pub name: String,
    pub barcode: Option<String>,
    pub category: Option<String>,
    pub unit: String,
    pub purchase_price: Option<f64>,
    pub selling_price: f64,
    pub mrp: Option<f64>,
    pub gst_rate: Option<f64>,
    pub stock: Option<f64>,
    pub minimum_stock: Option<f64>,
    pub hsn_code: Option<String>,
    pub expiry_date: Option<String>,
    pub batch_number: Option<String>,
}

/// Input payload for updating an existing product
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpdateProductInput {
    pub id: i64,
    pub name: String,
    pub barcode: Option<String>,
    pub category: Option<String>,
    pub unit: String,
    pub purchase_price: Option<f64>,
    pub selling_price: f64,
    pub mrp: Option<f64>,
    pub gst_rate: Option<f64>,
    pub stock: Option<f64>,
    pub minimum_stock: Option<f64>,
    pub hsn_code: Option<String>,
    pub expiry_date: Option<String>,
    pub batch_number: Option<String>,
}

/// Search and filter parameters for product queries
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProductFilterParams {
    pub search: Option<String>,
    pub category: Option<String>,
    pub low_stock_only: Option<bool>,
    pub out_of_stock_only: Option<bool>,
}

/// Input payload for bulk importing products via CSV / Excel
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BulkImportProductInput {
    pub name: String,
    pub barcode: Option<String>,
    pub category: Option<String>,
    pub unit: String,
    pub purchase_price: Option<f64>,
    pub selling_price: f64,
    pub mrp: Option<f64>,
    pub gst_rate: Option<f64>,
    pub stock: Option<f64>,
    pub minimum_stock: Option<f64>,
    pub hsn_code: Option<String>,
    pub expiry_date: Option<String>,
    pub batch_number: Option<String>,
}

/// Options configuring bulk catalog import
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulkImportOptions {
    pub update_existing_barcodes: bool,
}

/// Summary result of a bulk product import operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulkImportSummary {
    pub total: usize,
    pub inserted: usize,
    pub updated: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

/// Trims and sanitizes barcode strings, converting empty or whitespace-only inputs to `None`.
/// This ensures multiple products without barcodes can exist without triggering SQLite UNIQUE collisions.
pub fn sanitize_barcode(barcode: Option<String>) -> Option<String> {
    match barcode {
        Some(b) => {
            let trimmed = b.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        None => None,
    }
}

/// Validates product input fields before writing to SQLite.
pub fn validate_product_data(
    name: &str,
    unit: &str,
    purchase_price: f64,
    selling_price: f64,
    mrp: f64,
    gst_rate: f64,
    stock: f64,
    minimum_stock: f64,
) -> Result<(), String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Product name is required and cannot be blank.".to_string());
    }
    if unit.trim().is_empty() {
        return Err("Product unit is required.".to_string());
    }
    if purchase_price < 0.0 || purchase_price.is_nan() || purchase_price.is_infinite() {
        return Err("Purchase price must be a valid positive number or 0.".to_string());
    }
    if selling_price < 0.0 || selling_price.is_nan() || selling_price.is_infinite() {
        return Err("Selling price must be a valid positive number or 0.".to_string());
    }
    if mrp < 0.0 || mrp.is_nan() || mrp.is_infinite() {
        return Err("MRP must be a valid positive number or 0.".to_string());
    }
    if mrp > 0.0 && selling_price > mrp {
        return Err(format!(
            "Selling price (₹{:.2}) cannot exceed MRP (₹{:.2}) under Indian Retail Legal Metrology rules.",
            selling_price, mrp
        ));
    }
    if gst_rate < 0.0 || gst_rate > 100.0 || gst_rate.is_nan() || gst_rate.is_infinite() {
        return Err("GST rate must be a valid percentage between 0% and 100%.".to_string());
    }
    if stock < 0.0 || stock.is_nan() || stock.is_infinite() {
        return Err("Stock must be a valid positive number or 0.".to_string());
    }
    if minimum_stock < 0.0 || minimum_stock.is_nan() || minimum_stock.is_infinite() {
        return Err("Minimum stock must be a valid positive number or 0.".to_string());
    }
    Ok(())
}

/// Translates raw SQLite error codes into clear, user-friendly messages for the shopkeeper.
pub fn map_sqlite_error(err: rusqlite::Error) -> String {
    let err_msg = err.to_string();
    if err_msg.contains("UNIQUE constraint failed: products.barcode") {
        "A product with this barcode already exists in the catalog.".to_string()
    } else if err_msg.contains("FOREIGN KEY constraint failed") {
        "This product cannot be deleted because it has sales history.".to_string()
    } else {
        format!("Database error: {}", err_msg)
    }
}

/// Helper function to map a SQLite result row to a strongly-typed `Product` struct
fn map_row_to_product(row: &rusqlite::Row) -> rusqlite::Result<Product> {
    Ok(Product {
        id: row.get(0)?,
        name: row.get(1)?,
        barcode: row.get(2)?,
        category: row.get(3)?,
        unit: row.get(4)?,
        purchase_price: row.get(5)?,
        selling_price: row.get(6)?,
        mrp: row.get(7)?,
        gst_rate: row.get(8)?,
        stock: row.get(9)?,
        minimum_stock: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        hsn_code: row.get(13).ok(),
        expiry_date: row.get(14).ok(),
        batch_number: row.get(15).ok(),
    })
}

/// Inserts a new product into the database and returns the created record.
pub fn create_product_db(conn: &mut Connection, input: CreateProductInput) -> Result<Product, String> {
    let clean_name = input.name.trim().to_string();
    let clean_barcode = sanitize_barcode(input.barcode);
    let clean_hsn = sanitize_barcode(input.hsn_code);
    let clean_expiry = sanitize_barcode(input.expiry_date);
    let clean_batch = sanitize_barcode(input.batch_number);
    let clean_category = match input.category {
        Some(c) if !c.trim().is_empty() => c.trim().to_string(),
        _ => "General".to_string(),
    };
    let clean_unit = input.unit.trim().to_string();
    let purchase_price = input.purchase_price.unwrap_or(0.0);
    let selling_price = input.selling_price;
    let mrp = input.mrp.unwrap_or(selling_price);
    let gst_rate = input.gst_rate.unwrap_or(0.0);
    let stock = input.stock.unwrap_or(0.0);
    let minimum_stock = input.minimum_stock.unwrap_or(0.0);

    validate_product_data(
        &clean_name,
        &clean_unit,
        purchase_price,
        selling_price,
        mrp,
        gst_rate,
        stock,
        minimum_stock,
    )?;

    conn.execute(
        "INSERT INTO products (
            name, barcode, category, unit, purchase_price, selling_price, mrp, gst_rate, stock, minimum_stock, hsn_code, expiry_date, batch_number
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13);",
        params![
            clean_name,
            clean_barcode,
            clean_category,
            clean_unit,
            purchase_price,
            selling_price,
            mrp,
            gst_rate,
            stock,
            minimum_stock,
            clean_hsn,
            clean_expiry,
            clean_batch,
        ],
    )
    .map_err(map_sqlite_error)?;

    let new_id = conn.last_insert_rowid();

    // Record opening stock in ledger if initial stock > 0
    if stock > 0.0 {
        let _ = conn.execute(
            "INSERT INTO stock_movements (
                product_id, product_name, barcode, unit, movement_type,
                quantity, stock_before, stock_after, reference_type, reference_id,
                reason, notes, created_at
            ) VALUES (?1, ?2, ?3, ?4, 'OPENING_STOCK', ?5, 0.0, ?5, 'INITIAL', 'INITIAL', 'Initial stock on product creation', NULL, datetime('now', 'localtime'));",
            params![
                new_id,
                clean_name,
                clean_barcode,
                clean_unit,
                stock,
            ],
        );
    }

    get_product_db(conn, new_id)
}

/// Fetches a single product by its primary key ID.
pub fn get_product_db(conn: &Connection, id: i64) -> Result<Product, String> {
    conn.query_row(
        "SELECT id, name, barcode, category, unit, purchase_price, selling_price, mrp, gst_rate, stock, minimum_stock, created_at, updated_at, hsn_code, expiry_date, batch_number
         FROM products WHERE id = ?1;",
        params![id],
        map_row_to_product,
    )
    .optional()
    .map_err(map_sqlite_error)?
    .ok_or_else(|| format!("Product with ID {} was not found.", id))
}

/// Retrieves all products matching the specified search query, category, and stock filters.
pub fn get_products_db(
    conn: &Connection,
    filter: Option<ProductFilterParams>,
) -> Result<Vec<Product>, String> {
    let mut sql = "SELECT id, name, barcode, category, unit, purchase_price, selling_price, mrp, gst_rate, stock, minimum_stock, created_at, updated_at, hsn_code, expiry_date, batch_number FROM products WHERE 1=1".to_string();
    let mut param_values: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(ref f) = filter {
        if let Some(ref query) = f.search {
            let q = query.trim();
            if !q.is_empty() {
                let search_param = format!("%{}%", q);
                sql.push_str(" AND (name LIKE ? COLLATE NOCASE OR barcode LIKE ? COLLATE NOCASE OR hsn_code LIKE ? COLLATE NOCASE OR batch_number LIKE ? COLLATE NOCASE)");
                param_values.push(search_param.clone().into());
                param_values.push(search_param.clone().into());
                param_values.push(search_param.clone().into());
                param_values.push(search_param.into());
            }
        }

        if let Some(ref cat) = f.category {
            let c = cat.trim();
            if !c.is_empty() && c.to_lowercase() != "all" {
                sql.push_str(" AND category = ? COLLATE NOCASE");
                param_values.push(c.to_string().into());
            }
        }

        if let Some(true) = f.out_of_stock_only {
            sql.push_str(" AND stock <= 0");
        } else if let Some(true) = f.low_stock_only {
            sql.push_str(" AND stock <= minimum_stock AND stock > 0");
        }
    }

    sql.push_str(" ORDER BY name COLLATE NOCASE ASC;");

    let mut stmt = conn.prepare(&sql).map_err(map_sqlite_error)?;
    let params_slice: Vec<&dyn rusqlite::ToSql> = param_values
        .iter()
        .map(|v| v as &dyn rusqlite::ToSql)
        .collect();

    let product_iter = stmt
        .query_map(params_slice.as_slice(), map_row_to_product)
        .map_err(map_sqlite_error)?;

    let mut products = Vec::new();
    for p in product_iter {
        products.push(p.map_err(map_sqlite_error)?);
    }

    Ok(products)
}

/// Updates an existing product while preserving existing stock if not explicitly changed.
pub fn update_product_db(conn: &mut Connection, input: UpdateProductInput) -> Result<Product, String> {
    // 1. Fetch current product to check existence and preserve stock if omitted
    let current = get_product_db(conn, input.id)?;

    let clean_name = input.name.trim().to_string();
    let clean_barcode = sanitize_barcode(input.barcode);
    let clean_category = match input.category {
        Some(c) if !c.trim().is_empty() => c.trim().to_string(),
        _ => current.category,
    };
    let clean_unit = input.unit.trim().to_string();
    let purchase_price = input.purchase_price.unwrap_or(current.purchase_price);
    let selling_price = input.selling_price;
    let mrp = input.mrp.unwrap_or(current.mrp);
    let gst_rate = input.gst_rate.unwrap_or(current.gst_rate);
    // Explicit stock update or preserve existing stock count
    let stock = input.stock.unwrap_or(current.stock);
    let minimum_stock = input.minimum_stock.unwrap_or(current.minimum_stock);

    validate_product_data(
        &clean_name,
        &clean_unit,
        purchase_price,
        selling_price,
        mrp,
        gst_rate,
        stock,
        minimum_stock,
    )?;

    let clean_hsn = match input.hsn_code {
        Some(h) => sanitize_barcode(Some(h)),
        None => current.hsn_code,
    };

    let clean_expiry = match input.expiry_date {
        Some(e) => sanitize_barcode(Some(e)),
        None => current.expiry_date,
    };

    let clean_batch = match input.batch_number {
        Some(b) => sanitize_barcode(Some(b)),
        None => current.batch_number,
    };

    conn.execute(
        "UPDATE products SET
            name = ?1,
            barcode = ?2,
            category = ?3,
            unit = ?4,
            purchase_price = ?5,
            selling_price = ?6,
            mrp = ?7,
            gst_rate = ?8,
            stock = ?9,
            minimum_stock = ?10,
            hsn_code = ?11,
            expiry_date = ?12,
            batch_number = ?13,
            updated_at = datetime('now', 'localtime')
         WHERE id = ?14;",
        params![
            clean_name,
            clean_barcode,
            clean_category,
            clean_unit,
            purchase_price,
            selling_price,
            mrp,
            gst_rate,
            stock,
            minimum_stock,
            clean_hsn,
            clean_expiry,
            clean_batch,
            input.id,
        ],
    )
    .map_err(map_sqlite_error)?;

    get_product_db(conn, input.id)
}

/// Deletes a product by ID.
/// Returns error if deletion is blocked by SQLite foreign key enforcement (e.g. sales history).
pub fn delete_product_db(conn: &mut Connection, id: i64) -> Result<bool, String> {
    // Check if product has sales history
    let sales_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sale_items WHERE product_id = ?1;",
            params![id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if sales_count > 0 {
        return Err("This product cannot be deleted because it has sales history.".to_string());
    }

    // Clean up stock movements if any (e.g. initial OPENING_STOCK) so unsellable draft product can be deleted
    let _ = conn.execute("DELETE FROM stock_movements WHERE product_id = ?1;", params![id]);

    let rows_affected = conn
        .execute("DELETE FROM products WHERE id = ?1;", params![id])
        .map_err(map_sqlite_error)?;

    if rows_affected == 0 {
        return Err(format!("Product with ID {} was not found.", id));
    }

    Ok(true)
}

/// Dedicated fast search by name, barcode, HSN, or batch number.
pub fn search_products_db(conn: &Connection, query: String) -> Result<Vec<Product>, String> {
    let q = query.trim();
    if q.is_empty() {
        return get_products_db(conn, None);
    }

    let search_param = format!("%{}%", q);
    let mut stmt = conn
        .prepare(
            "SELECT id, name, barcode, category, unit, purchase_price, selling_price, mrp, gst_rate, stock, minimum_stock, created_at, updated_at, hsn_code, expiry_date, batch_number
             FROM products
             WHERE name LIKE ?1 COLLATE NOCASE OR barcode LIKE ?2 COLLATE NOCASE OR hsn_code LIKE ?3 COLLATE NOCASE OR batch_number LIKE ?4 COLLATE NOCASE
             ORDER BY name COLLATE NOCASE ASC
             LIMIT 50;",
        )
        .map_err(map_sqlite_error)?;

    let product_iter = stmt
        .query_map(params![search_param, search_param, search_param, search_param], map_row_to_product)
        .map_err(map_sqlite_error)?;

    let mut products = Vec::new();
    for p in product_iter {
        products.push(p.map_err(map_sqlite_error)?);
    }

    Ok(products)
}

/// Atomically imports a batch of products from CSV / Excel.
/// Handles validation, duplicate barcodes (skip or update), and stock ledger tracking.
pub fn bulk_import_products_db(
    conn: &mut Connection,
    products: Vec<BulkImportProductInput>,
    options: BulkImportOptions,
) -> Result<BulkImportSummary, String> {
    let mut inserted = 0;
    let mut updated = 0;
    let mut skipped = 0;
    let mut errors = Vec::new();
    let total = products.len();

    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;

    for (idx, p) in products.into_iter().enumerate() {
        let row_num = idx + 1;
        let clean_name = p.name.trim().to_string();
        if clean_name.is_empty() {
            errors.push(format!("Row {}: Product name is required and cannot be blank.", row_num));
            continue;
        }

        let clean_unit = if p.unit.trim().is_empty() {
            "PCS".to_string()
        } else {
            p.unit.trim().to_string()
        };

        let purchase_price = p.purchase_price.unwrap_or(0.0).max(0.0);
        let selling_price = p.selling_price;
        let mrp = p.mrp.unwrap_or(selling_price);
        let gst_rate = p.gst_rate.unwrap_or(0.0).clamp(0.0, 100.0);
        let stock = p.stock.unwrap_or(0.0).max(0.0);
        let minimum_stock = p.minimum_stock.unwrap_or(0.0).max(0.0);
        let clean_barcode = sanitize_barcode(p.barcode);
        let clean_hsn = sanitize_barcode(p.hsn_code);
        let clean_expiry = sanitize_barcode(p.expiry_date);
        let clean_batch = sanitize_barcode(p.batch_number);
        let clean_category = match p.category {
            Some(c) if !c.trim().is_empty() => c.trim().to_string(),
            _ => "General".to_string(),
        };

        if selling_price < 0.0 {
            errors.push(format!("Row {}: Selling price cannot be negative.", row_num));
            continue;
        }

        if mrp > 0.0 && selling_price > mrp {
            errors.push(format!(
                "Row {}: Selling price (₹{:.2}) cannot exceed MRP (₹{:.2}) under Legal Metrology rules.",
                row_num, selling_price, mrp
            ));
            continue;
        }

        // Check if barcode already exists
        if let Some(ref bc) = clean_barcode {
            let existing_id: Option<(i64, f64)> = tx
                .query_row(
                    "SELECT id, stock FROM products WHERE barcode = ?1;",
                    params![bc],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|e| format!("Database error on row {}: {}", row_num, e))?;

            if let Some((prod_id, current_stock)) = existing_id {
                if options.update_existing_barcodes {
                    let new_stock = current_stock + stock;
                    let res = tx.execute(
                        "UPDATE products SET
                            name = ?1, category = ?2, unit = ?3, purchase_price = ?4,
                            selling_price = ?5, mrp = ?6, gst_rate = ?7,
                            stock = ?8, minimum_stock = ?9, hsn_code = ?10,
                            expiry_date = ?11, batch_number = ?12,
                            updated_at = datetime('now', 'localtime')
                         WHERE id = ?13;",
                        params![
                            clean_name,
                            clean_category,
                            clean_unit,
                            purchase_price,
                            selling_price,
                            mrp,
                            gst_rate,
                            new_stock,
                            minimum_stock,
                            clean_hsn,
                            clean_expiry,
                            clean_batch,
                            prod_id,
                        ],
                    );

                    match res {
                        Ok(_) => {
                            if stock > 0.0 {
                                let _ = tx.execute(
                                    "INSERT INTO stock_movements (
                                        product_id, product_name, barcode, unit, movement_type,
                                        quantity, stock_before, stock_after, reference_type, reference_id,
                                        reason, notes, created_at
                                    ) VALUES (?1, ?2, ?3, ?4, 'MANUAL_ADJUSTMENT', ?5, ?6, ?7, 'BULK_IMPORT', 'CSV', 'Bulk CSV import stock increment', NULL, datetime('now', 'localtime'));",
                                    params![
                                        prod_id,
                                        clean_name,
                                        clean_barcode,
                                        clean_unit,
                                        stock,
                                        current_stock,
                                        new_stock,
                                    ],
                                );
                            }
                            updated += 1;
                        }
                        Err(e) => {
                            errors.push(format!("Row {}: Update failed - {}", row_num, e));
                        }
                    }
                    continue;
                } else {
                    skipped += 1;
                    continue;
                }
            }
        }

        // Insert new product
        let insert_res = tx.execute(
            "INSERT INTO products (
                name, barcode, category, unit, purchase_price, selling_price, mrp, gst_rate, stock, minimum_stock, hsn_code, expiry_date, batch_number
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13);",
            params![
                clean_name,
                clean_barcode,
                clean_category,
                clean_unit,
                purchase_price,
                selling_price,
                mrp,
                gst_rate,
                stock,
                minimum_stock,
                clean_hsn,
                clean_expiry,
                clean_batch,
            ],
        );

        match insert_res {
            Ok(_) => {
                let new_id = tx.last_insert_rowid();
                if stock > 0.0 {
                    let _ = tx.execute(
                        "INSERT INTO stock_movements (
                            product_id, product_name, barcode, unit, movement_type,
                            quantity, stock_before, stock_after, reference_type, reference_id,
                            reason, notes, created_at
                        ) VALUES (?1, ?2, ?3, ?4, 'OPENING_STOCK', ?5, 0.0, ?5, 'INITIAL', 'CSV_IMPORT', 'Opening catalog stock from CSV import', NULL, datetime('now', 'localtime'));",
                        params![
                            new_id,
                            clean_name,
                            clean_barcode,
                            clean_unit,
                            stock,
                        ],
                    );
                }
                inserted += 1;
            }
            Err(e) => {
                errors.push(format!("Row {}: Insert failed - {}", row_num, e));
            }
        }
    }

    tx.commit().map_err(|e| format!("Failed to commit bulk import transaction: {}", e))?;

    Ok(BulkImportSummary {
        total,
        inserted,
        updated,
        skipped,
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("Failed to open in-memory db");
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../migrations/001_initial_schema.sql")).unwrap();
        conn.execute_batch(include_str!("../migrations/003_returns_and_stock_ledger.sql")).unwrap();
        conn.execute_batch(include_str!("../migrations/004_hsn_and_gstin.sql")).unwrap();
        conn.execute_batch(include_str!("../migrations/005_expiry_and_batch.sql")).unwrap();
        conn
    }

    #[test]
    fn test_create_and_get_product() {
        let mut conn = setup_test_db();
        let input = CreateProductInput {
            name: "Basmati Rice 1kg".to_string(),
            barcode: Some("8901234567890".to_string()),
            category: Some("Grains".to_string()),
            unit: "KG".to_string(),
            purchase_price: Some(80.0),
            selling_price: 110.0,
            mrp: Some(120.0),
            gst_rate: Some(0.0),
            stock: Some(40.0),
            minimum_stock: Some(10.0),
            hsn_code: Some("1006".to_string()),
            ..Default::default()
        };

        let product = create_product_db(&mut conn, input).expect("Failed to create product");
        assert_eq!(product.id, 1);
        assert_eq!(product.name, "Basmati Rice 1kg");
        assert_eq!(product.barcode, Some("8901234567890".to_string()));
        assert_eq!(product.selling_price, 110.0);
        assert_eq!(product.stock, 40.0);
        assert_eq!(product.hsn_code, Some("1006".to_string()));

        let fetched = get_product_db(&conn, product.id).expect("Failed to get product");
        assert_eq!(fetched, product);
    }

    #[test]
    fn test_validation_empty_name_and_negative_price() {
        let mut conn = setup_test_db();
        let empty_name_input = CreateProductInput {
            name: "   ".to_string(),
            barcode: None,
            category: None,
            unit: "PCS".to_string(),
            purchase_price: Some(10.0),
            selling_price: 15.0,
            mrp: None,
            gst_rate: None,
            stock: None,
            minimum_stock: None,
            hsn_code: None,
            ..Default::default()
        };
        let err = create_product_db(&mut conn, empty_name_input).unwrap_err();
        assert!(err.contains("Product name is required"));

        let negative_price_input = CreateProductInput {
            name: "Test Item".to_string(),
            barcode: None,
            category: None,
            unit: "PCS".to_string(),
            purchase_price: Some(-5.0),
            selling_price: 15.0,
            mrp: None,
            gst_rate: None,
            stock: None,
            minimum_stock: None,
            hsn_code: None,
            ..Default::default()
        };
        let err2 = create_product_db(&mut conn, negative_price_input).unwrap_err();
        assert!(err2.contains("Purchase price must be a valid positive number"));
    }

    #[test]
    fn test_duplicate_barcode_rejection() {
        let mut conn = setup_test_db();
        let item1 = CreateProductInput {
            name: "Product A".to_string(),
            barcode: Some("11223344".to_string()),
            category: None,
            unit: "PCS".to_string(),
            purchase_price: Some(10.0),
            selling_price: 20.0,
            mrp: None,
            gst_rate: None,
            stock: None,
            minimum_stock: None,
            hsn_code: None,
            ..Default::default()
        };
        create_product_db(&mut conn, item1).unwrap();

        let item2 = CreateProductInput {
            name: "Product B".to_string(),
            barcode: Some("11223344".to_string()),
            category: None,
            unit: "PCS".to_string(),
            purchase_price: Some(15.0),
            selling_price: 25.0,
            mrp: None,
            gst_rate: None,
            stock: None,
            minimum_stock: None,
            hsn_code: None,
            ..Default::default()
        };
        let err = create_product_db(&mut conn, item2).unwrap_err();
        assert!(err.contains("already exists"), "Duplicate barcode should be friendly: {}", err);
    }

    #[test]
    fn test_multiple_products_without_barcodes_allowed() {
        let mut conn = setup_test_db();
        let item1 = CreateProductInput {
            name: "Loose Sugar 1kg".to_string(),
            barcode: None,
            category: None,
            unit: "KG".to_string(),
            purchase_price: Some(38.0),
            selling_price: 44.0,
            mrp: None,
            gst_rate: None,
            stock: None,
            minimum_stock: None,
            hsn_code: None,
            ..Default::default()
        };
        let p1 = create_product_db(&mut conn, item1).unwrap();

        let item2 = CreateProductInput {
            name: "Loose Wheat 1kg".to_string(),
            barcode: Some("   ".to_string()), // whitespace only
            category: None,
            unit: "KG".to_string(),
            purchase_price: Some(25.0),
            selling_price: 32.0,
            mrp: None,
            gst_rate: None,
            stock: None,
            minimum_stock: None,
            hsn_code: None,
            ..Default::default()
        };
        let p2 = create_product_db(&mut conn, item2).unwrap();

        assert_eq!(p1.barcode, None);
        assert_eq!(p2.barcode, None);
        assert_ne!(p1.id, p2.id);
    }

    #[test]
    fn test_search_and_stock_filtering() {
        let mut conn = setup_test_db();
        create_product_db(&mut conn, CreateProductInput {
            name: "Tata Salt 1kg".to_string(),
            barcode: Some("8901058852220".to_string()),
            category: Some("Spices & Salt".to_string()),
            unit: "PCS".to_string(),
            purchase_price: Some(22.0),
            selling_price: 28.0,
            mrp: Some(30.0),
            gst_rate: Some(0.0),
            stock: Some(3.0),
            minimum_stock: Some(5.0), // Low stock
            hsn_code: Some("2501".to_string()),
            ..Default::default()
        }).unwrap();

        create_product_db(&mut conn, CreateProductInput {
            name: "Fortune Oil 1L".to_string(),
            barcode: Some("8906007281010".to_string()),
            category: Some("Oils".to_string()),
            unit: "Litre".to_string(),
            purchase_price: Some(130.0),
            selling_price: 155.0,
            mrp: Some(165.0),
            gst_rate: Some(5.0),
            stock: Some(0.0), // Out of stock
            minimum_stock: Some(10.0),
            hsn_code: Some("1512".to_string()),
            ..Default::default()
        }).unwrap();

        create_product_db(&mut conn, CreateProductInput {
            name: "Aashirvaad Atta 5kg".to_string(),
            barcode: Some("8901030000001".to_string()),
            category: Some("Grains".to_string()),
            unit: "KG".to_string(),
            purchase_price: Some(210.0),
            selling_price: 245.0,
            mrp: Some(260.0),
            gst_rate: Some(0.0),
            stock: Some(25.0), // In stock
            minimum_stock: Some(5.0),
            hsn_code: Some("1101".to_string()),
            ..Default::default()
        }).unwrap();

        // Search by name substring
        let search_salt = search_products_db(&conn, "salt".to_string()).unwrap();
        assert_eq!(search_salt.len(), 1);
        assert_eq!(search_salt[0].name, "Tata Salt 1kg");

        // Search by barcode substring
        let search_barcode = search_products_db(&conn, "7281010".to_string()).unwrap();
        assert_eq!(search_barcode.len(), 1);
        assert_eq!(search_barcode[0].name, "Fortune Oil 1L");

        // Search by HSN Code
        let search_hsn = search_products_db(&conn, "1101".to_string()).unwrap();
        assert_eq!(search_hsn.len(), 1);
        assert_eq!(search_hsn[0].name, "Aashirvaad Atta 5kg");

        // Filter: low stock only (stock <= minimum_stock AND stock > 0)
        let low_stock = get_products_db(&conn, Some(ProductFilterParams {
            low_stock_only: Some(true),
            ..Default::default()
        })).unwrap();
        assert_eq!(low_stock.len(), 1);
        assert_eq!(low_stock[0].name, "Tata Salt 1kg");

        // Filter: out of stock only (stock <= 0)
        let out_of_stock = get_products_db(&conn, Some(ProductFilterParams {
            out_of_stock_only: Some(true),
            ..Default::default()
        })).unwrap();
        assert_eq!(out_of_stock.len(), 1);
        assert_eq!(out_of_stock[0].name, "Fortune Oil 1L");
    }

    #[test]
    fn test_update_product_preserves_stock() {
        let mut conn = setup_test_db();
        let created = create_product_db(&mut conn, CreateProductInput {
            name: "Original Name".to_string(),
            barcode: None,
            category: Some("Category A".to_string()),
            unit: "PCS".to_string(),
            purchase_price: Some(50.0),
            selling_price: 70.0,
            mrp: Some(80.0),
            gst_rate: Some(18.0),
            stock: Some(33.0),
            minimum_stock: Some(5.0),
            hsn_code: None,
            ..Default::default()
        }).unwrap();

        // Update name and price without passing stock (None)
        let update_input = UpdateProductInput {
            id: created.id,
            name: "Updated Name".to_string(),
            barcode: Some("99887766".to_string()),
            category: None,
            unit: "PCS".to_string(),
            purchase_price: None,
            selling_price: 75.0,
            mrp: None,
            gst_rate: None,
            stock: None, // Stock not specified, must preserve 33.0
            minimum_stock: None,
            hsn_code: Some("1902".to_string()),
            ..Default::default()
        };

        let updated = update_product_db(&mut conn, update_input).unwrap();
        assert_eq!(updated.name, "Updated Name");
        assert_eq!(updated.selling_price, 75.0);
        assert_eq!(updated.stock, 33.0, "Stock must be preserved when omitted");
        assert_eq!(updated.barcode, Some("99887766".to_string()));
        assert_eq!(updated.hsn_code, Some("1902".to_string()));
    }

    #[test]
    fn test_delete_product_foreign_key_protection() {
        let mut conn = setup_test_db();
        let prod = create_product_db(&mut conn, CreateProductInput {
            name: "Maggi Noodles".to_string(),
            barcode: Some("8901058850001".to_string()),
            category: Some("Instant Food".to_string()),
            unit: "PCS".to_string(),
            purchase_price: Some(12.0),
            selling_price: 14.0,
            mrp: Some(14.0),
            gst_rate: Some(12.0),
            stock: Some(50.0),
            minimum_stock: Some(10.0),
            hsn_code: None,
            ..Default::default()
        }).unwrap();

        // 1. Delete when not referenced works
        let deleted = delete_product_db(&mut conn, prod.id).unwrap();
        assert!(deleted);

        // 2. Re-create product and link a sale_item to it
        let prod2 = create_product_db(&mut conn, CreateProductInput {
            name: "Maggi Noodles".to_string(),
            barcode: Some("8901058850001".to_string()),
            category: Some("Instant Food".to_string()),
            unit: "PCS".to_string(),
            purchase_price: Some(12.0),
            selling_price: 14.0,
            mrp: Some(14.0),
            gst_rate: Some(12.0),
            stock: Some(50.0),
            minimum_stock: Some(10.0),
            hsn_code: None,
            ..Default::default()
        }).unwrap();

        // Create a sale and a sale_item referencing prod2
        conn.execute(
            "INSERT INTO sales (invoice_number, subtotal, total_amount) VALUES ('INV-001', 14.0, 14.0);",
            [],
        ).unwrap();
        let sale_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, mrp, gst_rate, tax_amount, total_price, hsn_code)
             VALUES (?1, ?2, 'Maggi Noodles', 1, 14.0, 14.0, 12.0, 1.5, 14.0, NULL);",
            params![sale_id, prod2.id],
        ).unwrap();

        // 3. Attempting to delete prod2 must be rejected by foreign key constraint!
        let delete_err = delete_product_db(&mut conn, prod2.id).unwrap_err();
        assert!(delete_err.contains("sales history"), "Error was: {}", delete_err);
    }

    #[test]
    fn test_product_selling_price_cannot_exceed_mrp() {
        let mut conn = setup_test_db();

        let err = create_product_db(&mut conn, CreateProductInput {
            name: "Premium Basmati Rice 1kg".to_string(),
            barcode: Some("8901000111222".to_string()),
            category: Some("Grains".to_string()),
            unit: "KG".to_string(),
            purchase_price: Some(100.0),
            selling_price: 150.0,
            mrp: Some(130.0), // Selling price 150 > MRP 130!
            gst_rate: Some(0.0),
            stock: Some(20.0),
            minimum_stock: Some(5.0),
            hsn_code: None,
            ..Default::default()
        }).unwrap_err();

        assert!(
            err.contains("cannot exceed MRP"),
            "Error must report MRP violation under Legal Metrology: {}",
            err
        );
    }

    #[test]
    fn test_product_expiry_and_batch() {
        let mut conn = setup_test_db();

        let prod = create_product_db(&mut conn, CreateProductInput {
            name: "Amul Pasteurised Butter 500g".to_string(),
            barcode: Some("8901262010053".to_string()),
            category: Some("Dairy".to_string()),
            unit: "PCS".to_string(),
            purchase_price: Some(240.0),
            selling_price: 275.0,
            mrp: Some(275.0),
            gst_rate: Some(12.0),
            stock: Some(20.0),
            minimum_stock: Some(5.0),
            hsn_code: Some("0405".to_string()),
            expiry_date: Some("2026-10-31".to_string()),
            batch_number: Some("BATCH-AML-09".to_string()),
        }).unwrap();

        assert_eq!(prod.expiry_date, Some("2026-10-31".to_string()));
        assert_eq!(prod.batch_number, Some("BATCH-AML-09".to_string()));

        let fetched = get_product_db(&conn, prod.id).unwrap();
        assert_eq!(fetched.expiry_date, Some("2026-10-31".to_string()));
        assert_eq!(fetched.batch_number, Some("BATCH-AML-09".to_string()));
    }
}


