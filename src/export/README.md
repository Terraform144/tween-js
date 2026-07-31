# TweenJS Runtime - API CreateJS-like

Le runtime TweenJS fournit une API similaire à **CreateJS/EaselJS** pour manipuler les animations exportées depuis l'éditeur TweenJS dans vos jeux vidéo.

## Installation

Le runtime est **sans dépendance** et autonome. Il suffit d'importer le fichier `tweenRuntime.js` :

```javascript
import { MovieClip, createMovieClip } from './tweenRuntime.js';
```

Ou avec un script HTML :

```html
<script src="tweenRuntime.js"></script>
```

## Utilisation de base

### 1. Exporter depuis TweenJS

Dans l'éditeur TweenJS :
1. Créez votre animation avec des symboles
2. Dans le panneau Bibliothèque, cliquez sur "Exporter" 
3. Sélectionnez "Exporter comme objet de jeu JS"
4. Le fichier généré contient votre symbole comme une classe étendant `MovieClip`

### 2. Utiliser dans votre jeu

```javascript
// Importez le runtime
import { MovieClip, createMovieClip } from './tweenRuntime.js';

// Importez vos données d'animation exportées
import PLAYER_DATA from './Player.json';

// Créez un canvas
const canvas = document.createElement('canvas');
canvas.width = 800;
canvas.height = 600;
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

// Créez votre MovieClip
const player = createMovieClip(PLAYER_DATA, {
  x: 400,
  y: 300,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  loop: true,
  isPlaying: true
});

// Boucle de jeu
let lastTime = performance.now();
function gameLoop(timestamp) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;
  
  // Mettre à jour les MovieClips
  player.update(dt);
  
  // Dessiner
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  player.draw(ctx);
  
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
```

## API MovieClip

### Propriétés

| Propriété | Type | Description |
|-----------|------|-------------|
| `x` | number | Position X en pixels |
| `y` | number | Position Y en pixels |
| `rotation` | number | Rotation en degrés (0 = droite, 90 = bas) |
| `scaleX` | number | Échelle horizontale (1 = taille normale) |
| `scaleY` | number | Échelle verticale (1 = taille normale) |
| `opacity` | number | Opacité (0 = transparent, 1 = opaque) |
| `visible` | boolean | Visibilité |
| `currentFrame` | number | Frame actuelle (lecture seule) |
| `frameCount` | number | Nombre total de frames (lecture seule) |
| `isPlaying` | boolean | Est-ce que l'animation joue ? |
| `loop` | boolean | Boucle l'animation ? |
| `name` | string | Nom de l'instance |

### Méthodes

| Méthode | Description |
|---------|-------------|
| `play()` | Lance la lecture de l'animation |
| `stop()` | Arrête la lecture de l'animation |
| `gotoAndPlay(frameOrLabel)` | Va à la frame ou label spécifié et lance la lecture |
| `gotoAndStop(frameOrLabel)` | Va à la frame ou label spécifié et arrête la lecture |
| `addEventListener(type, callback)` | Ajoute un écouteur d'événement |
| `removeEventListener(type, callback)` | Retire un écouteur d'événement |

### Événements

| Type | Description |
|------|-------------|
| `'loop'` | Déclenché quand l'animation boucle (quand elle revient à la frame 0) |
| `'complete'` | Déclenché quand l'animation atteint la fin sans boucle |

## Exemple complet avec contrôles

```javascript
import { createMovieClip } from './tweenRuntime.js';
import PLAYER_DATA from './Player.json';

const canvas = document.createElement('canvas');
canvas.width = 800;
canvas.height = 600;
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

// Créer le personnage
const player = createMovieClip(PLAYER_DATA, {
  x: 400,
  y: 300,
  loop: true,
  isPlaying: true
});

// Écouter les événements
player.addEventListener('loop', () => {
  console.log('Animation bouclée!');
});

player.addEventListener('complete', () => {
  console.log('Animation terminée!');
});

// Variables de jeu
let lastTime = performance.now();
const keys = {};

// Gestion des touches
document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  
  if (e.key === ' ') {
    player.gotoAndPlay('jump');
  }
  if (e.key === 'ArrowRight') {
    player.gotoAndPlay('walk');
    player.scaleX = 1;
  }
  if (e.key === 'ArrowLeft') {
    player.gotoAndPlay('walk');
    player.scaleX = -1; // Retourner le sprite
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    player.gotoAndStop('idle');
  }
});

// Boucle de jeu
function gameLoop(timestamp) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;
  
  // Déplacer le personnage
  if (keys['ArrowRight']) {
    player.x += 5;
  }
  if (keys['ArrowLeft']) {
    player.x -= 5;
  }
  
  // Mettre à jour
  player.update(dt);
  
  // Dessiner
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  player.draw(ctx);
  
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
```

## Symboles imbriqués

Les MovieClips peuvent contenir d'autres MovieClips (symboles imbriqués). Le runtime gère cela automatiquement :

```javascript
import { createMovieClip } from './tweenRuntime.js';
import CHARACTER_DATA from './Character.json'; // Contient des symboles imbriqués

const character = createMovieClip(CHARACTER_DATA, {
  x: 100,
  y: 100
});

// Tous les MovieClips enfants sont automatiquement créés et mis à jour
// Vous pouvez accéder aux instances enfants par leur nom
// (si vous avez exporté avec des noms d'instance dans TweenJS)
```

## Labels de frame

Dans TweenJS, vous pouvez ajouter des labels à vos frames. Utilisez-les dans votre code :

```javascript
// Aller au label "attack" et jouer
player.gotoAndPlay('attack');

// Aller au label "idle" et s'arrêter
player.gotoAndStop('idle');

// Aller à la frame 10
player.gotoAndPlay(10);
```

## Performance

- Le runtime est **léger** (~300 lignes de code)
- **Aucune dépendance externe**
- Optimisé pour les jeux avec beaucoup d'instances
- Seules les frames visibles sont dessiner

## Différences avec CreateJS/EaselJS

| Fonctionnalité | TweenJS Runtime | CreateJS |
|---------------|-----------------|----------|
| MovieClip | ✅ | ✅ |
| Timeline | ✅ (par MovieClip) | ✅ |
| play/stop | ✅ | ✅ |
| gotoAndPlay | ✅ | ✅ |
| Événements | ✅ (loop, complete) | ✅ |
| Stage/Container | ❌ | ✅ |
| Draw automatique | ❌ (manuel) | ✅ (automatique) |
| Update automatique | ❌ (manuel) | ✅ (via Ticker) |
| Filtres | ❌ | ✅ |
| Masques | ❌ | ✅ |

> **Note** : Le runtime TweenJS est conçu pour être **simple et léger**. Pour des fonctionnalités avancées (filtres, masques, etc.), utilisez CreateJS directement.

## Contribuer

Le runtime est dans `src/export/tweenRuntime.js`. Les contributions sont les bienvenues pour :
- Ajouter de nouvelles fonctionnalités
- Améliorer les performances
- Corriger des bugs

Voir [tweenRuntime.js](../export/tweenRuntime.js) pour le code source.
