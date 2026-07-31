# Environnement AirSDK - Iaido is Back

## Structure du projet
```
IIB_AS_HARMAN_TEST/
├── src/              # Code source ActionScript
│   └── Main.as      # Point d'entrée principal
├── lib/              # Bibliothèques externes (.swc)
├── bin/              # Fichiers compilés (.swf, .exe, .apk)
├── assets/           # Ressources (images, sons, etc.)
├── project.xml       # Configuration AIR
├── build.bat        # Script de compilation Windows
├── build.sh         # Script de compilation Linux/Mac
└── README.md
```

## Prérequis

### 1. Télécharger Adobe AIR SDK
- **Version recommandée**: AIR 33.1 ou supérieur
- Téléchargement: https://airsdk.dev/
- Placer le dossier `AIRSDK` dans ce répertoire ou configurer le chemin dans `build.bat`

### 2. Outils supplémentaires (optionnels)
- **Apache Ant** pour les builds automatisés
- **Java JRE** (requis pour AIR SDK)

## Configuration

Modifier `build.bat` pour pointer vers votre installation AIR SDK:
```
set AIR_SDK=C:\chemin\vers\AIRSDK
```

## Compilation

### Windows
```
build.bat
```

### Linux/Mac
```
chmod +x build.sh
./build.sh
```

## Fichiers générés
- `bin/ProjectName.swf` - Application SWF
- `bin/ProjectName.exe` - Installateur Windows (AIR)
- `bin/ProjectName.air` - Package AIR

## Notes
- Ce projet utilise ActionScript 3.0
- Compatible avec Adobe AIR pour desktop (Windows, macOS) et mobile (Android, iOS)
- Nécessite un certificat de signature pour la publication
