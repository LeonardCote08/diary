# Clean up old PowerShell scripts
# Keep only the essential ones

Write-Host "======================================" -ForegroundColor Yellow
Write-Host " CLEANING UP OLD SCRIPTS" -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Yellow
Write-Host ""

# Scripts to remove
$scriptsToRemove = @(
    "scripts\generate-proper-hybrid-tiles.ps1",
    "scripts\generate-hq-jpeg-tiles.ps1",
    "scripts\generate-simple-hq-tiles.ps1",
    "scripts\generate-hybrid-tiles-fixed.ps1",
    "scripts\generate-multi-level-tiles.ps1",
    "scripts\test-png-quality.ps1",
    "scripts\batch-process-artworks.ps1",
    "scripts\start-app.ps1"
)

# Scripts to keep
$scriptsToKeep = @(
    "scripts\generate-png-tiles.ps1",
    "scripts\generate-ultra-quality-tiles.ps1",
    "scripts\verify-tiles.ps1",
    "scripts\cleanup-project.ps1",
    "scripts\svg-converter.js"
)

Write-Host "Scripts to remove:" -ForegroundColor Red
foreach ($script in $scriptsToRemove) {
    if (Test-Path $script) {
        Write-Host "  - $script" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Scripts to keep:" -ForegroundColor Green
foreach ($script in $scriptsToKeep) {
    if (Test-Path $script) {
        Write-Host "  ✓ $script" -ForegroundColor Gray
    }
}

Write-Host ""
$confirm = Read-Host "Remove old scripts? [y/N]"

if ($confirm -eq 'y' -or $confirm -eq 'Y') {
    foreach ($script in $scriptsToRemove) {
        if (Test-Path $script) {
            try {
                Remove-Item $script -Force
                Write-Host "✓ Removed: $script" -ForegroundColor Green
            } catch {
                Write-Host "✗ Failed to remove: $script" -ForegroundColor Red
            }
        }
    }
    
    Write-Host ""
    Write-Host "✓ Cleanup complete!" -ForegroundColor Green
} else {
    Write-Host "Cleanup cancelled" -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Press Enter to close"