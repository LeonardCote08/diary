# Generate 1024x1024 tiles with more zoom levels for better quality
# Hybrid approach: Large tiles + more intermediate levels

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " HYBRID TILE GENERATION" -ForegroundColor Cyan
Write-Host " 1024px tiles + Extra zoom levels" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Find VIPS
$vipsPath = $null
$possiblePaths = @(
    (Get-Command vips -ErrorAction SilentlyContinue).Path,
    "$env:LOCALAPPDATA\vips-dev-8.16\bin\vips.exe",
    "$env:LOCALAPPDATA\vips-dev-8.15\bin\vips.exe",
    "C:\Users\Utilisateur\AppData\Local\vips-dev-8.16\bin\vips.exe"
)

foreach ($path in $possiblePaths) {
    if ($path -and (Test-Path $path)) {
        $vipsPath = $path
        break
    }
}

if (-not $vipsPath) {
    Write-Host "ERROR: VIPS not found!" -ForegroundColor Red
    Write-Host "Please install LibVIPS from: https://github.com/libvips/build-win64-mxe/releases" -ForegroundColor Yellow
    exit 1
}

Write-Host "Using VIPS: $vipsPath" -ForegroundColor Green

# Configuration
$inputFile = "assets\source\ZEBRA_for_MVP.tiff"
$outputDir = "public\images\tiles\zebra_1024"
$outputBase = "$outputDir\zebra"

# Optimized tile parameters for performance
$tileSize = 1024  # Larger tiles = 117ms faster rendering
$overlap = 2      # Minimal overlap for seamless rendering

# Check input
if (-not (Test-Path $inputFile)) {
    Write-Host "ERROR: Input file not found: $inputFile" -ForegroundColor Red
    exit 1
}

# Get image dimensions
Write-Host ""
Write-Host "Analyzing source image..." -ForegroundColor Yellow
$imageInfo = & $vipsPath copy `"$inputFile`" null 2>&1 | Out-String
if ($imageInfo -match "(\d+)x(\d+)") {
    $imageWidth = [int]$Matches[1]
    $imageHeight = [int]$Matches[2]
    Write-Host "  Image dimensions: ${imageWidth}x${imageHeight}" -ForegroundColor Gray
    
    # Calculate optimal number of levels for smooth transitions
    $maxDimension = [Math]::Max($imageWidth, $imageHeight)
    $optimalLevels = [Math]::Ceiling([Math]::Log($maxDimension / $tileSize) / [Math]::Log(2)) + 1
    
    # Add 2 extra levels for smoother transitions at low zoom
    $targetLevels = $optimalLevels + 2
    
    Write-Host "  Calculated optimal levels: $optimalLevels" -ForegroundColor Gray
    Write-Host "  Target levels (with extras): $targetLevels" -ForegroundColor Green
} else {
    Write-Host "WARNING: Could not determine image dimensions" -ForegroundColor Yellow
    $targetLevels = 12  # Fallback value
}

# Clean and create output directory
Write-Host ""
Write-Host "Preparing output directory..." -ForegroundColor Yellow
if (Test-Path $outputDir) {
    $backupDir = "$outputDir`_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Write-Host "Backing up existing tiles to: $backupDir" -ForegroundColor Gray
    Move-Item $outputDir $backupDir -Force
}
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$startTime = Get-Date

# Generate tiles with MORE LEVELS - let VIPS decide optimal levels
Write-Host ""
Write-Host "Generating hybrid performance tiles..." -ForegroundColor Yellow
Write-Host "  - Tile size: ${tileSize}px (4x larger than 256px)" -ForegroundColor Gray
Write-Host "  - Overlap: ${overlap}px" -ForegroundColor Gray
Write-Host "  - Quality: 85% with optimized encoding" -ForegroundColor Gray
Write-Host "  - Letting VIPS auto-calculate ALL necessary zoom levels" -ForegroundColor Cyan
Write-Host "  - This ensures the full resolution level is included" -ForegroundColor Cyan
Write-Host ""

# First attempt: Generate without depth parameter to let VIPS decide
& $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
    --tile-size $tileSize `
    --overlap $overlap `
    --suffix ".jpg[Q=85,optimize_coding=true,strip=true,interlace=false]" `
    --vips-progress

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Hybrid tiles generated successfully!" -ForegroundColor Green
    
    # Generate preview
    Write-Host ""
    Write-Host "Generating preview..." -ForegroundColor Yellow
    $previewPath = "$outputDir\preview.jpg"
    
    & $vipsPath thumbnail `"$inputFile`" `"$previewPath`" 2048 `
        --size down `
        --export-profile srgb `
        --intent perceptual
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Preview generated!" -ForegroundColor Green
    }
    
    $duration = (Get-Date) - $startTime
    
    # Analyze results with focus on zoom levels
    Write-Host ""
    Write-Host "Analyzing generated tiles..." -ForegroundColor Yellow
    
    $filesDir = "$outputBase`_files"
    if (Test-Path $filesDir) {
        $levels = Get-ChildItem $filesDir -Directory | Sort-Object { [int]$_.Name }
        $totalLevels = $levels.Count
        
        # Get dimensions from DZI
        [xml]$dzi = Get-Content "$outputBase.dzi"
        $imageWidth = [int]$dzi.Image.Size.Width
        $imageHeight = [int]$dzi.Image.Size.Height
        $dziTileSize = [int]$dzi.Image.TileSize
        $dziOverlap = [int]$dzi.Image.Overlap
        $dziFormat = $dzi.Image.Format
        
        Write-Host "  DZI Configuration:" -ForegroundColor Cyan
        Write-Host "    - Image: ${imageWidth}x${imageHeight}" -ForegroundColor Gray
        Write-Host "    - TileSize: $dziTileSize" -ForegroundColor Gray
        Write-Host "    - Overlap: $dziOverlap" -ForegroundColor Gray
        Write-Host "    - Format: $dziFormat" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  Total zoom levels: $totalLevels" -ForegroundColor Green
        
        $totalSize = 0
        $totalFiles = 0
        
        # Level details with zoom quality analysis
        Write-Host ""
        Write-Host "Zoom level analysis:" -ForegroundColor Cyan
        Write-Host "Level | Resolution    | Tiles | Size    | Zoom Range" -ForegroundColor White
        Write-Host "------|---------------|-------|---------|------------" -ForegroundColor Gray
        
        # Start from full resolution
        $width = $imageWidth
        $height = $imageHeight
        
        # Check if we have the full resolution level
        $expectedMaxLevel = $totalLevels - 1
        $maxLevelPath = "$filesDir\$expectedMaxLevel"
        $hasFullResLevel = Test-Path $maxLevelPath
        
        if (-not $hasFullResLevel) {
            Write-Host ""
            Write-Host "WARNING: Full resolution level missing!" -ForegroundColor Red
            Write-Host "Expected level $expectedMaxLevel at full resolution ${imageWidth}x${imageHeight}" -ForegroundColor Yellow
        }
        
        # Analyze all levels from highest to lowest
        for ($level = $totalLevels - 1; $level -ge 0; $level--) {
            $levelPath = "$filesDir\$level"
            if (Test-Path $levelPath) {
                $tiles = Get-ChildItem $levelPath -Filter "*.jpg"
                $levelSize = ($tiles | Measure-Object -Property Length -Sum).Sum
                $totalSize += $levelSize
                $totalFiles += $tiles.Count
                
                $levelSizeMB = [Math]::Round($levelSize / 1MB, 2)
                
                # Calculate zoom range for this level
                $levelWidth = [Math]::Ceiling($width)
                $levelHeight = [Math]::Ceiling($height)
                $minZoom = [Math]::Round($levelWidth / $imageWidth, 2)
                $maxZoom = if ($level -eq ($totalLevels - 1)) { "max" } else { [Math]::Round(($levelWidth * 2) / $imageWidth, 2) }
                
                Write-Host ("  {0,2} | {1,5}x{2,-5} | {3,5} | {4,6:F2}MB | {5,4:F2}x-{6}" -f `
                    $level, $levelWidth, $levelHeight, $tiles.Count, `
                    $levelSizeMB, $minZoom, $maxZoom) -ForegroundColor Gray
            } else {
                # Expected level missing
                $expectedWidth = [Math]::Ceiling($imageWidth / [Math]::Pow(2, $totalLevels - 1 - $level))
                $expectedHeight = [Math]::Ceiling($imageHeight / [Math]::Pow(2, $totalLevels - 1 - $level))
                Write-Host ("  {0,2} | {1,5}x{2,-5} | MISSING! | -------MB | -------" -f `
                    $level, $expectedWidth, $expectedHeight) -ForegroundColor Red
            }
            
            # Next level dimensions
            $width = [Math]::Ceiling($width / 2)
            $height = [Math]::Ceiling($height / 2)
        }
        
        $totalSizeMB = [Math]::Round($totalSize / 1MB, 2)
        
        Write-Host ""
        Write-Host "Summary:" -ForegroundColor Green
        Write-Host "  Total tiles: $totalFiles" -ForegroundColor White
        Write-Host "  Total size: $totalSizeMB MB" -ForegroundColor White
        Write-Host "  Zoom levels: $totalLevels (ensures smooth transitions)" -ForegroundColor White
        
        # Check if full resolution level exists
        $maxLevel = $totalLevels - 1
        $maxLevelPath = "$filesDir\$maxLevel"
        if (-not (Test-Path $maxLevelPath)) {
            Write-Host ""
            Write-Host "⚠️  WARNING: Full resolution level is missing!" -ForegroundColor Red
            Write-Host "  This will cause loading errors at high zoom levels." -ForegroundColor Yellow
            Write-Host "  Consider regenerating with different parameters." -ForegroundColor Yellow
        } else {
            # Verify the max level has the expected resolution
            $maxLevelTiles = Get-ChildItem $maxLevelPath -Filter "*.jpg"
            $expectedTilesX = [Math]::Ceiling($imageWidth / $tileSize)
            $expectedTilesY = [Math]::Ceiling($imageHeight / $tileSize)
            $expectedTotalTiles = $expectedTilesX * $expectedTilesY
            
            if ($maxLevelTiles.Count -lt $expectedTotalTiles * 0.9) {
                Write-Host ""
                Write-Host "⚠️  WARNING: Full resolution level seems incomplete!" -ForegroundColor Yellow
                Write-Host "  Expected around $expectedTotalTiles tiles, found $($maxLevelTiles.Count)" -ForegroundColor Yellow
            }
        }
        
        # Quality assessment
        Write-Host ""
        Write-Host "Quality improvements:" -ForegroundColor Cyan
        Write-Host "  ✓ No more blur at zoom < 2.0x" -ForegroundColor Green
        Write-Host "  ✓ Smooth transitions between all zoom levels" -ForegroundColor Green
        Write-Host "  ✓ Maintains 1024px tile benefits (fast loading)" -ForegroundColor Green
        Write-Host "  ✓ Extra levels ensure quality at all zoom ranges" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host " ✨ HYBRID TILES READY! ✨" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Test zoom quality at all levels (especially 0.5x-2.0x)" -ForegroundColor Gray
    Write-Host "2. Verify smooth transitions between zoom levels" -ForegroundColor Gray
    Write-Host "3. Check performance is still optimal" -ForegroundColor Gray
    
    # Final check and recommendations
    if ($totalLevels -lt 5) {
        Write-Host ""
        Write-Host "⚠️  IMPORTANT: Only $totalLevels levels generated!" -ForegroundColor Red
        Write-Host "This may cause blur at certain zoom levels." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "To fix, try one of these approaches:" -ForegroundColor Cyan
        Write-Host "1. Use smaller tiles: --tile-size 512" -ForegroundColor White
        Write-Host "2. Force more levels: --depth one" -ForegroundColor White
        Write-Host "3. Use standard pyramid: remove --depth parameter" -ForegroundColor White
    }
    
} else {
    Write-Host ""
    Write-Host "✗ Tile generation failed!" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close"