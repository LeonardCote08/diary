@echo off
REM Script pour regenerer les tiles sur Windows
REM Double-cliquez sur ce fichier pour l'executer

echo ========================================
echo  REGENERATION DES TILES OPTIMISEES
echo ========================================
echo.

REM Nettoyer les anciennes tiles
echo [1/3] Nettoyage des anciennes tiles...
if exist "public\images\tiles\zebra" (
    rmdir /s /q "public\images\tiles\zebra"
    echo       Tiles supprimees
) else (
    echo       Aucune tile a nettoyer
)
echo.

REM Generer les nouvelles tiles
echo [2/3] Generation des nouvelles tiles...
call npm run generate-tiles
echo.

REM Message de fin
echo [3/3] Termine!
echo.
echo ========================================
echo  Les tiles ont ete regenerees avec succes
echo  Vous pouvez maintenant lancer: npm run dev
echo ========================================
echo.

REM Garder la fenetre ouverte
pause