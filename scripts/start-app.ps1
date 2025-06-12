# Simple script to start the Interactive Art Diary application

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " STARTING INTERACTIVE ART DIARY" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: Not in the diary project directory!" -ForegroundColor Red
    Write-Host "Please run this script from the diary folder" -ForegroundColor Yellow
    exit 1
}

# Check if tiles exist
$tilesPath = "public\images\tiles\zebra\zebra.dzi"
if (Test-Path $tilesPath) {
    Write-Host "✓ Tiles found" -ForegroundColor Green
} else {
    Write-Host "⚠ No tiles found. Run 'npm run tiles' first!" -ForegroundColor Yellow
}

# Check node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "Starting development server..." -ForegroundColor Yellow
Write-Host "The browser should open automatically." -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""

# Start the dev server
npm run dev