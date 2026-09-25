use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

/// Shop Profile / Business Branding for Invoices and POS
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShopProfile {
    pub shop_name: String,
    pub owner_name: String,
    pub shop_address: String,
    pub shop_phone: String,
    pub shop_email: Option<String>,
    pub shop_gstin: Option<String>,
    pub invoice_footer: String,
}

impl Default for ShopProfile {
    fn default() -> Self {
        Self {
            shop_name: "Apna Grocery Store".to_string(),
            owner_name: "".to_string(),
            shop_address: "Main Market, Local City".to_string(),
            shop_phone: "".to_string(),
            shop_email: None,
            shop_gstin: None,
            invoice_footer: "Thank you for shopping with us! Please visit again.".to_string(),
        }
    }
}

/// Helper to get a setting key value with default fallback
fn get_setting_val(conn: &Connection, key: &str, default_val: &str) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1;",
        params![key],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| default_val.to_string())
}

/// Helper to get an optional setting key value
fn get_optional_setting_val(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1;",
        params![key],
        |row| row.get(0),
    )
    .ok()
    .and_then(|val: String| {
        let trimmed = val.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

/// Loads the shop business profile from the `settings` table
pub fn get_shop_profile_db(conn: &Connection) -> Result<ShopProfile, String> {
    let default = ShopProfile::default();

    let shop_name = get_setting_val(conn, "shop_name", &default.shop_name);
    let owner_name = get_setting_val(conn, "owner_name", &default.owner_name);
    let shop_address = get_setting_val(conn, "shop_address", &default.shop_address);
    let shop_phone = get_setting_val(conn, "shop_phone", &default.shop_phone);
    let shop_email = get_optional_setting_val(conn, "shop_email");
    let shop_gstin = get_optional_setting_val(conn, "shop_gstin");
    let invoice_footer = get_setting_val(conn, "invoice_footer", &default.invoice_footer);

    Ok(ShopProfile {
        shop_name: if shop_name.trim().is_empty() {
            default.shop_name
        } else {
            shop_name
        },
        owner_name,
        shop_address,
        shop_phone,
        shop_email,
        shop_gstin,
        invoice_footer: if invoice_footer.trim().is_empty() {
            default.invoice_footer
        } else {
            invoice_footer
        },
    })
}

/// Saves the shop business profile to the `settings` table atomically
pub fn save_shop_profile_db(
    conn: &mut Connection,
    profile: ShopProfile,
) -> Result<ShopProfile, String> {
    let trimmed_name = profile.shop_name.trim();
    if trimmed_name.is_empty() {
        return Err("Shop Name is required and cannot be blank.".to_string());
    }

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    let upsert_sql = "
        INSERT INTO settings (key, value, updated_at)
        VALUES (?1, ?2, datetime('now', 'localtime'))
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at;
    ";

    tx.execute(upsert_sql, params!["shop_name", trimmed_name])
        .map_err(|e| format!("Failed to save shop_name: {}", e))?;

    tx.execute(upsert_sql, params!["owner_name", profile.owner_name.trim()])
        .map_err(|e| format!("Failed to save owner_name: {}", e))?;

    tx.execute(upsert_sql, params!["shop_address", profile.shop_address.trim()])
        .map_err(|e| format!("Failed to save shop_address: {}", e))?;

    tx.execute(upsert_sql, params!["shop_phone", profile.shop_phone.trim()])
        .map_err(|e| format!("Failed to save shop_phone: {}", e))?;

    tx.execute(
        upsert_sql,
        params!["shop_email", profile.shop_email.as_deref().unwrap_or("").trim()],
    )
    .map_err(|e| format!("Failed to save shop_email: {}", e))?;

    tx.execute(
        upsert_sql,
        params!["shop_gstin", profile.shop_gstin.as_deref().unwrap_or("").trim()],
    )
    .map_err(|e| format!("Failed to save shop_gstin: {}", e))?;

    let footer = if profile.invoice_footer.trim().is_empty() {
        "Thank you for shopping with us! Please visit again."
    } else {
        profile.invoice_footer.trim()
    };
    tx.execute(upsert_sql, params!["invoice_footer", footer])
        .map_err(|e| format!("Failed to save invoice_footer: {}", e))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit shop profile: {}", e))?;

    get_shop_profile_db(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("Failed to open test in-memory SQLite");
        conn.execute_batch(
            "CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );",
        )
        .expect("Failed to create settings table");
        conn
    }

    #[test]
    fn test_get_default_shop_profile() {
        let conn = setup_test_db();
        let profile = get_shop_profile_db(&conn).expect("Should return default profile");
        assert_eq!(profile.shop_name, "Apna Grocery Store");
        assert_eq!(profile.invoice_footer, "Thank you for shopping with us! Please visit again.");
    }

    #[test]
    fn test_save_and_retrieve_shop_profile() {
        let mut conn = setup_test_db();
        let new_profile = ShopProfile {
            shop_name: "Maa Laxmi Grocery Store".to_string(),
            owner_name: "Rajesh Kumar".to_string(),
            shop_address: "Sevoke Road, Siliguri, WB".to_string(),
            shop_phone: "9876543210".to_string(),
            shop_email: Some("rajesh@grocery.in".to_string()),
            shop_gstin: Some("19ABCDE1234F1Z5".to_string()),
            invoice_footer: "Goods once sold cannot be returned after 7 days.".to_string(),
        };

        let saved = save_shop_profile_db(&mut conn, new_profile.clone()).expect("Should save profile");
        assert_eq!(saved.shop_name, "Maa Laxmi Grocery Store");
        assert_eq!(saved.owner_name, "Rajesh Kumar");
        assert_eq!(saved.shop_phone, "9876543210");
        assert_eq!(saved.shop_email, Some("rajesh@grocery.in".to_string()));
        assert_eq!(saved.shop_gstin, Some("19ABCDE1234F1Z5".to_string()));
        assert_eq!(saved.invoice_footer, "Goods once sold cannot be returned after 7 days.");

        let fetched = get_shop_profile_db(&conn).expect("Should fetch profile");
        assert_eq!(fetched, saved);
    }

    #[test]
    fn test_empty_shop_name_rejection() {
        let mut conn = setup_test_db();
        let bad_profile = ShopProfile {
            shop_name: "   ".to_string(),
            owner_name: "Rajesh".to_string(),
            shop_address: "".to_string(),
            shop_phone: "".to_string(),
            shop_email: None,
            shop_gstin: None,
            invoice_footer: "".to_string(),
        };

        let result = save_shop_profile_db(&mut conn, bad_profile);
        assert!(result.is_err(), "Empty shop name must be rejected");
    }
}
