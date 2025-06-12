# Quick test script for high-quality tiles

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " HIGH-QUALITY TILE TEST" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "This script will:" -ForegroundColor Yellow
Write-Host "1. Generate high-quality tiles (256px, 95% quality)" -ForegroundColor White
Write-Host "2. Start the development server" -ForegroundColor White
Write-Host "3. Open your browser automatically" -ForegroundColor White
Write-Host ""

$response = Read-Host "Continue? [Y/n]"
if ($response -eq 'n' -or $response -eq 'N') {
    exit
}

# Run high-quality tile generation
Write-Host ""
Write-Host "Step 1: Generating high-quality tiles..." -ForegroundColor Cyan
& ".\generate-tiles-simple.ps1"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Tile generation failed!" -ForegroundColor Red
    exit 1
}

# Start dev server
Write-Host ""
Write-Host "Step 2: Starting development server..." -ForegroundColor Cyan
Write-Host "The browser will open automatically at http://localhost:5173" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""

# Run dev server
npm run dev