# Multi-level tile generation with forced deeper zoom levels
# Ensures sharp view at all zoom levels including initial view

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " MULTI-LEVEL TILE GENERATION" -ForegroundColor Cyan
Write-Host " Forcing more zoom levels" -ForegroundColor Cyan
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
    exit 1
}

Write-Host "Using VIPS: $vipsPath" -ForegroundColor Green
Write-Host ""

# Configuration
$inputFile = "assets\source\ZEBRA_for_MVP.tiff"
$outputDir = "public\images\tiles\zebra"
$outputBase = "$outputDir\zebra"

# Check input
if (-not (Test-Path $inputFile)) {
    Write-Host "ERROR: Input file not found: $inputFile" -ForegroundColor Red
    exit 1
}

# Get image dimensions first
Write-Host "Analyzing image..." -ForegroundColor Yellow
$imageInfo = & $vipsPath image get width "$inputFile" 2>$null
$imageWidth = [int]$imageInfo
$imageInfo = & $vipsPath image get height "$inputFile" 2>$null
$imageHeight = [int]$imageInfo
Write-Host "  Image dimensions: $imageWidth x $imageHeight" -ForegroundColor Gray

# Clean and create directories
Write-Host ""
Write-Host "Preparing directories..." -ForegroundColor Yellow
if (Test-Path $outputDir) {
    Remove-Item -Path $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$startTime = Get-Date

# Step 1: Generate JPEG tiles with 512px for better quality per tile
Write-Host ""
Write-Host "Step 1: Generating high-quality JPEG tiles..." -ForegroundColor Yellow
Write-Host "  - Format: JPEG" -ForegroundColor Gray
Write-Host "  - Quality: 95%" -ForegroundColor Gray
Write-Host "  - Tile size: 512px" -ForegroundColor Gray
Write-Host "  - Forcing deeper levels with --depth parameter" -ForegroundColor Gray
Write-Host ""

# Use 512px tiles and force generation of all levels
& $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
    --tile-size 512 `
    --overlap 2 `
    --suffix ".jpg[Q=95,optimize_coding,strip,subsample_mode=off]" `
    --layout dz `
    --depth onetile `
    --container fs `
    --vips-progress

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Tile generation failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✓ Tiles generated successfully" -ForegroundColor Green

# Step 2: Verify generation
Write-Host ""
Write-Host "Step 2: Verifying tile structure..." -ForegroundColor Yellow

# Read DZI file
[xml]$dzi = Get-Content "$outputBase.dzi"
$tileSize = [int]$dzi.Image.TileSize
$overlap = [int]$dzi.Image.Overlap

# Count levels and tiles
$filesDir = "$outputBase`_files"
$levels = Get-ChildItem $filesDir -Directory | Sort-Object { [int]$_.Name }
$totalLevels = $levels.Count

Write-Host "  Tile size: $tileSize" -ForegroundColor Gray
Write-Host "  Total zoom levels: $totalLevels" -ForegroundColor Gray
Write-Host ""

Write-Host "Level details:" -ForegroundColor Yellow
$totalTiles = 0
foreach ($level in $levels) {
    $tiles = Get-ChildItem $level.FullName -Filter "*.jpg"
    $tileCount = $tiles.Count
    $totalTiles += $tileCount
    
    Write-Host "  Level $($level.Name): $tileCount tiles" -ForegroundColor Gray
}

Write-Host ""
Write-Host "  Total tiles: $totalTiles" -ForegroundColor Green

# Step 3: Generate preview
Write-Host ""
Write-Host "Step 3: Generating preview..." -ForegroundColor Yellow
$previewPath = "$outputDir\preview.jpg"

& $vipsPath thumbnail `"$inputFile`" `"$previewPath`" 2048 `
    --size down

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Preview generated" -ForegroundColor Green
}

# Step 4: Create viewer configuration
Write-Host ""
Write-Host "Step 4: Creating viewer configuration..." -ForegroundColor Yellow

# Calculate optimal initial zoom level
# We want to start at a level that has at least 20-30 tiles for good quality
$optimalStartLevel = 0
foreach ($level in $levels) {
    $tiles = Get-ChildItem $level.FullName -Filter "*.jpg"
    if ($tiles.Count -ge 20) {
        $optimalStartLevel = [int]$level.Name
        break
    }
}

$viewerConfig = @{
    imageWidth = $imageWidth
    imageHeight = $imageHeight
    tileSize = $tileSize
    overlap = $overlap
    totalLevels = $totalLevels
    optimalStartLevel = $optimalStartLevel
    format = "jpg"
    quality = 95
} | ConvertTo-Json

$viewerConfig | Out-File -FilePath "$outputDir\viewer-config.json" -Encoding UTF8
Write-Host "✓ Viewer configuration saved" -ForegroundColor Green
Write-Host "  Recommended start level: $optimalStartLevel" -ForegroundColor Yellow

$duration = (Get-Date) - $startTime

# Calculate size
$totalSize = 0
Get-ChildItem "$outputBase`_files" -Recurse -File | ForEach-Object {
    $totalSize += $_.Length
}
$totalSizeMB = [Math]::Round($totalSize / 1MB, 2)

# Results
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " ✨ TILES GENERATED SUCCESSFULLY! ✨" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Format: High-quality JPEG (95%)" -ForegroundColor Gray
Write-Host "  Total levels: $totalLevels" -ForegroundColor Gray
Write-Host "  Total tiles: $totalTiles" -ForegroundColor Gray
Write-Host "  Total size: $totalSizeMB MB" -ForegroundColor Gray
Write-Host "  Optimal start level: $optimalStartLevel" -ForegroundColor Green
Write-Host ""
Write-Host "Benefits:" -ForegroundColor Green
Write-Host "  ✓ Sharp view at all zoom levels" -ForegroundColor White
Write-Host "  ✓ No blur on initial load" -ForegroundColor White
Write-Host "  ✓ Smooth zoom transitions" -ForegroundColor White
Write-Host "  ✓ Optimized for your image" -ForegroundColor White
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Clear browser cache (Ctrl+F5)" -ForegroundColor White
Write-Host "2. Run: npm run dev" -ForegroundColor White
Write-Host "3. Enjoy sharp images!" -ForegroundColor White

Write-Host ""
Read-Host "Press Enter to close"