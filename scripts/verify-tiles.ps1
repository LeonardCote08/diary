# Verify tile generation and diagnose issues

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " TILE VERIFICATION & DIAGNOSTICS" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$tilesPath = "public\images\tiles\zebra"

# Check if tiles directory exists
if (-not (Test-Path $tilesPath)) {
    Write-Host "✗ Tiles directory not found: $tilesPath" -ForegroundColor Red
    Write-Host "  Run 'npm run tiles:png' or 'npm run tiles:ultra' first" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Tiles directory found" -ForegroundColor Green
Write-Host ""

# Check DZI file
$dziFile = "$tilesPath\zebra.dzi"
if (Test-Path $dziFile) {
    Write-Host "✓ DZI file found" -ForegroundColor Green
    [xml]$dzi = Get-Content $dziFile
    $width = [int]$dzi.Image.Size.Width
    $height = [int]$dzi.Image.Size.Height
    $tileSize = [int]$dzi.Image.TileSize
    $overlap = [int]$dzi.Image.Overlap
    $format = $dzi.Image.Format
    
    Write-Host "  Dimensions: $width x $height" -ForegroundColor Gray
    Write-Host "  Tile size: $tileSize" -ForegroundColor Gray
    Write-Host "  Overlap: $overlap" -ForegroundColor Gray
    Write-Host "  Format: $format" -ForegroundColor Cyan
} else {
    Write-Host "✗ DZI file not found" -ForegroundColor Red
    exit 1
}

# Check tiles
$filesDir = "$tilesPath\zebra_files"
if (Test-Path $filesDir) {
    Write-Host ""
    Write-Host "✓ Tiles directory found" -ForegroundColor Green
    
    # Get all levels
    $allLevels = Get-ChildItem $filesDir -Directory | ForEach-Object { [int]$_.Name } | Sort-Object
    $minLevel = $allLevels | Measure-Object -Minimum | Select-Object -ExpandProperty Minimum
    $maxLevel = $allLevels | Measure-Object -Maximum | Select-Object -ExpandProperty Maximum
    $totalLevels = $allLevels.Count
    
    Write-Host "  Levels found: $minLevel to $maxLevel" -ForegroundColor Gray
    Write-Host "  Total levels: $totalLevels" -ForegroundColor Gray
    
    # Check for missing levels
    $expectedLevels = $minLevel..$maxLevel
    $missingLevels = @()
    foreach ($level in $expectedLevels) {
        if ($level -notin $allLevels) {
            $missingLevels += $level
        }
    }
    
    if ($missingLevels.Count -gt 0) {
        Write-Host ""
        Write-Host "⚠ WARNING: Missing levels detected!" -ForegroundColor Yellow
        Write-Host "  Missing: $($missingLevels -join ', ')" -ForegroundColor Yellow
        Write-Host "  This may cause 'Image load aborted' errors" -ForegroundColor Yellow
    }
    
    Write-Host ""
    
    $totalJpeg = 0
    $totalPng = 0
    $totalSize = 0
    
    Write-Host "Level analysis:" -ForegroundColor Yellow
    
    # Analyze each existing level
    foreach ($level in $allLevels) {
        $levelPath = Join-Path $filesDir $level.ToString()
        
        $jpegFiles = Get-ChildItem "$levelPath\*.jpg" -ErrorAction SilentlyContinue
        $pngFiles = Get-ChildItem "$levelPath\*.png" -ErrorAction SilentlyContinue
        
        $levelJpeg = if ($jpegFiles) { $jpegFiles.Count } else { 0 }
        $levelPng = if ($pngFiles) { $pngFiles.Count } else { 0 }
        $levelTotal = $levelJpeg + $levelPng
        
        $format = if ($levelPng -gt 0) { "PNG" } elseif ($levelJpeg -gt 0) { "JPEG" } else { "NONE" }
        
        # Calculate size
        $levelSize = 0
        if ($jpegFiles) { $levelSize += ($jpegFiles | Measure-Object -Property Length -Sum).Sum }
        if ($pngFiles) { $levelSize += ($pngFiles | Measure-Object -Property Length -Sum).Sum }
        $levelSizeMB = [Math]::Round($levelSize / 1MB, 2)
        
        Write-Host "  Level $level`: $levelTotal tiles ($format) - $levelSizeMB MB" -ForegroundColor Gray
        
        $totalJpeg += $levelJpeg
        $totalPng += $levelPng
        $totalSize += $levelSize
    }
    
    $totalSizeMB = [Math]::Round($totalSize / 1MB, 2)
    
    Write-Host ""
    Write-Host "Summary:" -ForegroundColor Yellow
    Write-Host "  JPEG tiles: $totalJpeg" -ForegroundColor Gray
    Write-Host "  PNG tiles: $totalPng" -ForegroundColor Gray
    Write-Host "  Total tiles: $($totalJpeg + $totalPng)" -ForegroundColor Gray
    Write-Host "  Total size: $totalSizeMB MB" -ForegroundColor Gray
    
    # Check preview
    Write-Host ""
    if (Test-Path "$tilesPath\preview.jpg") {
        $previewSize = (Get-Item "$tilesPath\preview.jpg").Length / 1KB
        Write-Host "✓ Preview image found ($([Math]::Round($previewSize, 0)) KB)" -ForegroundColor Green
    } else {
        Write-Host "⚠ No preview image" -ForegroundColor Yellow
    }
    
    # Performance estimation
    Write-Host ""
    Write-Host "Performance notes:" -ForegroundColor Yellow
    if ($totalSizeMB -gt 150) {
        Write-Host "  ⚠ Large file size may slow initial loading" -ForegroundColor Yellow
        Write-Host "  Consider using JPEG Ultra for better performance" -ForegroundColor Gray
    } else {
        Write-Host "  ✓ File size is reasonable for web delivery" -ForegroundColor Green
    }
    
    # Final verdict
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    
    if ($missingLevels.Count -eq 0 -and ($totalJpeg -gt 0 -or $totalPng -gt 0)) {
        if ($totalPng -gt 0 -and $totalJpeg -eq 0) {
            Write-Host " ✅ PNG TILES VERIFIED!" -ForegroundColor Green
            Write-Host " Maximum quality for text" -ForegroundColor Green
        } elseif ($totalJpeg -gt 0 -and $totalPng -eq 0) {
            Write-Host " ✅ JPEG TILES VERIFIED!" -ForegroundColor Green
            Write-Host " Ultra-quality JPEG" -ForegroundColor Green
        } else {
            Write-Host " ✅ HYBRID TILES DETECTED!" -ForegroundColor Green
            Write-Host " Mixed format tiles" -ForegroundColor Green
        }
        Write-Host " Ready for viewing!" -ForegroundColor Green
    } else {
        Write-Host " ⚠ TILES VERIFIED WITH WARNINGS" -ForegroundColor Yellow
        if ($missingLevels.Count -gt 0) {
            Write-Host " Missing levels may cause loading issues" -ForegroundColor Yellow
        }
    }
    Write-Host "======================================" -ForegroundColor Cyan
    
} else {
    Write-Host "✗ Tiles directory not found" -ForegroundColor Red
}

Write-Host ""

# Show tile statistics
$tileCount = $totalJpeg + $totalPng
if ($tileCount -gt 0) {
    Write-Host "Tile statistics:" -ForegroundColor Cyan
    Write-Host "  Tiles per second at 10 Mbps: ~$([Math]::Round(10 * 1024 * 1024 / 8 / ($totalSize / $tileCount), 0)) tiles/sec" -ForegroundColor Gray
    Write-Host "  Estimated load time at 10 Mbps: ~$([Math]::Round($totalSize / (10 * 1024 * 1024 / 8), 1)) seconds" -ForegroundColor Gray
    Write-Host "  Average tile size: $([Math]::Round($totalSize / $tileCount / 1024, 1)) KB" -ForegroundColor Gray
}

Write-Host ""
Read-Host "Press Enter to close"