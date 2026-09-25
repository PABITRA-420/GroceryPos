# GroceryPOS — Commercial Indian Retail & Grocery Shop Billing Desktop Software

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue.svg)](https://tauri.app)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)
[![SQLite WAL](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57.svg)](https://sqlite.org)
[![Offline First](https://img.shields.io/badge/Offline-100%25%20Local-emerald.svg)]()

GroceryPOS is a commercial-grade, 100% offline desktop POS (Point of Sale) and billing software tailored specifically for Indian grocery stores, kirana shops, and FMCG retail outlets.

Built with a high-performance **Rust** core and a modern **React 19 + TypeScript** user interface via **Tauri v2**, GroceryPOS guarantees sub-millisecond barcode scanning, deterministic monetary calculations, immutable historical sales records, and double-entry stock ledger auditing.

---

## Key Highlights

- **100% Offline-First Architecture**: Operates with complete functionality without an active internet connection. No cloud server dependency or unexpected cloud sync delays.
- **Atomic Database Transactions**: Backed by embedded SQLite with Write-Ahead Logging (`WAL`), `PRAGMA foreign_keys = ON;`, and 5,000ms busy timeout.
- **Indian Retail Tax & GST Compliance**:
  - Deterministic integer-paise calculations preventing IEEE-754 floating-point errors.
  - Symmetrical 50/50 breakdown between **CGST** and **SGST** on all tax receipts.
  - Indian cash round-off to the nearest rupee ($\pm ₹0.50$).
  - Sequential Indian Financial Year invoice numbering (`INV/26-27/000001`).
- **Enforced Legal Metrology MRP Rule**: System-level validation prohibiting `Selling Price > MRP` on catalog creation, product editing, and billing checkout.
- **Double-Entry Stock Ledger**: Every inventory adjustment (Sale, Sale Return, Manual Correction, Damage, Expiry) is atomically committed to both `products.stock` and `stock_movements`. Strict rejection of negative inventory.
- **Fair Proportional Discount Returns**: When returning items from discounted bills, refunds are calculated proportionally against effective unit prices, eliminating cashier cash leakage.
- **Historical Snapshot Immutability**: Historical sales permanently preserve customer details, unit prices, GST rates, and timestamps used at the exact moment of sale.
- **Disaster Recovery & Safe Restore**: One-click SQLite `VACUUM INTO` backup snapshots, plus a safe database restore engine featuring `PRAGMA integrity_check`, pre-restore emergency snapshots, and WAL journal cleanup.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Desktop Runtime** | [Tauri v2](https://tauri.app) (Rust Backend) |
| **Database** | Embedded SQLite 3 (`rusqlite`) in WAL mode |
| **Frontend Framework** | React 19, TypeScript, Vite |
| **Styling** | Tailwind CSS v4, Lucide React Icons |
| **Platform Target** | Windows 10/11 Desktop |

---

## Architecture Overview

```text
React 19 UI (Counter POS / Catalog / History / Settings)
      │
      ▼  (Strongly Typed Service Abstraction)
Tauri IPC Bridge (@tauri-apps/api/core)
      │
      ▼  (Parameterized Rust Commands)
Rust Backend Engine (src-tauri/src/)
  ├── billing.rs      (Atomic sale completion & financial year sequencing)
  ├── returns.rs      (Proportional refunds & restock management)
  ├── inventory.rs    (Double-entry stock movement ledger & consistency checks)
  ├── products.rs     (Catalog CRUD with Legal Metrology MRP guards)
  ├── customers.rs    (Customer records & duplicate phone validation)
  └── db.rs           (PRAGMAs, migrations, backup & safe restore engine)
      │
      ▼  (ACID Atomic Transactions)
SQLite Database (%APPDATA%\com.grocerypos.desktop\grocerypos.db)
```

---

## Getting Started

### Prerequisites

- **Node.js**: v18 or higher (LTS recommended)
- **Rust**: stable toolchain with `cargo` installed
- **Build Tools**: Microsoft C++ Build Tools (for Windows native builds)

### Installation

1. Clone repository:
   ```bash
   git clone https://github.com/PABITRA-420/GroceryPos.git
   cd GroceryPos
   ```

2. Install Node dependencies:
   ```bash
   npm install
   ```

3. Run development desktop app:
   ```bash
   npm run tauri dev
   ```

4. Run unit test suite:
   ```bash
   cd src-tauri
   cargo test
   ```

5. Build production Windows installer:
   ```bash
   npm run tauri build
   ```

---

## License

Proprietary / Commercial Retail Software. All rights reserved.
