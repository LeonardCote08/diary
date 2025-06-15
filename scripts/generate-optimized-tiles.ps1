# Optimized tile generation for smooth zoom performance
# Uses 256x256 tiles with high-quality JPEG for better performance

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " OPTIMIZED TILE GENERATION" -ForegroundColor Cyan
Write-Host " 256x256 tiles for smooth zoom" -ForegroundColor Cyan
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
$outputDir = "public\images\tiles\zebra"
$outputBase = "$outputDir\zebra"

# Optimized tile parameters
$tileSize = 256  # Standard size for better performance
$overlap = 2     # Minimal overlap

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

# High-quality JPEG generation
Write-Host ""
Write-Host "Generating optimized JPEG tiles..." -ForegroundColor Yellow
Write-Host "  - Tile size: ${tileSize}px" -ForegroundColor Gray
Write-Host "  - Overlap: ${overlap}px" -ForegroundColor Gray
Write-Host "  - Quality: 95% with optimized encoding" -ForegroundColor Gray
Write-Host ""

# Generate tiles with optimized settings
& $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
    --tile-size $tileSize `
    --overlap $overlap `
    --suffix ".jpg[Q=95,optimize_coding=true,strip=true]" `
    --depth onepixel `
    --vips-progress

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Tiles generated successfully!" -ForegroundColor Green
    
    # Generate high-quality preview
    Write-Host ""
    Write-Host "Generating preview..." -ForegroundColor Yellow
    $previewPath = "$outputDir\preview.jpg"
    
    & $vipsPath thumbnail `"$inputFile`" `"$previewPath`" 2048 `
        --size down
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Preview generated!" -ForegroundColor Green
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
        
        Write-Host "  Image dimensions: ${imageWidth}x${imageHeight}" -ForegroundColor Gray
        Write-Host "  Tile size: $tileSize with ${overlap}px overlap" -ForegroundColor Gray
        Write-Host "  Total levels: $totalLevels" -ForegroundColor Gray
        
        $totalSize = 0
        $totalFiles = 0
        
        # Level details
        Write-Host ""
        Write-Host "Level details:" -ForegroundColor Cyan
        foreach ($level in $levels) {
            $tiles = Get-ChildItem $level.FullName -Filter "*.jpg"
            $levelSize = ($tiles | Measure-Object -Property Length -Sum).Sum
            $totalSize += $levelSize
            $totalFiles += $tiles.Count
            
            $levelSizeMB = [Math]::Round($levelSize / 1MB, 2)
            Write-Host "  Level $($level.Name): $($tiles.Count) tiles ($levelSizeMB MB)" -ForegroundColor Gray
        }
        
        $totalSizeMB = [Math]::Round($totalSize / 1MB, 2)
        
        Write-Host ""
        Write-Host "Summary:" -ForegroundColor Green
        Write-Host "  Total tiles: $totalFiles" -ForegroundColor White
        Write-Host "  Total size: $totalSizeMB MB" -ForegroundColor White
        
        # Performance estimate
        $avgTileSize = $totalSize / $totalFiles / 1024
        Write-Host ""
        Write-Host "Performance characteristics:" -ForegroundColor Cyan
        Write-Host "  Average tile size: $([Math]::Round($avgTileSize, 1)) KB" -ForegroundColor White
        Write-Host "  Estimated load time (10 Mbps): ~$([Math]::Round($totalSize / (10 * 1024 * 1024 / 8), 1)) seconds" -ForegroundColor White
        Write-Host "  Tiles per request: 4x more than 512px tiles" -ForegroundColor White
    }
    
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host " ✨ OPTIMIZED TILES COMPLETE! ✨" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
    Write-Host ""
    Write-Host "Optimizations applied:" -ForegroundColor Green
    Write-Host "  ✓ 256x256 tiles (better zoom performance)" -ForegroundColor White
    Write-Host "  ✓ JPEG 95% quality (smaller files)" -ForegroundColor White
    Write-Host "  ✓ Optimized encoding (better compression)" -ForegroundColor White
    Write-Host "  ✓ Metadata stripped (smaller files)" -ForegroundColor White
    
} else {
    Write-Host ""
    Write-Host "✗ Tile generation failed!" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close"