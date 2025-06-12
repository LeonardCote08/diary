# Batch process multiple artworks with VIPS
# This script processes all TIFF files in the assets/source directory

param(
    [string]$InputPath = ".\assets\source",
    [string]$OutputPath = ".\public\images\tiles",
    [string]$VipsPath = "",
    [int]$TileSize = 512,
    [int]$Overlap = 1,
    [int]$Quality = 85
)

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " BATCH ARTWORK TILE GENERATION" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Auto-detect VIPS if not provided
if (-not $VipsPath) {
    Write-Host "Auto-detecting VIPS installation..." -ForegroundColor Yellow
    
    $possiblePaths = @(
        (Get-Command vips -ErrorAction SilentlyContinue).Path,
        "C:\vips\bin\vips.exe",
        "C:\Program Files\vips\bin\vips.exe",
        "C:\Program Files (x86)\vips\bin\vips.exe",
        "$env:LOCALAPPDATA\vips-dev-8.16\bin\vips.exe",
        "$env:LOCALAPPDATA\vips-dev-8.15\bin\vips.exe",
        "$env:LOCALAPPDATA\vips-dev-8.14\bin\vips.exe"
    )
    
    foreach ($path in $possiblePaths) {
        if ($path -and (Test-Path $path)) {
            $VipsPath = $path
            break
        }
    }
}

# Check if VIPS exists
if (-not $VipsPath -or -not (Test-Path $VipsPath)) {
    Write-Host "ERROR: VIPS not found" -ForegroundColor Red
    Write-Host "Please install LibVIPS from: https://github.com/libvips/build-win64-mxe/releases" -ForegroundColor Yellow
    exit 1
}

Write-Host "Using VIPS at: $VipsPath" -ForegroundColor Green

# Verify VIPS version
Write-Host "Checking VIPS installation..." -ForegroundColor Yellow
& $VipsPath --version
Write-Host ""

# Get all TIFF files
$tiffFiles = Get-ChildItem -Path $InputPath -Filter "*.tiff" -File
$tifFiles = Get-ChildItem -Path $InputPath -Filter "*.tif" -File
$allFiles = $tiffFiles + $tifFiles

if ($allFiles.Count -eq 0) {
    Write-Host "No TIFF files found in $InputPath" -ForegroundColor Yellow
    exit 0
}

Write-Host "Found $($allFiles.Count) artwork(s) to process" -ForegroundColor Green
Write-Host ""

$successCount = 0
$failedFiles = @()
$totalStartTime = Get-Date

foreach ($file in $allFiles) {
    $outputName = $file.BaseName.ToLower().Replace(' ', '_')
    $outputDir = Join-Path $OutputPath $outputName
    $outputBase = Join-Path $outputDir $outputName
    
    Write-Host "Processing: $($file.Name)" -ForegroundColor Cyan
    Write-Host "  Output: $outputName" -ForegroundColor Gray
    
    # Clean existing tiles
    if (Test-Path $outputDir) {
        Remove-Item -Path $outputDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Cleaned old tiles" -ForegroundColor Gray
    }
    
    # Create output directory
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    
    # Generate tiles
    $startTime = Get-Date
    
    try {
        # Generate DZI tiles
        $process = Start-Process -FilePath $VipsPath -ArgumentList @(
            "dzsave",
            "`"$($file.FullName)`"",
            "`"$outputBase`"",
            "--tile-size", $TileSize,
            "--overlap", $Overlap,
            "--suffix", ".jpg[Q=$Quality]"
        ) -Wait -PassThru -NoNewWindow
        
        if ($process.ExitCode -eq 0) {
            # Generate preview
            $previewPath = Join-Path $outputDir "preview.jpg"
            $previewProcess = Start-Process -FilePath $VipsPath -ArgumentList @(
                "thumbnail",
                "`"$($file.FullName)`"",
                "[width=2048,height=2048,size=down]",
                "`"$previewPath`"",
                "--size", "down"
            ) -Wait -PassThru -NoNewWindow
            
            $duration = (Get-Date) - $startTime
            Write-Host "  ✓ Completed in $($duration.TotalSeconds.ToString('F2')) seconds" -ForegroundColor Green
            $successCount++
        } else {
            throw "VIPS process failed with exit code $($process.ExitCode)"
        }
    } catch {
        Write-Host "  ✗ Failed: $_" -ForegroundColor Red
        $failedFiles += $file.Name
    }
    
    Write-Host ""
}

$totalDuration = (Get-Date) - $totalStartTime

# Summary
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " BATCH PROCESSING COMPLETE" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Total files: $($allFiles.Count)"
Write-Host "  Successful: $successCount" -ForegroundColor Green
Write-Host "  Failed: $($failedFiles.Count)" -ForegroundColor $(if ($failedFiles.Count -gt 0) { "Red" } else { "Green" })
Write-Host "  Total time: $($totalDuration.TotalMinutes.ToString('F2')) minutes"
Write-Host ""

if ($failedFiles.Count -gt 0) {
    Write-Host "Failed files:" -ForegroundColor Red
    $failedFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host ""
}

Write-Host "All tiles generated in: $OutputPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Run 'npm run dev' to test the viewer"
Write-Host "2. Upload tiles to your CDN"
Write-Host ""

# Pause to see results
Read-Host "Press Enter to close"