# Verify tile generation - Check if tiles were generated correctly

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " TILE VERIFICATION" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$tilesPath = "public\images\tiles\zebra"

# Check if tiles directory exists
if (-not (Test-Path $tilesPath)) {
    Write-Host "✗ Tiles directory not found: $tilesPath" -ForegroundColor Red
    Write-Host "  Run 'npm run tiles' first" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Tiles directory found" -ForegroundColor Green
Write-Host ""

# Check DZI file
$dziFile = "$tilesPath\zebra.dzi"
if (Test-Path $dziFile) {
    Write-Host "✓ DZI file found" -ForegroundColor Green
    [xml]$dzi = Get-Content $dziFile
    $width = $dzi.Image.Size.Width
    $height = $dzi.Image.Size.Height
    $tileSize = $dzi.Image.TileSize
    Write-Host "  Dimensions: $width x $height" -ForegroundColor Gray
    Write-Host "  Tile size: $tileSize" -ForegroundColor Gray
} else {
    Write-Host "✗ DZI file not found" -ForegroundColor Red
    exit 1
}

# Check tiles
$filesDir = "$tilesPath\zebra_files"
if (Test-Path $filesDir) {
    Write-Host ""
    Write-Host "✓ Tiles directory found" -ForegroundColor Green
    
    # Count levels and tiles
    $levels = Get-ChildItem $filesDir -Directory | Sort-Object { [int]$_.Name }
    Write-Host "  Total levels: $($levels.Count)" -ForegroundColor Gray
    Write-Host ""
    
    $totalJpeg = 0
    $totalPng = 0
    $totalSize = 0
    
    Write-Host "Level analysis:" -ForegroundColor Yellow
    foreach ($level in $levels) {
        $jpegFiles = Get-ChildItem "$($level.FullName)\*.jpg" -ErrorAction SilentlyContinue
        $pngFiles = Get-ChildItem "$($level.FullName)\*.png" -ErrorAction SilentlyContinue
        
        $levelJpeg = if ($jpegFiles) { $jpegFiles.Count } else { 0 }
        $levelPng = if ($pngFiles) { $pngFiles.Count } else { 0 }
        $levelTotal = $levelJpeg + $levelPng
        
        $format = if ($levelPng -gt 0) { "PNG" } elseif ($levelJpeg -gt 0) { "JPEG" } else { "NONE" }
        
        Write-Host "  Level $($level.Name): $levelTotal tiles ($format)" -ForegroundColor Gray
        
        $totalJpeg += $levelJpeg
        $totalPng += $levelPng
        
        # Calculate size
        if ($jpegFiles) { $jpegFiles | ForEach-Object { $totalSize += $_.Length } }
        if ($pngFiles) { $pngFiles | ForEach-Object { $totalSize += $_.Length } }
    }
    
    Write-Host ""
    Write-Host "Summary:" -ForegroundColor Yellow
    Write-Host "  JPEG tiles: $totalJpeg" -ForegroundColor Gray
    Write-Host "  PNG tiles: $totalPng" -ForegroundColor Gray
    Write-Host "  Total tiles: $($totalJpeg + $totalPng)" -ForegroundColor Gray
    Write-Host "  Total size: $([Math]::Round($totalSize / 1MB, 2)) MB" -ForegroundColor Gray
    
    # Check hybrid info
    Write-Host ""
    $hybridInfo = "$tilesPath\hybrid-info.json"
    if (Test-Path $hybridInfo) {
        Write-Host "✓ Hybrid configuration found" -ForegroundColor Green
        $info = Get-Content $hybridInfo | ConvertFrom-Json
        Write-Host "  JPEG levels: 0-$($info.jpegLevels - 1)" -ForegroundColor Gray
        Write-Host "  PNG levels: $($info.pngStartLevel)-$($info.totalLevels - 1)" -ForegroundColor Gray
    } else {
        Write-Host "⚠ No hybrid configuration (standard tiles)" -ForegroundColor Yellow
    }
    
    # Check preview
    Write-Host ""
    if (Test-Path "$tilesPath\preview.jpg") {
        Write-Host "✓ Preview image found" -ForegroundColor Green
    } else {
        Write-Host "⚠ No preview image" -ForegroundColor Yellow
    }
    
    # Final verdict
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    if ($totalJpeg -gt 0 -and $totalPng -gt 0) {
        Write-Host " ✅ HYBRID TILES VERIFIED!" -ForegroundColor Green
        Write-Host " Ready for optimal viewing" -ForegroundColor Green
    } elseif ($totalJpeg -gt 0) {
        Write-Host " ✅ JPEG TILES VERIFIED!" -ForegroundColor Green
        Write-Host " Good quality, fast loading" -ForegroundColor Green
    } elseif ($totalPng -gt 0) {
        Write-Host " ✅ PNG TILES VERIFIED!" -ForegroundColor Green
        Write-Host " Maximum quality" -ForegroundColor Green
    } else {
        Write-Host " ❌ NO TILES FOUND!" -ForegroundColor Red
    }
    Write-Host "======================================" -ForegroundColor Cyan
    
} else {
    Write-Host "✗ Tiles directory not found" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close"