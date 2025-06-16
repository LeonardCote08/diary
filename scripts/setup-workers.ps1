# Setup Web Worker file in public directory
# This ensures the worker is accessible at runtime

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " WEB WORKER SETUP" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: Must run from project root directory" -ForegroundColor Red
    exit 1
}

# Create public directory if it doesn't exist
if (-not (Test-Path "public")) {
    Write-Host "Creating public directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "public" -Force | Out-Null
}

# Check if tile-worker.js already exists
$workerPath = "public\tile-worker.js"
if (Test-Path $workerPath) {
    Write-Host "✓ tile-worker.js already exists" -ForegroundColor Green
    
    # Show file info
    $fileInfo = Get-Item $workerPath
    Write-Host ""
    Write-Host "File info:" -ForegroundColor Gray
    Write-Host "  Size: $([Math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Gray
    Write-Host "  Modified: $($fileInfo.LastWriteTime)" -ForegroundColor Gray
    
    Write-Host ""
    $overwrite = Read-Host "Overwrite existing file? [y/N]"
    if ($overwrite -ne 'y' -and $overwrite -ne 'Y') {
        Write-Host "Keeping existing tile-worker.js" -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ""
Write-Host "IMPORTANT: You need to create the tile-worker.js file" -ForegroundColor Yellow
Write-Host ""
Write-Host "The Web Worker file should contain:" -ForegroundColor White
Write-Host "- Tile processing logic" -ForegroundColor Gray
Write-Host "- Priority calculation" -ForegroundColor Gray
Write-Host "- Cache management" -ForegroundColor Gray
Write-Host "- Message handling" -ForegroundColor Gray
Write-Host ""
Write-Host "Place the tile-worker.js file in: public\" -ForegroundColor Cyan
Write-Host ""

# Verify TileWorkerManager exists
$managerPath = "src\core\TileWorkerManager.js"
if (Test-Path $managerPath) {
    Write-Host "✓ TileWorkerManager.js found" -ForegroundColor Green
} else {
    Write-Host "⚠ TileWorkerManager.js not found at $managerPath" -ForegroundColor Yellow
    Write-Host "  Make sure to create this file for Worker management" -ForegroundColor Gray
}

# Check if TileOptimizer has been updated
$optimizerPath = "src\core\TileOptimizer.js"
if (Test-Path $optimizerPath) {
    $content = Get-Content $optimizerPath -Raw
    if ($content -match "TileWorkerManager") {
        Write-Host "✓ TileOptimizer.js has Web Worker support" -ForegroundColor Green
    } else {
        Write-Host "⚠ TileOptimizer.js needs to be updated for Web Worker support" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " SETUP STATUS" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Summary
$workerExists = Test-Path $workerPath
$managerExists = Test-Path $managerPath

if ($workerExists -and $managerExists) {
    Write-Host "✅ Web Worker system is ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Run 'npm run dev' to test" -ForegroundColor White
    Write-Host "2. Press 'W' in viewer to check status" -ForegroundColor White
    Write-Host "3. Watch console for initialization" -ForegroundColor White
} else {
    Write-Host "⚠ Web Worker system is not complete" -ForegroundColor Yellow
    Write-Host ""
    if (-not $workerExists) {
        Write-Host "Missing: public\tile-worker.js" -ForegroundColor Red
    }
    if (-not $managerExists) {
        Write-Host "Missing: src\core\TileWorkerManager.js" -ForegroundColor Red
    }
}

Write-Host ""
Read-Host "Press Enter to close"