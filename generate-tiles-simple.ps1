# Simple high-quality tile generation script
# Uses basic VIPS parameters that work reliably

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " SIMPLE HIGH-QUALITY TILE GENERATION" -ForegroundColor Cyan
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
Write-Host "Preparing output directory..." -ForegroundColor Yellow
if (Test-Path $outputDir) {
    Remove-Item -Path $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

# Generate tiles with basic high-quality settings
Write-Host "Generating high-quality tiles..." -ForegroundColor Yellow
Write-Host "  Tile size: 256px" -ForegroundColor Gray
Write-Host "  Quality: 95%" -ForegroundColor Gray
Write-Host "  Overlap: 2px" -ForegroundColor Gray
Write-Host ""

$startTime = Get-Date

# Basic VIPS command without problematic parameters
& $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
    --tile-size 256 `
    --overlap 2 `
    --suffix ".jpg[Q=95]"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Tiles generated successfully!" -ForegroundColor Green
    
    # Generate preview
    Write-Host "Generating preview..." -ForegroundColor Yellow
    $previewPath = "$outputDir\preview.jpg"
    
    & $vipsPath thumbnail `"$inputFile`" `"$previewPath`" 2048 `
        --size down
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Preview generated!" -ForegroundColor Green
    }
    
    $duration = (Get-Date) - $startTime
    
    # Show results
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host " ✨ TILES GENERATED SUCCESSFULLY! ✨" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
    Write-Host ""
    
    # Check what was created
    if (Test-Path "$outputBase.dzi") {
        [xml]$dzi = Get-Content "$outputBase.dzi"
        Write-Host "Image size: $($dzi.Image.Size.Width) x $($dzi.Image.Size.Height)" -ForegroundColor Gray
    }
    
    $filesDir = "$outputBase`_files"
    if (Test-Path $filesDir) {
        $levels = Get-ChildItem $filesDir -Directory
        Write-Host "Zoom levels: $($levels.Count)" -ForegroundColor Gray
    }
    
} else {
    Write-Host "✗ Tile generation failed!" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close"