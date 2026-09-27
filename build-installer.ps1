# ==============================================================================
# Grocery POS - Windows .EXE Setup Installer Build Script
# Creates a standalone NSIS Setup Wizard (.exe) for website downloads and selling
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Grocery POS: Building Windows .EXE Setup Installer     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Build Frontend & Tauri NSIS bundle
Write-Host "`n[1/3] Building production frontend & NSIS installer..." -ForegroundColor Yellow
npx tauri build --bundles nsis
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri installer build failed."
    exit 1
}

# 2. Find the generated installer
Write-Host "`n[2/3] Locating generated setup executable..." -ForegroundColor Yellow
$NsisDir = "src-tauri/target/release/bundle/nsis"
$Installer = Get-ChildItem -Path $NsisDir -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $Installer) {
    Write-Error "Could not find generated .exe installer in $NsisDir"
    exit 1
}

# 3. Copy to clean dist-installer folder
$DistDir = "dist-installer"
if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir | Out-Null
}

$OutputName = "GroceryPOS_Setup_v0.1.0.exe"
$FinalPath = Join-Path $DistDir $OutputName
Copy-Item -Path $Installer.FullName -Destination $FinalPath -Force

$SizeMB = [math]::Round((Get-Item $FinalPath).Length / 1MB, 2)

Write-Host "`n[3/3] Installer Created Successfully!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  File Name: $OutputName" -ForegroundColor Cyan
Write-Host "  Location : $(Resolve-Path $FinalPath)" -ForegroundColor Cyan
Write-Host "  File Size: $SizeMB MB" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "`nYou can now upload this '$OutputName' file directly to:" -ForegroundColor Yellow
Write-Host "  1. Your portfolio website (e.g. yoursite.com/downloads/$OutputName)"
Write-Host "  2. GitHub Releases"
Write-Host "  3. Google Drive / Dropbox for direct customer download links"
Write-Host "Any shopkeeper can download it, double-click to install, and start billing!`n" -ForegroundColor Green
