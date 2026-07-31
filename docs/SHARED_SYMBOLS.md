# Symboles Partagés - TweenJS (.SWC-like)

> *Inspiré des fichiers .SWC (Shared Object) d'Adobe Flash/AnimateCC*

## Table des matières

1. [Introduction](#introduction)
2. [Concept](#concept)
3. [Format des fichiers](#format-des-fichiers)
4. [Structure des dossiers](#structure-des-dossiers)
5. [Création de symboles partagés](#création-de-symboles-partagés)
6. [Utilisation dans un projet](#utilisation-dans-un-projet)
7. [API du SymbolRegistry](#api-du-symbolregistry)
8. [Manifestes de symboles](#manifestes-de-symboles)
9. [Exemples complets](#exemples-complets)
10. [Bonnes pratiques](#bonnes-pratiques)
11. [Différences avec les .SWC](#différences-avec-les-swc)

---

## Introduction

Dans Adobe Flash et AnimateCC, les fichiers **`.SWC`** (prononcé "swick") étaient des archives binaires contenant des symboles compilés (MovieClips, Graphiques, Boutons, etc.) qui pouvaient être **réutilisés entre différents projets** sans avoir à recréer les assets.

TweenJS implémente un système similaire mais **basé sur JSON**, plus moderne et compatible avec l'écosystème JavaScript actuel.

---

## Concept

### Qu'est-ce qu'un symbole partagé dans TweenJS ?

Un **symbole partagé** est simplement un **fichier JSON** qui contient :

- ✅ La structure complète d'un symbole (layers, keyframes, éléments)
- ✅ Ses propriétés (frameRate, dimensions, labels)
- ✅ Ses sous-symboles si applicable
- ✅ Des métadonnées (nom, description, auteur, version)

### Avantages

| Avantage | Description |
|----------|-------------|
| **Réutilisabilité** | Un symbole créé une fois peut être utilisé dans tous vos projets |
| **Collaboration** | Partagez des bibliothèques de symboles avec votre équipe |
| **Modularité** | Séparez votre code en composants réutilisables |
| **Maintenance** | Mettez à jour un symbole une fois, profitez partout |
| **Versionnage** | Utilisez git ou npm pour versionner vos symboles |
| **Pas de dépendance** | Format JSON pur, aucune dépendance externe |

---

## Format des fichiers

### Symbole individuel (`NomDuSymbole.json`)

```json
{
  "id": "button_standard",
  "name": "Button",
  "type": "movieclip",
  "description": "Bouton standard avec 4 états",
  "frameRate": 24,
  "frameCount": 12,
  "width": 150,
  "height": 50,
  "frameLabels": {
    "0": "up",
    "4": "over", 
    "8": "down",
    "11": "disabled"
  },
  "layers": [
    {
      "id": "layer_1",
      "name": "Background",
      "visible": true,
      "keyframes": [...]
    }
  ],
  "symbols": {},
  "_shared": {
    "format": "tweenjs-shared-symbol",
    "version": "1.0",
    "author": "Votre Nom",
    "exportDate": "2026-07-31"
  }
}
```

### Manifeste (`manifest.json`)

```json
{
  "format": "tweenjs-shared-manifest",
  "version": "1.0",
  "name": "Ma Bibliothèque de Symboles",
  "author": "Votre Nom",
  "description": "Description de la bibliothèque",
  "exportDate": "2026-07-31",
  "symbols": [
    {
      "id": "button_standard",
      "name": "Button",
      "description": "Bouton standard",
      "url": "Button.json",
      "tags": ["ui", "button"],
      "frameCount": 12,
      "width": 150,
      "height": 50
    }
  ],
  "categories": {
    "ui": {
      "name": "Interface Utilisateur",
      "symbols": ["button_standard"]
    }
  }
}
```

---

## Structure des dossiers

```
projet-tweenjs/
├── src/
│   └── shared/                    # Dossier des symboles partagés
│       ├── Button.json           # Symbole individuel
│       ├── Player.json           # Symbole individuel
│       ├── Enemy.json            # Symbole individuel
│       └── manifest.json         # Manifeste de la bibliothèque
│
└── docs/
    └── SHARED_SYMBOLS.md        # Cette documentation
```

---

## Création de symboles partagés

### Méthode 1 : Depuis l'éditeur TweenJS

1. **Créez votre symbole** dans l'éditeur TweenJS
2. **Donnez-lui un nom** clair et descriptif
3. **Ajoutez des labels** pour les frames importantes
4. **Exportez-le** via le panneau Bibliothèque

### Méthode 2 : Programmatiquement

```javascript
import { exportSymbolToSharedFormat } from './shared/exportSharedSymbol.js';
import { state } from './state.js';

// Exporter un symbole spécifique
const symbolId = 'sym_1';
const sharedSymbol = exportSymbolToSharedFormat(
  state.doc.symbols[symbolId],
  {
    author: 'Votre Nom',
    version: '1.0',
    description: 'Description du symbole'
  }
);

// Sauvegarder dans un fichier
const jsonStr = JSON.stringify(sharedSymbol, null, 2);
// Utilisez download() ou fs.writeFile() selon l'environnement
```

### Méthode 3 : Créer un package complet

```javascript
import { createSharedSymbolPackage } from './shared/exportSharedSymbol.js';
import { state } from './state.js';

// Exporter tous les symboles du document
const package = createSharedSymbolPackage(
  state.doc.symbols,
  {
    name: 'Mon Package de Symboles',
    author: 'Votre Nom',
    version: '1.0',
    description: 'Description du package'
  }
);

// package.files contient :
// {
//   'manifest.json': {...},
//   'sym_1.json': {...},
//   'sym_2.json': {...},
//   ...
// }
```

---

## Utilisation dans un projet

### Étape 1 : Charger le registre

```javascript
import { 
  loadSharedSymbol, 
  loadSymbolManifest,
  getSharedSymbol,
  registerSharedSymbol 
} from './shared/SymbolRegistry.js';
```

### Étape 2 : Charger un symbole individuel

```javascript
// Charger depuis un fichier local
const button = await loadSharedSymbol('./shared/Button.json', 'button_standard');

// Utiliser dans votre jeu
import { createMovieClip } from './export/tweenRuntime.js';

const buttonInstance = createMovieClip(button.data, {
  x: 100,
  y: 100
});

// Dans la boucle de jeu
function gameLoop(dt) {
  buttonInstance.update(dt);
  buttonInstance.draw(ctx);
}
```

### Étape 3 : Charger un manifeste complet

```javascript
// Charger tous les symboles d'une bibliothèque
const symbols = await loadSymbolManifest('./shared/manifest.json');

// Tous les symboles sont maintenant registrés et prêts à l'emploi
console.log('Symboles chargés:', symbols.map(s => s.name));
```

### Étape 4 : Utiliser les symboles chargés

```javascript
// Récupérer un symbole par son ID
const buttonSymbol = getSharedSymbol('button_standard');

// Créer une instance
const myButton = createMovieClip(buttonSymbol.data, {
  x: 200,
  y: 300,
  loop: false
});

// Contrôler le bouton
myButton.gotoAndStop('over'); // État "survol"
myButton.gotoAndPlay('down'); // État "enfoncé"
```

---

## API du SymbolRegistry

### Fonctions principales

| Fonction | Description |
|----------|-------------|
| `registerSharedSymbol(id, data)` | Enregistre un symbole manuellement |
| `loadSharedSymbol(url, id?)` | Charge un symbole depuis une URL |
| `loadSymbolManifest(url)` | Charge un manifeste complet |
| `getSharedSymbol(id)` | Récupère un symbole par ID |
| `getAllSharedSymbols()` | Récupère tous les symboles chargés |
| `hasSharedSymbol(id)` | Vérifie si un symbole est chargé |
| `unregisterSharedSymbol(id)` | Supprime un symbole du registre |
| `addSearchPath(path)` | Ajoute un chemin de recherche |

### Exemple complet d'utilisation

```javascript
import { loadSymbolManifest, getSharedSymbol } from './shared/SymbolRegistry.js';
import { createMovieClip } from './export/tweenRuntime.js';

// Charger la bibliothèque de symboles
async function initGame() {
  // Charger tous les symboles d'un manifeste
  await loadSymbolManifest('./shared/manifest.json');
  
  // Créer un canvas
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  
  // Créer des instances à partir des symboles chargés
  const button = createMovieClip(getSharedSymbol('button_standard').data, {
    x: 400,
    y: 250
  });
  
  const player = createMovieClip(getSharedSymbol('player_character').data, {
    x: 400,
    y: 400
  });
  
  // Boucle de jeu
  let lastTime = performance.now();
  function gameLoop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    
    button.update(dt);
    player.update(dt);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    button.draw(ctx);
    player.draw(ctx);
    
    requestAnimationFrame(gameLoop);
  }
  
  requestAnimationFrame(gameLoop);
}

initGame();
```

---

## Manifestes de symboles

### Créer un manifeste

```javascript
import { exportSymbolsToManifest } from './shared/exportSharedSymbol.js';

const manifest = exportSymbolsToManifest(
  state.doc.symbols,
  {
    name: 'Ma Bibliothèque UI',
    author: 'Votre Nom',
    version: '1.0',
    description: 'Bibliothèque de composants UI'
  }
);

// Sauvegarder
const jsonStr = JSON.stringify(manifest, null, 2);
```

### Structure d'un manifeste

```json
{
  "format": "tweenjs-shared-manifest",
  "version": "1.0",
  "name": "Nom de la bibliothèque",
  "author": "Auteur",
  "description": "Description",
  "exportDate": "2026-07-31",
  "symbols": [
    {
      "id": "identifiant_unique",
      "name": "Nom affiché",
      "description": "Description",
      "url": "chemin/vers/symbole.json",
      "tags": ["tag1", "tag2"],
      "frameCount": 24,
      "width": 100,
      "height": 100
    }
  ],
  "categories": {
    "catégorie1": {
      "name": "Nom Catégorie",
      "symbols": ["id1", "id2"]
    }
  }
}
```

---

## Exemples complets

### Exemple 1 : Bibliothèque de boutons

```javascript
// Charger la bibliothèque de boutons
import { loadSymbolManifest } from './shared/SymbolRegistry.js';

// Charger tous les boutons
await loadSymbolManifest('./shared/ui-buttons/manifest.json');

// Créer différents types de boutons
const primaryButton = createMovieClip(
  getSharedSymbol('button_primary').data,
  { x: 100, y: 100 }
);

const secondaryButton = createMovieClip(
  getSharedSymbol('button_secondary').data,
  { x: 100, y: 200 }
);

// Configurer les actions
primaryButton.addEventListener('loop', () => {
  console.log('Bouton principal animé');
});
```

### Exemple 2 : Personnages de jeu

```javascript
// Charger les personnages
await loadSymbolManifest('./shared/characters/manifest.json');

// Créer le héros
const hero = createMovieClip(
  getSharedSymbol('hero_knight').data,
  { x: 400, y: 300 }
);

// Créer des ennemis
const enemy1 = createMovieClip(
  getSharedSymbol('enemy_goblin').data,
  { x: 600, y: 300 }
);

// Contrôles du héros
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') {
    hero.gotoAndPlay('walk');
    hero.scaleX = 1;
  } else if (e.key === 'ArrowLeft') {
    hero.gotoAndPlay('walk');
    hero.scaleX = -1;
  } else if (e.key === ' ') {
    hero.gotoAndPlay('attack');
  }
});
```

### Exemple 3 : Effets visuels

```javascript
// Charger les effets
await loadSymbolManifest('./shared/effects/manifest.json');

// Créer une explosion
function createExplosion(x, y) {
  const explosion = createMovieClip(
    getSharedSymbol('effect_explosion').data,
    { x, y, loop: false }
  );
  
  explosion.addEventListener('complete', () => {
    // L'explosion est terminée, on peut la supprimer
    explosion = null;
  });
  
  return explosion;
}

// Dans le jeu, quand un ennemi meurt
enemy.addEventListener('complete', () => {
  const explosion = createExplosion(enemy.x, enemy.y);
  explosions.push(explosion);
});
```

---

## Bonnes pratiques

### 1. Nommage des symboles

- ✅ Utilisez des **noms descriptifs** : `button_primary`, `enemy_goblin_walk`
- ❌ Évitez les noms génériques : `symbol1`, `movieclip2`
- ✅ Utilisez des **underscores** pour séparer les mots
- ✅ Préférez l'**anglais** pour la compatibilité

### 2. Organisation des bibliothèques

```
shared/
├── ui/
│   ├── buttons/
│   │   ├── Button.json
│   │   ├── ButtonPrimary.json
│   │   └── manifest.json
│   └── icons/
│       ├── Icon.json
│       └── manifest.json
├── characters/
│   ├── Hero.json
│   ├── Enemy.json
│   └── manifest.json
└── manifest.json  # Manifeste global
```

### 3. Versionnage

Ajoutez des métadonnées de version :

```json
{
  "_shared": {
    "format": "tweenjs-shared-symbol",
    "version": "1.0.0",
    "author": "Votre Nom",
    "exportDate": "2026-07-31",
    "changelog": "Premiere version"
  }
}
```

### 4. Documentation

Ajoutez toujours une description :

```json
{
  "name": "Button",
  "description": "Bouton standard avec 4 états : up, over, down, disabled. Taille : 150x50px.",
  "tags": ["ui", "button", "interactive"],
  ...
}
```

### 5. Labels de frame

Utilisez des labels clairs pour les états :

```json
{
  "frameLabels": {
    "0": "idle",
    "10": "walk",
    "20": "attack",
    "30": "hurt",
    "40": "dead"
  }
}
```

---

## Différences avec les .SWC

| Fonctionnalité | .SWC (Flash) | TweenJS Shared Symbols |
|---------------|-------------|------------------------|
| **Format** | Binaire (SWF compilé) | JSON (texte) |
| **Compatibilité** | Flash Player uniquement | JavaScript/Navigateur |
| **Taille** | Optimisé binaire | Légèrement plus grand |
| **Éditable** | ❌ Non | ✅ Oui (JSON) |
| **Versionnage** | Intégré dans SWC | Géré manuellement |
| **Dépendance** | Flash Player | Aucune |
| **Chargement** | Synchrone | Asynchrone (Promise) |
| **Intégration** | Drag & drop dans IDE | Import JavaScript |
| **Partage** | Fichier .swc | Fichier .json, git, npm |

---

## Depannage

### Problème : Symbole non trouvé

**Solution 1** : Vérifiez le chemin du fichier
```javascript
// Mauvais
loadSharedSymbol('Button.json');

// Bon
loadSharedSymbol('./shared/Button.json');
```

**Solution 2** : Ajoutez un chemin de recherche
```javascript
import { addSearchPath } from './shared/SymbolRegistry.js';
addSearchPath('./assets/shared/');
```

### Problème : Erreur de validation

```javascript
const result = validateSharedSymbol(symbol);
if (!result.valid) {
  console.error('Erreurs:', result.errors);
  console.warn('Avertissements:', result.warnings);
}
```

### Problème : Animation ne joue pas

```javascript
// Vérifiez que isPlaying est à true
const clip = createMovieClip(data, {
  isPlaying: true,  // Important !
  loop: true
});
```

### Problème : Problèmes de CORS

Si vous chargez depuis un CDN ou un autre domaine :

```javascript
// Assurez-vous que le serveur envoie les headers CORS
// Access-Control-Allow-Origin: *
```

Ou utilisez des fichiers locaux.

---

## Intégration avec l'éditeur TweenJS

### Exporter depuis l'éditeur

1. Ouvrez votre projet dans TweenJS
2. Créez vos symboles
3. Cliquez sur "Exporter" dans le panneau Bibliothèque
4. Sélectionnez "Exporter comme symbole partagé"
5. Choisissez le format .SWC-like (JSON)

### Importer dans l'éditeur

1. Cliquez sur "Importer" dans le panneau Bibliothèque
2. Sélectionnez "Symbole partagé (.json)"
3. Choisissez votre fichier .json
4. Le symbole est ajouté à votre bibliothèque

---

## Format .SWC vs TweenJS

### .SWC (Flash)
```
Fichier binaire contenant :
- Symboles compilés (MovieClip, Button, Graphic)
- Métadonnées
- Pas lisible par l'homme
- Nécessite Flash Player
```

### TweenJS Shared Symbol
```json
{
  "id": "button",
  "type": "movieclip",
  "layers": [...],
  "_shared": { "format": "tweenjs-shared-symbol", "version": "1.0" }
}
```

---

## Conclusion

Le système de **Symboles Partagés** de TweenJS vous permet de :

- ✅ **Réutiliser** vos assets entre projets
- ✅ **Partager** avec votre équipe
- ✅ **Maintenir** une bibliothèque de composants
- ✅ **Organiser** votre code de manière modulaire
- ✅ **Versionner** vos symboles avec git
- ✅ **Publier** des packages npm de symboles

C'est une **évolution moderne** du concept .SWC, adaptée à l'écosystème JavaScript actuel.

---

## Voir aussi

- [Runtime CreateJS-like](./README.md) - Documentation du runtime MovieClip
- [exportSharedSymbol.js](../src/shared/exportSharedSymbol.js) - Code source de l'export
- [SymbolRegistry.js](../src/shared/SymbolRegistry.js) - Code source du registre

---

## 🏰 Cas d'usage avancé : Dungeon Crawler

Un **Dungeon Crawler** (ou Roguelike) est un type de jeu où le joueur explore des donjons générés procéduralement, avec des murs, des pièces, des couloirs et des ennemis.

Cette section explique comment **organiser efficacement vos assets** pour un Dungeon Crawler en utilisant le système de Symboles Partagés.

---

### 🧱 Organisation des murs

Pour un Dungeon Crawler, les murs ne sont pas de simples images statiques. Ils doivent :
- ✅ **S'assembler parfaitement** (tileable)
- ✅ **Avoir des variations** (murs droits, coins, portes, etc.)
- ✅ **Gérer les connexions** (un mur se connecte correctement à son voisin)
- ✅ **Être optimisés** (réutilisation maximale)

#### Structure recommandée

```
shared/
└── dungeon/
    ├── tilesets/
    │   ├── walls/
    │   │   ├── wall_straight.json       # Mur droit (─)
    │   │   ├── wall_corner.json         # Coin (┌, ┐, └, ┘)
    │   │   ├── wall_t.json              # Jonction T (┬, ┴, ├, ┤)
    │   │   ├── wall_cross.json          # Croisement (+)
    │   │   ├── wall_end.json            # Extrémité (┃, ─)
    │   │   ├── wall_door.json           # Mur avec porte
    │   │   ├── wall_window.json         # Mur avec fenêtre
    │   │   └── manifest.json
    │   │
    │   ├── floors/
    │   │   ├── floor_stone.json
    │   │   ├── floor_wood.json
    │   │   └── manifest.json
    │   │
    │   └── manifest.json              # Manifeste de tous les tilesets
    │
    ├── props/
    │   ├── torch.json
    │   ├── chest.json
    │   └── manifest.json
    │
    ├── enemies/
    │   ├── goblin.json
    │   └── manifest.json
    │
    └── manifest.json                   # Manifeste global du donjon
```

---

### 🧱 Système de tuiles pour les murs

#### 1. **Approche par tuiles individuelles (recommandée)**

Chaque type de mur est un symbole séparé :

```
walls/
├── wall_straight_h.json      # Mur horizontal (─)
├── wall_straight_v.json      # Mur vertical (│)
├── wall_corner_tl.json       # Coin haut-gauche (┌)
├── wall_corner_tr.json       # Coin haut-droite (┐)
├── wall_corner_bl.json       # Coin bas-gauche (└)
├── wall_corner_br.json       # Coin bas-droite (┘)
├── wall_t_top.json           # T vers le haut (┴)
├── wall_t_bottom.json        # T vers le bas (┬)
├── wall_t_left.json          # T vers la gauche (┤)
├── wall_t_right.json         # T vers la droite (├)
└── wall_cross.json           # Croisement (+)
```

**Avantages :**
- Simple à comprendre
- Chaque tuile est indépendante
- Facile à modifier individuellement

**Inconvénients :**
- Beaucoup de fichiers
- Nécessite une logique de placement intelligente

---

#### 2. **Approche par auto-tiling (avancée)**

Un seul symbole avec des **frameLabels** pour chaque type de connexion :

```json
{
  "id": "wall_auto",
  "name": "Wall (Auto-Tiling)",
  "type": "movieclip",
  "frameRate": 24,
  "frameCount": 48,
  "frameLabels": {
    "0": "straight_h",
    "1": "straight_v",
    "2": "corner_tl",
    "3": "corner_tr",
    "4": "corner_bl",
    "5": "corner_br",
    "6": "t_top",
    "7": "t_bottom",
    "8": "t_left",
    "9": "t_right",
    "10": "cross",
    "11": "end_top",
    "12": "end_bottom",
    "13": "end_left",
    "14": "end_right"
  }
}
```

**Avantages :**
- Un seul symbole à gérer
- Changement de type via `gotoAndStop()`

**Inconvénients :**
- Plus complexe à créer
- Toutes les variations doivent être dans un seul symbole

---

#### 3. **Approche hybride (recommandée pour les pros)**

Combiner les deux approches :
- **Symboles par catégorie** (murs, sols, props)
- **Frames pour les variations** dans chaque symbole

```
walls/
├── wall_segments.json          # Contient toutes les connexions de base
├── wall_doors.json             # Toutes les variations de portes
├── wall_windows.json           # Toutes les variations de fenêtres
└── manifest.json
```

Dans `wall_segments.json` :
```json
{
  "id": "wall_segments",
  "name": "Wall Segments",
  "type": "movieclip",
  "frameLabels": {
    "0": "straight_h",
    "4": "straight_v",
    "8": "corner_tl",
    "12": "corner_tr",
    // ... etc
  }
}
```

**Avantages :**
- Équilibre entre organisation et flexibilité
- Facile à étendre
- Bonne performance

---

### 🎨 Exemple concret : Créer une carte de donjon

#### 1. Définir la structure de la carte

```javascript
const dungeonMap = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 2, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1]
];
// 0 = vide (sol)
// 1 = mur
// 2 = joueur
```

#### 2. Charger les symboles

```javascript
import { loadSymbolManifest, getSharedSymbol } from './shared/SymbolRegistry.js';
import { createMovieClip } from './export/tweenRuntime.js';

// Charger tous les assets du donjon
await loadSymbolManifest('./shared/dungeon/manifest.json');

// Récupérer les symboles
const wallSymbol = getSharedSymbol('wall_straight_h');
const floorSymbol = getSharedSymbol('floor_stone');
const cornerSymbol = getSharedSymbol('wall_corner_tl');
```

#### 3. Créer la fonction de rendu

```javascript
const tileSize = 64; // Taille de chaque tuile en pixels
const walls = []; // Pour suivre les instances
const floors = [];

function renderDungeon(map, ctx) {
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const tileType = map[y][x];
      
      if (tileType === 1) {
        // C'est un mur - créer une instance
        const wall = createMovieClip(wallSymbol.data, {
          x: x * tileSize + tileSize / 2,
          y: y * tileSize + tileSize / 2
        });
        walls.push(wall);
      } else if (tileType === 0) {
        // C'est un sol
        const floor = createMovieClip(floorSymbol.data, {
          x: x * tileSize + tileSize / 2,
          y: y * tileSize + tileSize / 2
        });
        floors.push(floor);
      }
    }
  }
}

// Initialisation
const canvas = document.createElement('canvas');
canvas.width = dungeonMap[0].length * tileSize;
canvas.height = dungeonMap.length * tileSize;
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

renderDungeon(dungeonMap, ctx);
```

#### 4. Boucle de jeu avec mise à jour

```javascript
let lastTime = performance.now();

function gameLoop(timestamp) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;
  
  // Mettre à jour toutes les tuiles (si elles ont des animations)
  walls.forEach(wall => wall.update(dt));
  floors.forEach(floor => floor.update(dt));
  
  // Dessiner
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Dessiner les sols d'abord
  floors.forEach(floor => floor.draw(ctx));
  
  // Puis les murs par-dessus
  walls.forEach(wall => wall.draw(ctx));
  
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
```

---

### 🧩 Système de connexion automatique (Auto-Tiling)

Pour éviter d'avoir à placer manuellement chaque type de mur, on peut implémenter un système d'**auto-tiling** qui choisit automatiquement la bonne tuile en fonction de ses voisins.

#### 1. Définir les types de connexion

```javascript
// Masque binaire pour les connexions
// Bit 0 (1) = haut
// Bit 1 (2) = droite
// Bit 2 (4) = bas
// Bit 3 (8) = gauche
const Connection = {
  NONE: 0,
  TOP: 1,
  RIGHT: 2,
  BOTTOM: 4,
  LEFT: 8,
  TOP_RIGHT: 3,
  TOP_BOTTOM: 5,
  TOP_LEFT: 9,
  RIGHT_BOTTOM: 6,
  RIGHT_LEFT: 10,
  BOTTOM_LEFT: 12,
  TOP_RIGHT_BOTTOM: 7,
  TOP_RIGHT_LEFT: 11,
  TOP_BOTTOM_LEFT: 13,
  RIGHT_BOTTOM_LEFT: 14,
  ALL: 15
};
```

#### 2. Calculer le type de mur en fonction des voisins

```javascript
function getWallType(map, x, y) {
  // Vérifier les 4 directions
  let connections = 0;
  
  // Haut
  if (y > 0 && map[y-1][x] === 1) connections |= Connection.TOP;
  // Droite
  if (x < map[y].length - 1 && map[y][x+1] === 1) connections |= Connection.RIGHT;
  // Bas
  if (y < map.length - 1 && map[y+1][x] === 1) connections |= Connection.BOTTOM;
  // Gauche
  if (x > 0 && map[y][x-1] === 1) connections |= Connection.LEFT;
  
  return connections;
}
```

#### 3. Mapping des connexions vers les tuiles

```javascript
const connectionToTile = {
  // Murs droits
  [Connection.TOP | Connection.BOTTOM]: 'straight_v',
  [Connection.LEFT | Connection.RIGHT]: 'straight_h',
  
  // Coins
  [Connection.TOP | Connection.RIGHT]: 'corner_tr',
  [Connection.TOP | Connection.LEFT]: 'corner_tl',
  [Connection.BOTTOM | Connection.RIGHT]: 'corner_br',
  [Connection.BOTTOM | Connection.LEFT]: 'corner_bl',
  
  // T-jonctions
  [Connection.TOP | Connection.RIGHT | Connection.LEFT]: 't_bottom',
  [Connection.TOP | Connection.RIGHT | Connection.BOTTOM]: 't_left',
  [Connection.TOP | Connection.LEFT | Connection.BOTTOM]: 't_right',
  [Connection.RIGHT | Connection.LEFT | Connection.BOTTOM]: 't_top',
  
  // Extrémités
  [Connection.TOP]: 'end_bottom',
  [Connection.RIGHT]: 'end_left',
  [Connection.BOTTOM]: 'end_top',
  [Connection.LEFT]: 'end_right',
  
  // Croisement
  [Connection.ALL]: 'cross',
  
  // Mur isolé (devrait normalement pas exister)
  [Connection.NONE]: 'straight_h'
};
```

#### 4. Utilisation dans le rendu

```javascript
function renderDungeonWithAutoTiling(map, ctx) {
  const wallSymbol = getSharedSymbol('wall_segments');
  
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x] === 1) {
        const connections = getWallType(map, x, y);
        const tileType = connectionToTile[connections] || 'straight_h';
        
        const wall = createMovieClip(wallSymbol.data, {
          x: x * tileSize + tileSize / 2,
          y: y * tileSize + tileSize / 2
        });
        
        // Aller à la frame correspondante
        wall.gotoAndStop(tileType);
        
        walls.push(wall);
      }
    }
  }
}
```

---

### 🎯 Organisation optimale pour un Dungeon Crawler

#### Structure complète recommandée

```
shared/
└── dungeon_crawler/
    │
    ├── tilesets/
    │   ├── base/
    │   │   ├── walls.json           # Tous les types de murs
    │   │   ├── floors.json          # Tous les types de sols
    │   │   ├── doors.json           # Toutes les portes
    │   │   └── manifest.json
    │   │
    │   ├── decorations/
    │   │   ├── torches.json
    │   │   ├── pillars.json
    │   │   └── manifest.json
    │   │
    │   └── manifest.json
    │
    ├── props/
    │   ├── interactive/
    │   │   ├── chest.json
    │   │   ├── lever.json
    │   │   └── manifest.json
    │   │
    │   └── manifest.json
    │
    ├── enemies/
    │   ├── goblin.json
    │   ├── skeleton.json
    │   └── manifest.json
    │
    ├── items/
    │   ├── sword.json
    │   ├── potion.json
    │   └── manifest.json
    │
    ├── effects/
    │   ├── explosion.json
    │   ├── fire.json
    │   └── manifest.json
    │
    └── manifest.json              # Manifeste global
```

#### Dans `tilesets/base/walls.json`

```json
{
  "id": "dungeon_walls",
  "name": "Dungeon Walls",
  "type": "movieclip",
  "description": "Tous les types de murs pour le donjon",
  "frameRate": 24,
  "frameCount": 48,
  "width": 64,
  "height": 64,
  "frameLabels": {
    "0": "straight_h",
    "1": "straight_v",
    "2": "corner_tl",
    "3": "corner_tr",
    "4": "corner_bl",
    "5": "corner_br",
    "6": "t_top",
    "7": "t_bottom",
    "8": "t_left",
    "9": "t_right",
    "10": "cross",
    "11": "end_top",
    "12": "end_bottom",
    "13": "end_left",
    "14": "end_right",
    "15": "straight_h_broken",
    "16": "straight_v_broken",
    "17": "corner_tl_moss",
    "18": "corner_tr_moss",
    "19": "door_closed",
    "20": "door_open",
    "21": "door_locked",
    "22": "wall_window"
  }
}
```

#### Dans `tilesets/base/floors.json`

```json
{
  "id": "dungeon_floors",
  "name": "Dungeon Floors",
  "type": "movieclip",
  "frameRate": 24,
  "frameCount": 10,
  "width": 64,
  "height": 64,
  "frameLabels": {
    "0": "stone_clean",
    "1": "stone_cracked",
    "2": "stone_broken",
    "3": "stone_moss",
    "4": "stone_blood",
    "5": "wood",
    "6": "wood_dark",
    "7": "dirt",
    "8": "trap",
    "9": "spikes"
  }
}
```

---

### 📦 Manifeste complet pour le Dungeon Crawler

```json
{
  "format": "tweenjs-shared-manifest",
  "version": "1.0",
  "name": "Dungeon Crawler Assets",
  "description": "Bibliothèque complète d'assets pour un jeu de type Dungeon Crawler",
  "author": "Votre Studio",
  "exportDate": "2026-07-31",
  "symbols": [
    {
      "id": "dungeon_walls",
      "name": "Dungeon Walls",
      "description": "Tous les types de murs avec auto-tiling",
      "url": "tilesets/base/walls.json",
      "tags": ["dungeon", "walls", "tileset", "auto-tiling"],
      "frameCount": 48,
      "width": 64,
      "height": 64
    },
    {
      "id": "dungeon_floors",
      "name": "Dungeon Floors",
      "description": "Tous les types de sols",
      "url": "tilesets/base/floors.json",
      "tags": ["dungeon", "floors", "tileset"],
      "frameCount": 10,
      "width": 64,
      "height": 64
    },
    {
      "id": "dungeon_doors",
      "name": "Doors",
      "description": "Portes et passages",
      "url": "tilesets/base/doors.json",
      "tags": ["dungeon", "doors", "tileset"],
      "frameCount": 6,
      "width": 64,
      "height": 64
    },
    {
      "id": "torch",
      "name": "Torch",
      "description": "Torche animée avec lumière",
      "url": "props/decorations/torches.json",
      "tags": ["dungeon", "prop", "light", "animated"],
      "frameCount": 12,
      "width": 32,
      "height": 64
    },
    {
      "id": "chest",
      "name": "Chest",
      "description": "Coffre au trésor avec animations d'ouverture",
      "url": "props/interactive/chest.json",
      "tags": ["dungeon", "prop", "interactive", "loOT"],
      "frameCount": 20,
      "width": 48,
      "height": 32
    },
    {
      "id": "goblin",
      "name": "Goblin",
      "description": "Ennemi Gobelin avec animations de marche et attaque",
      "url": "enemies/goblin.json",
      "tags": ["dungeon", "enemy", "character", "animated"],
      "frameCount": 30,
      "width": 48,
      "height": 48
    }
  ],
  "categories": {
    "tilesets": {
      "name": "Tilesets",
      "symbols": ["dungeon_walls", "dungeon_floors", "dungeon_doors"]
    },
    "props": {
      "name": "Props & Décorations",
      "symbols": ["torch", "chest"]
    },
    "enemies": {
      "name": "Ennemis",
      "symbols": ["goblin"]
    }
  }
}
```

---

### 🎮 Exemple complet : Génération procédurale

Voici comment générer un donjon procéduralement avec le système :

```javascript
import { loadSymbolManifest, getSharedSymbol } from './shared/SymbolRegistry.js';
import { createMovieClip } from './export/tweenRuntime.js';

class DungeonCrawler {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tileSize = options.tileSize || 64;
    this.walls = [];
    this.floors = [];
    this.props = [];
    
    // Charger les assets
    this.symbols = {};
  }
  
  async init() {
    // Charger tous les assets du donjon
    await loadSymbolManifest('./shared/dungeon_crawler/manifest.json');
    
    // Charger les symboles individus
    this.symbols.walls = getSharedSymbol('dungeon_walls');
    this.symbols.floors = getSharedSymbol('dungeon_floors');
    this.symbols.torch = getSharedSymbol('torch');
    this.symbols.chest = getSharedSymbol('chest');
  }
  
  generateMap(width, height) {
    // Créer une carte vide
    const map = Array(height).fill().map(() => Array(width).fill(0));
    
    // Générer les bords
    for (let x = 0; x < width; x++) {
      map[0][x] = 1;  // Haut
      map[height-1][x] = 1;  // Bas
    }
    for (let y = 0; y < height; y++) {
      map[y][0] = 1;  // Gauche
      map[y][width-1] = 1;  // Droite
    }
    
    // Ajouter des murs intérieurs aléatoires
    for (let y = 2; y < height-2; y += 2) {
      for (let x = 2; x < width-2; x += 2) {
        if (Math.random() > 0.7) {
          map[y][x] = 1;
        }
      }
    }
    
    // Ajouter une pièce au centre
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    for (let y = centerY - 2; y <= centerY + 2; y++) {
      for (let x = centerX - 2; x <= centerX + 2; x++) {
        if (x > 0 && x < width-1 && y > 0 && y < height-1) {
          map[y][x] = 0;  // Vider la pièce
        }
      }
    }
    
    return map;
  }
  
  renderMap(map) {
    this.walls = [];
    this.floors = [];
    this.props = [];
    
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        if (map[y][x] === 1) {
          // Mur avec auto-tiling
          const connections = this.getWallConnections(map, x, y);
          const tileType = this.getTileType(connections);
          
          const wall = createMovieClip(this.symbols.walls.data, {
            x: x * this.tileSize + this.tileSize / 2,
            y: y * this.tileSize + this.tileSize / 2
          });
          wall.gotoAndStop(tileType);
          this.walls.push(wall);
        } else {
          // Sol
          const floor = createMovieClip(this.symbols.floors.data, {
            x: x * this.tileSize + this.tileSize / 2,
            y: y * this.tileSize + this.tileSize / 2
          });
          // Choisir un type de sol aléatoire
          const floorTypes = Object.keys(this.symbols.floors.data.frameLabels);
          const randomFloor = floorTypes[Math.floor(Math.random() * floorTypes.length)];
          floor.gotoAndStop(randomFloor);
          this.floors.push(floor);
          
          // Ajouter un prop aléatoire (10% de chance)
          if (Math.random() < 0.1) {
            this.addRandomProp(x, y);
          }
        }
      }
    }
  }
  
  getWallConnections(map, x, y) {
    let connections = 0;
    if (y > 0 && map[y-1][x] === 1) connections |= 1;  // TOP
    if (x < map[y].length - 1 && map[y][x+1] === 1) connections |= 2;  // RIGHT
    if (y < map.length - 1 && map[y+1][x] === 1) connections |= 4;  // BOTTOM
    if (x > 0 && map[y][x-1] === 1) connections |= 8;  // LEFT
    return connections;
  }
  
  getTileType(connections) {
    const mapping = {
      3: 'corner_tr',  // TOP + RIGHT
      9: 'corner_tl',  // TOP + LEFT
      6: 'corner_br',  // RIGHT + BOTTOM
      12: 'corner_bl', // BOTTOM + LEFT
      5: 'straight_v', // TOP + BOTTOM
      10: 'straight_h', // LEFT + RIGHT
      7: 't_bottom',   // TOP + RIGHT + BOTTOM
      11: 't_left',    // TOP + RIGHT + LEFT
      13: 't_right',   // TOP + BOTTOM + LEFT
      14: 't_top',     // RIGHT + BOTTOM + LEFT
      15: 'cross',     // ALL
      1: 'end_bottom', // TOP only
      2: 'end_left',   // RIGHT only
      4: 'end_top',    // BOTTOM only
      8: 'end_right'   // LEFT only
    };
    return mapping[connections] || 'straight_h';
  }
  
  addRandomProp(x, y) {
    const props = [
      { symbol: this.symbols.torch, probability: 0.7 },
      { symbol: this.symbols.chest, probability: 0.3 }
    ];
    
    const selected = props.find(p => Math.random() < p.probability);
    if (selected) {
      const prop = createMovieClip(selected.symbol.data, {
        x: x * this.tileSize + this.tileSize / 2,
        y: y * this.tileSize + this.tileSize / 2
      });
      this.props.push(prop);
    }
  }
  
  update(dt) {
    this.walls.forEach(w => w.update(dt));
    this.floors.forEach(f => f.update(dt));
    this.props.forEach(p => p.update(dt));
  }
  
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Dessiner les sols
    this.floors.forEach(f => f.draw(this.ctx));
    
    // Dessiner les props
    this.props.forEach(p => p.draw(this.ctx));
    
    // Dessiner les murs (par dessus)
    this.walls.forEach(w => w.draw(this.ctx));
  }
}

// Utilisation
async function initGame() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  document.body.appendChild(canvas);
  
  const dungeon = new DungeonCrawler(canvas);
  await dungeon.init();
  
  const map = dungeon.generateMap(10, 10);
  dungeon.renderMap(map);
  
  let lastTime = performance.now();
  function gameLoop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    
    dungeon.update(dt);
    dungeon.draw();
    
    requestAnimationFrame(gameLoop);
  }
  
  requestAnimationFrame(gameLoop);
}

initGame();
```

---

### 💡 Optimisations avancées

#### 1. **Tilesets optimisés**

Au lieu de créer un symbole séparé pour chaque type de mur, regroupez-les dans un **tileset** :

```
walls/
├── dungeon_tileset.png    # Image sprite contenant toutes les tuiles
└── dungeon_tileset.json   # Symbole avec mapping vers l'image
```

#### 2. **Cache des instances**

Réutilisez les mêmes instances pour les tuiles identiques :

```javascript
const tileCache = new Map();

function getWallInstance(type, x, y) {
  const key = type;
  if (!tileCache.has(key)) {
    const wall = createMovieClip(wallSymbol.data, { x, y });
    wall.gotoAndStop(type);
    tileCache.set(key, wall);
  }
  const instance = tileCache.get(key);
  instance.x = x;
  instance.y = y;
  return instance;
}
```

#### 3. **Génération de donjon avec algorithmes**

Utilisez des algorithmes pour générer des donjons plus intéressants :

- **Algorithme de Backtracking** : Génération de labyrinthe
- **BSP (Binary Space Partitioning)** : Division récursive
- **Drunkard's Walk** : Marche aléatoire
- **Room and Corridor** : Pièces connectées par des couloirs

Exemple avec BSP :

```javascript
function generateDungeonBSP(width, height, minRoomSize = 3) {
  // Implémentation BSP ici
  // Retourne une carte 2D
}
```

---

### 📚 Résumé des bonnes pratiques pour les murs

| Pratique | Description |
|----------|-------------|
| ✅ **Utilisez l'auto-tiling** | Réduit le nombre d'assets à créer |
| ✅ **Nommez clairement** | `wall_corner_tl` > `wall_1` |
| ✅ **Groupez par catégories** | `walls/`, `floors/`, `props/` |
| ✅ **Utilisez des frameLabels** | Pour basculer entre les variations |
| ✅ **Documentez vos assets** | Ajoutez description, tags, auteur |
| ✅ **Versionnez** | Utilisez git pour suivre les changements |
| ❌ **Évitez les duplications** | Réutilisez les mêmes assets |
| ❌ **Évitez les tailles incohérentes** | Toutes les tuiles = même taille |

---

### 🎯 Checklist pour un bon tileset de murs

- [ ] Toutes les tuiles ont la même taille (64x64, 32x32, etc.)
- [ ] Les connexions sont visuellement cohérentes
- [ ] Les labels de frame sont clairs et descriptifs
- [ ] Le manifeste référence correctement tous les fichiers
- [ ] Les assets sont optimisés (pas de pixels inutiles)
- [ ] Les animations (torches, etc.) sont fluides
- [ ] Les noms de fichiers suivent une convention
- [ ] La documentation explique comment utiliser les assets

---

*Documentation mise à jour le 31 juillet 2026*

