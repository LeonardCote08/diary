# Deploy to Netlify via production repository
# This script builds the project and pushes to a separate production repo
# Now includes Web Worker support

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " DEPLOY TO NETLIFY" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Store current location
$originalLocation = Get-Location

# Configuration
$productionRepoPath = "C:\Users\Utilisateur\Leo\diary-production"  # Adjust path as needed
$productionRepoUrl = "https://github.com/LeonardCote08/diary-production"  # Update with your repo

# Check if production repo exists
if (-not (Test-Path $productionRepoPath)) {
    Write-Host "Production repository not found. Setting up..." -ForegroundColor Yellow
    
    # Clone or create production repo
    Write-Host "Enter the URL of your production repository:" -ForegroundColor Cyan
    Write-Host "(Create an empty repo on GitHub first)" -ForegroundColor Gray
    $repoUrl = Read-Host "Repository URL"
    
    if ($repoUrl) {
        $productionRepoUrl = $repoUrl
    }
    
    # Clone the repo
    git clone $productionRepoUrl $productionRepoPath
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to clone repository. Creating new one..." -ForegroundColor Yellow
        New-Item -ItemType Directory -Path $productionRepoPath -Force
        Push-Location $productionRepoPath
        git init
        git remote add origin $productionRepoUrl
        Pop-Location
    }
}

# Check for Web Worker
Write-Host ""
Write-Host "Checking for Web Worker..." -ForegroundColor Yellow
$hasWebWorker = Test-Path "public\tile-worker.js"
if ($hasWebWorker) {
    Write-Host "✓ Web Worker found - will be included in deployment" -ForegroundColor Green
} else {
    Write-Host "⚠ Web Worker not found - performance will be reduced" -ForegroundColor Yellow
    Write-Host "  To enable Web Worker, place tile-worker.js in public/" -ForegroundColor Gray
}

# Build the project
Write-Host ""
Write-Host "Building project..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Build complete" -ForegroundColor Green

# Copy build files to production repo
Write-Host ""
Write-Host "Copying files to production repository..." -ForegroundColor Yellow

# Clean production repo (except .git)
Get-ChildItem $productionRepoPath -Exclude ".git" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Copy dist files
Copy-Item -Path "dist\*" -Destination $productionRepoPath -Recurse -Force

# Copy public files (including tiles)
Write-Host "Copying public assets (this may take a moment)..." -ForegroundColor Yellow
Copy-Item -Path "public\*" -Destination "$productionRepoPath\" -Recurse -Force

# Special handling for Web Worker
if ($hasWebWorker) {
    Write-Host "Ensuring Web Worker is in root directory..." -ForegroundColor Yellow
    # Copy to root as well (some configurations need it there)
    Copy-Item -Path "public\tile-worker.js" -Destination "$productionRepoPath\tile-worker.js" -Force
    Write-Host "✓ Web Worker copied" -ForegroundColor Green
}

# Create netlify.toml for SPA routing
$netlifyConfig = @"
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build]
  publish = "."

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"
    
[[headers]]
  for = "*.js"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
    
[[headers]]
  for = "/tile-worker.js"
  [headers.values]
    Cache-Control = "public, max-age=3600"
"@

Set-Content -Path "$productionRepoPath\netlify.toml" -Value $netlifyConfig

# Create a simple README
$webWorkerStatus = if ($hasWebWorker) { "✓ Web Worker enabled" } else { "⚠ Web Worker not included" }
$readme = @"
# Interactive Art Diary - Production Build

This is the production build of the Interactive Art Diary project.

## Deployment

This repository is automatically deployed to Netlify when changes are pushed to the main branch.

**Live URL**: [Your Netlify URL will appear here after first deployment]

## Build Info

- **Last updated**: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
- **Web Worker**: $webWorkerStatus
- **Tile size**: 1024px
- **Performance**: Optimized for 60 FPS

## Important

- This is an auto-generated repository
- Do not edit files directly here
- All changes should be made in the development repository
"@

Set-Content -Path "$productionRepoPath\README.md" -Value $readme

# Store current location
$originalLocation = Get-Location

# Git operations in production repo
Write-Host ""
Write-Host "Committing changes..." -ForegroundColor Yellow

Set-Location $productionRepoPath

# Pull latest changes first to avoid conflicts
Write-Host "Pulling latest changes from remote..." -ForegroundColor Yellow
git pull origin main --rebase

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠ Pull failed - attempting to continue anyway" -ForegroundColor Yellow
}

# Add all files
git add -A

# Commit with timestamp and Web Worker status
$workerStatus = if ($hasWebWorker) { " [+WebWorker]" } else { "" }
$commitMessage = "Deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')$workerStatus"
git commit -m $commitMessage

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Changes committed" -ForegroundColor Green
    
    # Push to remote
    Write-Host ""
    Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
    git push origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Successfully pushed to GitHub" -ForegroundColor Green
        Write-Host ""
        Write-Host "======================================" -ForegroundColor Cyan
        Write-Host " ✨ DEPLOYMENT COMPLETE! ✨" -ForegroundColor Cyan
        Write-Host "======================================" -ForegroundColor Cyan
        Write-Host ""
        
        # Performance status
        if ($hasWebWorker) {
            Write-Host "🚀 Web Worker enabled - maximum performance!" -ForegroundColor Green
        } else {
            Write-Host "⚠ Web Worker not included - consider adding for better performance" -ForegroundColor Yellow
        }
        
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "1. Go to netlify.com and connect your production repo" -ForegroundColor White
        Write-Host "2. Netlify will auto-deploy whenever you run this script" -ForegroundColor White
        Write-Host "3. Share the Netlify URL with Deji" -ForegroundColor White
        
        if ($hasWebWorker) {
            Write-Host ""
            Write-Host "Web Worker status:" -ForegroundColor Cyan
            Write-Host "- Press 'W' in the viewer to check worker status" -ForegroundColor Gray
            Write-Host "- Check browser console for initialization messages" -ForegroundColor Gray
        }
    } else {
        Write-Host "✗ Push failed" -ForegroundColor Red
        Write-Host "You may need to set up authentication or push manually" -ForegroundColor Yellow
    }
} else {
    Write-Host "No changes to deploy" -ForegroundColor Yellow
}

# Return to original directory
Set-Location $originalLocation

Write-Host ""
Read-Host "Press Enter to close"