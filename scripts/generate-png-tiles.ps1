# PNG-only tile generation for maximum text clarity
# Optimized for hand-drawn diary with perfect text readability

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " PNG TILE GENERATION" -ForegroundColor Cyan
Write-Host " Maximum quality for text clarity" -ForegroundColor Cyan
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

# Generate PNG tiles
Write-Host ""
Write-Host "Generating PNG tiles..." -ForegroundColor Yellow
Write-Host "  - Tile size: 256px" -ForegroundColor Gray
Write-Host "  - Overlap: 1px" -ForegroundColor Gray
Write-Host "  - Compression: Level 6" -ForegroundColor Gray
Write-Host "  - Format: Lossless PNG" -ForegroundColor Gray
Write-Host ""

# Use VIPS with correct parameters
& $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
    --tile-size 256 `
    --overlap 1 `
    --suffix ".png[compression=6]" `
    --vips-progress

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ PNG tiles generated successfully!" -ForegroundColor Green
    
    # Fix the DZI file to correctly indicate PNG format
    $dziPath = "$outputBase.dzi"
    if (Test-Path $dziPath) {
        $dziContent = Get-Content $dziPath -Raw
        $dziContent = $dziContent -replace 'Format="jpg"', 'Format="png"'
        $dziContent = $dziContent -replace 'Format="jpeg"', 'Format="png"'
        Set-Content -Path $dziPath -Value $dziContent -NoNewline
        Write-Host "✓ Updated DZI format to PNG" -ForegroundColor Green
    }
    
    # Generate preview
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
            $tiles = Get-ChildItem $level.FullName -Filter "*.png"
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
    Write-Host " ✨ PNG TILES COMPLETE! ✨" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
    Write-Host ""
    Write-Host "Benefits:" -ForegroundColor Green
    Write-Host "  ✓ Perfect text clarity at ALL zoom levels" -ForegroundColor White
    Write-Host "  ✓ No compression artifacts" -ForegroundColor White
    Write-Host "  ✓ Pixel-perfect rendering" -ForegroundColor White
    Write-Host "  ✓ Ideal for hand-drawn text" -ForegroundColor White
    
} else {
    Write-Host ""
    Write-Host "✗ Tile generation failed!" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close"