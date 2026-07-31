@echo off
chcp 65001 > nul

:: ============================================
:: Script de compilation AIR SDK - Windows
:: Iaido is Back - Game Test
:: ============================================

SETLOCAL

:: Chemin vers AIR SDK - Lien symbolique vers F:/_APP/AIRSDK_Windows
set AIR_SDK=.\AIRSDK

:: Vérification AIR SDK
if not exist "%AIR_SDK%\bin\adl.exe" (
    echo ERREUR: AIR SDK non trouve a: %AIR_SDK%
    echo Telechargez-le depuis https://airsdk.dev/
    pause
    exit /b 1
)

:: Configuration
set PROJECT_NAME=IIB_AS_HARMAN_TEST
set MAIN_CLASS=Main
set OUTPUT_DIR=bin
set SOURCE_DIR=src
set ASSETS_DIR=assets
set LIB_DIR=lib

:: Créer le répertoire de sortie
if not exist %OUTPUT_DIR% mkdir %OUTPUT_DIR%

:: Compilation du SWF
echo [1/3] Compilation du SWF...
"%AIR_SDK%\bin\amxmlc" \
    -file-specs=%SOURCE_DIR%\%MAIN_CLASS%.as \
    -output=%OUTPUT_DIR%\%PROJECT_NAME%.swf \
    -debug=false \
    -optimize=true \
    -static-link-runtime-shared-libraries=true

if errorlevel 1 (
    echo ERREUR: Echec de la compilation SWF
    pause
    exit /b 1
)

:: Packaging AIR
echo [2/3] Creation du package AIR...
"%AIR_SDK%\bin\adt" \
    -package \
    -target native \
    %OUTPUT_DIR%\%PROJECT_NAME%.exe \
    project.xml \
    %OUTPUT_DIR%\%PROJECT_NAME%.swf \
    -C %ASSETS_DIR% .

if errorlevel 1 (
    echo ERREUR: Echec du packaging AIR
    pause
    exit /b 1
)

echo [3/3] Compilation terminee avec succes !
echo.
echo Fichiers generes dans %OUTPUT_DIR%\ :
echo   - %PROJECT_NAME%.swf
echo   - %PROJECT_NAME%.exe
echo.
pause
