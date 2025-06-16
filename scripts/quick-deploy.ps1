# Quick deploy script - simplified version
# Run this whenever you want to update the test version for Deji

Write-Host "🚀 Quick Deploy to Netlify" -ForegroundColor Cyan
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