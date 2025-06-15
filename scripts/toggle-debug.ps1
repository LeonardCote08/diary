# Toggle debug mode in performance config

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " TOGGLE DEBUG MODE" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$configFile = "src\config\performanceConfig.js"

if (-not (Test-Path $configFile)) {
    Write-Host "ERROR: Performance config file not found!" -ForegroundColor Red
    exit 1
}

# Read current config
$content = Get-Content $configFile -Raw

# Find current debug settings
if ($content -match "showFPS:\s*(true|false)") {
    $currentFPS = $matches[1] -eq "true"
    Write-Host "Current debug settings:" -ForegroundColor Yellow
    Write-Host "  Show FPS: $currentFPS" -ForegroundColor Gray
}

if ($content -match "showMetrics:\s*(true|false)") {
    $currentMetrics = $matches[1] -eq "true"
    Write-Host "  Show Metrics: $currentMetrics" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Select option:" -ForegroundColor Cyan
Write-Host "1. Enable debug mode (show FPS monitor)" -ForegroundColor White
Write-Host "2. Disable debug mode" -ForegroundColor White
Write-Host "3. Toggle current state" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Enter choice [1-3]"

switch ($choice) {
    "1" {
        # Enable debug
        $content = $content -replace "showFPS:\s*(true|false)", "showFPS: true"
        $content = $content -replace "showMetrics:\s*(true|false)", "showMetrics: true"
        $content = $content -replace "logPerformance:\s*(true|false)", "logPerformance: true"
        Write-Host ""
        Write-Host "✓ Debug mode ENABLED" -ForegroundColor Green
    }
    "2" {
        # Disable debug
        $content = $content -replace "showFPS:\s*(true|false)", "showFPS: false"
        $content = $content -replace "showMetrics:\s*(true|false)", "showMetrics: false"
        $content = $content -replace "logPerformance:\s*(true|false)", "logPerformance: false"
        Write-Host ""
        Write-Host "✓ Debug mode DISABLED" -ForegroundColor Green
    }
    "3" {
        # Toggle
        if ($currentFPS) {
            $content = $content -replace "showFPS:\s*(true|false)", "showFPS: false"
            $content = $content -replace "showMetrics:\s*(true|false)", "showMetrics: false"
            $content = $content -replace "logPerformance:\s*(true|false)", "logPerformance: false"
            Write-Host ""
            Write-Host "✓ Debug mode TOGGLED OFF" -ForegroundColor Green
        } else {
            $content = $content -replace "showFPS:\s*(true|false)", "showFPS: true"
            $content = $content -replace "showMetrics:\s*(true|false)", "showMetrics: true"
            $content = $content -replace "logPerformance:\s*(true|false)", "logPerformance: true"
            Write-Host ""
            Write-Host "✓ Debug mode TOGGLED ON" -ForegroundColor Green
        }
    }
    default {
        Write-Host "Invalid choice" -ForegroundColor Red
        exit 1
    }
}

# Save changes
Set-Content $configFile $content -NoNewline

Write-Host ""
Write-Host "Changes saved. Restart the dev server to apply." -ForegroundColor Yellow
Write-Host ""

Read-Host "Press Enter to close"