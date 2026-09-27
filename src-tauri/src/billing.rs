use crate::db::with_transaction;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// Rounding helper for currency calculations to 2 decimal places
pub fn round_currency(val: f64) -> f64 {
    (val * 100.0).round() / 100.0
}

/// Input model for each cart line item submitted from the POS counter
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CartItemInput {
    pub product_id: Option<i64>,
    pub product_name: String,
    pub barcode: Option<String>,
    pub unit: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub mrp: f64,
    pub gst_rate: f64,
    #[serde(default)]
    pub hsn_code: Option<String>,
    #[serde(default)]
    pub expiry_date: Option<String>,
    #[serde(default)]
    pub batch_number: Option<String>,
}

/// Input payload to finalize and complete a sale
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CreateSaleInput {
    pub customer_id: Option<i64>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub items: Vec<CartItemInput>,
    pub discount_amount: f64,
    pub payment_mode: String, // 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT'
    pub notes: Option<String>,
    #[serde(default)]
    pub round_off: Option<f64>,
    #[serde(default)]
    pub split_cash: Option<f64>,
    #[serde(default)]
    pub split_upi: Option<f64>,
    #[serde(default)]
    pub split_card: Option<f64>,
    #[serde(default)]
    pub created_at: Option<String>,
}

/// Itemized sale item record persisted in SQLite `sale_items`
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct SaleItemRecord {
    pub id: i64,
    pub sale_id: i64,
    pub product_id: Option<i64>,
    pub product_name: String,
    pub barcode: Option<String>,
    pub unit: String,
    pub quantity: f64,
    pub unit_price: f64,
    pub mrp: f64,
    pub gst_rate: f64,
    pub tax_amount: f64,
    pub total_price: f64,
    pub hsn_code: Option<String>,
    pub expiry_date: Option<String>,
    pub batch_number: Option<String>,
}

/// Sale header record persisted in SQLite `sales`
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SaleRecord {
    pub id: i64,
    pub invoice_number: String,
    pub customer_id: Option<i64>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub subtotal: f64,
    pub discount_amount: f64,
    pub tax_amount: f64,
    pub total_amount: f64,
    pub payment_mode: String,
    pub payment_status: String,
    pub notes: Option<String>,
    pub created_at: String,
}

/// Complete transaction result containing invoice header and line items
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SaleResult {
    pub sale: SaleRecord,
    pub items: Vec<SaleItemRecord>,
}

/// Query and filter parameters for paginated sales history
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SalesFilterParams {
    pub search: Option<String>,
    pub payment_mode: Option<String>,
    pub date_preset: Option<String>, // "all" | "today" | "yesterday" | "last_7_days" | "this_month" | "custom"
    pub start_date: Option<String>,  // "YYYY-MM-DD"
    pub end_date: Option<String>,    // "YYYY-MM-DD"
    pub page: Option<i64>,           // 1-indexed, default 1
    pub page_size: Option<i64>,      // default 20
    pub sort_by: Option<String>,     // "created_at" | "invoice_number" | "total_amount"
    pub sort_direction: Option<String>, // "asc" | "desc", default "desc"
}

/// Compact sale list record for fast tabular history display
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SaleListItem {
    pub id: i64,
    pub invoice_number: String,
    pub customer_id: Option<i64>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub subtotal: f64,
    pub discount_amount: f64,
    pub tax_amount: f64,
    pub total_amount: f64,
    pub payment_mode: String,
    pub payment_status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub item_count: i64,
    pub total_quantity: f64,
}

/// Paginated result envelope for sales history
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PaginatedSalesResult {
    pub sales: Vec<SaleListItem>,
    pub total_count: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}

/// Computes the Indian Financial Year string (e.g. "26-27" for September 2026)
fn get_financial_year_db(tx: &rusqlite::Transaction) -> String {
    let row: Result<(i32, i32), _> = tx.query_row(
        "SELECT CAST(strftime('%Y', 'now', 'localtime') AS INTEGER), CAST(strftime('%m', 'now', 'localtime') AS INTEGER);",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    );

    let (year, month) = row.unwrap_or((2026, 4));
    let (start_y, end_y) = if month >= 4 {
        (year % 100, (year + 1) % 100)
    } else {
        (((year - 1) % 100).max(0), year % 100)
    };

    format!("{:02}-{:02}", start_y, end_y)
}

/// Generates a collision-proof sequential invoice number in the format `INV-000001`
/// or Indian Financial Year format `INV/26-27/000001` if configured.
fn generate_invoice_number(tx: &rusqlite::Transaction) -> Result<String, String> {
    let format_mode: String = tx
        .query_row(
            "SELECT value FROM settings WHERE key = 'invoice_format';",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "standard".to_string());

    let prefix: String = tx
        .query_row(
            "SELECT value FROM settings WHERE key = 'invoice_prefix';",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "INV".to_string());

    let max_id: i64 = tx
        .query_row("SELECT COALESCE(MAX(id), 0) FROM sales;", [], |row| {
            row.get(0)
        })
        .map_err(|e| format!("Failed to read max sale id: {}", e))?;

    let mut candidate_seq = max_id + 1;

    let fy_str = if format_mode.to_lowercase() == "fy" {
        Some(get_financial_year_db(tx))
    } else {
        None
    };

    // Loop until we find an invoice number that is strictly unused
    loop {
        let candidate = match &fy_str {
            Some(fy) => format!("{}/{}/{:06}", prefix, fy, candidate_seq),
            None => format!("{}-{:06}", prefix, candidate_seq),
        };

        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sales WHERE invoice_number = ?1);",
                params![&candidate],
                |row| row.get(0),
            )
            .map_err(|e| format!("Database error verifying invoice uniqueness: {}", e))?;

        if !exists {
            return Ok(candidate);
        }
        candidate_seq += 1;
    }
}

/// Completes a retail sale atomically within a single SQLite transaction.
///
/// Guaranteed steps:
/// 1. Validates inputs (items count, positive quantities, non-negative prices, valid discount).
/// 2. Verifies customer existence if `customer_id` is supplied.
/// 3. Validates real-time product existence and stock availability in SQLite.
/// 4. Atomically reduces product stock using `WHERE stock >= ?1` guard against concurrency race conditions.
/// 5. Deterministically calculates line subtotals, tax from GST rates, and final grand total.
/// 6. Generates unique sequential invoice number.
/// 7. Inserts the `sales` header and all `sale_items`.
/// 8. Commits the transaction or rolls back completely if any step encounters an error.
pub fn complete_sale_db(
    conn: &mut Connection,
    input: CreateSaleInput,
) -> Result<SaleResult, String> {
    // 1. Basic validation
    if input.items.is_empty() {
        return Err("Cart is empty. Please add at least one product to complete sale.".to_string());
    }

    if input.discount_amount < 0.0 || input.discount_amount.is_nan() || input.discount_amount.is_infinite() {
        return Err("Discount amount cannot be negative or invalid.".to_string());
    }

    let payment_mode = match input.payment_mode.to_uppercase().as_str() {
        "CASH" => "CASH",
        "UPI" => "UPI",
        "CARD" => "CARD",
        "CREDIT" => "CREDIT",
        "SPLIT" => "SPLIT",
        _ => "CASH",
    };

    // Execute everything atomically inside with_transaction
    with_transaction(conn, |tx| {
        // 2. Validate customer if customer_id provided
        let mut final_customer_name = input.customer_name.clone();
        let mut final_customer_phone = input.customer_phone.clone();

        if let Some(cid) = input.customer_id {
            let cust_row: Option<(String, Option<String>)> = tx
                .query_row(
                    "SELECT name, phone FROM customers WHERE id = ?1;",
                    params![cid],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|e| format!("Failed to verify customer: {}", e))?;

            match cust_row {
                Some((c_name, c_phone)) => {
                    if final_customer_name.as_deref().unwrap_or("").trim().is_empty() {
                        final_customer_name = Some(c_name);
                    }
                    if final_customer_phone.is_none() {
                        final_customer_phone = c_phone;
                    }
                }
                None => {
                    return Err(format!("Selected customer (ID: {}) no longer exists.", cid));
                }
            }
        } else {
            // Walk-in customer default
            if final_customer_name.as_deref().unwrap_or("").trim().is_empty() {
                final_customer_name = Some("Walk-in Customer".to_string());
            }
        }

        // 3. Validate items and reduce stock atomically
        struct CalculatedItem {
            product_id: Option<i64>,
            product_name: String,
            barcode: Option<String>,
            unit: String,
            quantity: f64,
            unit_price: f64,
            mrp: f64,
            gst_rate: f64,
            tax_amount: f64,
            total_price: f64,
            stock_before: Option<f64>,
            stock_after: Option<f64>,
            hsn_code: Option<String>,
            expiry_date: Option<String>,
            batch_number: Option<String>,
        }

        let mut calculated_items: Vec<CalculatedItem> = Vec::with_capacity(input.items.len());
        let mut subtotal: f64 = 0.0;
        let mut total_tax: f64 = 0.0;

        for item in &input.items {
            let item_name = item.product_name.trim();
            if item_name.is_empty() {
                return Err("Product name cannot be blank in cart items.".to_string());
            }

            if item.quantity <= 0.0 || item.quantity.is_nan() || item.quantity.is_infinite() {
                return Err(format!(
                    "Quantity for '{}' must be greater than zero.",
                    item_name
                ));
            }

            if item.unit_price < 0.0 || item.unit_price.is_nan() || item.unit_price.is_infinite() {
                return Err(format!(
                    "Unit price for '{}' cannot be negative.",
                    item_name
                ));
            }

            if item.mrp > 0.0 && item.unit_price > item.mrp {
                return Err(format!(
                    "Selling price (₹{:.2}) cannot exceed MRP (₹{:.2}) for '{}'.",
                    item.unit_price, item.mrp, item_name
                ));
            }

            // Real-time stock validation and decrement for catalog products
            let mut stock_before = None;
            let mut stock_after = None;

            if let Some(pid) = item.product_id {
                let prod_info: Option<(String, f64, String)> = tx
                    .query_row(
                        "SELECT name, stock, unit FROM products WHERE id = ?1;",
                        params![pid],
                        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                    )
                    .optional()
                    .map_err(|e| format!("Failed to verify product: {}", e))?;

                match prod_info {
                    Some((p_name, current_stock, p_unit)) => {
                        if current_stock < item.quantity {
                            return Err(format!(
                                "Only {:.2} {} available in stock for '{}'. Stock changed.",
                                current_stock, p_unit, p_name
                            ));
                        }

                        // Atomic decrement with stock guard
                        let rows_affected = tx
                            .execute(
                                "UPDATE products
                                 SET stock = stock - ?1, updated_at = datetime('now', 'localtime')
                                 WHERE id = ?2 AND stock >= ?1;",
                                params![item.quantity, pid],
                            )
                            .map_err(|e| format!("Failed to update product stock: {}", e))?;

                        if rows_affected == 0 {
                            return Err(format!(
                                "Stock for '{}' was updated by another operation. Please review the cart and try again.",
                                p_name
                            ));
                        }

                        stock_before = Some(current_stock);
                        stock_after = Some(current_stock - item.quantity);
                    }
                    None => {
                        return Err(format!("Product '{}' no longer exists in inventory.", item_name));
                    }
                }
            }

            // Calculations (GST is Inclusive in item unit price)
            let line_total = round_currency(item.quantity * item.unit_price);
            let tax_amount = if item.gst_rate > 0.0 {
                let base = line_total / (1.0 + (item.gst_rate / 100.0));
                round_currency(line_total - base)
            } else {
                0.0
            };

            subtotal += line_total;
            total_tax += tax_amount;

            let hsn_code = match &item.hsn_code {
                Some(h) if !h.trim().is_empty() => Some(h.trim().to_string()),
                _ => {
                    if let Some(pid) = item.product_id {
                        tx.query_row(
                            "SELECT hsn_code FROM products WHERE id = ?1;",
                            params![pid],
                            |r| r.get(0),
                        )
                        .unwrap_or(None)
                    } else {
                        None
                    }
                }
            };

            let expiry_date = match &item.expiry_date {
                Some(e) if !e.trim().is_empty() => Some(e.trim().to_string()),
                _ => {
                    if let Some(pid) = item.product_id {
                        tx.query_row(
                            "SELECT expiry_date FROM products WHERE id = ?1;",
                            params![pid],
                            |r| r.get(0),
                        )
                        .unwrap_or(None)
                    } else {
                        None
                    }
                }
            };

            let batch_number = match &item.batch_number {
                Some(b) if !b.trim().is_empty() => Some(b.trim().to_string()),
                _ => {
                    if let Some(pid) = item.product_id {
                        tx.query_row(
                            "SELECT batch_number FROM products WHERE id = ?1;",
                            params![pid],
                            |r| r.get(0),
                        )
                        .unwrap_or(None)
                    } else {
                        None
                    }
                }
            };

            calculated_items.push(CalculatedItem {
                product_id: item.product_id,
                product_name: item_name.to_string(),
                barcode: item.barcode.as_deref().map(|b| b.trim().to_string()),
                unit: if item.unit.trim().is_empty() {
                    "PCS".to_string()
                } else {
                    item.unit.trim().to_string()
                },
                quantity: item.quantity,
                unit_price: item.unit_price,
                mrp: item.mrp,
                gst_rate: item.gst_rate,
                tax_amount,
                total_price: line_total,
                stock_before,
                stock_after,
                hsn_code,
                expiry_date,
                batch_number,
            });
        }

        subtotal = round_currency(subtotal);
        total_tax = round_currency(total_tax);

        if input.discount_amount > subtotal {
            return Err(format!(
                "Discount (₹{:.2}) cannot exceed subtotal (₹{:.2}).",
                input.discount_amount, subtotal
            ));
        }

        let mut total_amount = round_currency(subtotal - input.discount_amount);
        if let Some(ro) = input.round_off {
            if ro.abs() <= 1.0 {
                total_amount = round_currency(total_amount + ro);
            }
        }
        if total_amount < 0.0 {
            return Err("Grand total cannot be negative.".to_string());
        }

        // 4. Generate unique invoice number
        let invoice_number = generate_invoice_number(tx)?;

        // 5. Insert sales record
        let payment_status = if payment_mode == "CREDIT" {
            "PENDING"
        } else {
            "PAID"
        };

        let mut final_notes = input.notes.as_deref().map(|n| n.trim().to_string());
        if payment_mode == "SPLIT" {
            let sc = input.split_cash.unwrap_or(0.0);
            let su = input.split_upi.unwrap_or(0.0);
            let scard = input.split_card.unwrap_or(0.0);
            let split_tag = format!("[SPLIT: Cash ₹{:.2}, UPI ₹{:.2}, Card ₹{:.2}]", sc, su, scard);
            final_notes = match final_notes {
                Some(n) if !n.is_empty() => Some(format!("{} | {}", n, split_tag)),
                _ => Some(split_tag),
            };
        }

        let created_at_sql: String = match &input.created_at {
            Some(ts) if !ts.trim().is_empty() => ts.trim().to_string(),
            _ => tx
                .query_row("SELECT datetime('now', 'localtime');", [], |r| r.get(0))
                .unwrap_or_else(|_| "1970-01-01 00:00:00".to_string()),
        };

        tx.execute(
            "INSERT INTO sales (
                invoice_number, customer_id, customer_name, customer_phone,
                subtotal, discount_amount, tax_amount, total_amount,
                payment_mode, payment_status, notes, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12);",
            params![
                invoice_number,
                input.customer_id,
                final_customer_name,
                final_customer_phone,
                subtotal,
                input.discount_amount,
                total_tax,
                total_amount,
                payment_mode,
                payment_status,
                final_notes,
                created_at_sql,
            ],
        )
        .map_err(|e| format!("Failed to insert sale record: {}", e))?;

        let sale_id = tx.last_insert_rowid();

        // 6. Insert all sale_items
        let mut persisted_items: Vec<SaleItemRecord> = Vec::with_capacity(calculated_items.len());

        for c_item in calculated_items {
            tx.execute(
                "INSERT INTO sale_items (
                    sale_id, product_id, product_name, barcode, unit,
                    quantity, unit_price, mrp, gst_rate, tax_amount, total_price, hsn_code, expiry_date, batch_number
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14);",
                params![
                    sale_id,
                    c_item.product_id,
                    c_item.product_name,
                    c_item.barcode,
                    c_item.unit,
                    c_item.quantity,
                    c_item.unit_price,
                    c_item.mrp,
                    c_item.gst_rate,
                    c_item.tax_amount,
                    c_item.total_price,
                    c_item.hsn_code,
                    c_item.expiry_date,
                    c_item.batch_number,
                ],
            )
            .map_err(|e| format!("Failed to insert sale item: {}", e))?;

            let item_id = tx.last_insert_rowid();

            // Record stock ledger movement atomically
            if let (Some(pid), Some(before), Some(after)) = (c_item.product_id, c_item.stock_before, c_item.stock_after) {
                let _ = crate::inventory::record_stock_movement_tx(
                    tx,
                    pid,
                    &c_item.product_name,
                    c_item.barcode.as_deref(),
                    &c_item.unit,
                    "SALE",
                    -c_item.quantity,
                    before,
                    after,
                    Some("SALE"),
                    Some(&invoice_number),
                    Some("Point of Sale retail checkout"),
                    None,
                )?;
            }

            persisted_items.push(SaleItemRecord {
                id: item_id,
                sale_id,
                product_id: c_item.product_id,
                product_name: c_item.product_name,
                barcode: c_item.barcode,
                unit: c_item.unit,
                quantity: c_item.quantity,
                unit_price: c_item.unit_price,
                mrp: c_item.mrp,
                gst_rate: c_item.gst_rate,
                tax_amount: c_item.tax_amount,
                total_price: c_item.total_price,
                hsn_code: c_item.hsn_code,
                expiry_date: c_item.expiry_date,
                batch_number: c_item.batch_number,
            });
        }

        // Fetch inserted sale header
        let sale_record = tx
            .query_row(
                "SELECT id, invoice_number, customer_id, customer_name, customer_phone,
                        subtotal, discount_amount, tax_amount, total_amount,
                        payment_mode, payment_status, notes, created_at
                 FROM sales WHERE id = ?1;",
                params![sale_id],
                |row| {
                    Ok(SaleRecord {
                        id: row.get(0)?,
                        invoice_number: row.get(1)?,
                        customer_id: row.get(2)?,
                        customer_name: row.get(3)?,
                        customer_phone: row.get(4)?,
                        subtotal: row.get(5)?,
                        discount_amount: row.get(6)?,
                        tax_amount: row.get(7)?,
                        total_amount: row.get(8)?,
                        payment_mode: row.get(9)?,
                        payment_status: row.get(10)?,
                        notes: row.get(11)?,
                        created_at: row.get(12)?,
                    })
                },
            )
            .map_err(|e| format!("Failed to retrieve generated sale: {}", e))?;

        Ok(SaleResult {
            sale: sale_record,
            items: persisted_items,
        })
    })
}

/// Retrieves a completed sale by its invoice number
pub fn get_sale_by_invoice_db(
    conn: &Connection,
    invoice_number: &str,
) -> Result<SaleResult, String> {
    let trimmed_inv = invoice_number.trim();
    if trimmed_inv.is_empty() {
        return Err("Invoice number cannot be empty.".to_string());
    }

    let sale: Option<SaleRecord> = conn
        .query_row(
            "SELECT id, invoice_number, customer_id, customer_name, customer_phone,
                    subtotal, discount_amount, tax_amount, total_amount,
                    payment_mode, payment_status, notes, created_at
             FROM sales WHERE invoice_number = ?1;",
            params![trimmed_inv],
            |row| {
                Ok(SaleRecord {
                    id: row.get(0)?,
                    invoice_number: row.get(1)?,
                    customer_id: row.get(2)?,
                    customer_name: row.get(3)?,
                    customer_phone: row.get(4)?,
                    subtotal: row.get(5)?,
                    discount_amount: row.get(6)?,
                    tax_amount: row.get(7)?,
                    total_amount: row.get(8)?,
                    payment_mode: row.get(9)?,
                    payment_status: row.get(10)?,
                    notes: row.get(11)?,
                    created_at: row.get(12)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to fetch sale: {}", e))?;

    let sale = match sale {
        Some(s) => s,
        None => return Err(format!("Invoice '{}' not found.", trimmed_inv)),
    };

    let mut stmt = conn
        .prepare(
            "SELECT id, sale_id, product_id, product_name, barcode, unit,
                    quantity, unit_price, mrp, gst_rate, tax_amount, total_price, hsn_code,
                    expiry_date, batch_number
             FROM sale_items WHERE sale_id = ?1 ORDER BY id ASC;",
        )
        .map_err(|e| format!("Failed to prepare sale items query: {}", e))?;

    let item_rows = stmt
        .query_map(params![sale.id], |row| {
            Ok(SaleItemRecord {
                id: row.get(0)?,
                sale_id: row.get(1)?,
                product_id: row.get(2)?,
                product_name: row.get(3)?,
                barcode: row.get(4)?,
                unit: row.get(5)?,
                quantity: row.get(6)?,
                unit_price: row.get(7)?,
                mrp: row.get(8)?,
                gst_rate: row.get(9)?,
                tax_amount: row.get(10)?,
                total_price: row.get(11)?,
                hsn_code: row.get(12).ok(),
                expiry_date: row.get(13).ok(),
                batch_number: row.get(14).ok(),
            })
        })
        .map_err(|e| format!("Failed to query sale items: {}", e))?;

    let mut items = Vec::new();
    for item in item_rows {
        items.push(item.map_err(|e| format!("Failed to read sale item: {}", e))?);
    }

    Ok(SaleResult { sale, items })
}

/// Retrieves the most recent sales for the POS counter (e.g. for reprinting or verification)
pub fn get_recent_sales_db(conn: &Connection, limit: i64) -> Result<Vec<SaleRecord>, String> {
    let effective_limit = if limit <= 0 { 10 } else { limit.min(100) };

    let mut stmt = conn
        .prepare(
            "SELECT id, invoice_number, customer_id, customer_name, customer_phone,
                    subtotal, discount_amount, tax_amount, total_amount,
                    payment_mode, payment_status, notes, created_at
             FROM sales ORDER BY id DESC LIMIT ?1;",
        )
        .map_err(|e| format!("Failed to prepare recent sales query: {}", e))?;

    let sales_rows = stmt
        .query_map(params![effective_limit], |row| {
            Ok(SaleRecord {
                id: row.get(0)?,
                invoice_number: row.get(1)?,
                customer_id: row.get(2)?,
                customer_name: row.get(3)?,
                customer_phone: row.get(4)?,
                subtotal: row.get(5)?,
                discount_amount: row.get(6)?,
                tax_amount: row.get(7)?,
                total_amount: row.get(8)?,
                payment_mode: row.get(9)?,
                payment_status: row.get(10)?,
                notes: row.get(11)?,
                created_at: row.get(12)?,
            })
        })
        .map_err(|e| format!("Failed to query recent sales: {}", e))?;

    let mut list = Vec::new();
    for sale in sales_rows {
        list.push(sale.map_err(|e| format!("Failed to read recent sale: {}", e))?);
    }

    Ok(list)
}

/// Helper to validate standard ISO date strings (YYYY-MM-DD)
fn is_valid_iso_date(s: &str) -> bool {
    let trimmed = s.trim();
    if trimmed.len() != 10 {
        return false;
    }
    let parts: Vec<&str> = trimmed.split('-').collect();
    if parts.len() != 3 {
        return false;
    }
    let y: Result<u32, _> = parts[0].parse();
    let m: Result<u32, _> = parts[1].parse();
    let d: Result<u32, _> = parts[2].parse();
    match (y, m, d) {
        (Ok(y), Ok(m), Ok(d)) => (1970..=2100).contains(&y) && (1..=12).contains(&m) && (1..=31).contains(&d),
        _ => false,
    }
}

/// Retrieves a completed sale by its internal ID
pub fn get_sale_by_id_db(conn: &Connection, id: i64) -> Result<SaleResult, String> {
    let sale: Option<SaleRecord> = conn
        .query_row(
            "SELECT id, invoice_number, customer_id, customer_name, customer_phone,
                    subtotal, discount_amount, tax_amount, total_amount,
                    payment_mode, payment_status, notes, created_at
             FROM sales WHERE id = ?1;",
            params![id],
            |row| {
                Ok(SaleRecord {
                    id: row.get(0)?,
                    invoice_number: row.get(1)?,
                    customer_id: row.get(2)?,
                    customer_name: row.get(3)?,
                    customer_phone: row.get(4)?,
                    subtotal: row.get(5)?,
                    discount_amount: row.get(6)?,
                    tax_amount: row.get(7)?,
                    total_amount: row.get(8)?,
                    payment_mode: row.get(9)?,
                    payment_status: row.get(10)?,
                    notes: row.get(11)?,
                    created_at: row.get(12)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("Failed to fetch sale by id: {}", e))?;

    let sale = match sale {
        Some(s) => s,
        None => return Err(format!("Sale with ID '{}' not found.", id)),
    };

    let mut stmt = conn
        .prepare(
            "SELECT id, sale_id, product_id, product_name, barcode, unit,
                    quantity, unit_price, mrp, gst_rate, tax_amount, total_price, hsn_code,
                    expiry_date, batch_number
             FROM sale_items WHERE sale_id = ?1 ORDER BY id ASC;",
        )
        .map_err(|e| format!("Failed to prepare sale items query: {}", e))?;

    let item_rows = stmt
        .query_map(params![sale.id], |row| {
            Ok(SaleItemRecord {
                id: row.get(0)?,
                sale_id: row.get(1)?,
                product_id: row.get(2)?,
                product_name: row.get(3)?,
                barcode: row.get(4)?,
                unit: row.get(5)?,
                quantity: row.get(6)?,
                unit_price: row.get(7)?,
                mrp: row.get(8)?,
                gst_rate: row.get(9)?,
                tax_amount: row.get(10)?,
                total_price: row.get(11)?,
                hsn_code: row.get(12).ok(),
                expiry_date: row.get(13).ok(),
                batch_number: row.get(14).ok(),
            })
        })
        .map_err(|e| format!("Failed to query sale items: {}", e))?;

    let mut items = Vec::new();
    for item in item_rows {
        items.push(item.map_err(|e| format!("Failed to read sale item: {}", e))?);
    }

    Ok(SaleResult { sale, items })
}

/// Retrieves sales history with server-side search, filtering, sorting, and pagination
pub fn get_sales_history_db(
    conn: &Connection,
    filter: SalesFilterParams,
) -> Result<PaginatedSalesResult, String> {
    let mut where_clauses = Vec::new();
    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

    // 1. Text Search across invoice number, customer name, customer phone
    if let Some(ref q) = filter.search {
        let trimmed = q.trim();
        if !trimmed.is_empty() {
            let search_pattern = format!("%{}%", trimmed);
            where_clauses.push(
                "(s.invoice_number LIKE ? COLLATE NOCASE OR s.customer_name LIKE ? COLLATE NOCASE OR s.customer_phone LIKE ?)"
                    .to_string(),
            );
            params_vec.push(search_pattern.clone().into());
            params_vec.push(search_pattern.clone().into());
            params_vec.push(search_pattern.into());
        }
    }

    // 2. Payment mode filter (CASH, UPI, CARD, CREDIT)
    if let Some(ref mode) = filter.payment_mode {
        let trimmed = mode.trim();
        if !trimmed.is_empty() && !trimmed.eq_ignore_ascii_case("all") {
            where_clauses.push("s.payment_mode = ? COLLATE NOCASE".to_string());
            params_vec.push(trimmed.to_uppercase().into());
        }
    }

    // 3. Date filtering: presets or custom ranges
    let preset = filter.date_preset.as_deref().map(str::trim).unwrap_or("all");
    match preset.to_lowercase().as_str() {
        "today" => {
            where_clauses.push("date(s.created_at) = date('now', 'localtime')".to_string());
        }
        "yesterday" => {
            where_clauses.push("date(s.created_at) = date('now', 'localtime', '-1 day')".to_string());
        }
        "last_7_days" => {
            where_clauses.push(
                "date(s.created_at) >= date('now', 'localtime', '-6 days') AND date(s.created_at) <= date('now', 'localtime')"
                    .to_string(),
            );
        }
        "this_month" => {
            where_clauses.push("strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now', 'localtime')".to_string());
        }
        "custom" | _ => {
            // Check explicit start_date and end_date
            let has_start = filter.start_date.as_deref().map(str::trim).filter(|s| !s.is_empty());
            let has_end = filter.end_date.as_deref().map(str::trim).filter(|s| !s.is_empty());

            if let Some(s_date) = has_start {
                if !is_valid_iso_date(s_date) {
                    return Err(format!("Invalid start date '{}'. Expected format YYYY-MM-DD.", s_date));
                }
            }

            if let Some(e_date) = has_end {
                if !is_valid_iso_date(e_date) {
                    return Err(format!("Invalid end date '{}'. Expected format YYYY-MM-DD.", e_date));
                }
            }

            if let (Some(s_date), Some(e_date)) = (has_start, has_end) {
                if s_date > e_date {
                    return Err("Start date cannot be after end date. Please check the date range.".to_string());
                }
            }

            if let Some(s_date) = has_start {
                where_clauses.push("date(s.created_at) >= date(?)".to_string());
                params_vec.push(s_date.to_string().into());
            }

            if let Some(e_date) = has_end {
                where_clauses.push("date(s.created_at) <= date(?)".to_string());
                params_vec.push(e_date.to_string().into());
            }
        }
    }

    let where_sql = if where_clauses.is_empty() {
        "1=1".to_string()
    } else {
        where_clauses.join(" AND ")
    };

    // 4. Pagination calculation
    let page = filter.page.unwrap_or(1).max(1);
    let page_size = filter.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    // 5. Total count query
    let count_sql = format!("SELECT count(*) FROM sales s WHERE {};", where_sql);
    let count_params: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|v| v as &dyn rusqlite::ToSql)
        .collect();

    let total_count: i64 = conn
        .query_row(&count_sql, count_params.as_slice(), |row| row.get(0))
        .map_err(|e| format!("Failed to count sales: {}", e))?;

    let total_pages = if total_count == 0 {
        1
    } else {
        (total_count + page_size - 1) / page_size
    };

    if total_count == 0 {
        return Ok(PaginatedSalesResult {
            sales: Vec::new(),
            total_count: 0,
            page,
            page_size,
            total_pages: 1,
        });
    }

    // 6. Sorting
    let sort_col = match filter.sort_by.as_deref().unwrap_or("created_at").to_lowercase().as_str() {
        "invoice_number" => "s.invoice_number",
        "total_amount" => "s.total_amount",
        _ => "s.id",
    };

    let sort_dir = if filter.sort_direction.as_deref().unwrap_or("desc").eq_ignore_ascii_case("asc") {
        "ASC"
    } else {
        "DESC"
    };

    // 7. Select rows
    let select_sql = format!(
        "SELECT s.id, s.invoice_number, s.customer_id, s.customer_name, s.customer_phone,
                s.subtotal, s.discount_amount, s.tax_amount, s.total_amount,
                s.payment_mode, s.payment_status, s.notes, s.created_at,
                (SELECT count(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count,
                (SELECT coalesce(sum(si.quantity), 0.0) FROM sale_items si WHERE si.sale_id = s.id) AS total_quantity
         FROM sales s
         WHERE {}
         ORDER BY {} {}, s.id DESC
         LIMIT ? OFFSET ?;",
        where_sql, sort_col, sort_dir
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
        .map_err(|e| format!("Failed to prepare sales query: {}", e))?;

    let sale_rows = stmt
        .query_map(final_params_refs.as_slice(), |row| {
            Ok(SaleListItem {
                id: row.get(0)?,
                invoice_number: row.get(1)?,
                customer_id: row.get(2)?,
                customer_name: row.get(3)?,
                customer_phone: row.get(4)?,
                subtotal: row.get(5)?,
                discount_amount: row.get(6)?,
                tax_amount: row.get(7)?,
                total_amount: row.get(8)?,
                payment_mode: row.get(9)?,
                payment_status: row.get(10)?,
                notes: row.get(11)?,
                created_at: row.get(12)?,
                item_count: row.get(13)?,
                total_quantity: row.get(14)?,
            })
        })
        .map_err(|e| format!("Failed to execute sales query: {}", e))?;

    let mut sales = Vec::new();
    for row in sale_rows {
        sales.push(row.map_err(|e| format!("Failed to read sale record: {}", e))?);
    }

    Ok(PaginatedSalesResult {
        sales,
        total_count,
        page,
        page_size,
        total_pages,
    })
}

/// Filter criteria for business reports and analytics
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BusinessReportFilter {
    pub date_preset: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

/// Aggregated business KPIs and profit summary
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BusinessReportSummary {
    pub total_invoices: i64,
    pub total_items_sold: f64,
    pub total_sales_revenue: f64, // Spend on sell
    pub total_purchase_cost: f64, // Spent on buy / cost of goods
    pub gross_profit: f64,
    pub profit_margin_percent: f64,
    pub total_tax: f64,
    pub total_discount: f64,
    pub payment_cash: f64,
    pub payment_upi: f64,
    pub payment_card: f64,
}

/// Customer spend record for customer analytics and CSV export
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CustomerSpendItem {
    pub customer_id: Option<i64>,
    pub name: String,
    pub phone: String,
    pub address: String,
    pub total_invoices: i64,
    pub total_spent_on_buying: f64,
    pub total_purchase_cost_to_store: f64,
    pub last_visit: String,
}

/// Product sales velocity and profit record
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TopSellingProductItem {
    pub product_id: Option<i64>,
    pub product_name: String,
    pub category: String,
    pub barcode: Option<String>,
    pub hsn_code: Option<String>,
    pub unit: String,
    pub quantity_sold: f64,
    pub total_sales_revenue: f64,
    pub total_purchase_cost: f64,
    pub total_profit: f64,
}

/// Complete report payload bundle
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BusinessReportResult {
    pub period_label: String,
    pub summary: BusinessReportSummary,
    pub customers: Vec<CustomerSpendItem>,
    pub top_products: Vec<TopSellingProductItem>,
    pub sales: Vec<SaleListItem>,
}

/// GSTR-1 Table 4: B2B Invoices (Sales to GST Registered Customers)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Gstr1B2bItem {
    pub gstin: String,
    pub customer_name: String,
    pub invoice_number: String,
    pub invoice_date: String,
    pub invoice_value: f64,
    pub place_of_supply: String,
    pub reverse_charge: String,
    pub applicable_tax_rate: f64,
    pub taxable_value: f64,
    pub central_tax: f64,
    pub state_tax: f64,
}

/// GSTR-1 Table 7: B2C (Small) Invoices (Sales to Unregistered Customers grouped by Tax Rate)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Gstr1B2cItem {
    pub tax_rate: f64,
    pub taxable_value: f64,
    pub central_tax: f64,
    pub state_tax: f64,
    pub invoice_count: i64,
    pub total_value: f64,
}

/// GSTR-1 Table 12: HSN-wise Summary of Outward Supplies
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Gstr1HsnItem {
    pub hsn_code: String,
    pub description: String,
    pub uqc: String,
    pub total_quantity: f64,
    pub total_value: f64,
    pub taxable_value: f64,
    pub central_tax: f64,
    pub state_tax: f64,
}

/// Full GSTR-1 Tax Report Result Envelope
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Gstr1ReportResult {
    pub period_label: String,
    pub shop_gstin: Option<String>,
    pub shop_name: String,
    pub total_b2b_invoices: usize,
    pub total_b2b_taxable: f64,
    pub total_b2b_tax: f64,
    pub total_b2c_invoices: usize,
    pub total_b2c_taxable: f64,
    pub total_b2c_tax: f64,
    pub b2b_table4: Vec<Gstr1B2bItem>,
    pub b2c_table7: Vec<Gstr1B2cItem>,
    pub hsn_table12: Vec<Gstr1HsnItem>,
}

/// Day-End Cash Drawer Reconciliation (Z-Report / Shift Close)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DayEndSummaryResult {
    pub report_date: String,
    pub generated_at: String,
    pub shop_name: String,
    pub total_invoices: i64,
    pub total_sales_revenue: f64,
    pub cash_sales: f64,
    pub upi_sales: f64,
    pub card_sales: f64,
    pub split_sales: f64,
    pub total_returns_count: i64,
    pub total_refund_amount: f64,
    pub cash_refund_amount: f64,
    pub net_cash_inflow: f64,
}

/// Retrieves comprehensive business performance, customer spend, top products,
/// and sales records for any daily, monthly, yearly, or custom time period.
pub fn get_business_report_db(
    conn: &Connection,
    filter: BusinessReportFilter,
) -> Result<BusinessReportResult, String> {
    let mut where_clauses: Vec<String> = Vec::new();
    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();
    let preset = filter.date_preset.as_deref().map(str::trim).unwrap_or("today");

    let period_label = match preset.to_lowercase().as_str() {
        "today" => {
            where_clauses.push("date(s.created_at) = date('now', 'localtime')".to_string());
            "Today (Daily)".to_string()
        }
        "yesterday" => {
            where_clauses.push("date(s.created_at) = date('now', 'localtime', '-1 day')".to_string());
            "Yesterday".to_string()
        }
        "this_week" | "last_7_days" => {
            where_clauses.push(
                "date(s.created_at) >= date('now', 'localtime', '-6 days') AND date(s.created_at) <= date('now', 'localtime')"
                    .to_string(),
            );
            "Last 7 Days (Weekly)".to_string()
        }
        "this_month" => {
            where_clauses.push("strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now', 'localtime')".to_string());
            "This Month (Monthly)".to_string()
        }
        "last_month" => {
            where_clauses.push("strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now', 'localtime', 'start of month', '-1 day')".to_string());
            "Last Month".to_string()
        }
        "this_year" => {
            where_clauses.push("strftime('%Y', s.created_at) = strftime('%Y', 'now', 'localtime')".to_string());
            "This Year (Yearly)".to_string()
        }
        "custom" => {
            let has_start = filter.start_date.as_deref().map(str::trim).filter(|s| !s.is_empty());
            let has_end = filter.end_date.as_deref().map(str::trim).filter(|s| !s.is_empty());

            if let Some(s_date) = has_start {
                if !is_valid_iso_date(s_date) {
                    return Err(format!("Invalid start date '{}'. Format: YYYY-MM-DD", s_date));
                }
                where_clauses.push("date(s.created_at) >= date(?)".to_string());
                params_vec.push(s_date.to_string().into());
            }

            if let Some(e_date) = has_end {
                if !is_valid_iso_date(e_date) {
                    return Err(format!("Invalid end date '{}'. Format: YYYY-MM-DD", e_date));
                }
                where_clauses.push("date(s.created_at) <= date(?)".to_string());
                params_vec.push(e_date.to_string().into());
            }

            match (has_start, has_end) {
                (Some(s), Some(e)) => format!("{} to {}", s, e),
                (Some(s), None) => format!("From {}", s),
                (None, Some(e)) => format!("Until {}", e),
                (None, None) => "Custom Range".to_string(),
            }
        }
        "all" | _ => {
            "All Time".to_string()
        }
    };

    let where_sql = if where_clauses.is_empty() {
        "1=1".to_string()
    } else {
        where_clauses.join(" AND ")
    };

    let query_params: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|v| v as &dyn rusqlite::ToSql)
        .collect();

    // 1. Sales & Revenue Summary
    let summary_sql = format!(
        "SELECT
            COUNT(s.id),
            COALESCE(SUM(s.subtotal), 0.0),
            COALESCE(SUM(s.discount_amount), 0.0),
            COALESCE(SUM(s.tax_amount), 0.0),
            COALESCE(SUM(s.total_amount), 0.0),
            COALESCE(SUM(CASE WHEN UPPER(s.payment_mode) = 'CASH' THEN s.total_amount ELSE 0.0 END), 0.0),
            COALESCE(SUM(CASE WHEN UPPER(s.payment_mode) = 'UPI' THEN s.total_amount ELSE 0.0 END), 0.0),
            COALESCE(SUM(CASE WHEN UPPER(s.payment_mode) = 'CARD' THEN s.total_amount ELSE 0.0 END), 0.0)
         FROM sales s
         WHERE {};",
        where_sql
    );

    let (
        total_invoices,
        _subtotal,
        total_discount,
        total_tax,
        total_sales_revenue,
        payment_cash,
        payment_upi,
        payment_card,
    ): (i64, f64, f64, f64, f64, f64, f64, f64) = conn
        .query_row(&summary_sql, query_params.as_slice(), |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
                r.get(7)?,
            ))
        })
        .map_err(|e| format!("Failed to compute sales summary: {}", e))?;

    // 2. Total items sold & purchase cost of goods sold
    let cogs_sql = format!(
        "SELECT
            COALESCE(SUM(si.quantity), 0.0),
            COALESCE(SUM(si.quantity * COALESCE(p.purchase_price, 0.0)), 0.0)
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id
         LEFT JOIN products p ON si.product_id = p.id
         WHERE {};",
        where_sql
    );

    let (total_items_sold, total_purchase_cost): (f64, f64) = conn
        .query_row(&cogs_sql, query_params.as_slice(), |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .map_err(|e| format!("Failed to compute cost of goods sold: {}", e))?;

    let gross_profit = round_currency(total_sales_revenue - total_purchase_cost);
    let profit_margin_percent = if total_sales_revenue > 0.0 {
        round_currency((gross_profit / total_sales_revenue) * 100.0)
    } else {
        0.0
    };

    let summary = BusinessReportSummary {
        total_invoices,
        total_items_sold: (total_items_sold * 1000.0).round() / 1000.0,
        total_sales_revenue: round_currency(total_sales_revenue),
        total_purchase_cost: round_currency(total_purchase_cost),
        gross_profit,
        profit_margin_percent,
        total_tax: round_currency(total_tax),
        total_discount: round_currency(total_discount),
        payment_cash: round_currency(payment_cash),
        payment_upi: round_currency(payment_upi),
        payment_card: round_currency(payment_card),
    };

    // 3. Customer Spend Query
    let customers_sql = format!(
        "SELECT
            s.customer_id,
            COALESCE(s.customer_name, 'Walk-in Customer') AS cust_name,
            COALESCE(s.customer_phone, '') AS cust_phone,
            COALESCE(c.address, '') AS cust_address,
            COUNT(s.id) AS inv_count,
            COALESCE(SUM(s_sub.sale_total), 0.0) AS total_spent,
            COALESCE(SUM(s_sub.sale_cost), 0.0) AS total_cost,
            MAX(s.created_at) AS last_date
         FROM sales s
         LEFT JOIN customers c ON s.customer_id = c.id
         JOIN (
            SELECT
                s2.id,
                s2.total_amount AS sale_total,
                COALESCE(SUM(si.quantity * COALESCE(p.purchase_price, 0.0)), 0.0) AS sale_cost
            FROM sales s2
            LEFT JOIN sale_items si ON si.sale_id = s2.id
            LEFT JOIN products p ON si.product_id = p.id
            GROUP BY s2.id
         ) s_sub ON s.id = s_sub.id
         WHERE {}
         GROUP BY s.customer_id, s.customer_name, s.customer_phone
         ORDER BY total_spent DESC;",
        where_sql
    );

    let mut cust_stmt = conn
        .prepare(&customers_sql)
        .map_err(|e| format!("Failed to prepare customer spend query: {}", e))?;

    let cust_rows = cust_stmt
        .query_map(query_params.as_slice(), |r| {
            let spent: f64 = r.get(5)?;
            let cost: f64 = r.get(6)?;
            Ok(CustomerSpendItem {
                customer_id: r.get(0)?,
                name: r.get(1)?,
                phone: r.get(2)?,
                address: r.get(3)?,
                total_invoices: r.get(4)?,
                total_spent_on_buying: round_currency(spent),
                total_purchase_cost_to_store: round_currency(cost),
                last_visit: r.get(7)?,
            })
        })
        .map_err(|e| format!("Failed to execute customer spend query: {}", e))?;

    let mut customers = Vec::new();
    for row in cust_rows {
        customers.push(row.map_err(|e| format!("Failed to read customer item: {}", e))?);
    }

    // 4. Top / More Selling Items Query
    let products_sql = format!(
        "SELECT
            si.product_id,
            si.product_name,
            COALESCE(p.category, 'General') AS category,
            si.barcode,
            si.hsn_code,
            si.unit,
            COALESCE(SUM(si.quantity), 0.0) AS total_qty,
            COALESCE(SUM(si.total_price), 0.0) AS total_revenue,
            COALESCE(SUM(si.quantity * COALESCE(p.purchase_price, 0.0)), 0.0) AS total_cost
         FROM sale_items si
         JOIN sales s ON si.sale_id = s.id
         LEFT JOIN products p ON si.product_id = p.id
         WHERE {}
         GROUP BY si.product_name, si.unit
         ORDER BY total_qty DESC;",
        where_sql
    );

    let mut prod_stmt = conn
        .prepare(&products_sql)
        .map_err(|e| format!("Failed to prepare top products query: {}", e))?;

    let prod_rows = prod_stmt
        .query_map(query_params.as_slice(), |r| {
            let qty: f64 = r.get(6)?;
            let rev: f64 = r.get(7)?;
            let cost: f64 = r.get(8)?;
            Ok(TopSellingProductItem {
                product_id: r.get(0)?,
                product_name: r.get(1)?,
                category: r.get(2)?,
                barcode: r.get(3)?,
                hsn_code: r.get(4)?,
                unit: r.get(5)?,
                quantity_sold: (qty * 1000.0).round() / 1000.0,
                total_sales_revenue: round_currency(rev),
                total_purchase_cost: round_currency(cost),
                total_profit: round_currency(rev - cost),
            })
        })
        .map_err(|e| format!("Failed to execute top products query: {}", e))?;

    let mut top_products = Vec::new();
    for row in prod_rows {
        top_products.push(row.map_err(|e| format!("Failed to read product report item: {}", e))?);
    }

    // 5. Itemized Sales Invoices List
    let sales_sql = format!(
        "SELECT
            s.id,
            s.invoice_number,
            s.customer_id,
            s.customer_name,
            s.customer_phone,
            s.subtotal,
            s.discount_amount,
            s.tax_amount,
            s.total_amount,
            s.payment_mode,
            s.payment_status,
            s.notes,
            s.created_at,
            (SELECT count(*) FROM sale_items WHERE sale_id = s.id) AS item_count,
            (SELECT coalesce(sum(quantity), 0.0) FROM sale_items WHERE sale_id = s.id) AS total_quantity
         FROM sales s
         WHERE {}
         ORDER BY s.id DESC;",
        where_sql
    );

    let mut sales_stmt = conn
        .prepare(&sales_sql)
        .map_err(|e| format!("Failed to prepare report sales query: {}", e))?;

    let sales_rows = sales_stmt
        .query_map(query_params.as_slice(), |r| {
            Ok(SaleListItem {
                id: r.get(0)?,
                invoice_number: r.get(1)?,
                customer_id: r.get(2)?,
                customer_name: r.get(3)?,
                customer_phone: r.get(4)?,
                subtotal: r.get(5)?,
                discount_amount: r.get(6)?,
                tax_amount: r.get(7)?,
                total_amount: r.get(8)?,
                payment_mode: r.get(9)?,
                payment_status: r.get(10)?,
                notes: r.get(11)?,
                created_at: r.get(12)?,
                item_count: r.get(13)?,
                total_quantity: r.get(14)?,
            })
        })
        .map_err(|e| format!("Failed to execute report sales query: {}", e))?;

    let mut sales = Vec::new();
    for row in sales_rows {
        sales.push(row.map_err(|e| format!("Failed to read sale record: {}", e))?);
    }

    Ok(BusinessReportResult {
        period_label,
        summary,
        customers,
        top_products,
        sales,
    })
}

/// Retrieves official GSTR-1 compliant tax data broken down into:
/// - Table 4: B2B Supplies to GST Registered merchants
/// - Table 7: B2C Small Supplies to unregistered retail consumers
/// - Table 12: HSN-wise summary of outward supplies
pub fn get_gstr1_report_db(
    conn: &Connection,
    filter: BusinessReportFilter,
) -> Result<Gstr1ReportResult, String> {
    let mut where_clauses: Vec<String> = Vec::new();
    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();
    let preset = filter.date_preset.as_deref().map(str::trim).unwrap_or("this_month");

    let period_label = match preset.to_lowercase().as_str() {
        "today" => {
            where_clauses.push("date(s.created_at) = date('now', 'localtime')".to_string());
            "Today".to_string()
        }
        "yesterday" => {
            where_clauses.push("date(s.created_at) = date('now', 'localtime', '-1 day')".to_string());
            "Yesterday".to_string()
        }
        "this_month" => {
            where_clauses.push("strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now', 'localtime')".to_string());
            "This Month".to_string()
        }
        "last_month" => {
            where_clauses.push("strftime('%Y-%m', s.created_at) = strftime('%Y-%m', 'now', 'localtime', 'start of month', '-1 day')".to_string());
            "Last Month".to_string()
        }
        "this_year" => {
            where_clauses.push("strftime('%Y', s.created_at) = strftime('%Y', 'now', 'localtime')".to_string());
            "This Financial Year".to_string()
        }
        "custom" => {
            let has_start = filter.start_date.as_deref().map(str::trim).filter(|s| !s.is_empty());
            let has_end = filter.end_date.as_deref().map(str::trim).filter(|s| !s.is_empty());

            if let Some(s_date) = has_start {
                if !is_valid_iso_date(s_date) {
                    return Err(format!("Invalid start date '{}'. Format: YYYY-MM-DD", s_date));
                }
                where_clauses.push("date(s.created_at) >= date(?)".to_string());
                params_vec.push(s_date.to_string().into());
            }

            if let Some(e_date) = has_end {
                if !is_valid_iso_date(e_date) {
                    return Err(format!("Invalid end date '{}'. Format: YYYY-MM-DD", e_date));
                }
                where_clauses.push("date(s.created_at) <= date(?)".to_string());
                params_vec.push(e_date.to_string().into());
            }

            match (has_start, has_end) {
                (Some(s), Some(e)) => format!("{} to {}", s, e),
                (Some(s), None) => format!("From {}", s),
                (None, Some(e)) => format!("Until {}", e),
                (None, None) => "Custom Range".to_string(),
            }
        }
        "all" | _ => "All Time".to_string(),
    };

    let sales_where = if where_clauses.is_empty() {
        "1=1".to_string()
    } else {
        where_clauses.join(" AND ")
    };

    let query_params: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|v| v as &dyn rusqlite::ToSql)
        .collect();

    let shop_name: String = conn
        .query_row("SELECT value FROM settings WHERE key = 'shop_name';", [], |r| r.get(0))
        .unwrap_or_else(|_| "Apna Grocery Store".to_string());
    let shop_gstin: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = 'shop_gstin';", [], |r| r.get(0))
        .ok();

    // 2. Table 4: B2B Invoices (Customers with GSTIN)
    let b2b_sql = format!(
        "SELECT
            c.gstin,
            c.name,
            s.invoice_number,
            date(s.created_at) as inv_date,
            s.total_amount,
            COALESCE(c.address, 'Local State'),
            si.gst_rate,
            SUM(si.total_price - si.tax_amount) as taxable_val,
            SUM(si.tax_amount / 2.0) as cgst,
            SUM(si.tax_amount / 2.0) as sgst
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         JOIN customers c ON c.id = s.customer_id
         WHERE {} AND c.gstin IS NOT NULL AND trim(c.gstin) != ''
         GROUP BY s.id, si.gst_rate
         ORDER BY s.id ASC;",
        sales_where
    );

    let mut b2b_stmt = conn.prepare(&b2b_sql).map_err(|e| format!("Failed to prepare B2B query: {}", e))?;
    let b2b_rows = b2b_stmt.query_map(&query_params[..], |row| {
        Ok(Gstr1B2bItem {
            gstin: row.get(0)?,
            customer_name: row.get(1)?,
            invoice_number: row.get(2)?,
            invoice_date: row.get(3)?,
            invoice_value: row.get(4)?,
            place_of_supply: row.get(5)?,
            reverse_charge: "N".to_string(),
            applicable_tax_rate: row.get(6)?,
            taxable_value: row.get(7)?,
            central_tax: row.get(8)?,
            state_tax: row.get(9)?,
        })
    }).map_err(|e| format!("Failed to query B2B items: {}", e))?;

    let mut b2b_table4 = Vec::new();
    let mut total_b2b_taxable = 0.0;
    let mut total_b2b_tax = 0.0;
    for item in b2b_rows {
        let b = item.map_err(|e| format!("Failed to read B2B row: {}", e))?;
        total_b2b_taxable += b.taxable_value;
        total_b2b_tax += b.central_tax + b.state_tax;
        b2b_table4.push(b);
    }

    // 3. Table 7: B2C (Small) Invoices (Customers without GSTIN, grouped by tax rate)
    let b2c_sql = format!(
        "SELECT
            si.gst_rate,
            COALESCE(SUM(si.total_price - si.tax_amount), 0.0) as taxable_val,
            COALESCE(SUM(si.tax_amount / 2.0), 0.0) as cgst,
            COALESCE(SUM(si.tax_amount / 2.0), 0.0) as sgst,
            COUNT(DISTINCT s.id) as inv_count,
            COALESCE(SUM(si.total_price), 0.0) as total_val
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE {} AND (c.gstin IS NULL OR trim(c.gstin) = '')
         GROUP BY si.gst_rate
         ORDER BY si.gst_rate ASC;",
        sales_where
    );

    let mut b2c_stmt = conn.prepare(&b2c_sql).map_err(|e| format!("Failed to prepare B2C query: {}", e))?;
    let b2c_rows = b2c_stmt.query_map(&query_params[..], |row| {
        Ok(Gstr1B2cItem {
            tax_rate: row.get(0)?,
            taxable_value: row.get(1)?,
            central_tax: row.get(2)?,
            state_tax: row.get(3)?,
            invoice_count: row.get(4)?,
            total_value: row.get(5)?,
        })
    }).map_err(|e| format!("Failed to query B2C items: {}", e))?;

    let mut b2c_table7 = Vec::new();
    let mut total_b2c_taxable = 0.0;
    let mut total_b2c_tax = 0.0;
    let mut total_b2c_invoices = 0;
    for item in b2c_rows {
        let b = item.map_err(|e| format!("Failed to read B2C row: {}", e))?;
        total_b2c_taxable += b.taxable_value;
        total_b2c_tax += b.central_tax + b.state_tax;
        total_b2c_invoices += b.invoice_count as usize;
        b2c_table7.push(b);
    }

    // 4. Table 12: HSN Summary of Outward Supplies
    let hsn_sql = format!(
        "SELECT
            COALESCE(NULLIF(trim(si.hsn_code), ''), '0000') as hsn,
            si.product_name,
            COALESCE(NULLIF(trim(si.unit), ''), 'PCS') as uqc,
            SUM(si.quantity) as total_qty,
            SUM(si.total_price) as total_val,
            SUM(si.total_price - si.tax_amount) as taxable_val,
            SUM(si.tax_amount / 2.0) as cgst,
            SUM(si.tax_amount / 2.0) as sgst
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         WHERE {}
         GROUP BY hsn, si.product_name, uqc
         ORDER BY hsn ASC, si.product_name ASC;",
        sales_where
    );

    let mut hsn_stmt = conn.prepare(&hsn_sql).map_err(|e| format!("Failed to prepare HSN query: {}", e))?;
    let hsn_rows = hsn_stmt.query_map(&query_params[..], |row| {
        Ok(Gstr1HsnItem {
            hsn_code: row.get(0)?,
            description: row.get(1)?,
            uqc: row.get(2)?,
            total_quantity: row.get(3)?,
            total_value: row.get(4)?,
            taxable_value: row.get(5)?,
            central_tax: row.get(6)?,
            state_tax: row.get(7)?,
        })
    }).map_err(|e| format!("Failed to query HSN items: {}", e))?;

    let mut hsn_table12 = Vec::new();
    for item in hsn_rows {
        hsn_table12.push(item.map_err(|e| format!("Failed to read HSN row: {}", e))?);
    }

    Ok(Gstr1ReportResult {
        period_label,
        shop_gstin,
        shop_name,
        total_b2b_invoices: b2b_table4.len(),
        total_b2b_taxable,
        total_b2b_tax,
        total_b2c_invoices,
        total_b2c_taxable,
        total_b2c_tax,
        b2b_table4,
        b2c_table7,
        hsn_table12,
    })
}

/// Day-End Cash Drawer Reconciliation (Z-Report / Shift Close)
/// Computes total cash tender inflow, returns outflow, UPI/card breakdown, and expected drawer balance.
pub fn get_day_end_summary_db(
    conn: &Connection,
    target_date: Option<String>,
) -> Result<DayEndSummaryResult, String> {
    let date_str = match target_date {
        Some(ref d) if !d.trim().is_empty() => {
            if !is_valid_iso_date(d.trim()) {
                return Err(format!("Invalid target date '{}'. Format: YYYY-MM-DD", d));
            }
            d.trim().to_string()
        }
        _ => {
            conn.query_row("SELECT date('now', 'localtime');", [], |r| r.get(0))
                .unwrap_or_else(|_| "2026-09-26".to_string())
        }
    };

    let shop_name: String = conn
        .query_row("SELECT value FROM settings WHERE key = 'shop_name';", [], |r| r.get(0))
        .unwrap_or_else(|_| "Apna Grocery Store".to_string());

    let (total_invoices, total_sales_revenue, cash_sales, upi_sales, card_sales, split_sales): (i64, f64, f64, f64, f64, f64) = conn
        .query_row(
            "SELECT
                COUNT(id),
                COALESCE(SUM(total_amount), 0.0),
                COALESCE(SUM(CASE WHEN UPPER(payment_mode) = 'CASH' THEN total_amount ELSE 0.0 END), 0.0),
                COALESCE(SUM(CASE WHEN UPPER(payment_mode) = 'UPI' THEN total_amount ELSE 0.0 END), 0.0),
                COALESCE(SUM(CASE WHEN UPPER(payment_mode) = 'CARD' THEN total_amount ELSE 0.0 END), 0.0),
                COALESCE(SUM(CASE WHEN UPPER(payment_mode) = 'SPLIT' THEN total_amount ELSE 0.0 END), 0.0)
             FROM sales
             WHERE date(created_at) = date(?1);",
            params![date_str],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )
        .unwrap_or((0, 0.0, 0.0, 0.0, 0.0, 0.0));

    // Also calculate any split tender cash recorded in sales notes (e.g. "Cash: ₹X.XX")
    let mut additional_split_cash = 0.0;
    if split_sales > 0.0 {
        if let Ok(mut split_stmt) = conn.prepare(
            "SELECT notes FROM sales WHERE date(created_at) = date(?1) AND UPPER(payment_mode) = 'SPLIT';"
        ) {
            if let Ok(rows) = split_stmt.query_map(params![date_str], |r| r.get::<_, Option<String>>(0)) {
                for note_opt in rows.flatten() {
                    if let Some(note) = note_opt {
                        if let Some(pos) = note.find("Cash: ₹") {
                            let sub = &note[pos + 9..];
                            let end = sub.find(',').or_else(|| sub.find(' ')).unwrap_or(sub.len());
                            if let Ok(val) = sub[..end].trim().parse::<f64>() {
                                additional_split_cash += val;
                            }
                        }
                    }
                }
            }
        }
    }

    let final_cash_sales = cash_sales + additional_split_cash;

    // Returns / Refunds for the day
    let (total_returns_count, total_refund_amount, cash_refund_amount): (i64, f64, f64) = conn
        .query_row(
            "SELECT
                COUNT(id),
                COALESCE(SUM(total_refund), 0.0),
                COALESCE(SUM(CASE WHEN UPPER(refund_mode) = 'CASH' THEN total_refund ELSE 0.0 END), 0.0)
             FROM sales_returns
             WHERE date(created_at) = date(?1);",
            params![date_str],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap_or((0, 0.0, 0.0));

    let net_cash_inflow = final_cash_sales - cash_refund_amount;
    let generated_at: String = conn
        .query_row("SELECT datetime('now', 'localtime');", [], |r| r.get(0))
        .unwrap_or_else(|_| date_str.clone());

    Ok(DayEndSummaryResult {
        report_date: date_str,
        generated_at,
        shop_name,
        total_invoices,
        total_sales_revenue,
        cash_sales: final_cash_sales,
        upi_sales,
        card_sales,
        split_sales,
        total_returns_count,
        total_refund_amount,
        cash_refund_amount,
        net_cash_inflow,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("Failed to open test in-memory SQLite");
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../migrations/001_initial_schema.sql"))
            .expect("Failed to run schema migration 001");
        conn.execute_batch(include_str!("../migrations/002_sales_indexes.sql"))
            .expect("Failed to run schema migration 002");
        conn.execute_batch(include_str!("../migrations/003_returns_and_stock_ledger.sql"))
            .expect("Failed to run schema migration 003");
        conn.execute_batch(include_str!("../migrations/004_hsn_and_gstin.sql"))
            .expect("Failed to run schema migration 004");
        conn.execute_batch(include_str!("../migrations/005_expiry_and_batch.sql"))
            .expect("Failed to run schema migration 005");
        conn
    }

    #[test]
    fn test_successful_walkin_sale_and_stock_reduction() {
        let mut conn = setup_test_db();

        // Insert a product with stock 10
        conn.execute(
            "INSERT INTO products (id, name, barcode, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Tata Salt 1kg', '8901234567890', 30.0, 30.0, 0.0, 10.0, 'PKT');",
            [],
        )
        .unwrap();

        let input = CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Tata Salt 1kg".to_string(),
                barcode: Some("8901234567890".to_string()),
                unit: "PKT".to_string(),
                quantity: 3.0,
                unit_price: 30.0,
                mrp: 30.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        };

        let result = complete_sale_db(&mut conn, input).expect("Sale must complete successfully");

        assert_eq!(result.sale.invoice_number, "INV-000001");
        assert_eq!(result.sale.customer_name, Some("Walk-in Customer".to_string()));
        assert_eq!(result.sale.subtotal, 90.0);
        assert_eq!(result.sale.total_amount, 90.0);
        assert_eq!(result.sale.payment_mode, "CASH");
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].quantity, 3.0);
        assert_eq!(result.items[0].total_price, 90.0);

        // Verify stock was reduced from 10 to 7
        let remaining_stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id = 1;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining_stock, 7.0);
    }

    #[test]
    fn test_customer_linked_sale_and_tax() {
        let mut conn = setup_test_db();

        // Insert customer
        conn.execute(
            "INSERT INTO customers (id, name, phone) VALUES (1, 'Rajesh Kumar', '9876543210');",
            [],
        )
        .unwrap();

        // Insert products: one 0% GST, one 18% GST
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Rice 1kg', 50.0, 50.0, 0.0, 50.0, 'KG'),
                    (2, 'Shampoo 200ml', 100.0, 120.0, 18.0, 20.0, 'BTL');",
            [],
        )
        .unwrap();

        let input = CreateSaleInput {
            customer_id: Some(1),
            customer_name: None,
            customer_phone: None,
            items: vec![
                CartItemInput {
                    product_id: Some(1),
                    product_name: "Rice 1kg".to_string(),
                    barcode: None,
                    unit: "KG".to_string(),
                    quantity: 2.0, // 2 * 50 = 100 subtotal, 0 tax
                    unit_price: 50.0,
                    mrp: 50.0,
                    gst_rate: 0.0,
                    hsn_code: Some("1006".to_string()),
                    ..Default::default()
                },
                CartItemInput {
                    product_id: Some(2),
                    product_name: "Shampoo 200ml".to_string(),
                    barcode: None,
                    unit: "BTL".to_string(),
                    quantity: 1.0, // 1 * 100 = 100 subtotal, 18 tax
                    unit_price: 100.0,
                    mrp: 120.0,
                    gst_rate: 18.0,
                    hsn_code: Some("3305".to_string()),
                    ..Default::default()
                },
            ],
            discount_amount: 10.0,
            payment_mode: "UPI".to_string(),
            notes: Some("UPI Ref: 123456789".to_string()),
            round_off: None,
            ..Default::default()
        };

        let result = complete_sale_db(&mut conn, input).expect("Customer sale must succeed");

        assert_eq!(result.sale.customer_id, Some(1));
        assert_eq!(result.sale.customer_name, Some("Rajesh Kumar".to_string()));
        assert_eq!(result.sale.customer_phone, Some("9876543210".to_string()));
        assert_eq!(result.sale.subtotal, 200.0);
        assert_eq!(result.sale.discount_amount, 10.0);
        // Shampoo (₹100 incl. 18% GST): tax = 100 - (100 / 1.18) = 15.25
        assert_eq!(result.sale.tax_amount, 15.25);
        assert_eq!(result.sale.total_amount, 190.0); // 200 - 10 (Inclusive GST)
        assert_eq!(result.sale.payment_mode, "UPI");

        // Verify query by invoice
        let queried = get_sale_by_invoice_db(&conn, &result.sale.invoice_number)
            .expect("Should query by invoice");
        assert_eq!(queried, result);
    }

    #[test]
    fn test_insufficient_stock_rollback() {
        let mut conn = setup_test_db();

        // Product with stock 2
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Butter 100g', 55.0, 55.0, 0.0, 2.0, 'PKT');",
            [],
        )
        .unwrap();

        // Try to buy 3
        let input = CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Butter 100g".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 3.0,
                unit_price: 55.0,
                mrp: 55.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        };

        let err = complete_sale_db(&mut conn, input).expect_err("Must fail due to insufficient stock");
        assert!(err.contains("Only 2.00 PKT available in stock"), "Error must state stock: {}", err);

        // Verify stock was NOT changed (remains 2)
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id = 1;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stock, 2.0);

        // Verify zero sales were inserted
        let sales_count: i64 = conn
            .query_row("SELECT count(*) FROM sales;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(sales_count, 0);

        // Verify zero sale items were inserted
        let items_count: i64 = conn
            .query_row("SELECT count(*) FROM sale_items;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(items_count, 0);
    }

    #[test]
    fn test_missing_product_rollback() {
        let mut conn = setup_test_db();

        let input = CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(9999), // Non-existent
                product_name: "Ghost Item".to_string(),
                barcode: None,
                unit: "PCS".to_string(),
                quantity: 1.0,
                unit_price: 100.0,
                mrp: 100.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        };

        let err = complete_sale_db(&mut conn, input).expect_err("Must fail for missing product");
        assert!(err.contains("no longer exists"), "Error: {}", err);
    }

    #[test]
    fn test_discount_cannot_exceed_subtotal() {
        let mut conn = setup_test_db();

        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Biscuit', 10.0, 10.0, 0.0, 10.0, 'PKT');",
            [],
        )
        .unwrap();

        let input = CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Biscuit".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 1.0,
                unit_price: 10.0,
                mrp: 10.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 50.0, // Exceeds 10.0
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        };

        let err = complete_sale_db(&mut conn, input).expect_err("Must reject discount exceeding subtotal");
        assert!(err.contains("cannot exceed subtotal"), "Error: {}", err);
    }

    #[test]
    fn test_invoice_number_sequence_across_multiple_sales() {
        let mut conn = setup_test_db();

        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Item', 10.0, 10.0, 0.0, 100.0, 'PCS');",
            [],
        )
        .unwrap();

        for i in 1..=5 {
            let input = CreateSaleInput {
                customer_id: None,
                customer_name: None,
                customer_phone: None,
                items: vec![CartItemInput {
                    product_id: Some(1),
                    product_name: "Item".to_string(),
                    barcode: None,
                    unit: "PCS".to_string(),
                    quantity: 1.0,
                    unit_price: 10.0,
                    mrp: 10.0,
                    gst_rate: 0.0,
                    hsn_code: None,
                    ..Default::default()
                }],
                discount_amount: 0.0,
                payment_mode: "CASH".to_string(),
                notes: None,
                round_off: None,
            ..Default::default()
            };

            let res = complete_sale_db(&mut conn, input).unwrap();
            let expected_inv = format!("INV-{:06}", i);
            assert_eq!(res.sale.invoice_number, expected_inv);
        }

        // Verify recent sales query
        let recent = get_recent_sales_db(&conn, 3).unwrap();
        assert_eq!(recent.len(), 3);
        assert_eq!(recent[0].invoice_number, "INV-000005");
        assert_eq!(recent[1].invoice_number, "INV-000004");
        assert_eq!(recent[2].invoice_number, "INV-000003");
    }

    #[test]
    fn test_round_off_adjustment() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Grains', 246.75, 250.0, 0.0, 10.0, 'KG');",
            [],
        )
        .unwrap();

        let input = CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Grains".to_string(),
                barcode: None,
                unit: "KG".to_string(),
                quantity: 1.0,
                unit_price: 246.75,
                mrp: 250.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: Some(0.25), // 246.75 + 0.25 = 247.00
            ..Default::default()
        };

        let res = complete_sale_db(&mut conn, input).unwrap();
        assert_eq!(res.sale.subtotal, 246.75);
        assert_eq!(res.sale.total_amount, 247.00);
    }

    #[test]
    fn test_financial_year_invoice_format() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('invoice_format', 'fy');",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Sugar', 45.0, 45.0, 0.0, 50.0, 'KG');",
            [],
        )
        .unwrap();

        let input = CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Sugar".to_string(),
                barcode: None,
                unit: "KG".to_string(),
                quantity: 1.0,
                unit_price: 45.0,
                mrp: 45.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        };

        let res = complete_sale_db(&mut conn, input).unwrap();
        assert!(res.sale.invoice_number.starts_with("INV/"), "Should start with INV/: {}", res.sale.invoice_number);
        assert!(res.sale.invoice_number.ends_with("/000001"), "Should end with /000001: {}", res.sale.invoice_number);
    }

    #[test]
    fn test_sales_history_pagination_and_sorting() {
        let mut conn = setup_test_db();

        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Wheat Flour', 40.0, 40.0, 0.0, 500.0, 'KG');",
            [],
        )
        .unwrap();

        // Create 25 sales
        for i in 1..=25 {
            let input = CreateSaleInput {
                customer_id: None,
                customer_name: Some(format!("Customer {:02}", i)),
                customer_phone: None,
                items: vec![CartItemInput {
                    product_id: Some(1),
                    product_name: "Wheat Flour".to_string(),
                    barcode: None,
                    unit: "KG".to_string(),
                    quantity: i as f64,
                    unit_price: 40.0,
                    mrp: 40.0,
                    gst_rate: 0.0,
                    hsn_code: None,
                    ..Default::default()
                }],
                discount_amount: 0.0,
                payment_mode: "CASH".to_string(),
                notes: None,
                round_off: None,
            ..Default::default()
            };
            complete_sale_db(&mut conn, input).unwrap();
        }

        // Test page 1, page_size 10 (default sort: newest first)
        let res_p1 = get_sales_history_db(&conn, SalesFilterParams {
            page: Some(1),
            page_size: Some(10),
            ..Default::default()
        }).unwrap();
        assert_eq!(res_p1.total_count, 25);
        assert_eq!(res_p1.total_pages, 3);
        assert_eq!(res_p1.sales.len(), 10);
        assert_eq!(res_p1.sales[0].invoice_number, "INV-000025");
        assert_eq!(res_p1.sales[9].invoice_number, "INV-000016");

        // Test page 2, page_size 10
        let res_p2 = get_sales_history_db(&conn, SalesFilterParams {
            page: Some(2),
            page_size: Some(10),
            ..Default::default()
        }).unwrap();
        assert_eq!(res_p2.sales.len(), 10);
        assert_eq!(res_p2.sales[0].invoice_number, "INV-000015");

        // Test page 3, page_size 10 (last page with remaining 5)
        let res_p3 = get_sales_history_db(&conn, SalesFilterParams {
            page: Some(3),
            page_size: Some(10),
            ..Default::default()
        }).unwrap();
        assert_eq!(res_p3.sales.len(), 5);
        assert_eq!(res_p3.sales[4].invoice_number, "INV-000001");

        // Test sort by total_amount ASC
        let res_sort_asc = get_sales_history_db(&conn, SalesFilterParams {
            page: Some(1),
            page_size: Some(5),
            sort_by: Some("total_amount".to_string()),
            sort_direction: Some("asc".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(res_sort_asc.sales[0].total_amount, 40.0); // 1 * 40

        // Test sort by total_amount DESC
        let res_sort_desc = get_sales_history_db(&conn, SalesFilterParams {
            page: Some(1),
            page_size: Some(5),
            sort_by: Some("total_amount".to_string()),
            sort_direction: Some("desc".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(res_sort_desc.sales[0].total_amount, 1000.0); // 25 * 40
    }

    #[test]
    fn test_sales_history_search_by_invoice_customer_phone() {
        let mut conn = setup_test_db();

        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Tea', 100.0, 100.0, 0.0, 100.0, 'PKT');",
            [],
        )
        .unwrap();

        // Sale 1: Walk-in
        complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Tea".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 1.0,
                unit_price: 100.0,
                mrp: 100.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        }).unwrap();

        // Sale 2: Rajesh with phone
        complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: Some("Rajesh Kumar".to_string()),
            customer_phone: Some("9876543210".to_string()),
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Tea".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 1.0,
                unit_price: 100.0,
                mrp: 100.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "UPI".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        }).unwrap();

        // Sale 3: Priya with phone
        complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: Some("Priya Sharma".to_string()),
            customer_phone: Some("9123456789".to_string()),
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Tea".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 1.0,
                unit_price: 100.0,
                mrp: 100.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "CARD".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        }).unwrap();

        // 1. Search by invoice number
        let search_inv = get_sales_history_db(&conn, SalesFilterParams {
            search: Some("INV-000002".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(search_inv.total_count, 1);
        assert_eq!(search_inv.sales[0].customer_name, Some("Rajesh Kumar".to_string()));

        // 2. Search by customer name (case-insensitive substring)
        let search_name = get_sales_history_db(&conn, SalesFilterParams {
            search: Some("priya".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(search_name.total_count, 1);
        assert_eq!(search_name.sales[0].customer_name, Some("Priya Sharma".to_string()));

        // 3. Search by phone number
        let search_phone = get_sales_history_db(&conn, SalesFilterParams {
            search: Some("987654".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(search_phone.total_count, 1);
        assert_eq!(search_phone.sales[0].customer_phone, Some("9876543210".to_string()));

        // 4. Search walk-in
        let search_walkin = get_sales_history_db(&conn, SalesFilterParams {
            search: Some("Walk-in".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(search_walkin.total_count, 1);
        assert_eq!(search_walkin.sales[0].invoice_number, "INV-000001");

        // 5. No results
        let search_none = get_sales_history_db(&conn, SalesFilterParams {
            search: Some("NonExistentMerchant999".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(search_none.total_count, 0);
        assert!(search_none.sales.is_empty());
    }

    #[test]
    fn test_sales_history_payment_mode_filter() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Milk 500ml', 30.0, 30.0, 0.0, 50.0, 'PKT');",
            [],
        )
        .unwrap();

        // 1 CASH sale
        complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Milk 500ml".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 1.0,
                unit_price: 30.0,
                mrp: 30.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        }).unwrap();

        // 2 UPI sales
        for _ in 0..2 {
            complete_sale_db(&mut conn, CreateSaleInput {
                customer_id: None,
                customer_name: None,
                customer_phone: None,
                items: vec![CartItemInput {
                    product_id: Some(1),
                    product_name: "Milk 500ml".to_string(),
                    barcode: None,
                    unit: "PKT".to_string(),
                    quantity: 1.0,
                    unit_price: 30.0,
                    mrp: 30.0,
                    gst_rate: 0.0,
                    hsn_code: None,
                    ..Default::default()
                }],
                discount_amount: 0.0,
                payment_mode: "UPI".to_string(),
                notes: None,
                round_off: None,
            ..Default::default()
            }).unwrap();
        }

        let cash_res = get_sales_history_db(&conn, SalesFilterParams {
            payment_mode: Some("CASH".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(cash_res.total_count, 1);
        assert_eq!(cash_res.sales[0].payment_mode, "CASH");

        let upi_res = get_sales_history_db(&conn, SalesFilterParams {
            payment_mode: Some("upi".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(upi_res.total_count, 2);
        assert_eq!(upi_res.sales[0].payment_mode, "UPI");

        let card_res = get_sales_history_db(&conn, SalesFilterParams {
            payment_mode: Some("CARD".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(card_res.total_count, 0);
    }

    #[test]
    fn test_sales_history_date_filters_and_invalid_range() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Bread', 40.0, 40.0, 0.0, 10.0, 'PKT');",
            [],
        )
        .unwrap();

        complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Bread".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 1.0,
                unit_price: 40.0,
                mrp: 40.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        }).unwrap();

        // 1. "today" preset should include today's sale
        let today_res = get_sales_history_db(&conn, SalesFilterParams {
            date_preset: Some("today".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(today_res.total_count, 1);

        // 2. "yesterday" preset should NOT include today's sale
        let yesterday_res = get_sales_history_db(&conn, SalesFilterParams {
            date_preset: Some("yesterday".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(yesterday_res.total_count, 0);

        // 3. Invalid date range (start > end) should return error
        let err_range = get_sales_history_db(&conn, SalesFilterParams {
            date_preset: Some("custom".to_string()),
            start_date: Some("2026-10-01".to_string()),
            end_date: Some("2026-09-01".to_string()),
            ..Default::default()
        }).expect_err("Should error when start_date > end_date");
        assert!(err_range.contains("cannot be after end date"), "Error: {}", err_range);

        // 4. Malformed date should return error
        let err_malformed = get_sales_history_db(&conn, SalesFilterParams {
            date_preset: Some("custom".to_string()),
            start_date: Some("invalid-date".to_string()),
            ..Default::default()
        }).expect_err("Should error on invalid date string");
        assert!(err_malformed.contains("Invalid start date"), "Error: {}", err_malformed);
    }

    #[test]
    fn test_critical_historical_data_immutability_when_product_and_customer_updated() {
        let mut conn = setup_test_db();

        // Insert customer with initial details
        conn.execute(
            "INSERT INTO customers (id, name, phone, address)
             VALUES (1, 'Ramesh Gupta', '9876543210', 'Old Bazaar');",
            [],
        )
        .unwrap();

        // Insert product with initial selling price 25.0
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Tata Salt 1kg', 25.0, 25.0, 0.0, 50.0, 'PKT');",
            [],
        )
        .unwrap();

        // Complete sale at initial price ₹25.0
        let sale_res = complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: Some(1),
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Tata Salt 1kg".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 2.0,
                unit_price: 25.0,
                mrp: 25.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: Some("Original Sale Note".to_string()),
            round_off: None,
            ..Default::default()
        }).unwrap();

        let inv_no = sale_res.sale.invoice_number.clone();
        let sale_id = sale_res.sale.id;

        // NOW: Customer changes their phone and name in the master customer profile
        conn.execute(
            "UPDATE customers SET name = 'Ramesh G. NewName', phone = '9111222333' WHERE id = 1;",
            [],
        )
        .unwrap();

        // NOW: Shopkeeper updates the product selling price from ₹25 to ₹35, and name in inventory
        conn.execute(
            "UPDATE products SET selling_price = 35.0, mrp = 35.0, name = 'Tata Salt (New Edition)' WHERE id = 1;",
            [],
        )
        .unwrap();

        // Verify that the historical invoice record fetched by invoice number is COMPLETELY IMMUTABLE
        let historical_by_inv = get_sale_by_invoice_db(&conn, &inv_no).unwrap();
        assert_eq!(historical_by_inv.sale.customer_name, Some("Ramesh Gupta".to_string()),
            "Historical invoice must retain original customer name");
        assert_eq!(historical_by_inv.sale.customer_phone, Some("9876543210".to_string()),
            "Historical invoice must retain original customer phone");
        assert_eq!(historical_by_inv.sale.subtotal, 50.0,
            "Historical invoice subtotal must remain 50.0");
        assert_eq!(historical_by_inv.sale.total_amount, 50.0,
            "Historical invoice total amount must remain 50.0");
        assert_eq!(historical_by_inv.items.len(), 1);
        assert_eq!(historical_by_inv.items[0].product_name, "Tata Salt 1kg",
            "Historical item name must remain unchanged");
        assert_eq!(historical_by_inv.items[0].unit_price, 25.0,
            "Historical item price must remain ₹25.0 even if product is now ₹35.0");
        assert_eq!(historical_by_inv.items[0].total_price, 50.0);

        // Verify that the historical invoice record fetched by ID is also COMPLETELY IMMUTABLE
        let historical_by_id = get_sale_by_id_db(&conn, sale_id).unwrap();
        assert_eq!(historical_by_id, historical_by_inv);

        // Verify that Sales History listing also displays the immutable historical snapshot
        let history_listing = get_sales_history_db(&conn, SalesFilterParams {
            search: Some("Ramesh".to_string()),
            ..Default::default()
        }).unwrap();
        assert_eq!(history_listing.total_count, 1);
        assert_eq!(history_listing.sales[0].customer_name, Some("Ramesh Gupta".to_string()));
        assert_eq!(history_listing.sales[0].customer_phone, Some("9876543210".to_string()));
        assert_eq!(history_listing.sales[0].total_amount, 50.0);
    }

    #[test]
    fn test_get_sale_by_id() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Soap', 20.0, 20.0, 0.0, 10.0, 'PCS');",
            [],
        )
        .unwrap();

        let sale = complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: Some("Test User".to_string()),
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Soap".to_string(),
                barcode: None,
                unit: "PCS".to_string(),
                quantity: 2.0,
                unit_price: 20.0,
                mrp: 20.0,
                gst_rate: 0.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        }).unwrap();

        let fetched = get_sale_by_id_db(&conn, sale.sale.id).unwrap();
        assert_eq!(fetched, sale);

        // Error for non-existent id
        let err = get_sale_by_id_db(&conn, 99999).unwrap_err();
        assert!(err.contains("not found"));
    }

    #[test]
    fn test_sale_unit_price_cannot_exceed_mrp() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Mustard Oil 1L', 140.0, 150.0, 5.0, 20.0, 'L');",
            [],
        )
        .unwrap();

        // Attempting to sell at 160 when MRP is 150 must fail
        let err = complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: Some("Walk-in".to_string()),
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Mustard Oil 1L".to_string(),
                barcode: None,
                unit: "L".to_string(),
                quantity: 1.0,
                unit_price: 160.0, // Exceeds MRP 150.0!
                mrp: 150.0,
                gst_rate: 5.0,
                hsn_code: None,
                ..Default::default()
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        }).unwrap_err();

        assert!(
            err.contains("cannot exceed MRP"),
            "Error must report MRP violation: {}",
            err
        );
    }

    #[test]
    fn test_business_report_generation() {
        let mut conn = setup_test_db();

        // 1. Create a customer
        conn.execute(
            "INSERT INTO customers (id, name, phone, address) VALUES (1, 'Ramesh Gupta', '9876543210', 'Shop 4, Market');",
            [],
        ).unwrap();

        // 2. Create products with purchase_price, selling_price, mrp
        conn.execute(
            "INSERT INTO products (id, name, category, unit, purchase_price, selling_price, mrp, gst_rate, stock, hsn_code)
             VALUES (1, 'Basmati Rice 1kg', 'Grains & Flours', 'Kg', 70.0, 95.0, 100.0, 5.0, 50.0, '1006');",
            [],
        ).unwrap();

        conn.execute(
            "INSERT INTO products (id, name, category, unit, purchase_price, selling_price, mrp, gst_rate, stock, hsn_code)
             VALUES (2, 'Toor Dal 500g', 'Pulses & Dals', 'Gram', 60.0, 80.0, 85.0, 0.0, 30.0, '0713');",
            [],
        ).unwrap();

        // 3. Complete a sale
        let sale_input = CreateSaleInput {
            customer_id: Some(1),
            customer_name: Some("Ramesh Gupta".to_string()),
            customer_phone: Some("9876543210".to_string()),
            items: vec![
                CartItemInput {
                    product_id: Some(1),
                    product_name: "Basmati Rice 1kg".to_string(),
                    barcode: None,
                    unit: "Kg".to_string(),
                    quantity: 2.0,
                    unit_price: 95.0,
                    mrp: 100.0,
                    gst_rate: 5.0,
                    hsn_code: Some("1006".to_string()),
                    ..Default::default()
                },
                CartItemInput {
                    product_id: Some(2),
                    product_name: "Toor Dal 500g".to_string(),
                    barcode: None,
                    unit: "Gram".to_string(),
                    quantity: 1.0,
                    unit_price: 80.0,
                    mrp: 85.0,
                    gst_rate: 0.0,
                    hsn_code: Some("0713".to_string()),
                    ..Default::default()
                },
            ],
            discount_amount: 10.0,
            payment_mode: "UPI".to_string(),
            notes: Some("Diwali Order".to_string()),
            round_off: None,
            ..Default::default()
        };

        let result = complete_sale_db(&mut conn, sale_input).expect("Sale must succeed");
        assert_eq!(result.items.len(), 2);

        // 4. Query report for today
        let report = get_business_report_db(&conn, BusinessReportFilter {
            date_preset: Some("today".to_string()),
            start_date: None,
            end_date: None,
        }).expect("Report query must succeed");

        assert_eq!(report.summary.total_invoices, 1);
        assert_eq!(report.summary.total_items_sold, 3.0);
        // Revenue: subtotal 270 - 10 discount = 260.0 (Inclusive GST)
        assert_eq!(report.summary.total_sales_revenue, 260.0);
        // Cost: 2 * 70 + 1 * 60 = 200.0
        assert_eq!(report.summary.total_purchase_cost, 200.0);
        // Profit: 260.0 - 200 = 60.0
        assert_eq!(report.summary.gross_profit, 60.0);
        assert_eq!(report.summary.payment_upi, 260.0);
        assert_eq!(report.summary.payment_cash, 0.0);

        // Check customer spend
        assert_eq!(report.customers.len(), 1);
        assert_eq!(report.customers[0].name, "Ramesh Gupta");
        assert_eq!(report.customers[0].total_spent_on_buying, 260.0);
        assert_eq!(report.customers[0].total_purchase_cost_to_store, 200.0);

        // Check top products
        assert_eq!(report.top_products.len(), 2);
        assert_eq!(report.top_products[0].product_name, "Basmati Rice 1kg");
        assert_eq!(report.top_products[0].quantity_sold, 2.0);

        // Check sales invoices list
        assert_eq!(report.sales.len(), 1);
        assert_eq!(report.sales[0].payment_mode, "UPI");
    }

    #[test]
    fn test_sale_records_expiry_and_batch() {
        let mut conn = setup_test_db();

        // Insert product with batch and expiry
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit, expiry_date, batch_number)
             VALUES (1, 'Organic Milk 500ml', 40.0, 40.0, 0.0, 20.0, 'PKT', '2026-10-15', 'BATCH-OM-99');",
            [],
        )
        .unwrap();

        // 1. Sale with product_id where cashier did not specify batch/expiry -> should snapshot from product master!
        let sale1 = complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Organic Milk 500ml".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 1.0,
                unit_price: 40.0,
                mrp: 40.0,
                gst_rate: 0.0,
                hsn_code: None,
                expiry_date: None,
                batch_number: None,
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        }).unwrap();

        assert_eq!(sale1.items[0].expiry_date, Some("2026-10-15".to_string()));
        assert_eq!(sale1.items[0].batch_number, Some("BATCH-OM-99".to_string()));

        // 2. Sale where cashier explicitly specifies a batch
        let sale2 = complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Organic Milk 500ml".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 1.0,
                unit_price: 40.0,
                mrp: 40.0,
                gst_rate: 0.0,
                hsn_code: None,
                expiry_date: Some("2026-11-20".to_string()),
                batch_number: Some("BATCH-SPECIAL-01".to_string()),
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
            ..Default::default()
        }).unwrap();

        assert_eq!(sale2.items[0].expiry_date, Some("2026-11-20".to_string()));
        assert_eq!(sale2.items[0].batch_number, Some("BATCH-SPECIAL-01".to_string()));
    }
}


