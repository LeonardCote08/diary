# Cleanup script to remove old optimization attempts and unnecessary files
# Run this after confirming the new optimizations work well

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " OPTIMIZATION CLEANUP" -ForegroundColor Cyan
Write-Host " Remove old files and backups" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Directories to check
$projectRoot = Get-Location
$publicDir = "$projectRoot\public"
$tilesDir = "$publicDir\images\tiles"
$srcDir = "$projectRoot\src"
$nodeModules = "$projectRoot\node_modules"

# Calculate current project size
Write-Host "Analyzing project size..." -ForegroundColor Yellow
$totalSize = 0
$tileSizes = @{}

# Check tiles directory
if (Test-Path $tilesDir) {
    $tilesDirs = Get-ChildItem $tilesDir -Directory
    foreach ($dir in $tilesDirs) {
        $dirSize = (Get-ChildItem $dir.FullName -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
        $tileSizes[$dir.Name] = $dirSize
        $totalSize += $dirSize
    }
}

# Check node_modules
$nodeModulesSize = 0
if (Test-Path $nodeModules) {
    Write-Host "Calculating node_modules size (this may take a moment)..." -ForegroundColor Gray
    $nodeModulesSize = (Get-ChildItem $nodeModules -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
    $totalSize += $nodeModulesSize
}

Write-Host ""
Write-Host "Current project analysis:" -ForegroundColor Cyan
Write-Host "  Total size: $([Math]::Round($totalSize, 2)) MB" -ForegroundColor White

if ($tileSizes.Count -gt 0) {
    Write-Host ""
    Write-Host "  Tile directories:" -ForegroundColor Yellow
    foreach ($tile in $tileSizes.GetEnumerator() | Sort-Object Value -Descending) {
        $label = ""
        if ($tile.Key -like "*backup*") { $label = " [BACKUP]" }
        elseif ($tile.Key -like "*1024*") { $label = " [1024px]" }
        elseif ($tile.Key -like "*webp*") { $label = " [WebP]" }
        
        Write-Host "    $($tile.Key): $([Math]::Round($tile.Value, 2)) MB$label" -ForegroundColor Gray
    }
}

if ($nodeModulesSize -gt 0) {
    Write-Host "  node_modules: $([Math]::Round($nodeModulesSize, 2)) MB" -ForegroundColor Gray
}

# Find cleanup candidates
Write-Host ""
Write-Host "Finding cleanup candidates..." -ForegroundColor Yellow
$candidates = @()

# Old tile backups
if (Test-Path $tilesDir) {
    $backups = Get-ChildItem $tilesDir -Directory | Where-Object { 
        $_.Name -like "*backup*" -and 
        $_.LastWriteTime -lt (Get-Date).AddDays(-7) 
    }
    
    foreach ($backup in $backups) {
        $size = (Get-ChildItem $backup.FullName -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
        $candidates += @{
            Path = $backup.FullName
            Type = "Old tile backup"
            Size = $size
            Age = ((Get-Date) - $backup.LastWriteTime).Days
        }
    }
}

# Unused tile formats
$unusedFormats = @()
if (Test-Path "$tilesDir\zebra_webp") {
    $size = (Get-ChildItem "$tilesDir\zebra_webp" -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
    $candidates += @{
        Path = "$tilesDir\zebra_webp"
        Type = "Unused WebP tiles"
        Size = $size
        Age = 0
    }
}

# Old build artifacts
$distDir = "$projectRoot\dist"
if (Test-Path $distDir) {
    $distAge = ((Get-Date) - (Get-Item $distDir).LastWriteTime).Days
    if ($distAge -gt 3) {
        $size = (Get-ChildItem $distDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
        $candidates += @{
            Path = $distDir
            Type = "Old build artifacts"
            Size = $size
            Age = $distAge
        }
    }
}

# NPM cache
$npmCache = "$env:APPDATA\npm-cache"
if (Test-Path $npmCache) {
    $size = (Get-ChildItem $npmCache -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
    if ($size -gt 500) {
        $candidates += @{
            Path = $npmCache
            Type = "NPM cache"
            Size = $size
            Age = 0
        }
    }
}

# Display candidates
if ($candidates.Count -eq 0) {
    Write-Host ""
    Write-Host "No cleanup candidates found. Project is clean!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Cleanup candidates:" -ForegroundColor Cyan
    $totalCleanupSize = 0
    
    for ($i = 0; $i -lt $candidates.Count; $i++) {
        $c = $candidates[$i]
        Write-Host ""
        Write-Host "  $($i + 1). $($c.Type)" -ForegroundColor Yellow
        Write-Host "     Path: $($c.Path)" -ForegroundColor Gray
        Write-Host "     Size: $([Math]::Round($c.Size, 2)) MB" -ForegroundColor White
        if ($c.Age -gt 0) {
            Write-Host "     Age: $($c.Age) days old" -ForegroundColor Gray
        }
        $totalCleanupSize += $c.Size
    }
    
    Write-Host ""
    Write-Host "Total recoverable space: $([Math]::Round($totalCleanupSize, 2)) MB" -ForegroundColor Green
    Write-Host ""
    
    # Cleanup options
    Write-Host "Cleanup options:" -ForegroundColor Yellow
    Write-Host "1. Clean all candidates" -ForegroundColor White
    Write-Host "2. Select specific items to clean" -ForegroundColor White
    Write-Host "3. Dry run (show what would be deleted)" -ForegroundColor White
    Write-Host "4. Cancel" -ForegroundColor White
    Write-Host ""
    
    $choice = Read-Host "Enter choice [1-4]"
    
    switch ($choice) {
        "1" {
            # Clean all
            Write-Host ""
            Write-Host "Cleaning all candidates..." -ForegroundColor Yellow
            
            foreach ($c in $candidates) {
                Write-Host "  Removing: $($c.Type)..." -ForegroundColor Gray -NoNewline
                try {
                    if ($c.Type -eq "NPM cache") {
                        npm cache clean --force 2>&1 | Out-Null
                    } else {
                        Remove-Item $c.Path -Recurse -Force -ErrorAction Stop
                    }
                    Write-Host " ✓" -ForegroundColor Green
                } catch {
                    Write-Host " ✗" -ForegroundColor Red
                    Write-Host "    Error: $_" -ForegroundColor Red
                }
            }
            
            Write-Host ""
            Write-Host "✓ Cleanup complete!" -ForegroundColor Green
        }
        
        "2" {
            # Select specific
            Write-Host ""
            Write-Host "Enter item numbers to clean (comma-separated, e.g., 1,3,4):" -ForegroundColor Yellow
            $selection = Read-Host
            
            $indices = $selection -split ',' | ForEach-Object { [int]$_.Trim() - 1 }
            
            Write-Host ""
            Write-Host "Cleaning selected items..." -ForegroundColor Yellow
            
            foreach ($index in $indices) {
                if ($index -ge 0 -and $index -lt $candidates.Count) {
                    $c = $candidates[$index]
                    Write-Host "  Removing: $($c.Type)..." -ForegroundColor Gray -NoNewline
                    try {
                        if ($c.Type -eq "NPM cache") {
                            npm cache clean --force 2>&1 | Out-Null
                        } else {
                            Remove-Item $c.Path -Recurse -Force -ErrorAction Stop
                        }
                        Write-Host " ✓" -ForegroundColor Green
                    } catch {
                        Write-Host " ✗" -ForegroundColor Red
                        Write-Host "    Error: $_" -ForegroundColor Red
                    }
                }
            }
            
            Write-Host ""
            Write-Host "✓ Selected cleanup complete!" -ForegroundColor Green
        }
        
        "3" {
            # Dry run
            Write-Host ""
            Write-Host "DRY RUN - The following would be deleted:" -ForegroundColor Cyan
            
            foreach ($c in $candidates) {
                Write-Host "  - $($c.Path)" -ForegroundColor Gray
                
                # Show some files that would be deleted
                if (Test-Path $c.Path) {
                    $files = Get-ChildItem $c.Path -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 5
                    foreach ($file in $files) {
                        Write-Host "    • $($file.FullName.Replace($c.Path, '...'))" -ForegroundColor DarkGray
                    }
                    $totalFiles = (Get-ChildItem $c.Path -File -Recurse -ErrorAction SilentlyContinue).Count
                    if ($totalFiles -gt 5) {
                        Write-Host "    • ... and $($totalFiles - 5) more files" -ForegroundColor DarkGray
                    }
                }
            }
            
            Write-Host ""
            Write-Host "No files were deleted (dry run mode)" -ForegroundColor Yellow
        }
        
        "4" {
            Write-Host "Cleanup cancelled" -ForegroundColor Yellow
        }
        
        default {
            Write-Host "Invalid choice" -ForegroundColor Red
        }
    }
}

# Additional recommendations
Write-Host ""
Write-Host "Additional optimization recommendations:" -ForegroundColor Cyan
Write-Host "  • Run 'npm prune' to remove unused dependencies" -ForegroundColor White
Write-Host "  • Run 'npm dedupe' to optimize dependency tree" -ForegroundColor White
Write-Host "  • Consider using 'npm ci' instead of 'npm install' for faster installs" -ForegroundColor White
Write-Host "  • Clear browser cache after major optimizations" -ForegroundColor White

# Git cleanup suggestion
$gitSize = 0
if (Test-Path "$projectRoot\.git") {
    $gitSize = (Get-ChildItem "$projectRoot\.git" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
    if ($gitSize -gt 100) {
        Write-Host ""
        Write-Host "Note: Git repository is $([Math]::Round($gitSize, 2)) MB" -ForegroundColor Yellow
        Write-Host "Consider running 'git gc --aggressive' to optimize" -ForegroundColor Gray
    }
}

Write-Host ""
Read-Host "Press Enter to close"