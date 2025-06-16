# Deploy to Netlify via production repository
# This script builds the project and pushes to a separate production repo

Write-Host "======================================" -ForegroundColor Cyan
Write-Host " DEPLOY TO NETLIFY" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$productionRepoPath = "..\diary-production"  # Adjust path as needed
$productionRepoUrl = "https://github.com/YOUR_USERNAME/diary-production.git"  # Update with your repo

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
        Set-Location $productionRepoPath
        git init
        git remote add origin $productionRepoUrl
        Set-Location -
    }
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
"@

Set-Content -Path "$productionRepoPath\netlify.toml" -Value $netlifyConfig

# Create a simple README
$readme = @"
# Interactive Art Diary - Production Build

This is the production build of the Interactive Art Diary project.

## Deployment

This repository is automatically deployed to Netlify when changes are pushed to the main branch.

**Live URL**: [Your Netlify URL will appear here after first deployment]

## Important

- This is an auto-generated repository
- Do not edit files directly here
- All changes should be made in the development repository

Last updated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

Set-Content -Path "$productionRepoPath\README.md" -Value $readme

# Git operations in production repo
Write-Host ""
Write-Host "Committing changes..." -ForegroundColor Yellow

Set-Location $productionRepoPath

# Add all files
git add -A

# Commit with timestamp
$commitMessage = "Deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
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
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "1. Go to netlify.com and connect your production repo" -ForegroundColor White
        Write-Host "2. Netlify will auto-deploy whenever you run this script" -ForegroundColor White
        Write-Host "3. Share the Netlify URL with Deji" -ForegroundColor White
    } else {
        Write-Host "✗ Push failed" -ForegroundColor Red
        Write-Host "You may need to set up authentication or push manually" -ForegroundColor Yellow
    }
} else {
    Write-Host "No changes to deploy" -ForegroundColor Yellow
}

# Return to original directory
Set-Location -

Write-Host ""
Read-Host "Press Enter to close"