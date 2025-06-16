# Verify Web Worker setup
# Checks all components are properly installed

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " WEB WORKER VERIFICATION" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$errors = 0
$warnings = 0

# Check 1: Project root
Write-Host "Checking project structure..." -ForegroundColor Yellow
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Not in project root directory" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Project root confirmed" -ForegroundColor Green

# Check 2: Web Worker file
Write-Host ""
Write-Host "Checking Web Worker file..." -ForegroundColor Yellow
$workerPath = "public\tile-worker.js"
if (Test-Path $workerPath) {
    $fileInfo = Get-Item $workerPath
    $sizeKB = [Math]::Round($fileInfo.Length / 1KB, 2)
    Write-Host "✓ tile-worker.js found ($sizeKB KB)" -ForegroundColor Green
    
    # Check if it's too small (might be empty)
    if ($fileInfo.Length -lt 1000) {
        Write-Host "⚠ Warning: tile-worker.js seems too small" -ForegroundColor Yellow
        $warnings++
    }
} else {
    Write-Host "❌ tile-worker.js not found in public/" -ForegroundColor Red
    $errors++
}

# Check 3: TileWorkerManager
Write-Host ""
Write-Host "Checking TileWorkerManager..." -ForegroundColor Yellow
$managerPath = "src\core\TileWorkerManager.js"
if (Test-Path $managerPath) {
    Write-Host "✓ TileWorkerManager.js found" -ForegroundColor Green
    
    # Check if it imports correctly
    $content = Get-Content $managerPath -Raw
    if ($content -match "class TileWorkerManager") {
        Write-Host "✓ TileWorkerManager class defined" -ForegroundColor Green
    } else {
        Write-Host "⚠ TileWorkerManager class not found" -ForegroundColor Yellow
        $warnings++
    }
} else {
    Write-Host "❌ TileWorkerManager.js not found" -ForegroundColor Red
    $errors++
}

# Check 4: TileOptimizer updates
Write-Host ""
Write-Host "Checking TileOptimizer integration..." -ForegroundColor Yellow
$optimizerPath = "src\core\TileOptimizer.js"
if (Test-Path $optimizerPath) {
    $content = Get-Content $optimizerPath -Raw
    
    if ($content -match "import TileWorkerManager") {
        Write-Host "✓ TileOptimizer imports TileWorkerManager" -ForegroundColor Green
    } else {
        Write-Host "❌ TileOptimizer doesn't import TileWorkerManager" -ForegroundColor Red
        $errors++
    }
    
    if ($content -match "this\.workerManager") {
        Write-Host "✓ TileOptimizer uses workerManager" -ForegroundColor Green
    } else {
        Write-Host "❌ TileOptimizer doesn't use workerManager" -ForegroundColor Red
        $errors++
    }
} else {
    Write-Host "❌ TileOptimizer.js not found" -ForegroundColor Red
    $errors++
}

# Check 5: ArtworkViewer updates
Write-Host ""
Write-Host "Checking ArtworkViewer integration..." -ForegroundColor Yellow
$viewerPath = "src\components\ArtworkViewer.jsx"
if (Test-Path $viewerPath) {
    $content = Get-Content $viewerPath -Raw
    
    if ($content -match "'w':|'W':") {
        Write-Host "✓ ArtworkViewer has 'W' key handler for Worker status" -ForegroundColor Green
    } else {
        Write-Host "⚠ ArtworkViewer missing 'W' key handler" -ForegroundColor Yellow
        $warnings++
    }
} else {
    Write-Host "❌ ArtworkViewer.jsx not found" -ForegroundColor Red
    $errors++
}

# Check 6: Deployment scripts
Write-Host ""
Write-Host "Checking deployment scripts..." -ForegroundColor Yellow
$deployScript = "scripts\deploy-to-netlify.ps1"
if (Test-Path $deployScript) {
    $content = Get-Content $deployScript -Raw
    if ($content -match "tile-worker\.js") {
        Write-Host "✓ Deployment script handles Web Worker" -ForegroundColor Green
    } else {
        Write-Host "⚠ Deployment script may not handle Web Worker" -ForegroundColor Yellow
        $warnings++
    }
}

# Summary
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " VERIFICATION SUMMARY" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

if ($errors -eq 0 -and $warnings -eq 0) {
    Write-Host "✅ All checks passed! Web Worker system is ready." -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now:" -ForegroundColor Yellow
    Write-Host "1. Run 'npm run dev' to test locally" -ForegroundColor White
    Write-Host "2. Press 'W' in the viewer to check Worker status" -ForegroundColor White
    Write-Host "3. Monitor console for 'TileOptimizer: Web Worker initialized'" -ForegroundColor White
} elseif ($errors -eq 0) {
    Write-Host "✓ Setup complete with $warnings warning(s)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The system should work but check the warnings above." -ForegroundColor White
} else {
    Write-Host "❌ Setup incomplete: $errors error(s), $warnings warning(s)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Fix the errors above before proceeding." -ForegroundColor White
}

Write-Host ""

# Quick test option
if ($errors -eq 0) {
    $test = Read-Host "Run 'npm run dev' to test now? [y/N]"
    if ($test -eq 'y' -or $test -eq 'Y') {
        Write-Host ""
        Write-Host "Starting development server..." -ForegroundColor Cyan
        npm run dev
    }
} else {
    Read-Host "Press Enter to close"
}