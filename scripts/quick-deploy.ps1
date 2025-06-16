# Quick deploy script - simplified version
# Run this whenever you want to update the test version for Deji
# Now includes Web Worker status check

Write-Host "🚀 Quick Deploy to Netlify" -ForegroundColor Cyan
Write-Host ""

# Check Web Worker status
$hasWebWorker = Test-Path "public\tile-worker.js"
if ($hasWebWorker) {
    Write-Host "✓ Web Worker detected - performance optimized!" -ForegroundColor Green
} else {
    Write-Host "⚠ No Web Worker found - running without background processing" -ForegroundColor Yellow
    Write-Host "  Add tile-worker.js to public/ for better zoom performance" -ForegroundColor Gray
}
Write-Host ""

# Build
Write-Host "Building project..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

# Deploy
Write-Host "Deploying..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File scripts\deploy-to-netlify.ps1

Write-Host ""
Write-Host "✅ Deploy complete!" -ForegroundColor Green

if ($hasWebWorker) {
    Write-Host "🎯 Web Worker included in deployment" -ForegroundColor Cyan
}