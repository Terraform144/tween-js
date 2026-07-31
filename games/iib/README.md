# IIB - Jeu converti depuis SWF

Jeu converti depuis le fichier IIB.swf en utilisant le système de MovieClip de TweenJS.

## Structure

```
games/iib/
├── index.html           # Page HTML du jeu
├── main.js              # Code principal du jeu
├── tween-runtime.js     # Runtime MovieClip
├── iib-data.js          # Données du jeu (à remplir)
├── vite.config.js       # Configuration Vite
├── convert-from-editor.js # Outil de conversion
├── CONVERSION_GUIDE.md  # Guide de conversion
└── README.md             # Ce fichier
```

## Installation

```bash
# Depuis la racine du projet
cd games/iib

# Installer les dépendances (si nécessaire)
npm install
```

## Démarrage

```bash
# Démarrer le serveur de développement
npm run dev

# Ou depuis la racine du projet
cd games/iib && npm run dev
```

Le jeu sera accessible à l'adresse http://localhost:3000

## Build pour la production

```bash
npm run build
```

Les fichiers seront générés dans le dossier `dist/`.

## Fichiers à modifier

### iib-data.js

**C'est le fichier principal à remplir avec vos données.**

Il contient la structure complète de votre jeu :
- Taille de la scène et frame rate
- Tous les symboles (MovieClip/Graphic)
- La timeline principale avec les instances

Voir [CONVERSION_GUIDE.md](CONVERSION_GUIDE.md) pour des instructions détaillées.

### main.js

Contient la logique du jeu :
- Gestion des inputs (clavier, souris, tactile)
- Boucle de jeu (update/draw)
- Détection des collisions
- Système de score et de vie

Vous pouvez modifier ce fichier pour adapter le gameplay à votre jeu.

## Fonctionnalités disponibles

### MovieClip

La classe `MovieClip` supporte :
- `play()` / `stop()` - Contrôler la lecture
- `gotoAndPlay(frameOrLabel)` / `gotoAndStop(frameOrLabel)` - Aller à une frame
- `nextFrame()` / `prevFrame()` - Navigation frame par frame
- `addEventListener(type, fn)` - Événements : 'loop', 'complete', 'frameChanged'
- `update(dt)` - Mettre à jour (dt en millisecondes)
- `draw(ctx)` - Dessiner sur un contexte 2D
- `getBounds()` - Obtenir les limites (approximation)

### Types de symboles

- **movieclip** : Timeline indépendante, animations
- **graphic** : Synchronisé avec la timeline parente

### Types de formes

- `rect` - Rectangle
- `ellipse` - Ellipse/Cercle
- `line` - Ligne
- `path` - Chemin Bézier
- `text` - Texte

## Exemple de données

```javascript
// Dans iib-data.js
export const gameData = {
  stage: {
    width: 800,
    height: 600,
    frameRate: 24,
    backgroundColor: '#000000',
    frameCount: 100,
  },
  
  symbols: {
    'player_mc': {
      type: 'movieclip',
      name: 'Player',
      frameCount: 10,
      frameLabels: { 0: 'idle', 5: 'run' },
      layers: [/* ... */],
    },
  },
  
  mainTimeline: {
    layers: [/* ... */],
  },
};
```

## Conseils

1. **Commencez petit** : Extrayez d'abord un symbole simple
2. **Testez souvent** : Vérifiez chaque symbole dans le jeu
3. **Utilisez les labels** : Cela rend le code plus lisible
4. **Organisez vos layers** : Gardez une structure claire
5. **Backup** : Sauvegardez vos progrès régulièrement

## Conversion depuis l'éditeur TweenJS

Si vous utilisez l'éditeur principal pour recréer votre jeu :

1. Créez votre contenu dans l'éditeur
2. Exportez le document (Menu > Exporter > Document JSON)
3. Utilisez le script de conversion :

```bash
node convert-from-editor.js document-export.json iib-data.js
```

## Prochaines étapes

1. [ ] Extraire les données de IIB.swf
2. [ ] Remplir iib-data.js
3. [ ] Tester le rendu dans le navigateur
4. [ ] Adapter main.js à votre game design
5. [ ] Ajouter les fonctionnalités spécifiques

## Problèmes connus

- Les chemins Bézier complexes peuvent nécessiter des ajustements manuels
- Les sons ne sont pas encore supportés (à ajouter via Web Audio API)
- Les actions ActionScript doivent être réimplémentées en JavaScript

## Ressources

- [Documentation Konva.js](https://konvajs.org/) - Bibliothèque utilisée pour le rendu
- [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) - Pour le dessin personnalisé
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) - Pour ajouter le son

## Licence

Ce jeu utilise le runtime TweenJS sous licence AGPL-3.0.
