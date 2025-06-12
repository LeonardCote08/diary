# Quick test to generate tiles with auto-detected VIPS

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " QUICK TILE GENERATION TEST" -ForegroundColor Cyan
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

Write-Host "✓ Found VIPS at: $vipsPath" -ForegroundColor Green
Write-Host ""

# Check input file
$inputFile = "assets\source\ZEBRA_for_MVP.tiff"
if (-not (Test-Path $inputFile)) {
    Write-Host "ERROR: Input file not found: $inputFile" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Found input file: $inputFile" -ForegroundColor Green
Write-Host ""

# Clean old tiles
$outputDir = "public\images\tiles\zebra"
if (Test-Path $outputDir) {
    Write-Host "Cleaning old tiles..." -ForegroundColor Yellow
    Remove-Item -Path $outputDir -Recurse -Force
}

# Create output directory
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

# Generate tiles
Write-Host "Generating tiles..." -ForegroundColor Yellow
$outputBase = "$outputDir\zebra"

$process = Start-Process -FilePath $vipsPath -ArgumentList @(
    "dzsave",
    "`"$inputFile`"",
    "`"$outputBase`"",
    "--tile-size", "512",
    "--overlap", "1",
    "--suffix", ".jpg[Q=85]",
    "--vips-progress"
) -Wait -PassThru -NoNewWindow

if ($process.ExitCode -eq 0) {
    Write-Host "✓ Tiles generated successfully!" -ForegroundColor Green
    
    # Check what was created
    if (Test-Path "$outputBase.dzi") {
        Write-Host "✓ DZI file created" -ForegroundColor Green
    }
    
    $filesDir = "$outputBase`_files"
    if (Test-Path $filesDir) {
        $levels = Get-ChildItem $filesDir -Directory
        Write-Host "✓ Created $($levels.Count) zoom levels" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "Success! You can now run:" -ForegroundColor Cyan
    Write-Host "  npm run dev" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "✗ Tile generation failed with exit code: $($process.ExitCode)" -ForegroundColor Red
}

Read-Host "Press Enter to close"