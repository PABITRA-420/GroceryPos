# ==============================================================================
# Grocery POS - Automated Portable Release Packaging Script
# Creates a 100% self-contained portable folder ready to sell to shopkeepers.
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Grocery POS: Building Portable Distribution for Retail  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Build Vite Frontend
Write-Host "`n[1/4] Compiling React frontend assets..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend compilation failed."
    exit 1
}

# 2. Build Tauri Release Executable
Write-Host "`n[2/4] Compiling Rust release binary (bundled SQLite3)..." -ForegroundColor Yellow
npm run tauri build -- --no-bundle
if ($LASTEXITCODE -ne 0) {
    Write-Host "Attempting direct cargo release build..." -ForegroundColor Yellow
    cargo build --release --manifest-path src-tauri/Cargo.toml
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend compilation failed."
        exit 1
    }
}

# 3. Locate compiled executable
$ReleaseExe = "src-tauri/target/release/GroceryPOS.exe"
if (-not (Test-Path $ReleaseExe)) {
    $ReleaseExe = "src-tauri/target/release/app.exe"
}

if (-not (Test-Path $ReleaseExe)) {
    Write-Error "Could not locate compiled release executable in src-tauri/target/release/"
    exit 1
}

# 4. Prepare Portable Distribution Folder
$DistFolder = "dist-portable/GroceryPOS-Portable"
Write-Host "`n[3/4] Assembling portable release in $DistFolder..." -ForegroundColor Yellow

if (Test-Path $DistFolder) {
    Remove-Item -Recurse -Force $DistFolder
}
New-Item -ItemType Directory -Force -Path "$DistFolder/data/backups" | Out-Null

# Copy release binary
Copy-Item -Path $ReleaseExe -Destination "$DistFolder/GroceryPOS.exe" -Force

# Create portable flag
New-Item -ItemType File -Force -Path "$DistFolder/.portable" | Out-Null

# Create 1-click launcher batch file
$LauncherContent = @"
@echo off
start "" "%~dp0GroceryPOS.exe" --portable
exit
"@
Set-Content -Path "$DistFolder/Start_GroceryPOS.bat" -Value $LauncherContent -Encoding ASCII

# Create friendly Shopkeeper Guide
$GuideContent = @"
========================================================================
GROCERY POS - PORTABLE DESKTOP RETAIL BILLING SOFTWARE
========================================================================

HOW TO RUN:
1. Double-click "Start_GroceryPOS.bat" or "GroceryPOS.exe".
2. The application will launch immediately - NO INSTALLATION REQUIRED!
3. You can run this software directly from:
   - Your computer's Desktop or C:/D: drive
   - A USB Pen Drive or external hard drive (plug into any PC and run!)

DATA & SAFETY:
- All your products, sales, customers, and records are stored inside the
  "data" folder right next to the app ("data/grocerypos.db").
- Daily backups are saved automatically in "data/backups".
- To move your POS to a new computer, simply copy this entire
  "GroceryPOS-Portable" folder to a pen drive and paste it on the new PC.
  Zero data loss guaranteed!

KEYBOARD SHORTCUTS:
- F1: Dashboard & Reports
- F2: Quick Retail Billing
- F3: Product Catalog & Barcode Management
- F4: Khata / Customer Ledger
- F5: Day-End Summary
- F6: Returns & Refunds
- F7: Full Sales History & Invoice Search
- F8: Store Settings & Data Backup

FIRST RUN SETUP:
- Open Settings (F8) -> "Shop Profile"
- Enter your Shop Name, Address, Contact Number, and GSTIN (if applicable).
- Click "Save Business Profile".
- Your printed invoices and WhatsApp receipts will now feature your brand!

========================================================================
"@
Set-Content -Path "$DistFolder/README_FOR_SHOPKEEPER.txt" -Value $GuideContent -Encoding UTF8

Write-Host "`n[4/4] Portable distribution created successfully!" -ForegroundColor Green
Write-Host "Location: $DistFolder" -ForegroundColor Green
Write-Host "Simply copy or ZIP the '$DistFolder' folder and hand it to the shopkeeper!`n" -ForegroundColor Cyan
