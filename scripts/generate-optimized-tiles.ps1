# Optimized tile generation based on research recommendations
# Uses 512x512 tiles with 8px overlap for perfect text clarity

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " OPTIMIZED TILE GENERATION" -ForegroundColor Cyan
Write-Host " 512x512 tiles with 8px overlap" -ForegroundColor Cyan
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

# Tile parameters based on research
$tileSize = 512  # Optimal for text clarity
$overlap = 8     # Prevents text cut-off at boundaries

# Check input
if (-not (Test-Path $inputFile)) {
    Write-Host "ERROR: Input file not found: $inputFile" -ForegroundColor Red
    exit 1
}

# Get user choice
Write-Host ""
Write-Host "Select tile generation strategy:" -ForegroundColor Yellow
Write-Host "1. PNG (Maximum quality, larger files)" -ForegroundColor White
Write-Host "2. JPEG 4:4:4 (High quality, faster loading)" -ForegroundColor White
Write-Host ""
$choice = Read-Host "Enter choice [1-2]"

# Clean and create output directory
Write-Host ""
Write-Host "Preparing output directory..." -ForegroundColor Yellow
if (Test-Path $outputDir) {
    Remove-Item -Path $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$startTime = Get-Date

if ($choice -eq "1") {
    # PNG Generation - Maximum quality
    Write-Host ""
    Write-Host "Generating PNG tiles for maximum quality..." -ForegroundColor Yellow
    Write-Host "  - Tile size: ${tileSize}px" -ForegroundColor Gray
    Write-Host "  - Overlap: ${overlap}px" -ForegroundColor Gray
    Write-Host "  - Compression: Level 6" -ForegroundColor Gray
    Write-Host ""

    & $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
        --tile-size $tileSize `
        --overlap $overlap `
        --suffix ".png[compression=6]" `
        --vips-progress

    if ($LASTEXITCODE -eq 0) {
        # Fix DZI format
        $dziPath = "$outputBase.dzi"
        if (Test-Path $dziPath) {
            $dziContent = Get-Content $dziPath -Raw
            $dziContent = $dziContent -replace 'Format="jpg"', 'Format="png"'
            $dziContent = $dziContent -replace 'Format="jpeg"', 'Format="png"'
            Set-Content -Path $dziPath -Value $dziContent -NoNewline
        }
    }
    
} else {
    # JPEG 4:4:4 Generation - Optimized quality
    Write-Host ""
    Write-Host "Generating JPEG 4:4:4 tiles for optimized quality..." -ForegroundColor Yellow
    Write-Host "  - Tile size: ${tileSize}px" -ForegroundColor Gray
    Write-Host "  - Overlap: ${overlap}px" -ForegroundColor Gray
    Write-Host "  - Quality: 98% with 4:4:4 chroma" -ForegroundColor Gray
    Write-Host ""

    # Use JPEG with no chroma subsampling for better text
    & $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
        --tile-size $tileSize `
        --overlap $overlap `
        --suffix ".jpg[Q=98,subsample_mode=off]" `
        --vips-progress
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Tiles generated successfully!" -ForegroundColor Green
    
    # Generate preview with proper quality
    Write-Host ""
    Write-Host "Generating preview..." -ForegroundColor Yellow
    $previewPath = "$outputDir\preview.jpg"
    
    & $vipsPath thumbnail `"$inputFile`" `"$previewPath`" 2048 `
        --size down `
        --export-profile srgb
    
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
        
        foreach ($level in $levels) {
            $extension = if ($choice -eq "1") { "*.png" } else { "*.jpg" }
            $tiles = Get-ChildItem $level.FullName -Filter $extension
            $levelSize = ($tiles | Measure-Object -Property Length -Sum).Sum
            $totalSize += $levelSize
            $totalFiles += $tiles.Count
        }
        
        $totalSizeMB = [Math]::Round($totalSize / 1MB, 2)
        
        Write-Host ""
        Write-Host "  Total tiles: $totalFiles" -ForegroundColor Green
        Write-Host "  Total size: $totalSizeMB MB" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host " ✨ OPTIMIZED TILES COMPLETE! ✨" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
    Write-Host ""
    Write-Host "Optimizations applied:" -ForegroundColor Green
    Write-Host "  ✓ 512x512 tiles (75% fewer requests)" -ForegroundColor White
    Write-Host "  ✓ 8px overlap (no text cut-off)" -ForegroundColor White
    if ($choice -eq "1") {
        Write-Host "  ✓ PNG format (pixel-perfect)" -ForegroundColor White
    } else {
        Write-Host "  ✓ JPEG 4:4:4 (no chroma artifacts)" -ForegroundColor White
    }
    
} else {
    Write-Host ""
    Write-Host "✗ Tile generation failed!" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close"