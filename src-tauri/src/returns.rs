use crate::db::with_transaction;
use crate::inventory::record_stock_movement_tx;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

fn round_currency(val: f64) -> f64 {
    (val * 100.0).round() / 100.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnItemInput {
    pub sale_item_id: i64,
    pub return_quantity: f64,
    pub restock: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReturnInput {
    pub sale_id: i64,
    pub items: Vec<ReturnItemInput>,
    pub refund_mode: String, // 'CASH' | 'UPI' | 'CARD'
    pub reason: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SalesReturnRecord {
    pub id: i64,
    pub return_number: String,
    pub sale_id: i64,
    pub customer_id: Option<i64>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub refund_amount: f64,
    pub refund_mode: String,
    pub reason: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SalesReturnItemRecord {
    pub id: i64,
    pub return_id: i64,
    pub sale_item_id: i64,
    pub product_id: Option<i64>,
    pub product_name: String,
    pub barcode: Option<String>,
    pub unit: String,
    pub original_quantity: f64,
    pub return_quantity: f64,
    pub unit_price: f64,
    pub tax_rate: f64,
    pub refund_amount: f64,
    pub restock: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SalesReturnResult {
    pub return_record: SalesReturnRecord,
    pub items: Vec<SalesReturnItemRecord>,
    pub original_invoice_number: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReturnableItemInfo {
    pub sale_item_id: i64,
    pub product_id: Option<i64>,
    pub product_name: String,
    pub barcode: Option<String>,
    pub unit: String,
    pub sold_quantity: f64,
    pub already_returned_quantity: f64,
    pub available_return_quantity: f64,
    pub unit_price: f64,
    pub mrp: f64,
    pub gst_rate: f64,
    pub tax_amount: f64,
    pub total_price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ReturnListItem {
    pub id: i64,
    pub return_number: String,
    pub sale_id: i64,
    pub original_invoice_number: String,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub refund_amount: f64,
    pub refund_mode: String,
    pub reason: String,
    pub created_at: String,
    pub items_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ReturnsFilterParams {
    pub search: Option<String>,
    pub refund_mode: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PaginatedReturnsResult {
    pub returns: Vec<ReturnListItem>,
    pub total_count: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}

/// Helper to generate sequential return number (e.g. RET/26-27/000001 or RET-000001)
fn generate_return_number(tx: &rusqlite::Transaction) -> Result<String, String> {
    let format_mode: String = tx
        .query_row(
            "SELECT value FROM settings WHERE key = 'invoice_format';",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "standard".to_string());

    let prefix = "RET";

    let max_id: i64 = tx
        .query_row("SELECT COALESCE(MAX(id), 0) FROM sales_returns;", [], |row| {
            row.get(0)
        })
        .map_err(|e| format!("Failed to read max return id: {}", e))?;

    let mut candidate_seq = max_id + 1;

    let fy_str = if format_mode.to_lowercase() == "fy" {
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
        Some(format!("{:02}-{:02}", start_y, end_y))
    } else {
        None
    };

    loop {
        let candidate = match &fy_str {
            Some(fy) => format!("{}/{}/{:06}", prefix, fy, candidate_seq),
            None => format!("{}-{:06}", prefix, candidate_seq),
        };

        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sales_returns WHERE return_number = ?1);",
                params![&candidate],
                |row| row.get(0),
            )
            .map_err(|e| format!("Database error verifying return number uniqueness: {}", e))?;

        if !exists {
            return Ok(candidate);
        }
        candidate_seq += 1;
    }
}

/// Inspects an existing sale and returns each line item with its available returnable quantity.
/// `available_return_quantity = sold_quantity - already_returned_quantity`
pub fn get_returnable_items_db(
    conn: &Connection,
    sale_id: i64,
) -> Result<Vec<ReturnableItemInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT si.id, si.product_id, si.product_name, si.barcode, si.unit,
                    si.quantity, si.unit_price, si.mrp, si.gst_rate, si.tax_amount, si.total_price,
                    COALESCE((SELECT SUM(sri.return_quantity) FROM sales_return_items sri WHERE sri.sale_item_id = si.id), 0.0) AS already_returned
             FROM sale_items si
             WHERE si.sale_id = ?1
             ORDER BY si.id ASC;",
        )
        .map_err(|e| format!("Failed to prepare returnable items query: {}", e))?;

    let rows = stmt
        .query_map(params![sale_id], |row| {
            let sold_quantity: f64 = row.get(5)?;
            let already_returned: f64 = row.get(11)?;
            let available = (sold_quantity - already_returned).max(0.0);
            Ok(ReturnableItemInfo {
                sale_item_id: row.get(0)?,
                product_id: row.get(1)?,
                product_name: row.get(2)?,
                barcode: row.get(3)?,
                unit: row.get(4)?,
                sold_quantity,
                already_returned_quantity: already_returned,
                available_return_quantity: (available * 1000.0).round() / 1000.0,
                unit_price: row.get(6)?,
                mrp: row.get(7)?,
                gst_rate: row.get(8)?,
                tax_amount: row.get(9)?,
                total_price: row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to query returnable items: {}", e))?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| format!("Failed to read returnable item: {}", e))?);
    }

    Ok(list)
}

/// Atomically creates a sales return record, validates return quantities, calculates refund amounts,
/// updates stock for restocked goods, and writes stock ledger movements in a single transaction.
pub fn create_return_db(
    conn: &mut Connection,
    input: CreateReturnInput,
) -> Result<SalesReturnResult, String> {
    if input.items.is_empty() {
        return Err("No items selected for return. Please select at least one item.".to_string());
    }

    let clean_reason = input.reason.trim();
    if clean_reason.is_empty() {
        return Err("Return reason is required.".to_string());
    }

    let refund_mode = match input.refund_mode.trim().to_uppercase().as_str() {
        "CASH" => "CASH",
        "UPI" => "UPI",
        "CARD" => "CARD",
        _ => "CASH",
    };

    with_transaction(conn, |tx| {
        // 1. Validate original sale exists
        let sale_info: Option<(String, Option<i64>, Option<String>, Option<String>, f64, f64)> = tx
            .query_row(
                "SELECT invoice_number, customer_id, customer_name, customer_phone, subtotal, discount_amount
                 FROM sales WHERE id = ?1;",
                params![input.sale_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .optional()
            .map_err(|e| format!("Database error querying sale: {}", e))?;

        let (inv_num, cust_id, cust_name, cust_phone, subtotal, discount_amount) = match sale_info {
            Some(info) => info,
            None => return Err(format!("Original sale (ID {}) not found.", input.sale_id)),
        };

        // Calculate bill-level discount ratio for accurate, fair refunds
        let discount_ratio = if subtotal > 0.0 && discount_amount > 0.0 {
            (discount_amount / subtotal).min(1.0)
        } else {
            0.0
        };

        // 2. Validate items and compute refunds
        struct CalculatedReturnItem {
            sale_item_id: i64,
            product_id: Option<i64>,
            product_name: String,
            barcode: Option<String>,
            unit: String,
            original_quantity: f64,
            return_quantity: f64,
            unit_price: f64,
            tax_rate: f64,
            refund_amount: f64,
            restock: bool,
            reason: Option<String>,
        }

        let mut calculated_items = Vec::with_capacity(input.items.len());
        let mut total_refund: f64 = 0.0;

        for item_in in &input.items {
            if item_in.return_quantity <= 0.0 || item_in.return_quantity.is_nan() || item_in.return_quantity.is_infinite() {
                return Err(format!(
                    "Return quantity must be greater than zero (Sale Item ID: {}).",
                    item_in.sale_item_id
                ));
            }

            // Query sale_item details
            let si_info: Option<(Option<i64>, String, Option<String>, String, f64, f64, f64)> = tx
                .query_row(
                    "SELECT product_id, product_name, barcode, unit, quantity, unit_price, gst_rate
                     FROM sale_items WHERE id = ?1 AND sale_id = ?2;",
                    params![item_in.sale_item_id, input.sale_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
                )
                .optional()
                .map_err(|e| format!("Database error querying sale item: {}", e))?;

            let (p_id, p_name, p_barcode, p_unit, sold_qty, unit_price, gst_rate) = match si_info {
                Some(si) => si,
                None => {
                    return Err(format!(
                        "Sale item (ID: {}) does not belong to invoice {}.",
                        item_in.sale_item_id, inv_num
                    ));
                }
            };

            // Query previously returned quantity
            let already_returned: f64 = tx
                .query_row(
                    "SELECT COALESCE(SUM(return_quantity), 0.0) FROM sales_return_items WHERE sale_item_id = ?1;",
                    params![item_in.sale_item_id],
                    |row| row.get(0),
                )
                .unwrap_or(0.0);

            let available_return = (sold_qty - already_returned).max(0.0);
            let available_return_rounded = (available_return * 1000.0).round() / 1000.0;
            let req_return_rounded = (item_in.return_quantity * 1000.0).round() / 1000.0;

            if req_return_rounded > available_return_rounded {
                return Err(format!(
                    "Cannot return {:.2} {} of '{}'. Only {:.2} {} available to return (Sold: {:.2}, Already returned: {:.2}).",
                    item_in.return_quantity, p_unit, p_name, available_return, p_unit, sold_qty, already_returned
                ));
            }

            // Refund calculation respecting historical prices & bill discount
            let effective_unit_price = unit_price * (1.0 - discount_ratio);
            let tax_per_unit = if gst_rate > 0.0 {
                effective_unit_price * (gst_rate / 100.0)
            } else {
                0.0
            };
            let line_unit_paid = effective_unit_price + tax_per_unit;
            let line_refund = round_currency(item_in.return_quantity * line_unit_paid);

            total_refund += line_refund;

            calculated_items.push(CalculatedReturnItem {
                sale_item_id: item_in.sale_item_id,
                product_id: p_id,
                product_name: p_name,
                barcode: p_barcode,
                unit: p_unit,
                original_quantity: sold_qty,
                return_quantity: item_in.return_quantity,
                unit_price,
                tax_rate: gst_rate,
                refund_amount: line_refund,
                restock: item_in.restock,
                reason: item_in.reason.as_deref().map(str::trim).map(String::from),
            });
        }

        total_refund = round_currency(total_refund);

        // 3. Generate unique return number
        let return_number = generate_return_number(tx)?;

        // 4. Insert sales_returns header
        tx.execute(
            "INSERT INTO sales_returns (
                return_number, sale_id, customer_id, customer_name, customer_phone,
                refund_amount, refund_mode, reason, notes, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now', 'localtime'));",
            params![
                return_number,
                input.sale_id,
                cust_id,
                cust_name,
                cust_phone,
                total_refund,
                refund_mode,
                clean_reason,
                input.notes.as_deref().map(str::trim),
            ],
        )
        .map_err(|e| format!("Failed to insert sales return header: {}", e))?;

        let return_id = tx.last_insert_rowid();

        // 5. Insert return items and handle restocking
        let mut persisted_items = Vec::with_capacity(calculated_items.len());

        for c_item in calculated_items {
            tx.execute(
                "INSERT INTO sales_return_items (
                    return_id, sale_item_id, product_id, product_name, barcode, unit,
                    original_quantity, return_quantity, unit_price, tax_rate, refund_amount, restock, reason
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13);",
                params![
                    return_id,
                    c_item.sale_item_id,
                    c_item.product_id,
                    c_item.product_name,
                    c_item.barcode,
                    c_item.unit,
                    c_item.original_quantity,
                    c_item.return_quantity,
                    c_item.unit_price,
                    c_item.tax_rate,
                    c_item.refund_amount,
                    if c_item.restock { 1 } else { 0 },
                    c_item.reason,
                ],
            )
            .map_err(|e| format!("Failed to insert return item: {}", e))?;

            let item_id = tx.last_insert_rowid();

            // If restock is YES and product_id is valid, restore stock atomically and create ledger movement
            if c_item.restock {
                if let Some(pid) = c_item.product_id {
                    let cur_stock: f64 = tx
                        .query_row("SELECT stock FROM products WHERE id = ?1;", params![pid], |row| row.get(0))
                        .unwrap_or(0.0);

                    let new_stock = round_currency(cur_stock + c_item.return_quantity);

                    tx.execute(
                        "UPDATE products SET stock = ?1, updated_at = datetime('now', 'localtime') WHERE id = ?2;",
                        params![new_stock, pid],
                    )
                    .map_err(|e| format!("Failed to restock product '{}': {}", c_item.product_name, e))?;

                    record_stock_movement_tx(
                        tx,
                        pid,
                        &c_item.product_name,
                        c_item.barcode.as_deref(),
                        &c_item.unit,
                        "SALE_RETURN",
                        c_item.return_quantity,
                        cur_stock,
                        new_stock,
                        Some("RETURN"),
                        Some(&return_number),
                        Some(clean_reason),
                        input.notes.as_deref().map(str::trim),
                    )?;
                }
            }

            persisted_items.push(SalesReturnItemRecord {
                id: item_id,
                return_id,
                sale_item_id: c_item.sale_item_id,
                product_id: c_item.product_id,
                product_name: c_item.product_name,
                barcode: c_item.barcode,
                unit: c_item.unit,
                original_quantity: c_item.original_quantity,
                return_quantity: c_item.return_quantity,
                unit_price: c_item.unit_price,
                tax_rate: c_item.tax_rate,
                refund_amount: c_item.refund_amount,
                restock: c_item.restock,
                reason: c_item.reason,
            });
        }

        // 6. Fetch created return record
        let return_record = tx
            .query_row(
                "SELECT id, return_number, sale_id, customer_id, customer_name, customer_phone,
                        refund_amount, refund_mode, reason, notes, created_at
                 FROM sales_returns WHERE id = ?1;",
                params![return_id],
                |row| {
                    Ok(SalesReturnRecord {
                        id: row.get(0)?,
                        return_number: row.get(1)?,
                        sale_id: row.get(2)?,
                        customer_id: row.get(3)?,
                        customer_name: row.get(4)?,
                        customer_phone: row.get(5)?,
                        refund_amount: row.get(6)?,
                        refund_mode: row.get(7)?,
                        reason: row.get(8)?,
                        notes: row.get(9)?,
                        created_at: row.get(10)?,
                    })
                },
            )
            .map_err(|e| format!("Failed to load inserted return record: {}", e))?;

        Ok(SalesReturnResult {
            return_record,
            items: persisted_items,
            original_invoice_number: inv_num,
        })
    })
}

/// Retrieves returns history with server-side pagination, searching, and filtering
pub fn get_returns_history_db(
    conn: &Connection,
    filter: ReturnsFilterParams,
) -> Result<PaginatedReturnsResult, String> {
    let mut where_clauses = Vec::new();
    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(ref q) = filter.search {
        let clean = q.trim();
        if !clean.is_empty() {
            let pattern = format!("%{}%", clean);
            where_clauses.push(
                "(sr.return_number LIKE ? COLLATE NOCASE OR s.invoice_number LIKE ? COLLATE NOCASE OR sr.customer_name LIKE ? COLLATE NOCASE OR sr.customer_phone LIKE ?)"
                    .to_string(),
            );
            params_vec.push(pattern.clone().into());
            params_vec.push(pattern.clone().into());
            params_vec.push(pattern.clone().into());
            params_vec.push(pattern.into());
        }
    }

    if let Some(ref mode) = filter.refund_mode {
        let clean = mode.trim();
        if !clean.is_empty() && !clean.eq_ignore_ascii_case("all") {
            where_clauses.push("sr.refund_mode = ? COLLATE NOCASE".to_string());
            params_vec.push(clean.to_uppercase().into());
        }
    }

    if let Some(ref s_date) = filter.start_date {
        let clean = s_date.trim();
        if !clean.is_empty() {
            where_clauses.push("date(sr.created_at) >= date(?)".to_string());
            params_vec.push(clean.to_string().into());
        }
    }

    if let Some(ref e_date) = filter.end_date {
        let clean = e_date.trim();
        if !clean.is_empty() {
            where_clauses.push("date(sr.created_at) <= date(?)".to_string());
            params_vec.push(clean.to_string().into());
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

    let count_sql = format!(
        "SELECT count(*) FROM sales_returns sr JOIN sales s ON sr.sale_id = s.id WHERE {};",
        where_sql
    );
    let count_params: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|v| v as &dyn rusqlite::ToSql)
        .collect();

    let total_count: i64 = conn
        .query_row(&count_sql, count_params.as_slice(), |row| row.get(0))
        .map_err(|e| format!("Failed to count returns: {}", e))?;

    let total_pages = if total_count == 0 {
        1
    } else {
        (total_count + page_size - 1) / page_size
    };

    if total_count == 0 {
        return Ok(PaginatedReturnsResult {
            returns: Vec::new(),
            total_count: 0,
            page,
            page_size,
            total_pages: 1,
        });
    }

    let select_sql = format!(
        "SELECT sr.id, sr.return_number, sr.sale_id, s.invoice_number,
                sr.customer_name, sr.customer_phone, sr.refund_amount,
                sr.refund_mode, sr.reason, sr.created_at,
                (SELECT count(*) FROM sales_return_items sri WHERE sri.return_id = sr.id) AS items_count
         FROM sales_returns sr
         JOIN sales s ON sr.sale_id = s.id
         WHERE {}
         ORDER BY sr.id DESC
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
        .map_err(|e| format!("Failed to prepare returns query: {}", e))?;

    let rows = stmt
        .query_map(final_params_refs.as_slice(), |row| {
            Ok(ReturnListItem {
                id: row.get(0)?,
                return_number: row.get(1)?,
                sale_id: row.get(2)?,
                original_invoice_number: row.get(3)?,
                customer_name: row.get(4)?,
                customer_phone: row.get(5)?,
                refund_amount: row.get(6)?,
                refund_mode: row.get(7)?,
                reason: row.get(8)?,
                created_at: row.get(9)?,
                items_count: row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to query returns: {}", e))?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row.map_err(|e| format!("Failed to read return list item: {}", e))?);
    }

    Ok(PaginatedReturnsResult {
        returns: list,
        total_count,
        page,
        page_size,
        total_pages,
    })
}

/// Retrieves a completed return record with all returned line items by its return number
pub fn get_return_by_number_db(
    conn: &Connection,
    return_number: &str,
) -> Result<SalesReturnResult, String> {
    let clean = return_number.trim();
    if clean.is_empty() {
        return Err("Return number cannot be blank.".to_string());
    }

    let return_info: Option<(SalesReturnRecord, String)> = conn
        .query_row(
            "SELECT sr.id, sr.return_number, sr.sale_id, sr.customer_id, sr.customer_name, sr.customer_phone,
                    sr.refund_amount, sr.refund_mode, sr.reason, sr.notes, sr.created_at, s.invoice_number
             FROM sales_returns sr
             JOIN sales s ON sr.sale_id = s.id
             WHERE sr.return_number = ?1;",
            params![clean],
            |row| {
                Ok((
                    SalesReturnRecord {
                        id: row.get(0)?,
                        return_number: row.get(1)?,
                        sale_id: row.get(2)?,
                        customer_id: row.get(3)?,
                        customer_name: row.get(4)?,
                        customer_phone: row.get(5)?,
                        refund_amount: row.get(6)?,
                        refund_mode: row.get(7)?,
                        reason: row.get(8)?,
                        notes: row.get(9)?,
                        created_at: row.get(10)?,
                    },
                    row.get(11)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Database error fetching return: {}", e))?;

    let (return_record, original_invoice_number) = match return_info {
        Some(info) => info,
        None => return Err(format!("Return '{}' was not found.", clean)),
    };

    let mut stmt = conn
        .prepare(
            "SELECT id, return_id, sale_item_id, product_id, product_name, barcode, unit,
                    original_quantity, return_quantity, unit_price, tax_rate, refund_amount, restock, reason
             FROM sales_return_items WHERE return_id = ?1 ORDER BY id ASC;",
        )
        .map_err(|e| format!("Failed to prepare return items query: {}", e))?;

    let item_rows = stmt
        .query_map(params![return_record.id], |row| {
            let restock_int: i32 = row.get(12)?;
            Ok(SalesReturnItemRecord {
                id: row.get(0)?,
                return_id: row.get(1)?,
                sale_item_id: row.get(2)?,
                product_id: row.get(3)?,
                product_name: row.get(4)?,
                barcode: row.get(5)?,
                unit: row.get(6)?,
                original_quantity: row.get(7)?,
                return_quantity: row.get(8)?,
                unit_price: row.get(9)?,
                tax_rate: row.get(10)?,
                refund_amount: row.get(11)?,
                restock: restock_int == 1,
                reason: row.get(13)?,
            })
        })
        .map_err(|e| format!("Failed to query return items: {}", e))?;

    let mut items = Vec::new();
    for it in item_rows {
        items.push(it.map_err(|e| format!("Failed to read return item: {}", e))?);
    }

    Ok(SalesReturnResult {
        return_record,
        items,
        original_invoice_number,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::billing::{complete_sale_db, CartItemInput, CreateSaleInput};

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("Failed to open test in-memory SQLite");
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../migrations/001_initial_schema.sql")).unwrap();
        conn.execute_batch(include_str!("../migrations/002_sales_indexes.sql")).unwrap();
        conn.execute_batch(include_str!("../migrations/003_returns_and_stock_ledger.sql")).unwrap();
        conn.execute_batch(include_str!("../migrations/004_hsn_and_gstin.sql")).unwrap();
        conn
    }

    #[test]
    fn test_partial_return_and_stock_restoration() {
        let mut conn = setup_test_db();

        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Tata Salt 1kg', 25.0, 25.0, 0.0, 50.0, 'PKT');",
            [],
        )
        .unwrap();

        // Sell 5 packets (stock becomes 45)
        let sale_res = complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: Some("Ramesh".to_string()),
            customer_phone: Some("9876543210".to_string()),
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Tata Salt 1kg".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 5.0,
                unit_price: 25.0,
                mrp: 25.0,
                gst_rate: 0.0,
                hsn_code: None,
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
        }).unwrap();

        let sale_item_id = sale_res.items[0].id;

        // Verify available return quantity is 5
        let returnable = get_returnable_items_db(&conn, sale_res.sale.id).unwrap();
        assert_eq!(returnable.len(), 1);
        assert_eq!(returnable[0].available_return_quantity, 5.0);

        // Return 2 packets with restock = YES
        let ret_res = create_return_db(&mut conn, CreateReturnInput {
            sale_id: sale_res.sale.id,
            items: vec![ReturnItemInput {
                sale_item_id,
                return_quantity: 2.0,
                restock: true,
                reason: Some("Customer changed mind".to_string()),
            }],
            refund_mode: "CASH".to_string(),
            reason: "Customer Changed Mind".to_string(),
            notes: None,
        }).expect("Return must succeed");

        assert_eq!(ret_res.return_record.refund_amount, 50.0); // 2 * 25.0
        assert_eq!(ret_res.items.len(), 1);
        assert_eq!(ret_res.items[0].return_quantity, 2.0);

        // Verify product stock is restored from 45 to 47
        let current_stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id = 1;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(current_stock, 47.0);

        // Verify stock movement was recorded
        let movement_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM stock_movements WHERE movement_type = 'SALE_RETURN' AND product_id = 1;",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(movement_count, 1);

        // Verify available return quantity is now 3 (5 - 2)
        let returnable_after = get_returnable_items_db(&conn, sale_res.sale.id).unwrap();
        assert_eq!(returnable_after[0].already_returned_quantity, 2.0);
        assert_eq!(returnable_after[0].available_return_quantity, 3.0);
    }

    #[test]
    fn test_over_return_protection() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Tea', 100.0, 100.0, 0.0, 20.0, 'PKT');",
            [],
        )
        .unwrap();

        let sale_res = complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Tea".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 2.0,
                unit_price: 100.0,
                mrp: 100.0,
                gst_rate: 0.0,
                hsn_code: None,
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
        }).unwrap();

        let sale_item_id = sale_res.items[0].id;

        // Try to return 3 (only 2 were sold)
        let err = create_return_db(&mut conn, CreateReturnInput {
            sale_id: sale_res.sale.id,
            items: vec![ReturnItemInput {
                sale_item_id,
                return_quantity: 3.0,
                restock: true,
                reason: None,
            }],
            refund_mode: "CASH".to_string(),
            reason: "Wrong Product".to_string(),
            notes: None,
        }).expect_err("Must reject over-return");

        assert!(err.contains("Only 2.00 PKT available to return"), "Error: {}", err);
    }

    #[test]
    fn test_duplicate_return_protection() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Biscuit', 20.0, 20.0, 0.0, 10.0, 'PKT');",
            [],
        )
        .unwrap();

        let sale_res = complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Biscuit".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 2.0,
                unit_price: 20.0,
                mrp: 20.0,
                gst_rate: 0.0,
                hsn_code: None,
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
        }).unwrap();

        let sale_item_id = sale_res.items[0].id;

        // 1st return of 2 packets (fully returned)
        create_return_db(&mut conn, CreateReturnInput {
            sale_id: sale_res.sale.id,
            items: vec![ReturnItemInput {
                sale_item_id,
                return_quantity: 2.0,
                restock: true,
                reason: None,
            }],
            refund_mode: "CASH".to_string(),
            reason: "Damaged Product".to_string(),
            notes: None,
        }).unwrap();

        // 2nd return attempt of 1 packet must be rejected
        let err = create_return_db(&mut conn, CreateReturnInput {
            sale_id: sale_res.sale.id,
            items: vec![ReturnItemInput {
                sale_item_id,
                return_quantity: 1.0,
                restock: true,
                reason: None,
            }],
            refund_mode: "CASH".to_string(),
            reason: "Damaged Product".to_string(),
            notes: None,
        }).expect_err("Must reject duplicate return");

        assert!(err.contains("Only 0.00 PKT available to return"), "Error: {}", err);
    }

    #[test]
    fn test_non_restocked_return_leaves_stock_unchanged() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Milk 500ml', 30.0, 30.0, 0.0, 10.0, 'PKT');",
            [],
        )
        .unwrap();

        // Sell 2 packets (stock 8)
        let sale_res = complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Milk 500ml".to_string(),
                barcode: None,
                unit: "PKT".to_string(),
                quantity: 2.0,
                unit_price: 30.0,
                mrp: 30.0,
                gst_rate: 0.0,
                hsn_code: None,
            }],
            discount_amount: 0.0,
            payment_mode: "CASH".to_string(),
            notes: None,
            round_off: None,
        }).unwrap();

        // Return 1 packet marked restock = FALSE (expired/damaged)
        create_return_db(&mut conn, CreateReturnInput {
            sale_id: sale_res.sale.id,
            items: vec![ReturnItemInput {
                sale_item_id: sale_res.items[0].id,
                return_quantity: 1.0,
                restock: false,
                reason: Some("Spoiled milk".to_string()),
            }],
            refund_mode: "CASH".to_string(),
            reason: "Expired Product".to_string(),
            notes: None,
        }).unwrap();

        // Verify product stock is STILL 8 (NOT increased to 9)
        let stock: f64 = conn
            .query_row("SELECT stock FROM products WHERE id = 1;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stock, 8.0);
    }

    #[test]
    fn test_return_refund_with_discounted_bill() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO products (id, name, selling_price, mrp, gst_rate, stock, unit)
             VALUES (1, 'Ghee 1L', 500.0, 500.0, 0.0, 10.0, 'JAR');",
            [],
        )
        .unwrap();

        // Customer buys 2 jars = 1000 subtotal, with ₹100 bill discount (10% discount). Total paid: ₹900
        let sale_res = complete_sale_db(&mut conn, CreateSaleInput {
            customer_id: None,
            customer_name: None,
            customer_phone: None,
            items: vec![CartItemInput {
                product_id: Some(1),
                product_name: "Ghee 1L".to_string(),
                barcode: None,
                unit: "JAR".to_string(),
                quantity: 2.0,
                unit_price: 500.0,
                mrp: 500.0,
                gst_rate: 0.0,
                hsn_code: None,
            }],
            discount_amount: 100.0,
            payment_mode: "UPI".to_string(),
            notes: None,
            round_off: None,
        }).unwrap();

        assert_eq!(sale_res.sale.total_amount, 900.0);

        // Customer returns 1 jar.
        // Pre-discount price is 500, but customer only paid 450 (due to 10% bill discount).
        // Refund must be ₹450, NOT ₹500!
        let ret_res = create_return_db(&mut conn, CreateReturnInput {
            sale_id: sale_res.sale.id,
            items: vec![ReturnItemInput {
                sale_item_id: sale_res.items[0].id,
                return_quantity: 1.0,
                restock: true,
                reason: None,
            }],
            refund_mode: "UPI".to_string(),
            reason: "Customer Changed Mind".to_string(),
            notes: None,
        }).unwrap();

        assert_eq!(ret_res.return_record.refund_amount, 450.0);
    }
}
