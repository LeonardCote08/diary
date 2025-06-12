# Test script to compare JPEG vs PNG tile quality
# Generates sample tiles in both formats for comparison

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " JPEG vs PNG QUALITY COMPARISON TEST" -ForegroundColor Cyan
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

# Configuration
$inputFile = "assets\source\ZEBRA_for_MVP.tiff"
$testDir = "test-tiles"

# Check input
if (-not (Test-Path $inputFile)) {
    Write-Host "ERROR: Input file not found: $inputFile" -ForegroundColor Red
    exit 1
}

# Create test directory
if (Test-Path $testDir) {
    Remove-Item -Path $testDir -Recurse -Force
}
New-Item -ItemType Directory -Path $testDir -Force | Out-Null

Write-Host "Extracting test region with text..." -ForegroundColor Yellow

# Extract a region with text (adjust coordinates as needed)
$testRegion = "$testDir\test-region.tif"
& $vipsPath crop `"$inputFile`" `"$testRegion`" 3000 2000 2000 1500

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to extract test region" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Test region extracted" -ForegroundColor Green
Write-Host ""

# Test 1: JPEG at different quality levels
Write-Host "Test 1: JPEG tiles at different quality levels" -ForegroundColor Yellow
$jpegQualities = @(85, 90, 95, 100)

foreach ($quality in $jpegQualities) {
    Write-Host "  Generating JPEG tiles at $quality% quality..." -ForegroundColor Gray
    $outputBase = "$testDir\jpeg-q$quality\test"
    
    & $vipsPath dzsave `"$testRegion`" `"$outputBase`" `
        --tile-size 512 `
        --overlap 1 `
        --suffix ".jpg[Q=$quality]" `
        --depth 3
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ JPEG Q$quality generated" -ForegroundColor Green
    } else {
        Write-Host "  ✗ JPEG Q$quality failed" -ForegroundColor Red
    }
}

Write-Host ""

# Test 2: PNG at different compression levels
Write-Host "Test 2: PNG tiles at different compression levels" -ForegroundColor Yellow
$pngCompressions = @(1, 6, 9)

foreach ($compression in $pngCompressions) {
    Write-Host "  Generating PNG tiles at compression level $compression..." -ForegroundColor Gray
    $outputBase = "$testDir\png-c$compression\test"
    
    & $vipsPath dzsave `"$testRegion`" `"$outputBase`" `
        --tile-size 512 `
        --overlap 1 `
        --suffix ".png[compression=$compression]" `
        --depth 3
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ PNG C$compression generated" -ForegroundColor Green
    } else {
        Write-Host "  ✗ PNG C$compression failed" -ForegroundColor Red
    }
}

Write-Host ""

# Test 3: WebP (if available)
Write-Host "Test 3: WebP tiles (modern format)" -ForegroundColor Yellow
$outputBase = "$testDir\webp\test"

& $vipsPath dzsave `"$testRegion`" `"$outputBase`" `
    --tile-size 512 `
    --overlap 1 `
    --suffix ".webp[Q=95,lossless=false]" `
    --depth 3 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ WebP generated" -ForegroundColor Green
} else {
    Write-Host "  ⚠ WebP not available (optional)" -ForegroundColor Yellow
}

Write-Host ""

# Generate comparison HTML
Write-Host "Generating comparison viewer..." -ForegroundColor Yellow

$htmlContent = @"
<!DOCTYPE html>
<html>
<head>
    <title>JPEG vs PNG Quality Comparison</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: #000;
            color: #fff;
            margin: 0;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1, h2 {
            text-align: center;
        }
        .comparison {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .tile-test {
            border: 1px solid #333;
            padding: 10px;
            text-align: center;
        }
        .tile-test img {
            max-width: 100%;
            height: auto;
            image-rendering: pixelated;
            image-rendering: -moz-crisp-edges;
            image-rendering: crisp-edges;
        }
        .info {
            margin-top: 10px;
            font-size: 12px;
            color: #888;
        }
        .size {
            color: #f39c12;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Tile Quality Comparison</h1>
        <p style="text-align: center;">Zoom in with Ctrl/Cmd + Mouse Wheel to examine text clarity</p>
        
        <h2>JPEG Tiles</h2>
        <div class="comparison">
"@

# Add JPEG samples
foreach ($quality in $jpegQualities) {
    $tilePath = "$testDir\jpeg-q$quality\test_files\2\1_1.jpg"
    if (Test-Path $tilePath) {
        $fileSize = [math]::Round((Get-Item $tilePath).Length / 1KB, 1)
        $htmlContent += @"
            <div class="tile-test">
                <h3>JPEG Q$quality</h3>
                <img src="jpeg-q$quality/test_files/2/1_1.jpg" alt="JPEG Q$quality">
                <div class="info">
                    Quality: $quality%<br>
                    <span class="size">Size: $fileSize KB</span>
                </div>
            </div>
"@
    }
}

$htmlContent += @"
        </div>
        
        <h2>PNG Tiles</h2>
        <div class="comparison">
"@

# Add PNG samples
foreach ($compression in $pngCompressions) {
    $tilePath = "$testDir\png-c$compression\test_files\2\1_1.png"
    if (Test-Path $tilePath) {
        $fileSize = [math]::Round((Get-Item $tilePath).Length / 1KB, 1)
        $htmlContent += @"
            <div class="tile-test">
                <h3>PNG C$compression</h3>
                <img src="png-c$compression/test_files/2/1_1.png" alt="PNG C$compression">
                <div class="info">
                    Compression: Level $compression<br>
                    <span class="size">Size: $fileSize KB</span>
                </div>
            </div>
"@
    }
}

# Add WebP if available
$webpPath = "$testDir\webp\test_files\2\1_1.webp"
if (Test-Path $webpPath) {
    $fileSize = [math]::Round((Get-Item $webpPath).Length / 1KB, 1)
    $htmlContent += @"
            <div class="tile-test">
                <h3>WebP</h3>
                <img src="webp/test_files/2/1_1.webp" alt="WebP">
                <div class="info">
                    Quality: 95%<br>
                    <span class="size">Size: $fileSize KB</span>
                </div>
            </div>
"@
}

$htmlContent += @"
        </div>
        
        <h2>Summary</h2>
        <table style="margin: 0 auto; border-collapse: collapse;">
            <tr>
                <th style="padding: 10px; border: 1px solid #333;">Format</th>
                <th style="padding: 10px; border: 1px solid #333;">Settings</th>
                <th style="padding: 10px; border: 1px solid #333;">File Size</th>
                <th style="padding: 10px; border: 1px solid #333;">Quality</th>
            </tr>
"@

# Add summary data
foreach ($quality in $jpegQualities) {
    $tilePath = "$testDir\jpeg-q$quality\test_files\2\1_1.jpg"
    if (Test-Path $tilePath) {
        $fileSize = [math]::Round((Get-Item $tilePath).Length / 1KB, 1)
        $htmlContent += @"
            <tr>
                <td style="padding: 10px; border: 1px solid #333;">JPEG</td>
                <td style="padding: 10px; border: 1px solid #333;">Q=$quality</td>
                <td style="padding: 10px; border: 1px solid #333;">$fileSize KB</td>
                <td style="padding: 10px; border: 1px solid #333;">Lossy compression artifacts</td>
            </tr>
"@
    }
}

foreach ($compression in $pngCompressions) {
    $tilePath = "$testDir\png-c$compression\test_files\2\1_1.png"
    if (Test-Path $tilePath) {
        $fileSize = [math]::Round((Get-Item $tilePath).Length / 1KB, 1)
        $htmlContent += @"
            <tr>
                <td style="padding: 10px; border: 1px solid #333;">PNG</td>
                <td style="padding: 10px; border: 1px solid #333;">C=$compression</td>
                <td style="padding: 10px; border: 1px solid #333;">$fileSize KB</td>
                <td style="padding: 10px; border: 1px solid #333;">Lossless - pixel perfect</td>
            </tr>
"@
    }
}

$htmlContent += @"
        </table>
        
        <div style="margin-top: 40px; padding: 20px; background: #1a1a1a; border-radius: 8px;">
            <h3>Recommendations:</h3>
            <ul>
                <li><strong>PNG with compression 9</strong> provides pixel-perfect quality with reasonable file sizes</li>
                <li>JPEG, even at 100% quality, introduces compression artifacts that blur text</li>
                <li>PNG files are 2-3x larger but preserve every detail of hand-drawn text</li>
                <li>WebP offers a middle ground but may not be supported on all browsers</li>
            </ul>
        </div>
    </div>
</body>
</html>
"@

# Save HTML
$htmlPath = "$testDir\comparison.html"
$htmlContent | Out-File -FilePath $htmlPath -Encoding UTF8

Write-Host "✓ Comparison viewer generated" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " TEST COMPLETE!" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Results saved in: $testDir" -ForegroundColor Yellow
Write-Host ""
Write-Host "To view the comparison:" -ForegroundColor Green
Write-Host "1. Open $htmlPath in your browser" -ForegroundColor White
Write-Host "2. Zoom in (Ctrl/Cmd + Mouse Wheel) to examine text clarity" -ForegroundColor White
Write-Host "3. Compare file sizes vs quality" -ForegroundColor White
Write-Host ""

# Open in browser
$response = Read-Host "Open comparison in browser? [Y/n]"
if ($response -ne 'n' -and $response -ne 'N') {
    Start-Process $htmlPath
}

Write-Host ""
Read-Host "Press Enter to close"