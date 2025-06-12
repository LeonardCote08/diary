# Quick high-quality tile generation
# One-liner approach for simplicity

$vips = "$env:LOCALAPPDATA\vips-dev-8.16\bin\vips.exe"
if (-not (Test-Path $vips)) {
    Write-Host "VIPS not found!" -ForegroundColor Red
    exit
}

Write-Host "Generating high-quality tiles..." -ForegroundColor Cyan

# Clean old tiles
Remove-Item -Path "public\images\tiles\zebra" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "public\images\tiles\zebra" -Force | Out-Null

# Generate tiles (256px, 95% quality)
& $vips dzsave "assets\source\ZEBRA_for_MVP.tiff" "public\images\tiles\zebra\zebra" --tile-size 256 --overlap 2 --suffix ".jpg[Q=95]"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Success! Tiles generated." -ForegroundColor Green
    
    # Generate preview
    & $vips thumbnail "assets\source\ZEBRA_for_MVP.tiff" "public\images\tiles\zebra\preview.jpg" 2048
    
    Write-Host "Ready to run: npm run dev" -ForegroundColor Yellow
} else {
    Write-Host "✗ Failed!" -ForegroundColor Red
}