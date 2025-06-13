# Ultra-high quality JPEG tile generation
# Maximum JPEG quality with optimized settings for text readability

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " ULTRA-QUALITY JPEG TILES" -ForegroundColor Cyan
Write-Host " Maximum JPEG quality for text" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Find VIPS
$vipsPath = $null
$possiblePaths = @(
    (Get-Command vips -ErrorAction SilentlyContinue).Path,
    "$env:LOCALAPPDATA\vips-dev-8.16\bin\vips.exe",
    "$env:LOCALAPPDATA\vips-dev-8.15\bin\vips.exe"
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

# Check input
if (-not (Test-Path $inputFile)) {
    Write-Host "ERROR: Input file not found: $inputFile" -ForegroundColor Red
    exit 1
}

# Clean and create output directory
Write-Host ""
Write-Host "Preparing output directory..." -ForegroundColor Yellow
if (Test-Path $outputDir) {
    Remove-Item -Path $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$startTime = Get-Date

# Generate ultra-high quality JPEG tiles
Write-Host ""
Write-Host "Generating ultra-quality JPEG tiles..." -ForegroundColor Yellow
Write-Host "  - Tile size: 256px" -ForegroundColor Gray
Write-Host "  - Quality: 100% (maximum)" -ForegroundColor Gray
Write-Host "  - Overlap: 1px" -ForegroundColor Gray
Write-Host "  - Chroma subsampling: disabled (4:4:4)" -ForegroundColor Gray
Write-Host "  - Optimization: Huffman coding" -ForegroundColor Gray
Write-Host ""

# Use VIPS with maximum quality settings (only supported options)
& $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
    --tile-size 256 `
    --overlap 1 `
    --suffix ".jpg[Q=100,optimize_coding,strip,subsample_mode=off]" `
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
    
    # Analyze generated tiles
    Write-Host ""
    Write-Host "Analyzing generated tiles..." -ForegroundColor Yellow
    
    $dziPath = "$outputBase.dzi"
    $filesDir = "$outputBase`_files"
    
    if (Test-Path $filesDir) {
        $levels = Get-ChildItem $filesDir -Directory | Sort-Object { [int]$_.Name }
        $totalLevels = $levels.Count
        $maxLevel = ($levels | ForEach-Object { [int]$_.Name } | Measure-Object -Maximum).Maximum
        
        # Get dimensions from DZI
        [xml]$dzi = Get-Content $dziPath
        $imageWidth = [int]$dzi.Image.Size.Width
        $imageHeight = [int]$dzi.Image.Size.Height
        $tileSize = [int]$dzi.Image.TileSize
        
        Write-Host "  Image dimensions: ${imageWidth}x${imageHeight}" -ForegroundColor Gray
        Write-Host "  Total levels: $totalLevels (0 to $maxLevel)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  Tiles per level:" -ForegroundColor Gray
        
        $totalSize = 0
        $totalFiles = 0
        
        foreach ($level in $levels) {
            $tiles = Get-ChildItem $level.FullName -Filter "*.jpg"
            $levelSize = ($tiles | Measure-Object -Property Length -Sum).Sum
            $totalSize += $levelSize
            $totalFiles += $tiles.Count
            
            $levelSizeMB = [Math]::Round($levelSize / 1MB, 2)
            Write-Host "    Level $($level.Name): $($tiles.Count) tiles ($levelSizeMB MB)" -ForegroundColor Gray
        }
        
        $totalSizeMB = [Math]::Round($totalSize / 1MB, 2)
        
        Write-Host ""
        Write-Host "  Total tiles: $totalFiles" -ForegroundColor Green
        Write-Host "  Total size: $totalSizeMB MB" -ForegroundColor Green
        
        Write-Host ""
        Write-Host "  DZI verification:" -ForegroundColor Gray
        Write-Host "    Image: ${imageWidth}x${imageHeight}" -ForegroundColor Gray
        Write-Host "    Tile size: $tileSize" -ForegroundColor Gray
        Write-Host "    Format: $($dzi.Image.Format)" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host " ✨ ULTRA-QUALITY TILES COMPLETE! ✨" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
    Write-Host ""
    Write-Host "Benefits:" -ForegroundColor Green
    Write-Host "  ✓ Maximum JPEG quality (100%)" -ForegroundColor White
    Write-Host "  ✓ No chroma subsampling (4:4:4)" -ForegroundColor White
    Write-Host "  ✓ Optimized Huffman coding" -ForegroundColor White
    Write-Host "  ✓ Best possible JPEG for text" -ForegroundColor White
    Write-Host "  ✓ Faster loading than PNG" -ForegroundColor White
    
} else {
    Write-Host ""
    Write-Host "✗ Tile generation failed!" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
    
    # Show warnings if any (they don't prevent generation)
    Write-Host ""
    Write-Host "Note: Warnings about unknown TIFF tags can be ignored - tiles are still generated correctly" -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Press Enter to close"