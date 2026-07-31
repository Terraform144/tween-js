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
