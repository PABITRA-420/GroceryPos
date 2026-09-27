# Commercial POS Software Architecture & Production Roadmap
*GroceryPOS — Retail-Ready Software Audit & Execution Plan*

---

## 1. Executive Summary & Audit Overview

This audit evaluates the codebase across three key perspectives:
1. **Web & System Architecture**: Local SQLite persistence, Rust IPC bridge, offline-first reliability, background synchronization.
2. **Senior Developer & Engineering**: Performance, memory safety, test suites, edge case handling, and eliminating dead code / mock layers.
3. **Product Design & Real Retail Operations**: Fast counter checkout, loose-weight items, keyboard-only shortcuts, thermal printing ergonomics, customer credit (Khata), and data security.

---

## 2. Priority 1: Critical (Must Address Before Production Deployment)

### 1.1 Replace Technical Architecture Dashboard with a Business Cockpit
* **Current State**: [DashboardPage.tsx](file:///f:/GroceryPos/src/pages/Dashboard/DashboardPage.tsx) displays developer diagnostics (*"Tauri Native Layer"*, *"IPC Connected"*, *"React 19"*).
* **Required Upgrade**:
  * **Today's Gross Sales (₹)**, Total Bills Count, and Average Basket Size.
  * **Cash in Drawer vs UPI / Online** collected today.
  * **Low Stock Alerts** with 1-click reorder / stock update shortcuts.
  * **Top Selling Products** of the day/week.
  * **Quick POS Actions**: *New Bill (F2)*, *Add Product*, *Day-End Z-Report*.
  * Relocate developer/system diagnostic cards to *Settings → System Info*.

### 1.2 Remove / Complete the Dummy Purchases Shell
* **Current State**: [PurchasesPage.tsx](file:///f:/GroceryPos/src/pages/Purchases/PurchasesPage.tsx) contains a placeholder shell (*"Purchases Module Shell: Foundation active"*).
* **Required Upgrade**:
  * Implement an **Inward Stock Entry** form: Supplier Name, Invoice Number, Items, Purchase Price, Quantity Increment, and Payment Status.
  * Alternatively, hide the tab from the sidebar until implementation is complete, ensuring the merchant only sees 100% finished modules.

### 1.3 First-Time Store Onboarding Setup Wizard
* **Current State**: Fresh installation initializes with placeholder strings (`"Apna Grocery Store"`, `"Main Market"`, `"1234"` PIN).
* **Required Upgrade**:
  * A 3-step First Launch Wizard shown when store settings are unconfigured:
    1. **Store Identity**: Shop Name, Address, Contact Phone, GSTIN (optional).
    2. **Payments & QR**: Shop UPI ID (VPA) for instant receipt QR billing.
    3. **Hardware & Security**: Set Manager PIN, select receipt format (Thermal 80mm vs 58mm vs A4).
  * **"Seed Common Indian Grocery Catalog"** button: Pre-populates 50 common fast-moving grocery items (Atta, Sugar, Mustard Oil, Toor Dal, Maggi, Tata Salt, Biscuits with HSN & GST slabs) to eliminate cold-start friction.

### 1.4 Automated Rotating Daily Database Backups
* **Current State**: Backup in [SettingsPage.tsx](file:///f:/GroceryPos/src/pages/Settings/SettingsPage.tsx) requires manual merchant action.
* **Required Upgrade**:
  * Trigger automated SQLite backup snapshots on app close or at Day-End Z-Report completion.
  * Save timestamped snapshots (`backups/grocery_pos_YYYY-MM-DD.db`).
  * Auto-prune and retain the rolling last 14 days of backups.

---

## 3. Priority 2: Core POS Logic & Retail Counter Ergonomics

### 2.1 Global Barcode Wedge Sniffer
* **Current State**: Scanning while focus is in an input field (e.g., customer phone or discount) types barcode digits into that field.
* **Required Upgrade**:
  * Global keypress timing sniffer (< 35ms between characters identifies hardware barcode scanners).
  * Automatically intercepts and directs barcode scans to `cart.addProductByBarcode()` regardless of active UI focus.

### 2.2 One-Touch Fast Cash Buttons & Change Return
* **Current State**: Cashiers manually type cash tendered in [BillingPage.tsx](file:///f:/GroceryPos/src/pages/Billing/BillingPage.tsx).
* **Required Upgrade**:
  * Quick Cash Tender buttons: `[Exact]`, `[₹50]`, `[₹100]`, `[₹200]`, `[₹500]`, `[₹2000]`.
  * Prominent, high-contrast **Change to Return** display (e.g. `Change: ₹57.00`) to eliminate counter calculation errors during peak hours.

### 2.3 Direct Thermal Spooling (Zero Dialog Print)
* **Current State**: Receipt printing triggers Windows `window.print()` dialog, requiring cashier confirmation.
* **Required Upgrade**:
  * Direct ESC/POS byte streaming via Tauri printer plugin for zero-click instant printing on `Enter`.
  * Automatic paper cut command (`GS V 0`) and cash drawer kick pulse (`ESC p 0 25 250`).

### 2.4 Customer Khata (Credit / Udhaar) Settle Flow
* **Current State**: Credit sales are flagged as `PENDING`, but no dedicated payment collection dialog exists.
* **Required Upgrade**:
  * Display **Outstanding Udhaar Balance** badge in [CustomersPage.tsx](file:///f:/GroceryPos/src/pages/Customers/CustomersPage.tsx).
  * 1-Click **"Settle Balance"** modal allowing customers to pay partial/full cash against their account, generating a settlement receipt.

---

## 4. Priority 3: Dummy / Placeholder Items to Clean Up

1. **[PurchasesPage.tsx](file:///f:/GroceryPos/src/pages/Purchases/PurchasesPage.tsx)**: Remove the placeholder card and text.
2. **[DashboardPage.tsx](file:///f:/GroceryPos/src/pages/Dashboard/DashboardPage.tsx)**: Remove developer architecture diagnostic cards.
3. **Mock Data Clean-Up**:
   * Clean out static placeholder phone numbers (`9876543210`) across mock fallbacks.
   * Remove browser preview debug messages in [storageService.ts](file:///f:/GroceryPos/src/services/storageService.ts).
4. **WhatsApp Dispatch Ergonomics**:
   * Prevent browser `beforeunload` prompt when opening WhatsApp.
   * Support native desktop scheme (`whatsapp://send`) via hidden iframe and reuse a single named window (`grocery_whatsapp_window`) for WhatsApp Web.

---

## 5. Priority 4: Keyboard-Only POS Workflow

Standardize counter keybindings for 100% mouse-free operations:
* `[F1]` — Help & Keyboard Shortcuts Modal
* `[F2]` — Focus Product Search / Barcode Scanner
* `[F4]` — Quick Weight / Decimal Quantity Selector
* `[F6]` — Park / Hold Current Bill
* `[F7]` — Recall Parked Bills List
* `[F8]` — Customer Phone Search / Khata
* `[F9]` — Apply Bill Discount
* `[F10]` — One-Touch Cash Checkout & Print
* `[F11]` — Display Dynamic UPI QR Code
* `[Esc]` — Cancel / Back / Clear Cart

---

## 6. Commercial Readiness Checklist

```markdown
[ ] 1. Store Setup Wizard: First-launch onboarding for shop info, UPI, and tax configuration.
[ ] 2. Shopkeeper Dashboard: Live business metrics (sales, cash vs UPI, low stock).
[ ] 3. Complete or Hide Purchases: Keep UI clean and production-ready.
[ ] 4. Barcode Sniffer: Global scanner listener preventing input field misdirection.
[ ] 5. One-Touch Change Return: Preset cash buttons with bold change calculation.
[ ] 6. Customer Khata Settlement: Debt collection and balance settlement flow.
[ ] 7. Automated Daily Backups: Rotating 14-day SQLite snapshots on app exit.
```
