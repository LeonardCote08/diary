# Project cleanup script - Remove unnecessary files and tiles

Write-Host "======================================" -ForegroundColor Yellow
Write-Host " PROJECT CLEANUP" -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Yellow
Write-Host ""

# Ask if user wants to remove tiles
$removeTiles = $false
Write-Host "Do you want to remove generated tiles?" -ForegroundColor Yellow
$response = Read-Host "This will delete all tiles in public/images/tiles [y/N]"
if ($response -eq 'y' -or $response -eq 'Y') {
    $removeTiles = $true
}

Write-Host ""

# Files to remove
$filesToRemove = @(
    # Old files in root (NOT index.html!)
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

# DO NOT REMOVE index.html or HybridTileSource.js - we need them!

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

# Remove tiles if requested
if ($removeTiles) {
    Write-Host ""
    Write-Host "Removing tiles..." -ForegroundColor Yellow
    
    $tilesPath = "public\images\tiles"
    if (Test-Path $tilesPath) {
        # List what will be removed
        $tileFolders = Get-ChildItem -Path $tilesPath -Directory
        if ($tileFolders) {
            Write-Host "Found tile folders:" -ForegroundColor Gray
            foreach ($folder in $tileFolders) {
                Write-Host "  - $($folder.Name)" -ForegroundColor Gray
                
                # Calculate size
                $size = 0
                Get-ChildItem $folder.FullName -Recurse -File | ForEach-Object { $size += $_.Length }
                $sizeMB = [Math]::Round($size / 1MB, 2)
                Write-Host "    Size: $sizeMB MB" -ForegroundColor DarkGray
            }
            
            Write-Host ""
            $confirm = Read-Host "Confirm deletion of all tile folders? [y/N]"
            if ($confirm -eq 'y' -or $confirm -eq 'Y') {
                foreach ($folder in $tileFolders) {
                    try {
                        Remove-Item $folder.FullName -Recurse -Force
                        Write-Host "✓ Removed tiles: $($folder.Name)" -ForegroundColor Green
                    } catch {
                        Write-Host "✗ Failed to remove: $($folder.Name)" -ForegroundColor Red
                    }
                }
            } else {
                Write-Host "Tile removal cancelled" -ForegroundColor Yellow
            }
        } else {
            Write-Host "No tile folders found" -ForegroundColor Gray
        }
    } else {
        Write-Host "Tiles directory not found" -ForegroundColor Gray
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

# Show tiles status
if (Test-Path "public\images\tiles") {
    $remainingTiles = Get-ChildItem "public\images\tiles" -Directory
    if ($remainingTiles) {
        Write-Host ""
        Write-Host "Remaining tiles:" -ForegroundColor Yellow
        foreach ($tile in $remainingTiles) {
            Write-Host "  - $($tile.Name)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host ""
    Write-Host "No tiles found (ready for fresh generation)" -ForegroundColor Green
}

Write-Host ""

Read-Host "Press Enter to close"