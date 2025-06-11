# Guide des Commandes Windows PowerShell

## Configuration initiale

### 1. Ouvrir Windows Terminal (PowerShell)
- Appuyez sur `Win + X` puis `I` ou `A` pour ouvrir PowerShell
- Ou recherchez "Windows Terminal" dans le menu Démarrer

### 2. Naviguer vers votre projet
```powershell
cd C:\Users\VotreNom\diary
# ou
cd "C:\Chemin vers\votre projet\diary"
```

### 3. Exécuter le script de configuration
```powershell
# Autoriser l'exécution de scripts (une seule fois)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Exécuter le script de setup
.\setup-windows.ps1
```

## Commandes principales

### Installer les dépendances
```powershell
npm install
```

### Générer les tiles optimisées
```powershell
# Nettoyer les anciennes tiles
npm run clean-tiles

# Générer les nouvelles tiles
npm run generate-tiles

# Ou tout faire en une commande
npm run regenerate-tiles
```

### Lancer le serveur de développement
```powershell
npm run dev
```

### Compiler pour la production
```powershell
npm run build
```

## Commandes utiles PowerShell

### Créer des dossiers
```powershell
# Créer un seul dossier
New-Item -ItemType Directory -Path "src/config"

# Créer plusieurs dossiers
New-Item -ItemType Directory -Force -Path "src/config", "src/utils", "public/data"
```

### Supprimer des fichiers/dossiers
```powershell
# Supprimer un dossier et son contenu
Remove-Item -Path "public/images/tiles/zebra" -Recurse -Force

# Supprimer avec gestion d'erreur si n'existe pas
Remove-Item -Path "public/images/tiles/*" -Recurse -Force -ErrorAction SilentlyContinue
```

### Copier des fichiers
```powershell
# Copier un fichier
Copy-Item -Path "source.js" -Destination "dest.js"

# Copier un dossier entier
Copy-Item -Path "src" -Destination "backup/src" -Recurse
```

### Vérifier si un fichier/dossier existe
```powershell
# Test simple
Test-Path "src/config/performanceConfig.js"

# Avec condition
if (Test-Path "public/images/tiles/zebra") {
    Write-Host "Les tiles existent"
} else {
    Write-Host "Les tiles n'existent pas"
}
```

### Lister le contenu d'un dossier
```powershell
# Liste simple
Get-ChildItem "public/images/tiles"

# Liste détaillée
Get-ChildItem "public/images/tiles" -Recurse

# Alias court (comme 'ls' sur Linux)
ls "public/images/tiles"
dir "public/images/tiles"
```

### Voir le contenu d'un fichier
```powershell
# Afficher tout le contenu
Get-Content "package.json"

# Alias court
cat "package.json"
type "package.json"

# Voir les 10 premières lignes
Get-Content "package.json" -Head 10

# Voir les 10 dernières lignes
Get-Content "package.json" -Tail 10
```

## Dépannage

### Si les scripts PowerShell ne s'exécutent pas
```powershell
# Vérifier la politique d'exécution
Get-ExecutionPolicy

# Autoriser les scripts locaux
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Si npm n'est pas reconnu
1. Vérifiez que Node.js est installé :
   ```powershell
   node --version
   npm --version
   ```

2. Si non installé, téléchargez depuis : https://nodejs.org/

3. Après installation, fermez et rouvrez Windows Terminal

### Problèmes de permissions
```powershell
# Lancer PowerShell en administrateur
# Clic droit sur Windows Terminal > "Exécuter en tant qu'administrateur"
```

### Nettoyer le cache npm
```powershell
npm cache clean --force
```

## Workflow complet pour les optimisations

1. **Ouvrir Windows Terminal**

2. **Naviguer vers le projet**
   ```powershell
   cd "C:\votre\chemin\diary"
   ```

3. **Créer la structure**
   ```powershell
   .\setup-windows.ps1
   ```

4. **Copier les fichiers modifiés** (manuellement)

5. **Régénérer les tiles**
   ```powershell
   npm run regenerate-tiles
   ```

6. **Lancer le serveur**
   ```powershell
   npm run dev
   ```

7. **Ouvrir dans le navigateur**
   - http://localhost:5173

## Raccourcis Windows Terminal

- `Ctrl + Shift + T` : Nouvel onglet
- `Ctrl + Tab` : Changer d'onglet
- `Ctrl + C` : Arrêter le processus en cours
- `Ctrl + L` : Effacer l'écran (ou `Clear`)
- `Tab` : Auto-complétion des chemins
- `↑` / `↓` : Naviguer dans l'historique des commandes

## Variables d'environnement utiles

```powershell
# Voir le chemin actuel
$PWD
pwd

# Voir le chemin du dossier utilisateur
$HOME
$env:USERPROFILE

# Créer un alias temporaire
Set-Alias tiles "npm run regenerate-tiles"
```