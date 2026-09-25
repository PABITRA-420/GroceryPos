use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// Strongly-typed Customer model matching the SQLite `customers` schema
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Customer {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Input payload for creating a new customer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCustomerInput {
    pub name: String,
    pub phone: Option<String>,
    pub address: Option<String>,
}

/// Input payload for updating an existing customer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCustomerInput {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub address: Option<String>,
}

/// Search parameters for customer queries
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CustomerSearchParams {
    pub query: Option<String>,
}

/// Normalizes and validates Indian phone numbers.
///
/// Strips whitespace, hyphens, parentheses, and optional leading '+91' or '0'.
/// Returns `None` if the input is empty or blank (allowing walk-in customers without phones).
/// Returns an error if the formatted input is not a valid 10-digit number.
pub fn normalize_phone(raw_phone: Option<String>) -> Result<Option<String>, String> {
    match raw_phone {
        Some(p) => {
            let trimmed = p.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }

            // Strip spaces, dashes, dots, parentheses
            let cleaned: String = trimmed
                .chars()
                .filter(|c| c.is_ascii_digit() || *c == '+')
                .collect();

            // Handle optional leading +91 or 91 or 0 prefix
            let digits = if cleaned.starts_with("+91") && cleaned.len() == 13 {
                &cleaned[3..]
            } else if cleaned.starts_with("91") && cleaned.len() == 12 {
                &cleaned[2..]
            } else if cleaned.starts_with('0') && cleaned.len() == 11 {
                &cleaned[1..]
            } else {
                &cleaned[..]
            };

            // Verify standard 10-digit number (all digits)
            if digits.len() == 10 && digits.chars().all(|c| c.is_ascii_digit()) {
                Ok(Some(digits.to_string()))
            } else {
                Err(format!(
                    "Invalid phone number '{}'. Please enter a valid 10-digit mobile number.",
                    trimmed
                ))
            }
        }
        None => Ok(None),
    }
}

/// Validates customer name and fields before SQLite operations.
pub fn validate_customer_data(name: &str) -> Result<String, String> {
    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err("Customer name is required and cannot be blank.".to_string());
    }
    if clean_name.chars().count() > 120 {
        return Err("Customer name is too long (maximum 120 characters).".to_string());
    }
    Ok(clean_name.to_string())
}

/// Translates raw SQLite error messages into user-friendly messages for the shopkeeper.
pub fn map_sqlite_error(err: rusqlite::Error) -> String {
    let err_msg = err.to_string();
    if err_msg.contains("UNIQUE constraint failed: customers.phone") {
        "Customer with this phone number already exists.".to_string()
    } else {
        format!("Database error: {}", err_msg)
    }
}

/// Helper function to map a SQLite row to a `Customer` struct
fn map_row_to_customer(row: &rusqlite::Row) -> rusqlite::Result<Customer> {
    Ok(Customer {
        id: row.get(0)?,
        name: row.get(1)?,
        phone: row.get(2)?,
        address: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

/// Inserts a new customer into the database and returns the created customer record.
pub fn create_customer_db(conn: &mut Connection, input: CreateCustomerInput) -> Result<Customer, String> {
    let clean_name = validate_customer_data(&input.name)?;
    let clean_phone = normalize_phone(input.phone)?;
    let clean_address = match input.address {
        Some(a) => {
            let t = a.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
        None => None,
    };

    conn.execute(
        "INSERT INTO customers (name, phone, address) VALUES (?1, ?2, ?3);",
        params![clean_name, clean_phone, clean_address],
    )
    .map_err(map_sqlite_error)?;

    let new_id = conn.last_insert_rowid();
    get_customer_db(conn, new_id)
}

/// Fetches a single customer by primary key ID.
pub fn get_customer_db(conn: &Connection, id: i64) -> Result<Customer, String> {
    conn.query_row(
        "SELECT id, name, phone, address, created_at, updated_at FROM customers WHERE id = ?1;",
        params![id],
        map_row_to_customer,
    )
    .optional()
    .map_err(map_sqlite_error)?
    .ok_or_else(|| format!("Customer with ID {} was not found.", id))
}

/// Retrieves all customers, optionally filtering by search query (name or phone).
pub fn get_customers_db(
    conn: &Connection,
    search: Option<CustomerSearchParams>,
) -> Result<Vec<Customer>, String> {
    let mut sql = "SELECT id, name, phone, address, created_at, updated_at FROM customers WHERE 1=1".to_string();
    let mut param_values: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(ref s) = search {
        if let Some(ref q) = s.query {
            let trimmed_q = q.trim();
            if !trimmed_q.is_empty() {
                let search_param = format!("%{}%", trimmed_q);
                sql.push_str(" AND (name LIKE ?1 COLLATE NOCASE OR phone LIKE ?2 COLLATE NOCASE)");
                param_values.push(search_param.clone().into());
                param_values.push(search_param.into());
            }
        }
    }

    sql.push_str(" ORDER BY name COLLATE NOCASE ASC;");

    let mut stmt = conn.prepare(&sql).map_err(map_sqlite_error)?;
    let params_slice: Vec<&dyn rusqlite::ToSql> = param_values
        .iter()
        .map(|v| v as &dyn rusqlite::ToSql)
        .collect();

    let customer_iter = stmt
        .query_map(params_slice.as_slice(), map_row_to_customer)
        .map_err(map_sqlite_error)?;

    let mut customers = Vec::new();
    for c in customer_iter {
        customers.push(c.map_err(map_sqlite_error)?);
    }

    Ok(customers)
}

/// Updates an existing customer's details.
pub fn update_customer_db(conn: &mut Connection, input: UpdateCustomerInput) -> Result<Customer, String> {
    // 1. Verify existence
    let _existing = get_customer_db(conn, input.id)?;

    let clean_name = validate_customer_data(&input.name)?;
    let clean_phone = normalize_phone(input.phone)?;
    let clean_address = match input.address {
        Some(a) => {
            let t = a.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        }
        None => None,
    };

    conn.execute(
        "UPDATE customers SET
            name = ?1,
            phone = ?2,
            address = ?3,
            updated_at = datetime('now', 'localtime')
         WHERE id = ?4;",
        params![clean_name, clean_phone, clean_address, input.id],
    )
    .map_err(map_sqlite_error)?;

    get_customer_db(conn, input.id)
}

/// Deletes a customer by ID safely.
/// Prevents deletion if the customer has billing history in the `sales` table.
pub fn delete_customer_db(conn: &mut Connection, id: i64) -> Result<bool, String> {
    // Check if customer exists
    let _customer = get_customer_db(conn, id)?;

    // Check if customer is referenced by existing sales
    let sales_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM sales WHERE customer_id = ?1;",
            params![id],
            |row| row.get(0),
        )
        .map_err(map_sqlite_error)?;

    if sales_count > 0 {
        return Err("This customer has billing history and cannot be deleted.".to_string());
    }

    let rows_affected = conn
        .execute("DELETE FROM customers WHERE id = ?1;", params![id])
        .map_err(map_sqlite_error)?;

    Ok(rows_affected > 0)
}

/// Dedicated fast search by customer name or phone substring.
pub fn search_customers_db(conn: &Connection, query: String) -> Result<Vec<Customer>, String> {
    let q = query.trim();
    if q.is_empty() {
        return get_customers_db(conn, None);
    }

    let search_param = format!("%{}%", q);
    let mut stmt = conn
        .prepare(
            "SELECT id, name, phone, address, created_at, updated_at
             FROM customers
             WHERE name LIKE ?1 COLLATE NOCASE OR phone LIKE ?2 COLLATE NOCASE
             ORDER BY name COLLATE NOCASE ASC
             LIMIT 50;",
        )
        .map_err(map_sqlite_error)?;

    let customer_iter = stmt
        .query_map(params![search_param, search_param], map_row_to_customer)
        .map_err(map_sqlite_error)?;

    let mut customers = Vec::new();
    for c in customer_iter {
        customers.push(c.map_err(map_sqlite_error)?);
    }

    Ok(customers)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("Failed to open in-memory db");
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../migrations/001_initial_schema.sql")).unwrap();
        conn
    }

    #[test]
    fn test_phone_normalization() {
        // Standard 10 digits
        assert_eq!(normalize_phone(Some("9876543210".to_string())).unwrap(), Some("9876543210".to_string()));
        // With spaces
        assert_eq!(normalize_phone(Some("98765 43210".to_string())).unwrap(), Some("9876543210".to_string()));
        // With dashes
        assert_eq!(normalize_phone(Some("98765-43210".to_string())).unwrap(), Some("9876543210".to_string()));
        // With +91
        assert_eq!(normalize_phone(Some("+91 9876543210".to_string())).unwrap(), Some("9876543210".to_string()));
        // With leading 0
        assert_eq!(normalize_phone(Some("09876543210".to_string())).unwrap(), Some("9876543210".to_string()));
        // Empty / None
        assert_eq!(normalize_phone(None).unwrap(), None);
        assert_eq!(normalize_phone(Some("   ".to_string())).unwrap(), None);

        // Invalid lengths / characters
        assert!(normalize_phone(Some("12345".to_string())).is_err());
        assert!(normalize_phone(Some("abcdefghij".to_string())).is_err());
    }

    #[test]
    fn test_create_and_get_customer() {
        let mut conn = setup_test_db();
        let input = CreateCustomerInput {
            name: "Rahul Das".to_string(),
            phone: Some("98765 43210".to_string()),
            address: Some("Siliguri, College Para".to_string()),
        };

        let customer = create_customer_db(&mut conn, input).expect("Failed to create customer");
        assert_eq!(customer.id, 1);
        assert_eq!(customer.name, "Rahul Das");
        assert_eq!(customer.phone, Some("9876543210".to_string()), "Phone must be normalized without spaces");
        assert_eq!(customer.address, Some("Siliguri, College Para".to_string()));

        let fetched = get_customer_db(&conn, customer.id).expect("Failed to get customer");
        assert_eq!(fetched, customer);
    }

    #[test]
    fn test_create_customer_without_phone() {
        let mut conn = setup_test_db();
        let c1 = create_customer_db(&mut conn, CreateCustomerInput {
            name: "Walk-in Customer 1".to_string(),
            phone: None,
            address: None,
        }).expect("Customer without phone must succeed");

        let c2 = create_customer_db(&mut conn, CreateCustomerInput {
            name: "Walk-in Customer 2".to_string(),
            phone: Some("  ".to_string()),
            address: None,
        }).expect("Customer with whitespace phone must succeed");

        assert_eq!(c1.phone, None);
        assert_eq!(c2.phone, None);
        assert_ne!(c1.id, c2.id);
    }

    #[test]
    fn test_empty_name_rejection() {
        let mut conn = setup_test_db();
        let err = create_customer_db(&mut conn, CreateCustomerInput {
            name: "   ".to_string(),
            phone: Some("9876543210".to_string()),
            address: None,
        }).unwrap_err();

        assert!(err.contains("name is required"));
    }

    #[test]
    fn test_duplicate_phone_rejection() {
        let mut conn = setup_test_db();
        create_customer_db(&mut conn, CreateCustomerInput {
            name: "Customer One".to_string(),
            phone: Some("9876543210".to_string()),
            address: None,
        }).unwrap();

        let err = create_customer_db(&mut conn, CreateCustomerInput {
            name: "Customer Two".to_string(),
            phone: Some("98765 43210".to_string()), // same phone with space
            address: None,
        }).unwrap_err();

        assert!(err.contains("already exists"), "Error message must be user-friendly: {}", err);
    }

    #[test]
    fn test_search_by_name_and_phone() {
        let mut conn = setup_test_db();
        create_customer_db(&mut conn, CreateCustomerInput {
            name: "Amit Kumar".to_string(),
            phone: Some("9123456780".to_string()),
            address: Some("Jalpaiguri".to_string()),
        }).unwrap();

        create_customer_db(&mut conn, CreateCustomerInput {
            name: "Rahul Das".to_string(),
            phone: Some("9876543210".to_string()),
            address: Some("Siliguri".to_string()),
        }).unwrap();

        // Search by name substring
        let res_name = search_customers_db(&conn, "Rahul".to_string()).unwrap();
        assert_eq!(res_name.len(), 1);
        assert_eq!(res_name[0].name, "Rahul Das");

        // Search by phone substring
        let res_phone = search_customers_db(&conn, "234567".to_string()).unwrap();
        assert_eq!(res_phone.len(), 1);
        assert_eq!(res_phone[0].name, "Amit Kumar");
    }

    #[test]
    fn test_update_customer() {
        let mut conn = setup_test_db();
        let c = create_customer_db(&mut conn, CreateCustomerInput {
            name: "Old Name".to_string(),
            phone: Some("9876543210".to_string()),
            address: Some("Old Address".to_string()),
        }).unwrap();

        let updated = update_customer_db(&mut conn, UpdateCustomerInput {
            id: c.id,
            name: "New Name".to_string(),
            phone: Some("9123456789".to_string()),
            address: Some("New Address".to_string()),
        }).unwrap();

        assert_eq!(updated.name, "New Name");
        assert_eq!(updated.phone, Some("9123456789".to_string()));
        assert_eq!(updated.address, Some("New Address".to_string()));
    }

    #[test]
    fn test_delete_customer_safeguard_with_sales() {
        let mut conn = setup_test_db();
        let c = create_customer_db(&mut conn, CreateCustomerInput {
            name: "Buyer With Sales".to_string(),
            phone: Some("9988776655".to_string()),
            address: None,
        }).unwrap();

        // 1. Link a sale to this customer
        conn.execute(
            "INSERT INTO sales (invoice_number, customer_id, subtotal, total_amount) VALUES ('INV-101', ?1, 100.0, 100.0);",
            params![c.id],
        ).unwrap();

        // 2. Attempt deletion - must be prevented!
        let delete_err = delete_customer_db(&mut conn, c.id).unwrap_err();
        assert!(delete_err.contains("billing history and cannot be deleted"), "Error was: {}", delete_err);

        // 3. Customer must still exist
        let still_there = get_customer_db(&conn, c.id).unwrap();
        assert_eq!(still_there.name, "Buyer With Sales");

        // 4. Delete the sale, now customer deletion succeeds
        conn.execute("DELETE FROM sales WHERE customer_id = ?1;", params![c.id]).unwrap();
        let delete_ok = delete_customer_db(&mut conn, c.id).unwrap();
        assert!(delete_ok);
    }
}
