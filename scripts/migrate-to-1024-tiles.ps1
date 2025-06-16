# Migrate existing tiles to 1024px performance tiles
# Run this after generating 1024px tiles to update the viewer

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " MIGRATE TO 1024px TILES" -ForegroundColor Cyan
Write-Host " For optimal 60 FPS performance" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$artworkId = "zebra"
$tilesDir = "public\images\tiles"
$oldTilesDir = "$tilesDir\$artworkId"
$newTilesDir = "$tilesDir\${artworkId}_1024"

# Check if new tiles exist
if (-not (Test-Path $newTilesDir)) {
    Write-Host "ERROR: 1024px tiles not found at: $newTilesDir" -ForegroundColor Red
    Write-Host "Please run generate-1024-tiles.ps1 first" -ForegroundColor Yellow
    exit 1
}

# Check if old tiles exist
if (-not (Test-Path $oldTilesDir)) {
    Write-Host "ERROR: Original tiles not found at: $oldTilesDir" -ForegroundColor Red
    exit 1
}

Write-Host "Migration options:" -ForegroundColor Yellow
Write-Host "1. Test 1024px tiles (keep original as backup)" -ForegroundColor White
Write-Host "2. Replace original with 1024px tiles permanently" -ForegroundColor White
Write-Host "3. Compare tile directories" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Enter choice [1-3]"

switch ($choice) {
    "1" {
        # Test mode - rename directories temporarily
        Write-Host ""
        Write-Host "Setting up test mode..." -ForegroundColor Yellow
        
        # Rename original to backup
        $backupDir = "${oldTilesDir}_256_backup"
        if (Test-Path $backupDir) {
            Write-Host "Removing old backup..." -ForegroundColor Gray
            Remove-Item $backupDir -Recurse -Force
        }
        
        Write-Host "Backing up original tiles to: $backupDir" -ForegroundColor Gray
        Rename-Item $oldTilesDir $backupDir
        
        # Rename 1024 to main
        Write-Host "Activating 1024px tiles..." -ForegroundColor Gray
        Rename-Item $newTilesDir $oldTilesDir
        
        Write-Host ""
        Write-Host "✓ Test mode activated!" -ForegroundColor Green
        Write-Host ""
        Write-Host "The viewer will now use 1024px tiles." -ForegroundColor White
        Write-Host "To revert: Run this script again and choose option 2" -ForegroundColor Yellow
    }
    
    "2" {
        # Check current state
        $backupExists = Test-Path "${oldTilesDir}_256_backup"
        
        if ($backupExists) {
            # Revert from test mode
            Write-Host ""
            Write-Host "Reverting to original 256px tiles..." -ForegroundColor Yellow
            
            # Rename current (1024) back
            $temp1024Dir = "${oldTilesDir}_1024"
            Rename-Item $oldTilesDir $temp1024Dir
            
            # Restore backup
            Rename-Item "${oldTilesDir}_256_backup" $oldTilesDir
            
            # Rename 1024 back to its original name
            Rename-Item $temp1024Dir $newTilesDir
            
            Write-Host ""
            Write-Host "✓ Reverted to 256px tiles!" -ForegroundColor Green
        } else {
            # Permanent replacement
            Write-Host ""
            Write-Host "WARNING: This will permanently replace 256px tiles with 1024px tiles!" -ForegroundColor Red
            $confirm = Read-Host "Are you sure? [y/N]"
            
            if ($confirm -eq 'y' -or $confirm -eq 'Y') {
                Write-Host ""
                Write-Host "Creating permanent backup..." -ForegroundColor Yellow
                
                $permanentBackup = "${oldTilesDir}_256_permanent_backup"
                if (Test-Path $permanentBackup) {
                    Remove-Item $permanentBackup -Recurse -Force
                }
                
                Move-Item $oldTilesDir $permanentBackup
                Move-Item $newTilesDir $oldTilesDir
                
                Write-Host ""
                Write-Host "✓ Permanently migrated to 1024px tiles!" -ForegroundColor Green
                Write-Host "Original tiles backed up to: $permanentBackup" -ForegroundColor Gray
            } else {
                Write-Host "Migration cancelled" -ForegroundColor Yellow
            }
        }
    }
    
    "3" {
        # Compare directories
        Write-Host ""
        Write-Host "Comparing tile directories..." -ForegroundColor Yellow
        Write-Host ""
        
        # Get info for 256px tiles
        if (Test-Path $oldTilesDir) {
            $old256Files = Get-ChildItem $oldTilesDir -Recurse -File | Where-Object { $_.Extension -in ".jpg", ".jpeg" }
            $old256Size = ($old256Files | Measure-Object -Property Length -Sum).Sum / 1MB
            Write-Host "256px tiles:" -ForegroundColor Cyan
            Write-Host "  Location: $oldTilesDir" -ForegroundColor Gray
            Write-Host "  Files: $($old256Files.Count)" -ForegroundColor White
            Write-Host "  Size: $([Math]::Round($old256Size, 2)) MB" -ForegroundColor White
        } else {
            Write-Host "256px tiles: NOT FOUND" -ForegroundColor Red
        }
        
        Write-Host ""
        
        # Get info for 1024px tiles
        if (Test-Path $newTilesDir) {
            $new1024Files = Get-ChildItem $newTilesDir -Recurse -File | Where-Object { $_.Extension -in ".jpg", ".jpeg" }
            $new1024Size = ($new1024Files | Measure-Object -Property Length -Sum).Sum / 1MB
            Write-Host "1024px tiles:" -ForegroundColor Cyan
            Write-Host "  Location: $newTilesDir" -ForegroundColor Gray
            Write-Host "  Files: $($new1024Files.Count)" -ForegroundColor White
            Write-Host "  Size: $([Math]::Round($new1024Size, 2)) MB" -ForegroundColor White
        } else {
            Write-Host "1024px tiles: NOT FOUND" -ForegroundColor Red
        }
        
        # Calculate differences
        if ((Test-Path $oldTilesDir) -and (Test-Path $newTilesDir)) {
            Write-Host ""
            Write-Host "Comparison:" -ForegroundColor Green
            $fileReduction = [Math]::Round((1 - ($new1024Files.Count / $old256Files.Count)) * 100, 1)
            $sizeIncrease = [Math]::Round((($new1024Size / $old256Size) - 1) * 100, 1)
            
            Write-Host "  File count reduction: $fileReduction%" -ForegroundColor White
            Write-Host "  Size difference: +$sizeIncrease%" -ForegroundColor White
            Write-Host "  Expected performance gain: ~117ms faster rendering" -ForegroundColor Cyan
        }
        
        # Check for backups
        Write-Host ""
        Write-Host "Existing backups:" -ForegroundColor Yellow
        $backups = Get-ChildItem $tilesDir -Directory | Where-Object { $_.Name -like "*backup*" }
        if ($backups.Count -eq 0) {
            Write-Host "  None found" -ForegroundColor Gray
        } else {
            foreach ($backup in $backups) {
                $backupSize = (Get-ChildItem $backup.FullName -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
                Write-Host "  $($backup.Name) - $([Math]::Round($backupSize, 2)) MB" -ForegroundColor Gray
            }
        }
    }
    
    default {
        Write-Host "Invalid choice" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# Performance tips
if ($choice -eq "1" -or ($choice -eq "2" -and $confirm -eq 'y')) {
    Write-Host "Performance tips:" -ForegroundColor Cyan
    Write-Host "  ✓ Clear browser cache after migration" -ForegroundColor White
    Write-Host "  ✓ Test zoom performance - should be smoother" -ForegroundColor White
    Write-Host "  ✓ Monitor FPS counter (press 'D' to toggle)" -ForegroundColor White
    Write-Host "  ✓ Check network tab - fewer tile requests" -ForegroundColor White
}

Write-Host ""
Read-Host "Press Enter to close"