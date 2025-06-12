# Quick test script to verify VIPS setup and tile generation

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " VIPS SETUP TEST" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$errors = 0

# Test 1: Check VIPS installation
Write-Host "[1/4] Checking VIPS installation..." -ForegroundColor Yellow

# Try to find VIPS
$vipsPath = $null
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
        $vipsPath = $path
        break
    }
}

if ($vipsPath) {
    Write-Host "✓ VIPS found at: $vipsPath" -ForegroundColor Green
    & $vipsPath --version
    Write-Host "✓ VIPS is installed" -ForegroundColor Green
} else {
    Write-Host "✗ VIPS not found" -ForegroundColor Red
    Write-Host "  Please install from: https://github.com/libvips/build-win64-mxe/releases" -ForegroundColor Yellow
    $errors++
}
Write-Host ""

# Test 2: Check input file
Write-Host "[2/4] Checking input artwork..." -ForegroundColor Yellow
$inputFile = "assets\source\ZEBRA_for_MVP.tiff"

if (Test-Path $inputFile) {
    $fileInfo = Get-Item $inputFile
    $sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
    Write-Host "✓ Found input file: $($fileInfo.Name) ($sizeMB MB)" -ForegroundColor Green
} else {
    Write-Host "✗ Input file not found: $inputFile" -ForegroundColor Red
    $errors++
}
Write-Host ""

# Test 3: Check Node.js setup
Write-Host "[3/4] Checking Node.js environment..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-Host "✓ Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "✓ npm: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js or npm not found" -ForegroundColor Red
    $errors++
}
Write-Host ""

# Test 4: Check project dependencies
Write-Host "[4/4] Checking project dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    $requiredDeps = @("openseadragon", "solid-js", "rbush", "howler")
    $missingDeps = @()
    
    foreach ($dep in $requiredDeps) {
        if (-not (Test-Path "node_modules\$dep")) {
            $missingDeps += $dep
        }
    }
    
    if ($missingDeps.Count -eq 0) {
        Write-Host "✓ All required dependencies installed" -ForegroundColor Green
    } else {
        Write-Host "✗ Missing dependencies: $($missingDeps -join ', ')" -ForegroundColor Red
        Write-Host "  Run: npm install" -ForegroundColor Yellow
        $errors++
    }
} else {
    Write-Host "✗ node_modules not found" -ForegroundColor Red
    Write-Host "  Run: npm install" -ForegroundColor Yellow
    $errors++
}
Write-Host ""

# Summary
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " TEST RESULTS" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

if ($errors -eq 0) {
    Write-Host "✨ All tests passed! Your setup is ready." -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now run:" -ForegroundColor Yellow
    Write-Host "  npm run tiles     - Generate tiles for the zebra artwork" -ForegroundColor White
    Write-Host "  npm run dev       - Start the development server" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "❌ Found $errors issue(s). Please fix them before proceeding." -ForegroundColor Red
    Write-Host ""
}

Read-Host "Press Enter to close"