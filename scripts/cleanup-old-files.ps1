# Clean up old files and scripts after optimization

Write-Host "======================================" -ForegroundColor Yellow
Write-Host " CLEANUP OLD FILES" -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Yellow
Write-Host ""

# Files to remove
$filesToRemove = @(
    # Old tile generation scripts
    "scripts\generate-proper-hybrid-tiles.ps1",
    "scripts\generate-hq-jpeg-tiles.ps1",
    "scripts\generate-png-tiles.ps1",
    "scripts\generate-ultra-quality-tiles.ps1",
    "scripts\generate-simple-hq-tiles.ps1",
    "scripts\generate-hybrid-tiles-fixed.ps1",
    "scripts\generate-multi-level-tiles.ps1",
    "scripts\test-png-quality.ps1",
    "scripts\batch-process-artworks.ps1",
    "scripts\start-app.ps1",
    
    # Old hybrid tile source (no longer needed)
    "src\core\HybridTileSource.js",
    
    # Old config files
    "vips.config.js"
)

# Scripts to keep
$scriptsToKeep = @(
    "scripts\generate-optimized-tiles.ps1",
    "scripts\verify-tiles.ps1",
    "scripts\cleanup-project.ps1",
    "scripts\svg-converter.js",
    "scripts\cleanup-old-files.ps1"
)

Write-Host "Files to remove:" -ForegroundColor Red
foreach ($file in $filesToRemove) {
    if (Test-Path $file) {
        Write-Host "  - $file" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Files to keep:" -ForegroundColor Green
foreach ($file in $scriptsToKeep) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Gray
    }
}

Write-Host ""
$confirm = Read-Host "Remove old files? [y/N]"

if ($confirm -eq 'y' -or $confirm -eq 'Y') {
    foreach ($file in $filesToRemove) {
        if (Test-Path $file) {
            try {
                Remove-Item $file -Force
                Write-Host "✓ Removed: $file" -ForegroundColor Green
            } catch {
                Write-Host "✗ Failed to remove: $file" -ForegroundColor Red
            }
        }
    }
    
    Write-Host ""
    
    # Check for old tile directories with wrong formats
    $tilesPath = "public\images\tiles"
    if (Test-Path $tilesPath) {
        $oldTileDirs = Get-ChildItem $tilesPath -Directory | Where-Object {
            # Check if directory contains hybrid-info.json (old hybrid approach)
            Test-Path "$($_.FullName)\hybrid-info.json"
        }
        
        if ($oldTileDirs) {
            Write-Host "Found old hybrid tile directories:" -ForegroundColor Yellow
            foreach ($dir in $oldTileDirs) {
                Write-Host "  - $($dir.Name)" -ForegroundColor Gray
            }
            
            $removeOld = Read-Host "Remove old hybrid tile directories? [y/N]"
            if ($removeOld -eq 'y' -or $removeOld -eq 'Y') {
                foreach ($dir in $oldTileDirs) {
                    Remove-Item $dir.FullName -Recurse -Force
                    Write-Host "✓ Removed old tiles: $($dir.Name)" -ForegroundColor Green
                }
            }
        }
    }
    
    Write-Host ""
    Write-Host "✓ Cleanup complete!" -ForegroundColor Green
    
    # Recommend regenerating tiles
    Write-Host ""
    Write-Host "IMPORTANT:" -ForegroundColor Yellow
    Write-Host "You should regenerate your tiles with the new optimized script:" -ForegroundColor Yellow
    Write-Host "  npm run tiles" -ForegroundColor Cyan
    
} else {
    Write-Host "Cleanup cancelled" -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Press Enter to close"