# Fixed hybrid tile generation: JPEG for overview, PNG for deep zoom
# Correctly generates ALL tiles at each level

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " FIXED HYBRID TILE GENERATION" -ForegroundColor Cyan
Write-Host " JPEG (overview) + PNG (detail)" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Find VIPS
$vipsPath = $null
$possiblePaths = @(
    (Get-Command vips -ErrorAction SilentlyContinue).Path,
    "$env:LOCALAPPDATA\vips-dev-8.16\bin\vips.exe",
    "$env:LOCALAPPDATA\vips-dev-8.15\bin\vips.exe",
    "C:\vips\bin\vips.exe"
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
$tempDir = "$outputDir\temp"

# Check input
if (-not (Test-Path $inputFile)) {
    Write-Host "ERROR: Input file not found: $inputFile" -ForegroundColor Red
    exit 1
}

# Clean and create directories
Write-Host "Preparing directories..." -ForegroundColor Yellow
if (Test-Path $outputDir) {
    Remove-Item -Path $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

$startTime = Get-Date

# Step 1: Generate complete JPEG tile pyramid
Write-Host "Step 1: Generating complete JPEG tile pyramid..." -ForegroundColor Yellow
Write-Host "  - Format: JPEG" -ForegroundColor Gray
Write-Host "  - Quality: 95%" -ForegroundColor Gray
Write-Host "  - Tile size: 512px" -ForegroundColor Gray
Write-Host "  - Full image decomposition" -ForegroundColor Gray
Write-Host ""

# First, let's check the image dimensions
Write-Host "Analyzing image..." -ForegroundColor Yellow
$imageInfo = & $vipsPath copy `"$inputFile`" 2>&1 | Out-String
Write-Host "Image info obtained" -ForegroundColor Gray

# Generate JPEG tiles with proper parameters
& $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
    --tile-size 512 `
    --overlap 2 `
    --suffix ".jpg[Q=95,optimize_coding,strip,subsample_mode=off]" `
    --layout dz `
    --depth onepixel `
    --vips-progress

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ JPEG generation failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✓ JPEG tiles generated" -ForegroundColor Green

# Step 2: Analyze what was generated
Write-Host ""
Write-Host "Step 2: Analyzing generated structure..." -ForegroundColor Yellow

# Read DZI file
[xml]$dzi = Get-Content "$outputBase.dzi"
$imageWidth = [int]$dzi.Image.Size.Width
$imageHeight = [int]$dzi.Image.Size.Height
$tileSize = [int]$dzi.Image.TileSize
$overlap = [int]$dzi.Image.Overlap

Write-Host "  Image dimensions: $imageWidth x $imageHeight" -ForegroundColor Gray
Write-Host "  Tile size: $tileSize" -ForegroundColor Gray
Write-Host "  Overlap: $overlap" -ForegroundColor Gray

# Count actual levels generated
$filesDir = "$outputBase`_files"
$levels = Get-ChildItem $filesDir -Directory | Sort-Object { [int]$_.Name }
$totalLevels = $levels.Count

Write-Host "  Total zoom levels: $totalLevels (0-$($totalLevels-1))" -ForegroundColor Gray

# Count tiles per level
$jpegTileCount = 0
foreach ($level in $levels) {
    $tiles = Get-ChildItem $level.FullName -Filter "*.jpg"
    $jpegTileCount += $tiles.Count
    Write-Host "    Level $($level.Name): $($tiles.Count) JPEG tiles" -ForegroundColor Gray
}

Write-Host "  Total JPEG tiles: $jpegTileCount" -ForegroundColor Green

# Step 3: Determine which levels need PNG
Write-Host ""
Write-Host "Step 3: Planning PNG replacement..." -ForegroundColor Yellow

# Calculate where text becomes readable (approximately last 30% of levels)
$pngStartLevel = [Math]::Floor($totalLevels * 0.7)
$pngLevels = $totalLevels - $pngStartLevel

Write-Host "  JPEG levels: 0-$($pngStartLevel-1) (overview to medium zoom)" -ForegroundColor Gray
Write-Host "  PNG levels: $pngStartLevel-$($totalLevels-1) (high zoom, text readable)" -ForegroundColor Gray
Write-Host "  PNG levels to generate: $pngLevels" -ForegroundColor Gray

# Step 4: Generate PNG tiles for high zoom levels
if ($pngLevels -gt 0) {
    Write-Host ""
    Write-Host "Step 4: Generating PNG tiles for detail levels..." -ForegroundColor Yellow
    
    # Generate complete PNG pyramid
    $tempBase = "$tempDir\zebra_png"
    
    & $vipsPath dzsave `"$inputFile`" `"$tempBase`" `
        --tile-size 512 `
        --overlap 2 `
        --suffix ".png[compression=9]" `
        --layout dz `
        --depth onepixel `
        --vips-progress
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ PNG tiles generated" -ForegroundColor Green
        
        # Replace JPEG tiles with PNG tiles for high zoom levels
        Write-Host ""
        Write-Host "Replacing detail levels with PNG..." -ForegroundColor Yellow
        
        $pngTileCount = 0
        for ($level = $pngStartLevel; $level -lt $totalLevels; $level++) {
            $sourcePath = "$tempBase`_files\$level"
            $destPath = "$outputBase`_files\$level"
            
            if (Test-Path $sourcePath) {
                # Count PNG tiles
                $pngTiles = Get-ChildItem "$sourcePath\*.png"
                $pngTileCount += $pngTiles.Count
                
                # Remove JPEG tiles
                Remove-Item "$destPath\*.jpg" -Force -ErrorAction SilentlyContinue
                
                # Copy PNG tiles
                Copy-Item "$sourcePath\*.png" -Destination $destPath -Force
                
                Write-Host "  Level $level`: Replaced with $($pngTiles.Count) PNG tiles" -ForegroundColor Gray
            }
        }
        
        Write-Host ""
        Write-Host "✓ Replaced $pngTileCount tiles with PNG format" -ForegroundColor Green
    } else {
        Write-Host "⚠ PNG generation failed, keeping JPEG only" -ForegroundColor Yellow
    }
}

# Step 5: Generate preview
Write-Host ""
Write-Host "Step 5: Generating preview..." -ForegroundColor Yellow
$previewPath = "$outputDir\preview.jpg"

& $vipsPath thumbnail `"$inputFile`" `"$previewPath`" 2048 `
    --size down

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Preview generated" -ForegroundColor Green
}

# Step 6: Create hybrid-aware DZI
Write-Host ""
Write-Host "Step 6: Creating hybrid DZI configuration..." -ForegroundColor Yellow

# Add custom metadata to help identify hybrid tiles
$hybridInfoPath = "$outputDir\hybrid-info.json"
$hybridInfo = @{
    totalLevels = $totalLevels
    jpegLevels = $pngStartLevel
    pngStartLevel = $pngStartLevel
    pngLevels = $pngLevels
    tileSize = $tileSize
    overlap = $overlap
    imageWidth = $imageWidth
    imageHeight = $imageHeight
} | ConvertTo-Json

$hybridInfo | Out-File -FilePath $hybridInfoPath -Encoding UTF8
Write-Host "✓ Hybrid info saved" -ForegroundColor Green

# Clean up temp directory
Write-Host ""
Write-Host "Cleaning up..." -ForegroundColor Yellow
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

$duration = (Get-Date) - $startTime

# Calculate final sizes
$jpegSize = 0
$pngSize = 0
$finalJpegCount = 0
$finalPngCount = 0

Get-ChildItem "$outputBase`_files" -Recurse -File | ForEach-Object {
    if ($_.Extension -eq ".jpg") {
        $jpegSize += $_.Length
        $finalJpegCount++
    } elseif ($_.Extension -eq ".png") {
        $pngSize += $_.Length
        $finalPngCount++
    }
}

$totalSize = $jpegSize + $pngSize
$jpegSizeMB = [Math]::Round($jpegSize / 1MB, 2)
$pngSizeMB = [Math]::Round($pngSize / 1MB, 2)
$totalSizeMB = [Math]::Round($totalSize / 1MB, 2)

# Show results
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " ✨ HYBRID TILES COMPLETE! ✨" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
Write-Host ""
Write-Host "Tile statistics:" -ForegroundColor Yellow
Write-Host "  JPEG tiles: $finalJpegCount ($jpegSizeMB MB) - Levels 0-$($pngStartLevel-1)" -ForegroundColor Gray
Write-Host "  PNG tiles: $finalPngCount ($pngSizeMB MB) - Levels $pngStartLevel-$($totalLevels-1)" -ForegroundColor Gray
Write-Host "  Total size: $totalSizeMB MB" -ForegroundColor Gray
Write-Host ""
Write-Host "Benefits:" -ForegroundColor Green
Write-Host "  ✓ Sharp overview (JPEG 95%)" -ForegroundColor White
Write-Host "  ✓ Pixel-perfect text (PNG lossless)" -ForegroundColor White
Write-Host "  ✓ Optimal file size (~$totalSizeMB MB)" -ForegroundColor White
Write-Host "  ✓ Fast loading and smooth zoom" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Clear browser cache (Ctrl+F5)" -ForegroundColor White
Write-Host "2. Run: npm run dev" -ForegroundColor White
Write-Host "3. Verify quality at all zoom levels" -ForegroundColor White

Write-Host ""
Read-Host "Press Enter to close"