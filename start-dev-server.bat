@echo off
REM Script pour lancer le serveur de developpement
REM Double-cliquez sur ce fichier pour demarrer

echo ========================================
echo  DEMARRAGE DU SERVEUR DE DEVELOPPEMENT
echo ========================================
echo.

echo Verification de Node.js...
node --version
npm --version
echo.

echo Demarrage du serveur...
echo Le site sera disponible sur: http://localhost:5173
echo.
echo Appuyez sur Ctrl+C pour arreter le serveur
echo ========================================
echo.

REM Lancer le serveur
npm run dev