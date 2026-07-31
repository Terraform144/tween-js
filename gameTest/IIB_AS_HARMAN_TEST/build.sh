#!/bin/bash

# ============================================
# Script de compilation AIR SDK - Linux/Mac
# Iaido is Back - Game Test
# ============================================

# Chemin vers AIR SDK - Lien symbolique vers /f/_APP/AIRSDK_Windows
AIR_SDK="./AIRSDK"

# Vérification AIR SDK
if [ ! -f "$AIR_SDK/bin/adl" ]; then
    echo "ERREUR: AIR SDK non trouvé à: $AIR_SDK"
    echo "Téléchargez-le depuis https://airsdk.dev/"
    exit 1
fi

# Configuration
PROJECT_NAME="IIB_AS_HARMAN_TEST"
MAIN_CLASS="Main"
OUTPUT_DIR="bin"
SOURCE_DIR="src"
ASSETS_DIR="assets"
LIB_DIR="lib"

# Créer le répertoire de sortie
mkdir -p "$OUTPUT_DIR"

# Compilation du SWF
echo "[1/3] Compilation du SWF..."
"$AIR_SDK/bin/amxmlc" \
    -file-specs="$SOURCE_DIR/$MAIN_CLASS.as" \
    -output="$OUTPUT_DIR/$PROJECT_NAME.swf" \
    -debug=false \
    -optimize=true \
    -static-link-runtime-shared-libraries=true

if [ $? -ne 0 ]; then
    echo "ERREUR: Échec de la compilation SWF"
    exit 1
fi

# Packaging AIR
echo "[2/3] Création du package AIR..."
"$AIR_SDK/bin/adt" \
    -package \
    -target native \
    "$OUTPUT_DIR/$PROJECT_NAME.exe" \
    project.xml \
    "$OUTPUT_DIR/$PROJECT_NAME.swf" \
    -C "$ASSETS_DIR" .

if [ $? -ne 0 ]; then
    echo "ERREUR: Échec du packaging AIR"
    exit 1
fi

echo "[3/3] Compilation terminée avec succès !"
echo ""
echo "Fichiers générés dans $OUTPUT_DIR/ :"
echo "  - $PROJECT_NAME.swf"
echo "  - $PROJECT_NAME.exe"
echo ""
