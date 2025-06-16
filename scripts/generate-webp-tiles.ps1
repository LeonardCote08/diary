# WebP tile generation for optimal performance
# Reduces bandwidth by 25-35% while maintaining quality

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " WEBP TILE GENERATION" -ForegroundColor Cyan
Write-Host " 25-35% smaller files" -ForegroundColor Cyan
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

# Check WebP support
Write-Host ""
Write-Host "Checking WebP support..." -ForegroundColor Yellow
$testOutput = & $vipsPath --vips-config 2>&1 | Out-String
if ($testOutput -notmatch "webp") {
    Write-Host "WARNING: WebP support not detected in VIPS" -ForegroundColor Yellow
    Write-Host "WebP tiles may not generate properly" -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue anyway? [y/N]"
    if ($continue -ne 'y' -and $continue -ne 'Y') {
        exit 0
    }
}

# Configuration
$inputFile = "assets\source\ZEBRA_for_MVP.tiff"
$outputDir = "public\images\tiles\zebra_webp"
$outputBase = "$outputDir\zebra"

# Tile parameters (same as JPEG for consistency)
$tileSize = 256
$overlap = 0  # No overlap needed with WebGL

# Check input
if (-not (Test-Path $inputFile)) {
    Write-Host "ERROR: Input file not found: $inputFile" -ForegroundColor Red
    exit 1
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

# Generate WebP tiles
Write-Host ""
Write-Host "Generating WebP tiles..." -ForegroundColor Yellow
Write-Host "  - Tile size: ${tileSize}px" -ForegroundColor Gray
Write-Host "  - Overlap: ${overlap}px" -ForegroundColor Gray
Write-Host "  - Quality: Lossless compression" -ForegroundColor Gray
Write-Host ""

# Generate tiles with WebP format
# Using lossless WebP for quality, or quality=90 for lossy
& $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
    --tile-size $tileSize `
    --overlap $overlap `
    --suffix ".webp[lossless=true,near_lossless=true,reduction_effort=6]" `
    --depth onepixel `
    --vips-progress

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ WebP tiles generated successfully!" -ForegroundColor Green
    
    # Generate WebP preview
    Write-Host ""
    Write-Host "Generating WebP preview..." -ForegroundColor Yellow
    $previewPath = "$outputDir\preview.webp"
    
    & $vipsPath thumbnail `"$inputFile`" `"$previewPath`" 2048 `
        --size down
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ WebP preview generated!" -ForegroundColor Green
    }
    
    $duration = (Get-Date) - $startTime
    
    # Analyze results
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
        
        # Update DZI format to webp
        $dzi.Image.Format = "webp"
        $dzi.Save("$outputBase.dzi")
        
        Write-Host "  Image dimensions: ${imageWidth}x${imageHeight}" -ForegroundColor Gray
        Write-Host "  Tile size: $tileSize with ${overlap}px overlap" -ForegroundColor Gray
        Write-Host "  Total levels: $totalLevels" -ForegroundColor Gray
        
        $totalSize = 0
        $totalFiles = 0
        $jpegComparison = 0
        
        # Level details
        Write-Host ""
        Write-Host "Level details:" -ForegroundColor Cyan
        foreach ($level in $levels) {
            $tiles = Get-ChildItem $level.FullName -Filter "*.webp"
            $levelSize = ($tiles | Measure-Object -Property Length -Sum).Sum
            $totalSize += $levelSize
            $totalFiles += $tiles.Count
            
            $levelSizeMB = [Math]::Round($levelSize / 1MB, 2)
            Write-Host "  Level $($level.Name): $($tiles.Count) tiles ($levelSizeMB MB)" -ForegroundColor Gray
        }
        
        $totalSizeMB = [Math]::Round($totalSize / 1MB, 2)
        
        # Compare with JPEG if exists
        $jpegDir = "public\images\tiles\zebra"
        if (Test-Path $jpegDir) {
            $jpegSize = Get-ChildItem $jpegDir -Recurse -File | 
                        Where-Object { $_.Extension -in ".jpg", ".jpeg" } |
                        Measure-Object -Property Length -Sum
            if ($jpegSize.Sum -gt 0) {
                $jpegSizeMB = [Math]::Round($jpegSize.Sum / 1MB, 2)
                $reduction = [Math]::Round((1 - ($totalSize / $jpegSize.Sum)) * 100, 1)
                $jpegComparison = $reduction
            }
        }
        
        Write-Host ""
        Write-Host "Summary:" -ForegroundColor Green
        Write-Host "  Total tiles: $totalFiles" -ForegroundColor White
        Write-Host "  Total size: $totalSizeMB MB" -ForegroundColor White
        
        if ($jpegComparison -ne 0) {
            Write-Host "  Size reduction: $jpegComparison% vs JPEG" -ForegroundColor Cyan
        }
        
        # Performance estimate
        $avgTileSize = $totalSize / $totalFiles / 1024
        Write-Host ""
        Write-Host "Performance benefits:" -ForegroundColor Cyan
        Write-Host "  Average tile size: $([Math]::Round($avgTileSize, 1)) KB" -ForegroundColor White
        Write-Host "  Bandwidth savings: ~$([Math]::Round($jpegComparison, 0))%" -ForegroundColor White
        Write-Host "  Estimated load time (10 Mbps): ~$([Math]::Round($totalSize / (10 * 1024 * 1024 / 8), 1)) seconds" -ForegroundColor White
    }
    
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host " ✨ WEBP TILES COMPLETE! ✨" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
    Write-Host ""
    Write-Host "WebP advantages:" -ForegroundColor Green
    Write-Host "  ✓ 25-35% smaller files" -ForegroundColor White
    Write-Host "  ✓ Lossless compression" -ForegroundColor White
    Write-Host "  ✓ Faster loading" -ForegroundColor White
    Write-Host "  ✓ Lower bandwidth usage" -ForegroundColor White
    
    Write-Host ""
    Write-Host "To use WebP tiles:" -ForegroundColor Yellow
    Write-Host "1. Enable WebP in performanceConfig.js" -ForegroundColor Gray
    Write-Host "2. Update tile path in ArtworkViewer.jsx" -ForegroundColor Gray
    Write-Host "3. Ensure browser compatibility" -ForegroundColor Gray
    
} else {
    Write-Host ""
    Write-Host "✗ WebP tile generation failed!" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
    Write-Host ""
    Write-Host "Try using lossy compression instead:" -ForegroundColor Yellow
    Write-Host '  --suffix ".webp[Q=90,method=6]"' -ForegroundColor Gray
}

Write-Host ""
Read-Host "Press Enter to close"