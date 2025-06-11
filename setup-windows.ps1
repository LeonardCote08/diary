# Setup script for Windows PowerShell
# Interactive Art Diary - Performance Optimization Setup

Write-Host "🚀 Setting up Interactive Art Diary optimizations..." -ForegroundColor Cyan

# Create missing directories
Write-Host "`n📁 Creating directory structure..." -ForegroundColor Yellow

$directories = @(
    "src/config",
    "src/utils",
    "public/data",
    "public/images/tiles"
)

foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        Write-Host "  ✅ Created: $dir" -ForegroundColor Green
    } else {
        Write-Host "  ℹ️  Exists: $dir" -ForegroundColor Gray
    }
}

# Clean old tiles if they exist
Write-Host "`n🧹 Cleaning old tiles..." -ForegroundColor Yellow
$tilesPath = "public/images/tiles/zebra"
if (Test-Path $tilesPath) {
    Remove-Item -Path $tilesPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  ✅ Removed old tiles" -ForegroundColor Green
} else {
    Write-Host "  ℹ️  No old tiles to clean" -ForegroundColor Gray
}

# Display next steps
Write-Host "`n📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Copy all the modified files to your project" -ForegroundColor White
Write-Host "2. Make sure performanceConfig.js is in src/config/" -ForegroundColor White
Write-Host "3. Run: npm run generate-tiles" -ForegroundColor White
Write-Host "4. Run: npm run dev" -ForegroundColor White

Write-Host "`n✨ Setup complete!" -ForegroundColor Green
