# High-quality JPEG tile generation for sharp overview
# Optimized for both performance and quality

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " HIGH-QUALITY JPEG TILE GENERATION" -ForegroundColor Cyan
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

# Clean and create output directory
Write-Host "Preparing output directory..." -ForegroundColor Yellow
if (Test-Path $outputDir) {
    Remove-Item -Path $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$startTime = Get-Date

# Generate high-quality JPEG tiles
Write-Host "Generating high-quality JPEG tiles..." -ForegroundColor Yellow
Write-Host "  - Tile size: 512px" -ForegroundColor Gray
Write-Host "  - Quality: 95%" -ForegroundColor Gray
Write-Host "  - Overlap: 2px" -ForegroundColor Gray
Write-Host "  - Chroma subsampling: disabled (4:4:4)" -ForegroundColor Gray
Write-Host ""

# Use VIPS with optimized JPEG settings
& $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
    --tile-size 512 `
    --overlap 2 `
    --suffix ".jpg[Q=95,optimize_coding,strip,subsample_mode=off]" `
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
        --size down `
        --vips-progress
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Preview generated!" -ForegroundColor Green
    }
    
    $duration = (Get-Date) - $startTime
    
    # Show results
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host " ✨ HIGH-QUALITY TILES COMPLETE! ✨" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
    Write-Host ""
    
    # Check what was created
    if (Test-Path "$outputBase.dzi") {
        [xml]$dzi = Get-Content "$outputBase.dzi"
        Write-Host "Image size: $($dzi.Image.Size.Width) x $($dzi.Image.Size.Height)" -ForegroundColor Gray
        Write-Host "Tile size: $($dzi.Image.TileSize)" -ForegroundColor Gray
    }
    
    $filesDir = "$outputBase`_files"
    if (Test-Path $filesDir) {
        $levels = Get-ChildItem $filesDir -Directory
        Write-Host "Zoom levels: $($levels.Count)" -ForegroundColor Gray
        
        # Calculate total size
        $totalSize = 0
        $totalFiles = 0
        Get-ChildItem $filesDir -Recurse -File | ForEach-Object {
            $totalSize += $_.Length
            $totalFiles++
        }
        $sizeMB = [math]::Round($totalSize / 1MB, 2)
        Write-Host "Total size: $sizeMB MB" -ForegroundColor Gray
        Write-Host "Total tiles: $totalFiles" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Benefits:" -ForegroundColor Green
    Write-Host "  ✓ Sharp images at all zoom levels" -ForegroundColor White
    Write-Host "  ✓ Fast loading with JPEG" -ForegroundColor White
    Write-Host "  ✓ No chroma subsampling artifacts" -ForegroundColor White
    Write-Host "  ✓ Optimized for web viewing" -ForegroundColor White
    
} else {
    Write-Host ""
    Write-Host "✗ Tile generation failed!" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close"