# Iaido is back - Demo Canard

Demo d'animation du **Canard** pour le dungeon crawler "Iaido is back" inspire de Dungeon Master (1987).

## Structure

```
gameTest/
├── canard.js             # Donnees originales du Canard (exporte CanardClip)
├── animate-runtime.js   # Runtime MovieClip (copie de tween-runtime.js)
├── tween-runtime.js      # Runtime MovieClip (copie de games/iib/)
├── iib-creatures.json    # Donnees des 4 creatures (Gobelin, Squelette, Orc, Dragonnet)
├── index.html            # Page de demo du Canard (autonome, pas besoin de serveur)
└── README.md             # Ce fichier
```

## La creature Canard

Le canard est compose de :
- **Corps** : Ellipse verte (#2a7473) qui se deforme
- **Bec** : Rectangle orange (#cb4b16) qui bouge
- **24 frames** d'animation en loop avec morphing fluide

L'animation fait :
- Frame 0-11 : Le corps s'aplatit et le bec s'allonge
- Frame 12-21 : Le corps s'etire horizontalement et le bec se rabat
- Frame 22-23 : Retour a la position initiale

## Lancer la demo

**Ouvre simplement `index.html` dans ton navigateur !**

Le fichier index.html est autonome et fonctionne sans serveur web.

## Controles

- **Flèches / WASD** : Deplacer le canard

## Notes

- Le fichier `canard.js` original utilise des modules ES6 et depend de `animate-runtime.js`
- L'index.html actuel contient une version autonomes des donnees et du runtime
- Pour utiliser `canard.js` avec des modules, il faudrait un serveur web (Vite, etc.)

## Controles

- **Flèches / WASD** : Deplacer le Gobelin
- **Espace** : Attaquer (animation d'attaque)

## Pour integrer dans ton jeu

```javascript
import { MovieClip, createMovieClip } from './tween-runtime.js';
import gameData from './iib-creatures.json';

// Creer un Gobelin
const goblinData = {
  frameRate: gameData.stage.frameRate,
  frameCount: gameData.symbols.goblin_mc.frameCount,
  layers: gameData.symbols.goblin_mc.layers,
  frameLabels: gameData.symbols.goblin_mc.frameLabels,
  symbols: gameData.symbols,
  width: gameData.stage.width,
  height: gameData.stage.height,
};

const goblin = createMovieClip(goblinData, { x: 100, y: 100 });
goblin.gotoAndPlay('idle');

// Dans la boucle de jeu
goblin.update(deltaTime);
goblin.draw(ctx);
```

## Les 4 creatures disponibles

| ID | Nom | Taille | Animations | Proprietes |
|----|-----|--------|------------|------------|
| `goblin_mc` | Gobelin | 30x45 | idle, attack | Vie:20, Atq:5, Def:2, Vitesse:8 |
| `skeleton_mc` | Squelette | 25x40 | idle, attack | Vie:35, Atq:8, Def:5, Vitesse:4 |
| `orc_mc` | Orc | 45x65 | idle, attack | Vie:60, Atq:15, Def:8, Vitesse:5 |
| `drake_mc` | Dragonnet | 40x85 | idle, fly, attack | Vie:100, Atq:25, Def:5, Vitesse:10, Volant |
