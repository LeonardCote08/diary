# Script de vérification de l'installation
# Interactive Art Diary - Performance Optimization

Write-Host "`n🔍 VERIFICATION DE L'INSTALLATION" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

$errors = 0

# Vérifier Node.js et npm
Write-Host "`n📦 Vérification de Node.js et npm..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-Host "  ✅ Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "  ✅ npm: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Node.js n'est pas installé!" -ForegroundColor Red
    Write-Host "     Téléchargez depuis: https://nodejs.org/" -ForegroundColor Gray
    $errors++
}

# Vérifier la structure des dossiers
Write-Host "`n📁 Vérification de la structure..." -ForegroundColor Yellow
$requiredDirs = @(
    "src/config",
    "src/components",
    "src/core",
    "src/utils",
    "public/data",
    "public/images/tiles",
    "scripts",
    "assets/source"
)

foreach ($dir in $requiredDirs) {
    if (Test-Path $dir) {
        Write-Host "  ✅ $dir" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $dir manquant" -ForegroundColor Red
        $errors++
    }
}

# Vérifier les fichiers critiques
Write-Host "`n📄 Vérification des fichiers essentiels..." -ForegroundColor Yellow
$requiredFiles = @(
    @{Path="package.json"; Desc="Configuration npm"},
    @{Path="vite.config.js"; Desc="Configuration Vite"},
    @{Path="src/App.jsx"; Desc="Application principale"},
    @{Path="src/config/performanceConfig.js"; Desc="Configuration performance"},
    @{Path="scripts/generate-tiles.js"; Desc="Script de génération"},
    @{Path="assets/source/ZEBRA_for_MVP.tiff"; Desc="Image source"}
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file.Path) {
        Write-Host "  ✅ $($file.Path) - $($file.Desc)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($file.Path) - $($file.Desc) MANQUANT!" -ForegroundColor Red
        $errors++
    }
}

# Vérifier les dépendances npm
Write-Host "`n📚 Vérification des dépendances..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    $packageJson = Get-Content "package.json" | ConvertFrom-Json
    $dependencies = @("solid-js", "openseadragon", "howler", "rbush")
    
    foreach ($dep in $dependencies) {
        if (Test-Path "node_modules/$dep") {
            Write-Host "  ✅ $dep installé" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $dep non installé" -ForegroundColor Red
            $errors++
        }
    }
} else {
    Write-Host "  ❌ node_modules manquant - Exécutez: npm install" -ForegroundColor Red
    $errors++
}

# Vérifier les tiles générées
Write-Host "`n🖼️  Vérification des tiles..." -ForegroundColor Yellow
$tilesPath = "public/images/tiles/zebra"
if (Test-Path $tilesPath) {
    $tilesCount = (Get-ChildItem $tilesPath -Recurse -File).Count
    if ($tilesCount -gt 0) {
        Write-Host "  ✅ $tilesCount tiles trouvées" -ForegroundColor Green
        
        # Vérifier la présence du preview
        if (Test-Path "$tilesPath/preview.jpg") {
            Write-Host "  ✅ Image preview présente" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  Preview manquant (les tiles anciennes doivent être régénérées)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ❌ Aucune tile trouvée" -ForegroundColor Red
        Write-Host "     Exécutez: npm run generate-tiles" -ForegroundColor Gray
        $errors++
    }
} else {
    Write-Host "  ⚠️  Tiles non générées" -ForegroundColor Yellow
    Write-Host "     Exécutez: npm run generate-tiles" -ForegroundColor Gray
}

# Vérifier les hotspots
Write-Host "`n🎯 Vérification des hotspots..." -ForegroundColor Yellow
if (Test-Path "public/data/hotspots.json") {
    try {
        $hotspots = Get-Content "public/data/hotspots.json" | ConvertFrom-Json
        $count = $hotspots.Count
        Write-Host "  ✅ $count hotspots trouvés" -ForegroundColor Green
    } catch {
        Write-Host "  ❌ Erreur lors de la lecture des hotspots" -ForegroundColor Red
        $errors++
    }
} else {
    Write-Host "  ❌ hotspots.json manquant" -ForegroundColor Red
    Write-Host "     Exécutez: npm run convert" -ForegroundColor Gray
    $errors++
}

# Résumé
Write-Host "`n=================================" -ForegroundColor Cyan
if ($errors -eq 0) {
    Write-Host "✅ TOUT EST PRÊT !" -ForegroundColor Green
    Write-Host "`nVous pouvez maintenant lancer:" -ForegroundColor White
    Write-Host "  npm run dev" -ForegroundColor Yellow
    Write-Host "`nOu double-cliquez sur:" -ForegroundColor White
    Write-Host "  start-dev-server.bat" -ForegroundColor Yellow
} else {
    Write-Host "❌ $errors PROBLÈME(S) DÉTECTÉ(S)" -ForegroundColor Red
    Write-Host "`nCorrigez les erreurs ci-dessus avant de continuer." -ForegroundColor White
    
    if (-not (Test-Path "node_modules")) {
        Write-Host "`n💡 Commencez par: npm install" -ForegroundColor Yellow
    }
}
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Informations système
Write-Host "📊 Informations système:" -ForegroundColor Gray
Write-Host "  OS: $([System.Environment]::OSVersion.VersionString)" -ForegroundColor Gray
Write-Host "  PowerShell: $($PSVersionTable.PSVersion)" -ForegroundColor Gray
Write-Host "  Dossier actuel: $PWD" -ForegroundColor Gray
Write-Host ""

# Garder la fenêtre ouverte si exécuté directement
if ($Host.Name -eq "ConsoleHost") {
    Write-Host "Appuyez sur une touche pour fermer..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}