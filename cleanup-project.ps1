# PowerShell cleanup script to remove unnecessary files
# Run this from the project root directory

Write-Host "========================================"
Write-Host " CLEANING UP UNUSED FILES"
Write-Host "========================================"
Write-Host ""

# Remove old Canvas-based renderer files
Write-Host "[1/3] Removing old Canvas-based files..." -ForegroundColor Yellow

$canvasFiles = @(
    "src\core\HotspotRenderer.js",
    "src\core\InteractionManager.js"
)

foreach ($file in $canvasFiles) {
    if (Test-Path $file) {
        Remove-Item $file
        Write-Host "      ✓ Removed $file" -ForegroundColor Green
    }
}

# Remove empty component files
Write-Host "[2/3] Removing empty component files..." -ForegroundColor Yellow

$emptyComponents = @(
    "src\components\AudioPlayer.jsx",
    "src\components\NavigationMenu.jsx",
    "src\components\PlaybackModes.jsx"
)

foreach ($file in $emptyComponents) {
    if (Test-Path $file) {
        Remove-Item $file
        Write-Host "      ✓ Removed $file" -ForegroundColor Green
    }
}

# Remove empty utility files
Write-Host "[3/3] Removing empty utility files..." -ForegroundColor Yellow

$emptyUtils = @(
    "src\utils\deepLinking.js",
    "src\utils\imageProcessing.js",
    "src\utils\performanceMonitor.js"
)

foreach ($file in $emptyUtils) {
    if (Test-Path $file) {
        Remove-Item $file
        Write-Host "      ✓ Removed $file" -ForegroundColor Green
    }
}

# Remove empty utils folder if empty
if (Test-Path "src\utils") {
    $utilsContent = Get-ChildItem "src\utils"
    if ($utilsContent.Count -eq 0) {
        Remove-Item "src\utils"
        Write-Host "      ✓ Removed empty utils folder" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host " ✨ Cleanup complete!"
Write-Host "========================================"
Write-Host ""
Write-Host "Remaining core files:" -ForegroundColor Cyan
Write-Host " - ArtworkViewer.jsx"
Write-Host " - NativeHotspotRenderer.js"
Write-Host " - SpatialIndex.js"
Write-Host " - ViewportManager.js"
Write-Host " - AudioEngine.js"
Write-Host " - performanceConfig.js"
Write-Host ""

Read-Host "Press Enter to close"