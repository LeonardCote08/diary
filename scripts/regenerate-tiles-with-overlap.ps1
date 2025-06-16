# Regenerate tiles with 2px overlap for smooth transitions
# Fixes the visible tile loading issue

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " REGENERATE TILES WITH OVERLAP" -ForegroundColor Cyan
Write-Host " Fixes visible tile boundaries" -ForegroundColor Cyan
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

# IMPORTANT: 2px overlap for smooth transitions
$tileSize = 256
$overlap = 2  # This prevents visible seams between tiles

# Check input
if (-not (Test-Path $inputFile)) {
    Write-Host "ERROR: Input file not found: $inputFile" -ForegroundColor Red
    exit 1
}

# Backup existing tiles
Write-Host ""
Write-Host "Backing up existing tiles..." -ForegroundColor Yellow
if (Test-Path $outputDir) {
    $backupDir = "$outputDir`_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Move-Item $outputDir $backupDir -Force
    Write-Host "Backed up to: $backupDir" -ForegroundColor Gray
}

# Create output directory
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$startTime = Get-Date

# Generate tiles with overlap
Write-Host ""
Write-Host "Generating tiles with overlap..." -ForegroundColor Yellow
Write-Host "  - Tile size: ${tileSize}px" -ForegroundColor Gray
Write-Host "  - Overlap: ${overlap}px (prevents seams)" -ForegroundColor Cyan
Write-Host "  - Quality: 95% JPEG" -ForegroundColor Gray
Write-Host ""

& $vipsPath dzsave `"$inputFile`" `"$outputBase`" `
    --tile-size $tileSize `
    --overlap $overlap `
    --suffix ".jpg[Q=95,optimize_coding=true,strip=true]" `
    --depth onepixel `
    --vips-progress

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Tiles generated successfully!" -ForegroundColor Green
    
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
    
    # Verify DZI file has correct overlap
    [xml]$dzi = Get-Content "$outputBase.dzi"
    $dziOverlap = [int]$dzi.Image.Overlap
    
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host " ✨ TILES REGENERATED! ✨" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Time: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
    Write-Host "DZI Overlap: $dziOverlap pixels" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Benefits of overlap:" -ForegroundColor Green
    Write-Host "  ✓ No visible seams between tiles" -ForegroundColor White
    Write-Host "  ✓ Smoother loading experience" -ForegroundColor White
    Write-Host "  ✓ Better visual quality during zoom" -ForegroundColor White
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Restart the dev server" -ForegroundColor Gray
    Write-Host "2. Clear browser cache (Ctrl+Shift+R)" -ForegroundColor Gray
    Write-Host "3. Test the improved loading" -ForegroundColor Gray
    
} else {
    Write-Host ""
    Write-Host "✗ Tile generation failed!" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to close"