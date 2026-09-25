use crate::db::with_transaction;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// Ledger record representing an immutable inventory movement
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StockMovement {
    pub id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub barcode: Option<String>,
    pub unit: String,
    pub movement_type: String, // 'OPENING_STOCK' | 'SALE' | 'SALE_RETURN' | 'DAMAGE' | 'EXPIRED' | 'MANUAL_ADJUSTMENT' | 'PURCHASE'
    pub quantity: f64,         // positive for stock IN, negative for stock OUT
    pub stock_before: f64,
    pub stock_after: f64,
    pub reference_type: Option<String>,
    pub reference_id: Option<String>,
    pub reason: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

/// Input payload for manual merchant stock adjustments (Damage, Expired, Stock count correction)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockAdjustmentInput {
    pub product_id: i64,
    pub adjustment_type: String, // 'DAMAGE' | 'EXPIRED' | 'MANUAL_ADJUSTMENT' | 'OPENING_STOCK'
    pub quantity_change: f64,    // Negative for reduction (e.g. -5), positive for addition (e.g. +10)
    pub reason: String,
    pub notes: Option<String>,
}

/// Query parameters for filtering and paginating stock ledger movements
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StockFilterParams {
    pub product_id: Option<i64>,
    pub movement_type: Option<String>,
    pub search: Option<String>,
    pub date_preset: Option<String>, // 'all' | 'today' | 'last_7_days' | 'this_month' | 'custom'
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

/// Paginated result of stock movements
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PaginatedStockMovements {
    pub movements: Vec<StockMovement>,
    pub total_count: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}

/// Diagnostic report verifying consistency between products.stock and stock_movements ledger
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StockConsistencyReport {
    pub product_id: i64,
    pub product_name: String,
    pub current_stock: f64,
    pub ledger_derived_stock: Option<f64>,
    pub is_consistent: bool,
    pub total_movements_recorded: i64,
}

/// Helper function to record a stock movement record inside an active SQLite transaction.
/// Ensures atomicity between stock updates and ledger audit history.
pub fn record_stock_movement_tx(
    tx: &rusqlite::Transaction,
    product_id: i64,
    product_name: &str,
    barcode: Option<&str>,
    unit: &str,
    movement_type: &str,
    quantity: f64,
    stock_before: f64,
    stock_after: f64,
    reference_type: Option<&str>,
    reference_id: Option<&str>,
    reason: Option<&str>,
    notes: Option<&str>,
) -> Result<i64, String> {
    tx.execute(
        "INSERT INTO stock_movements (
            product_id, product_name, barcode, unit, movement_type,
            quantity, stock_before, stock_after, reference_type, reference_id,
            reason, notes, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now', 'localtime'));",
        params![
            product_id,
            product_name,
            barcode,
            unit,
            movement_type,
            quantity,
            stock_before,
            stock_after,
            reference_type,
            reference_id,
            reason,
            notes,
        ],
    )
    .map_err(|e| format!("Failed to record stock movement: {}", e))?;

    Ok(tx.last_insert_rowid())
}

/// Creates a manual stock adjustment atomically in SQLite.
/// Updates products.stock and creates an immutable stock_movements record in the same transaction.
pub fn create_stock_adjustment_db(
    conn: &mut Connection,
    input: StockAdjustmentInput,
) -> Result<StockMovement, String> {
    if input.quantity_change == 0.0 || input.quantity_change.is_nan() || input.quantity_change.is_infinite() {
        return Err("Adjustment quantity change cannot be zero or invalid.".to_string());
    }

    let clean_reason = input.reason.trim();
    if clean_reason.is_empty() {
        return Err("Adjustment reason is required.".to_string());
    }

    let m_type = match input.adjustment_type.trim().to_uppercase().as_str() {
        "DAMAGE" => "DAMAGE",
        "EXPIRED" => "EXPIRED",
        "OPENING_STOCK" => "OPENING_STOCK",
        _ => "MANUAL_ADJUSTMENT",
    };

    with_transaction(conn, |tx| {
        // 1. Fetch current product information
        let prod_info: Option<(String, Option<String>, String, f64)> = tx
            .query_row(
                "SELECT name, barcode, unit, stock FROM products WHERE id = ?1;",
                params![input.product_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()
            .map_err(|e| format!("Failed to query product: {}", e))?;

        let (p_name, p_barcode, p_unit, current_stock) = match prod_info {
            Some(info) => info,
            None => return Err(format!("Product with ID {} not found.", input.product_id)),
        };

        // 2. Negative stock protection
        let new_stock = ((current_stock + input.quantity_change) * 100.0).round() / 100.0;
        if new_stock < 0.0 {
            return Err(format!(
                "Insufficient stock for '{}'. Available stock: {:.2} {}, cannot reduce by {:.2}.",
                p_name,
                current_stock,
                p_unit,
                input.quantity_change.abs()
            ));
        }

        // 3. Update stock in products table
        tx.execute(
            "UPDATE products SET stock = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2;",
            params![new_stock, input.product_id],
        )
        .map_err(|e| format!("Failed to update product stock: {}", e))?;

        // 4. Record stock movement ledger entry
        let movement_id = record_stock_movement_tx(
            tx,
            input.product_id,
            &p_name,
            p_barcode.as_deref(),
            &p_unit,
            m_type,
            input.quantity_change,
            current_stock,
            new_stock,
            Some("ADJUSTMENT"),
            None,
            Some(clean_reason),
            input.notes.as_deref().map(str::trim),
        )?;

        // 5. Query inserted movement record
        let movement = tx
            .query_row(
                "SELECT id, product_id, product_name, barcode, unit, movement_type,
                        quantity, stock_before, stock_after, reference_type, reference_id,
                        reason, notes, created_at
                 FROM stock_movements WHERE id = ?1;",
                params![movement_id],
                |row| {
                    Ok(StockMovement {
                        id: row.get(0)?,
                        product_id: row.get(1)?,
                        product_name: row.get(2)?,
                        barcode: row.get(3)?,
                        unit: row.get(4)?,
                        movement_type: row.get(5)?,
                        quantity: row.get(6)?,
                        stock_before: row.get(7)?,
                        stock_after: row.get(8)?,
                        reference_type: row.get(9)?,
                        reference_id: row.get(10)?,
                        reason: row.get(11)?,
                        notes: row.get(12)?,
                        created_at: row.get(13)?,
                    })
                },
            )
            .map_err(|e| format!("Failed to load inserted stock movement: {}", e))?;

        Ok(movement)
    })
}

/// Retrieves stock ledger movements with server-side filtering and pagination
pub fn get_stock_ledger_db(
    conn: &Connection,
    filter: StockFilterParams,
) -> Result<PaginatedStockMovements, String> {
    let mut where_clauses = Vec::new();
    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(pid) = filter.product_id {
        where_clauses.push("product_id = ?".to_string());
        params_vec.push(pid.into());
    }

    if let Some(ref m_type) = filter.movement_type {
        let clean_type = m_type.trim();
        if !clean_type.is_empty() && !clean_type.eq_ignore_ascii_case("all") {
            where_clauses.push("movement_type = ? COLLATE NOCASE".to_string());
            params_vec.push(clean_type.to_uppercase().into());
        }
    }

    if let Some(ref q) = filter.search {
        let clean_q = q.trim();
        if !clean_q.is_empty() {
            let pattern = format!("%{}%", clean_q);
            where_clauses.push(
                "(product_name LIKE ? COLLATE NOCASE OR barcode LIKE ? COLLATE NOCASE OR reference_id LIKE ? COLLATE NOCASE)".to_string(),
            );
            params_vec.push(pattern.clone().into());
            params_vec.push(pattern.clone().into());
            params_vec.push(pattern.into());
        }
    }

    // Date filtering
    let preset = filter.date_preset.as_deref().map(str::trim).unwrap_or("all");
    match preset.to_lowercase().as_str() {
        "today" => {
            where_clauses.push("date(created_at) = date('now', 'localtime')".to_string());
        }
        "yesterday" => {
            where_clauses.push("date(created_at) = date('now', 'localtime', '-1 day')".to_string());
        }
        "last_7_days" => {
            where_clauses.push(
                "date(created_at) >= date('now', 'localtime', '-6 days') AND date(created_at) <= date('now', 'localtime')"
                    .to_string(),
            );
        }
        "this_month" => {
            where_clauses.push("strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')".to_string());
        }
        _ => {
            if let Some(ref s_date) = filter.start_date {
                let clean_s = s_date.trim();
                if !clean_s.is_empty() {
                    where_clauses.push("date(created_at) >= date(?)".to_string());
                    params_vec.push(clean_s.to_string().into());
                }
            }
            if let Some(ref e_date) = filter.end_date {
                let clean_e = e_date.trim();
                if !clean_e.is_empty() {
                    where_clauses.push("date(created_at) <= date(?)".to_string());
                    params_vec.push(clean_e.to_string().into());
                }
            }
        }
    }

    let where_sql = if where_clauses.is_empty() {
        "1=1".to_string()
    } else {
        where_clauses.join(" AND ")
    };

    let page = filter.page.unwrap_or(1).max(1);
    let page_size = filter.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let count_sql = format!("SELECT count(*) FROM stock_movements WHERE {};", where_sql);
    let count_params: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|v| v as &dyn rusqlite::ToSql)
        .collect();

    let total_count: i64 = conn
        .query_row(&count_sql, count_params.as_slice(), |row| row.get(0))
        .map_err(|e| format!("Failed to count stock movements: {}", e))?;

    let total_pages = if total_count == 0 {
        1
    } else {
        (total_count + page_size - 1) / page_size
    };

    if total_count == 0 {
        return Ok(PaginatedStockMovements {
            movements: Vec::new(),
            total_count: 0,
            page,
            page_size,
            total_pages: 1,
        });
    }

    let select_sql = format!(
        "SELECT id, product_id, product_name, barcode, unit, movement_type,
                quantity, stock_before, stock_after, reference_type, reference_id,
                reason, notes, created_at
         FROM stock_movements
         WHERE {}
         ORDER BY id DESC
         LIMIT ? OFFSET ?;",
        where_sql
    );

    let mut final_params = params_vec;
    final_params.push(page_size.into());
    final_params.push(offset.into());

    let final_params_refs: Vec<&dyn rusqlite::ToSql> = final_params
        .iter()
        .map(|v| v as &dyn rusqlite::ToSql)
        .collect();

    let mut stmt = conn
        .prepare(&select_sql)
        .map_err(|e| format!("Failed to prepare stock movements query: {}", e))?;

    let rows = stmt
        .query_map(final_params_refs.as_slice(), |row| {
            Ok(StockMovement {
                id: row.get(0)?,
                product_id: row.get(1)?,
                product_name: row.get(2)?,
                barcode: row.get(3)?,
                unit: row.get(4)?,
                movement_type: row.get(5)?,
                quantity: row.get(6)?,
                stock_before: row.get(7)?,
                stock_after: row.get(8)?,
                reference_type: row.get(9)?,
                reference_id: row.get(10)?,
                reason: row.get(11)?,
                notes: row.get(12)?,
                created_at: row.get(13)?,
            })
        })
        .map_err(|e| format!("Failed to query stock movements: {}", e))?;

    let mut movements = Vec::new();
    for row in rows {
        movements.push(row.map_err(|e| format!("Failed to read stock movement: {}", e))?);
    }

    Ok(PaginatedStockMovements {
        movements,
        total_count,
        page,
        page_size,
        total_pages,
    })
}

/// Consistency check between products.stock and the ledger movements
pub fn check_stock_consistency_db(
    conn: &Connection,
    product_id: i64,
) -> Result<StockConsistencyReport, String> {
    let prod: Option<(String, f64)> = conn
        .query_row(
            "SELECT name, stock FROM products WHERE id = ?1;",
            params![product_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("Database error checking product: {}", e))?;

    let (product_name, current_stock) = match prod {
        Some(p) => p,
        None => return Err(format!("Product with ID {} not found.", product_id)),
    };

    let movement_stats: (i64, Option<f64>) = conn
        .query_row(
            "SELECT count(*), sum(quantity) FROM stock_movements WHERE product_id = ?1;",
            params![product_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Database error querying movements: {}", e))?;

    let (count, net_change) = movement_stats;

    // If movements exist, check if the latest movement stock_after matches current_stock
    let latest_stock_after: Option<f64> = conn
        .query_row(
            "SELECT stock_after FROM stock_movements WHERE product_id = ?1 ORDER BY id DESC LIMIT 1;",
            params![product_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Database error fetching latest movement: {}", e))?;

    let is_consistent = match latest_stock_after {
        Some(after) => (after - current_stock).abs() < 0.001,
        None => true, // baseline product with no movements yet
    };

    Ok(StockConsistencyReport {
        product_id,
        product_name,
        current_stock,
        ledger_derived_stock: latest_stock_after.or(net_change),
        is_consistent,
        total_movements_recorded: count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("Failed to open test in-memory SQLite");
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../migrations/001_initial_schema.sql")).unwrap();
        conn.execute_batch(include_str!("../migrations/002_sales_indexes.sql")).unwrap();
        conn.execute_batch(include_str!("../migrations/003_returns_and_stock_ledger.sql")).unwrap();
        conn
    }

    #[test]
    fn test_stock_adjustment_negative_damage() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Milk 500ml', 30.0, 30.0, 0.0, 20.0, 'PKT');",
            [],
        )
        .unwrap();

        let input = StockAdjustmentInput {
            product_id: 1,
            adjustment_type: "DAMAGE".to_string(),
            quantity_change: -4.0,
            reason: "Leaked packet".to_string(),
            notes: Some("Damaged in crate".to_string()),
        };

        let result = create_stock_adjustment_db(&mut conn, input).expect("Adjustment should succeed");
        assert_eq!(result.stock_before, 20.0);
        assert_eq!(result.quantity, -4.0);
        assert_eq!(result.stock_after, 16.0);
        assert_eq!(result.movement_type, "DAMAGE");

        // Verify product stock in products table was updated to 16
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id = 1;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stock, 16.0);

        // Verify ledger consistency report
        let report = check_stock_consistency_db(&conn, 1).unwrap();
        assert!(report.is_consistent);
        assert_eq!(report.current_stock, 16.0);
        assert_eq!(report.total_movements_recorded, 1);
    }

    #[test]
    fn test_stock_adjustment_positive_correction() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Rice 1kg', 50.0, 50.0, 0.0, 10.0, 'KG');",
            [],
        )
        .unwrap();

        let input = StockAdjustmentInput {
            product_id: 1,
            adjustment_type: "MANUAL_ADJUSTMENT".to_string(),
            quantity_change: 5.0,
            reason: "Physical count found more".to_string(),
            notes: None,
        };

        let result = create_stock_adjustment_db(&mut conn, input).unwrap();
        assert_eq!(result.stock_before, 10.0);
        assert_eq!(result.stock_after, 15.0);

        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id = 1;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stock, 15.0);
    }

    #[test]
    fn test_negative_stock_prevention() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Eggs 6pk', 45.0, 45.0, 0.0, 3.0, 'PKT');",
            [],
        )
        .unwrap();

        let input = StockAdjustmentInput {
            product_id: 1,
            adjustment_type: "DAMAGE".to_string(),
            quantity_change: -5.0, // Exceeds current stock 3.0
            reason: "Broken".to_string(),
            notes: None,
        };

        let err = create_stock_adjustment_db(&mut conn, input).expect_err("Must reject negative stock");
        assert!(err.contains("Insufficient stock"), "Error: {}", err);

        // Verify stock is STILL 3.0
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id = 1;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stock, 3.0);

        // Verify no ledger entries were created
        let count: i64 = conn
            .query_row("SELECT count(*) FROM stock_movements WHERE product_id = 1;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_stock_ledger_pagination_and_filter() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, barcode, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Sugar 1kg', '8901111111111', 45.0, 45.0, 0.0, 100.0, 'KG');",
            [],
        )
        .unwrap();

        // Perform 5 adjustments
        for i in 1..=5 {
            create_stock_adjustment_db(&mut conn, StockAdjustmentInput {
                product_id: 1,
                adjustment_type: if i % 2 == 0 { "DAMAGE".to_string() } else { "MANUAL_ADJUSTMENT".to_string() },
                quantity_change: if i % 2 == 0 { -2.0 } else { 2.0 },
                reason: format!("Adjustment reason {}", i),
                notes: None,
            }).unwrap();
        }

        // Test pagination
        let p1 = get_stock_ledger_db(&conn, StockFilterParams {
            product_id: Some(1),
            page: Some(1),
            page_size: Some(3),
            ..Default::default()
        }).unwrap();
        assert_eq!(p1.total_count, 5);
        assert_eq!(p1.total_pages, 2);
        assert_eq!(p1.movements.len(), 3);

        // Test filter by movement_type DAMAGE
        let damage_movements = get_stock_ledger_db(&conn, StockFilterParams {
            movement_type: Some("DAMAGE".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(damage_movements.total_count, 2);
        assert_eq!(damage_movements.movements[0].movement_type, "DAMAGE");
    }
}
