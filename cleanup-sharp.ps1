# Cleanup script to remove Sharp dependencies and old tile generation files
# Run this after successfully testing VIPS tile generation

Write-Host "======================================" -ForegroundColor Yellow
Write-Host " CLEANING UP SHARP DEPENDENCIES" -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Yellow
Write-Host ""

# Backup old script first
if (Test-Path "scripts\generate-tiles.js") {
    Copy-Item "scripts\generate-tiles.js" "scripts\generate-tiles.js.backup" -Force
    Write-Host "✓ Backed up old generate-tiles.js" -ForegroundColor Green
}

# Remove Sharp from node_modules (will be cleaned on next npm install)
Write-Host "Removing Sharp from dependencies..." -ForegroundColor Yellow

# Update package.json to remove Sharp
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json

# Remove sharp from devDependencies if it exists
if ($packageJson.devDependencies.PSObject.Properties.Name -contains "sharp") {
    $packageJson.devDependencies.PSObject.Properties.Remove("sharp")
    Write-Host "✓ Removed Sharp from package.json" -ForegroundColor Green
}

# Save updated package.json
$packageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json" -Encoding UTF8
Write-Host "✓ Updated package.json" -ForegroundColor Green

# Clean node_modules and reinstall
Write-Host ""
Write-Host "Reinstalling dependencies without Sharp..." -ForegroundColor Yellow
Write-Host "This may take a moment..." -ForegroundColor Gray

# Remove node_modules
if (Test-Path "node_modules") {
    Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "✓ Removed node_modules" -ForegroundColor Green
}

# Remove package-lock.json to ensure clean install
if (Test-Path "package-lock.json") {
    Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue
    Write-Host "✓ Removed package-lock.json" -ForegroundColor Green
}

# Reinstall dependencies
Write-Host ""
Write-Host "Running npm install..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Dependencies reinstalled successfully" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "✗ Error reinstalling dependencies" -ForegroundColor Red
    exit 1
}

# Optional: Remove old generate-tiles.js
Write-Host ""
$response = Read-Host "Remove old generate-tiles.js? (backup already created) [y/N]"
if ($response -eq 'y' -or $response -eq 'Y') {
    Remove-Item "scripts\generate-tiles.js" -Force
    Write-Host "✓ Removed old generate-tiles.js" -ForegroundColor Green
}

# Optional: Remove old regenerate-tiles.ps1
if (Test-Path "regenerate-tiles.ps1") {
    $response = Read-Host "Remove old regenerate-tiles.ps1? [y/N]"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Remove-Item "regenerate-tiles.ps1" -Force
        Write-Host "✓ Removed old regenerate-tiles.ps1" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host " ✨ CLEANUP COMPLETE!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Sharp has been removed from your project." -ForegroundColor Cyan
Write-Host "Your project now uses LibVIPS for tile generation." -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Test tile generation: npm run tiles" -ForegroundColor White
Write-Host "2. Start dev server: npm run dev" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to close"