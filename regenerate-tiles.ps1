# PowerShell script to regenerate tiles on Windows
# Run this from the project root directory

Write-Host "========================================"
Write-Host " REGENERATING TILES WITH HIGH QUALITY"
Write-Host "========================================"
Write-Host ""

# Clean old tiles
Write-Host "[1/3] Cleaning old tiles..." -ForegroundColor Yellow
$tilesPath = "public\images\tiles\zebra"

if (Test-Path $tilesPath) {
    Remove-Item -Path $tilesPath -Recurse -Force
    Write-Host "      ✓ Old tiles removed" -ForegroundColor Green
} else {
    Write-Host "      - No tiles to clean" -ForegroundColor Gray
}

Write-Host ""

# Generate new tiles
Write-Host "[2/3] Generating new high-quality tiles..." -ForegroundColor Yellow
npm run generate-tiles

if ($LASTEXITCODE -eq 0) {
    Write-Host "      ✓ Tiles generated successfully" -ForegroundColor Green
} else {
    Write-Host "      ✗ Error generating tiles" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check the error messages above." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Clear npm/browser cache
Write-Host "[3/3] Clearing caches..." -ForegroundColor Yellow

# Clear npm cache
npm cache clean --force 2>$null
Write-Host "      ✓ NPM cache cleared" -ForegroundColor Green

Write-Host ""
Write-Host "========================================"
Write-Host " ✨ TILES REGENERATED SUCCESSFULLY! ✨"
Write-Host "========================================"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Clear your browser cache (Ctrl+Shift+Delete)"
Write-Host "2. Restart the dev server: npm run dev"
Write-Host "3. The artwork should now be crystal clear!"
Write-Host ""

Read-Host "Press Enter to close"