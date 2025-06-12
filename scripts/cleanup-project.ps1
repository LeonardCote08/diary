# Project cleanup script - Remove unnecessary files

Write-Host "======================================" -ForegroundColor Yellow
Write-Host " PROJECT CLEANUP" -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Yellow
Write-Host ""

# Files to remove
$filesToRemove = @(
    # Old files in root
    "index.html",
    "test-files",
    "test-tiles",
    "quick-test-tiles.ps1",
    "test-png-quality.ps1",
    "generate-png-tiles.ps1",
    "generate-tiles-simple.ps1",
    "test-hq.ps1",
    "quick-hq-tiles.ps1",
    "regenerate-hq-tiles.ps1",
    "start-dev-server.bat",
    "folder-structure.sh",
    # Old scripts
    "scripts/test-vips-options.ps1",
    "scripts/generate-tiles-vips.js",
    "scripts/quick-test-tiles.ps1"
)

# DO NOT REMOVE HybridTileSource.js - we need it!

# Remove each file/folder
foreach ($file in $filesToRemove) {
    if (Test-Path $file) {
        try {
            Remove-Item $file -Recurse -Force -ErrorAction Stop
            Write-Host "✓ Removed: $file" -ForegroundColor Green
        } catch {
            Write-Host "✗ Failed to remove: $file" -ForegroundColor Red
        }
    } else {
        Write-Host "- Skipped (not found): $file" -ForegroundColor Gray
    }
}

# Check for old backup folders
$backupFolders = Get-ChildItem -Path "public\images\tiles" -Filter "*_backup" -Directory -ErrorAction SilentlyContinue
if ($backupFolders) {
    Write-Host ""
    Write-Host "Found backup folders:" -ForegroundColor Yellow
    foreach ($folder in $backupFolders) {
        Write-Host "  - $($folder.Name)" -ForegroundColor Gray
    }
    $response = Read-Host "Remove backup folders? [y/N]"
    if ($response -eq 'y' -or $response -eq 'Y') {
        foreach ($folder in $backupFolders) {
            Remove-Item $folder.FullName -Recurse -Force
            Write-Host "✓ Removed: $($folder.Name)" -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "✓ Cleanup complete!" -ForegroundColor Green
Write-Host ""

# Show remaining structure
Write-Host "Current project structure:" -ForegroundColor Yellow
Write-Host "- /assets (source files)" -ForegroundColor Gray
Write-Host "- /public (web files)" -ForegroundColor Gray
Write-Host "- /scripts (PowerShell & JS scripts)" -ForegroundColor Gray
Write-Host "- /src (application code)" -ForegroundColor Gray
Write-Host ""

Read-Host "Press Enter to close"