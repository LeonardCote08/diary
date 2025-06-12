# High-quality PNG tile generation for pixel-perfect text clarity
# Implements recommendations from deep zoom optimization research

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " PNG TILE GENERATION - MAX QUALITY" -ForegroundColor Cyan
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
    Write-Host "Download from: https://github.com/libvips/build-win64-mxe/releases" -ForegroundColor Yellow
    exit 1
}

Write-Host "Using VIPS: $vipsPath" -ForegroundColor Green
Write-Host ""

# Configuration
$inputFile = "assets\source\ZEBRA_for_MVP.tiff"
$outputDir = "public\images\tiles\zebra"
$outputBase = "$outputDir\zebra"
$preprocessedFile = "$outputDir\preprocessed.tif"

# Check input
if (-not (Test-Path $inputFile)) {
    Write-Host "ERROR: Input file not found: $inputFile" -ForegroundColor Red
    exit 1
}

# Clean and create output directory
Write-Host "Preparing output directory..." -ForegroundColor Yellow
if (Test-Path $outputDir) {
    Remove-Item -Path $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$startTime = Get-Date

# Step 1: Preprocessing for enhanced text clarity
Write-Host "Step 1: Preprocessing image for text enhancement..." -ForegroundColor Yellow

# Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
Write-Host "  - Applying contrast enhancement (CLAHE)..." -ForegroundColor Gray
& $vipsPath hist_local `"$inputFile`" `"$outputDir\clahe.tif`" 128 128 --max-slope 3

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠ CLAHE failed, continuing with original" -ForegroundColor Yellow
    $enhancedFile = $inputFile
} else {
    $enhancedFile = "$outputDir\clahe.tif"
    Write-Host "  ✓ Contrast enhanced" -ForegroundColor Green
}

# Apply unsharp masking for text sharpening
Write-Host "  - Applying unsharp mask for text clarity..." -ForegroundColor Gray
& $vipsPath sharpen `"$enhancedFile`" `"$preprocessedFile`" --sigma 1.0 --x1 2 --m2 0.5

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠ Sharpening failed, using enhanced file" -ForegroundColor Yellow
    $preprocessedFile = $enhancedFile
} else {
    Write-Host "  ✓ Text sharpening applied" -ForegroundColor Green
}

# Step 2: Generate PNG tiles with maximum quality
Write-Host ""
Write-Host "Step 2: Generating PNG tiles..." -ForegroundColor Yellow
Write-Host "  - Format: PNG (lossless)" -ForegroundColor Gray
Write-Host "  - Tile size: 512px" -ForegroundColor Gray
Write-Host "  - Overlap: 1px" -ForegroundColor Gray
Write-Host "  - Compression: Level 9" -ForegroundColor Gray
Write-Host "  - Interpolation: Lanczos3" -ForegroundColor Gray
Write-Host ""

# Generate tiles with optimal settings for text
& $vipsPath dzsave `"$preprocessedFile`" `"$outputBase`" `
    --layout dz `
    --tile-size 512 `
    --overlap 1 `
    --suffix ".png[compression=9]" `
    --depth onepixel `
    --vips-progress

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ PNG tiles generated successfully!" -ForegroundColor Green
    
    # Step 3: Generate preview (JPEG is fine for overview)
    Write-Host ""
    Write-Host "Step 3: Generating preview image..." -ForegroundColor Yellow
    $previewPath = "$outputDir\preview.jpg"
    
    & $vipsPath thumbnail `"$inputFile`" `"$previewPath`" 2048 `
        --size down `
        --vips-progress
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Preview generated!" -ForegroundColor Green
    } else {
        Write-Host "⚠ Preview generation failed (non-critical)" -ForegroundColor Yellow
    }
    
    # Clean up temporary files
    Write-Host ""
    Write-Host "Cleaning up temporary files..." -ForegroundColor Yellow
    if (Test-Path "$outputDir\clahe.tif") {
        Remove-Item "$outputDir\clahe.tif" -Force
    }
    if ($preprocessedFile -ne $inputFile -and (Test-Path $preprocessedFile)) {
        Remove-Item $preprocessedFile -Force
    }
    
    $duration = (Get-Date) - $startTime
    
    # Show results
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host " ✨ PNG TILES GENERATED! ✨" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
    Write-Host ""
    
    # Check file sizes
    if (Test-Path "$outputBase.dzi") {
        [xml]$dzi = Get-Content "$outputBase.dzi"
        Write-Host "Image size: $($dzi.Image.Size.Width) x $($dzi.Image.Size.Height)" -ForegroundColor Gray
    }
    
    $filesDir = "$outputBase`_files"
    if (Test-Path $filesDir) {
        $levels = Get-ChildItem $filesDir -Directory
        Write-Host "Zoom levels: $($levels.Count)" -ForegroundColor Gray
        
        # Calculate total size
        $totalSize = 0
        Get-ChildItem $filesDir -Recurse -File | ForEach-Object {
            $totalSize += $_.Length
        }
        $sizeMB = [math]::Round($totalSize / 1MB, 2)
        Write-Host "Total size: $sizeMB MB" -ForegroundColor Gray
        
        # Show file count
        $fileCount = (Get-ChildItem $filesDir -Recurse -File).Count
        Write-Host "Total tiles: $fileCount" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "✅ Ready for pixel-perfect deep zoom!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Clear browser cache (Ctrl+F5)" -ForegroundColor White
    Write-Host "2. Run: npm run dev" -ForegroundColor White
    Write-Host "3. Zoom in to verify text clarity" -ForegroundColor White
    
} else {
    Write-Host ""
    Write-Host "✗ Tile generation failed!" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close"