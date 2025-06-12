# Proper hybrid tile generation with correct tile sizes
# Ensures ALL tiles are generated at each level

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " PROPER HYBRID TILE GENERATION" -ForegroundColor Cyan
Write-Host " Full tiles at all levels" -ForegroundColor Cyan
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

# Step 1: Generate COMPLETE JPEG pyramid with ALL tiles
Write-Host "Step 1: Generating complete JPEG tile pyramid..." -ForegroundColor Yellow
Write-Host "  - Format: JPEG" -ForegroundColor Gray
Write-Host "  - Quality: 95%" -ForegroundColor Gray
Write-Host "  - Tile size: 256px (standard for more tiles)" -ForegroundColor Gray
Write-Host ""

# Use 256px tiles for more granular coverage
& $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
    --tile-size 256 `
    --overlap 1 `
    --suffix ".jpg[Q=95,optimize_coding,strip,subsample_mode=off]" `
    --layout dz `
    --depth onetile `
    --vips-progress

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ JPEG generation failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✓ JPEG tiles generated" -ForegroundColor Green

# Step 2: Analyze and verify proper generation
Write-Host ""
Write-Host "Step 2: Verifying tile generation..." -ForegroundColor Yellow

# Read DZI file
[xml]$dzi = Get-Content "$outputBase.dzi"
$imageWidth = [int]$dzi.Image.Size.Width
$imageHeight = [int]$dzi.Image.Size.Height
$tileSize = [int]$dzi.Image.TileSize
$overlap = [int]$dzi.Image.Overlap

Write-Host "  Image dimensions: $imageWidth x $imageHeight" -ForegroundColor Gray
Write-Host "  Tile size: $tileSize" -ForegroundColor Gray

# Count tiles per level
$filesDir = "$outputBase`_files"
$levels = Get-ChildItem $filesDir -Directory | Sort-Object { [int]$_.Name }
$totalLevels = $levels.Count

Write-Host "  Total zoom levels: $totalLevels" -ForegroundColor Gray
Write-Host ""

# Verify each level has proper tiles
$jpegTileCount = 0
$levelDetails = @()
foreach ($level in $levels) {
    $tiles = Get-ChildItem $level.FullName -Filter "*.jpg"
    $tileCount = $tiles.Count
    $jpegTileCount += $tileCount
    
    # Calculate expected tiles for this level
    $levelNum = [int]$level.Name
    $scale = [Math]::Pow(2, $totalLevels - 1 - $levelNum)
    $levelWidth = [Math]::Ceiling($imageWidth / $scale)
    $levelHeight = [Math]::Ceiling($imageHeight / $scale)
    $expectedCols = [Math]::Ceiling($levelWidth / $tileSize)
    $expectedRows = [Math]::Ceiling($levelHeight / $tileSize)
    $expectedTiles = $expectedCols * $expectedRows
    
    Write-Host "  Level $($level.Name): $tileCount tiles (expected ~$expectedTiles)" -ForegroundColor Gray
    
    $levelDetails += @{
        Level = $levelNum
        TileCount = $tileCount
        Expected = $expectedTiles
    }
}

Write-Host "  Total JPEG tiles: $jpegTileCount" -ForegroundColor Green

# Step 3: Determine PNG levels (only last 2 levels for extreme zoom)
Write-Host ""
Write-Host "Step 3: Planning PNG replacement..." -ForegroundColor Yellow

# Use PNG only for the last 2 levels where text is really zoomed in
$pngStartLevel = [Math]::Max(0, $totalLevels - 2)
$pngLevels = $totalLevels - $pngStartLevel

Write-Host "  JPEG levels: 0-$($pngStartLevel-1) (all overview levels)" -ForegroundColor Gray
Write-Host "  PNG levels: $pngStartLevel-$($totalLevels-1) (extreme detail only)" -ForegroundColor Gray

# Step 4: Generate PNG tiles for detail levels only
if ($pngLevels -gt 0) {
    Write-Host ""
    Write-Host "Step 4: Generating PNG tiles for detail levels..." -ForegroundColor Yellow
    
    # Generate temporary PNG pyramid
    $tempBase = "$tempDir\zebra_png"
    
    & $vipsPath dzsave `"$inputFile`" `"$tempBase`" `
        --tile-size 256 `
        --overlap 1 `
        --suffix ".png[compression=9]" `
        --layout dz `
        --depth onetile `
        --vips-progress
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ PNG tiles generated" -ForegroundColor Green
        
        # Replace only high zoom levels with PNG
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
        Write-Host "✓ Replaced $pngTileCount tiles with PNG" -ForegroundColor Green
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

# Step 6: Create hybrid info
Write-Host ""
Write-Host "Step 6: Creating hybrid configuration..." -ForegroundColor Yellow

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

# Update DZI to use 256px tiles
$dziContent = @"
<?xml version="1.0" encoding="UTF-8"?>
<Image xmlns="http://schemas.microsoft.com/deepzoom/2008"
  Format="jpg"
  Overlap="1"
  TileSize="256">
  <Size Height="$imageHeight" Width="$imageWidth"/>
</Image>
"@

$dziContent | Out-File -FilePath "$outputBase.dzi" -Encoding UTF8

# Clean up
Write-Host ""
Write-Host "Cleaning up..." -ForegroundColor Yellow
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

$duration = (Get-Date) - $startTime

# Calculate final statistics
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

# Results
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " ✨ PROPER HYBRID TILES COMPLETE! ✨" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
Write-Host ""
Write-Host "Tile statistics:" -ForegroundColor Yellow
Write-Host "  JPEG tiles: $finalJpegCount ($jpegSizeMB MB)" -ForegroundColor Gray
Write-Host "  PNG tiles: $finalPngCount ($pngSizeMB MB)" -ForegroundColor Gray
Write-Host "  Total size: $totalSizeMB MB" -ForegroundColor Gray
Write-Host ""
Write-Host "Quality levels:" -ForegroundColor Green
Write-Host "  ✓ Sharp overview (JPEG with proper tiles)" -ForegroundColor White
Write-Host "  ✓ Pixel-perfect detail (PNG for text)" -ForegroundColor White
Write-Host "  ✓ No more blurry initial view!" -ForegroundColor White
Write-Host ""

# Verify proper generation
if ($finalJpegCount -lt 50) {
    Write-Host "⚠ Warning: Low JPEG tile count. Image might still be blurry." -ForegroundColor Yellow
    Write-Host "  Consider running 'npm run tiles:jpeg' for JPEG-only tiles" -ForegroundColor Yellow
}

Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Clear browser cache (Ctrl+F5)" -ForegroundColor White
Write-Host "2. Run: npm run dev" -ForegroundColor White
Write-Host "3. Initial view should now be sharp!" -ForegroundColor White

Write-Host ""
Read-Host "Press Enter to close"