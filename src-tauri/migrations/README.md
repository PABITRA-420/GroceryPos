# SQLite Migrations Directory

This directory stores offline SQLite migration scripts (`.sql` files) executed in sequential order on application startup.

### Conventions:
- `001_initial_schema.sql` (Creates products, customers, sales, sale_items, purchases, etc.)
- `002_add_held_bills.sql`
- etc.

All migrations are tracked in a `_migrations` table inside SQLite to ensure atomic upgrades and data safety.
