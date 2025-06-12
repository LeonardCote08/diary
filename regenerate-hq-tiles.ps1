# High-quality tile regeneration script
# Optimized for maximum quality and smooth zooming

param(
    [string]$Artwork = "zebra"
)

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " HIGH-QUALITY TILE GENERATION" -ForegroundColor Cyan
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

# Configuration for maximum quality
$inputFile = "assets\source\ZEBRA_for_MVP.tiff"
$outputDir = "public\images\tiles\$Artwork"
$outputBase = "$outputDir\$Artwork"

# Check input
if (-not (Test-Path $inputFile)) {
    Write-Host "ERROR: Input file not found: $inputFile" -ForegroundColor Red
    exit 1
}

$fileInfo = Get-Item $inputFile
Write-Host "Input file: $($fileInfo.Name) ($([math]::Round($fileInfo.Length / 1MB, 2)) MB)" -ForegroundColor Cyan

# Clean old tiles
Write-Host "Cleaning old tiles..." -ForegroundColor Yellow
if (Test-Path $outputDir) {
    Remove-Item -Path $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

# Generate high-quality tiles
Write-Host "Generating high-quality tiles..." -ForegroundColor Yellow
Write-Host "Settings:" -ForegroundColor Gray
Write-Host "  - Tile size: 256px (optimal for text)" -ForegroundColor Gray
Write-Host "  - Quality: 95% JPEG" -ForegroundColor Gray
Write-Host "  - Overlap: 2px (no seams)" -ForegroundColor Gray
Write-Host "  - All zoom levels" -ForegroundColor Gray
Write-Host ""

$startTime = Get-Date

# Generate DZI with maximum quality settings
$process = Start-Process -FilePath $vipsPath -ArgumentList @(
    "dzsave",
    "`"$inputFile`"",
    "`"$outputBase`"",
    "--tile-size", "256",
    "--overlap", "2",
    "--suffix", ".jpg[Q=95,optimize_coding,strip]",
    "--depth", "onetile",
    "--container", "fs",
    "--layout", "dz",
    "--vips-progress"
) -Wait -PassThru -NoNewWindow

if ($process.ExitCode -ne 0) {
    Write-Host "ERROR: Tile generation failed!" -ForegroundColor Red
    exit 1
}

# Generate high-quality preview
Write-Host ""
Write-Host "Generating preview..." -ForegroundColor Yellow

$previewPath = "$outputDir\preview.jpg"
$previewProcess = Start-Process -FilePath $vipsPath -ArgumentList @(
    "thumbnail",
    "`"$inputFile`"",
    "[width=2048,height=2048,size=down]",
    "`"$previewPath`"",
    "--size", "down"
) -Wait -PassThru -NoNewWindow

$duration = (Get-Date) - $startTime

# Verify results
Write-Host ""
if (Test-Path "$outputBase.dzi") {
    Write-Host "✓ DZI file created" -ForegroundColor Green
    
    # Parse DZI to show info
    [xml]$dziContent = Get-Content "$outputBase.dzi"
    $width = $dziContent.Image.Size.Width
    $height = $dziContent.Image.Size.Height
    Write-Host "✓ Image dimensions: $width x $height" -ForegroundColor Green
}

$filesDir = "$outputBase`_files"
if (Test-Path $filesDir) {
    $levels = Get-ChildItem $filesDir -Directory
    Write-Host "✓ Created $($levels.Count) zoom levels" -ForegroundColor Green
    
    # Count total tiles
    $totalTiles = 0
    foreach ($level in $levels) {
        $tiles = Get-ChildItem $level.FullName -File
        $totalTiles += $tiles.Count
    }
    Write-Host "✓ Total tiles: $totalTiles" -ForegroundColor Green
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " ✨ HIGH-QUALITY TILES GENERATED! ✨" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Time taken: $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Clear browser cache (Ctrl+Shift+Delete)" -ForegroundColor White
Write-Host "2. Run: npm run dev" -ForegroundColor White
Write-Host "3. Enjoy smooth, high-quality zooming!" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to close"