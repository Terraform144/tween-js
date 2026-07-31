# Symboles Partagés - Dossier

> *Système de symboles partagés inspiré des .SWC d'Adobe Flash/AnimateCC*

Ce dossier contient le système de **Symboles Partagés** de TweenJS, qui permet de réutiliser des symboles (MovieClips, Graphiques) entre différents projets.

## 📁 Structure

```
shared/
├── SymbolRegistry.js       # Registre central des symboles partagés
├── exportSharedSymbol.js   # Utilitaires d'export
├── Button.json             # Exemple : Bouton standard
├── manifest.json           # Exemple : Manifeste de bibliothèque
└── README.md               # Ce fichier
```

## 🚀 Utilisation rapide

### 1. Importer le registre

```javascript
import {
  loadSharedSymbol,
  loadSymbolManifest,
  getSharedSymbol,
  registerSharedSymbol
} from './shared/SymbolRegistry.js';
```

### 2. Charger un symbole

```javascript
// Charger un symbole individuel
const button = await loadSharedSymbol('./shared/Button.json');

// Ou charger un manifeste complet
await loadSymbolManifest('./shared/manifest.json');
```

### 3. Utiliser avec le runtime

```javascript
import { createMovieClip } from '../export/tweenRuntime.js';

const instance = createMovieClip(button.data, {
  x: 100,
  y: 100
});

// Dans la boucle de jeu
function gameLoop(dt) {
  instance.update(dt);
  instance.draw(ctx);
}
```

## 📦 Contenu du dossier

### 1. **SymbolRegistry.js**

Registre central pour gérer les symboles partagés.

**Fonctionnalités :**
- Chargement de symboles individuels
- Chargement de manifestes
- Registre des symboles chargés
- Gestion des chemins de recherche
- Création de manifestes

**Exemple :**
```javascript
import { SymbolRegistry } from './SymbolRegistry.js';

// Charger un manifeste
const symbols = await SymbolRegistry.loadSymbolManifest('./manifest.json');

// Récupérer un symbole
const button = SymbolRegistry.getSharedSymbol('button_standard');
```

### 2. **exportSharedSymbol.js**

Utilitaires pour exporter des symboles depuis TweenJS vers le format partagé.

**Fonctionnalités :**
- Export de symboles individuels
- Export de bibliothèques complètes
- Création de manifestes
- Validation des symboles

**Exemple :**
```javascript
import { exportSymbolToSharedFormat } from './exportSharedSymbol.js';

// Depuis l'éditeur TweenJS
const sharedSymbol = exportSymbolToSharedFormat(state.doc.symbols['sym_1']);

// Sauvegarder
const jsonStr = JSON.stringify(sharedSymbol, null, 2);
```

### 3. **Button.json** (Exemple)

Exemple de symbole partagé - un bouton avec 4 états (up, over, down, disabled).

**Structure :**
- ID : `button_standard`
- Type : `movieclip`
- 12 frames
- 2 layers (Background, Label)
- Labels : up (0), over (4), down (8), disabled (11)

### 4. **manifest.json** (Exemple)

Exemple de manifeste de bibliothèque.

**Structure :**
- Format : `tweenjs-shared-manifest`
- 1 symbole : `button_standard`
- Catégorie : `ui`

## 🎯 Cas d'usage

### 1. Créer une bibliothèque de composants UI

```
shared/
└── ui/
    ├── buttons/
    │   ├── Button.json
    │   ├── ButtonPrimary.json
    │   └── ButtonSecondary.json
    ├── icons/
    │   ├── Icon.json
    │   └── IconSet.json
    └── manifest.json
```

### 2. Créer une bibliothèque de personnages

```
shared/
└── characters/
    ├── Hero.json
    ├── EnemyGoblin.json
    ├── EnemyOrc.json
    └── manifest.json
```

### 3. Créer une bibliothèque d'effets

```
shared/
└── effects/
    ├── Explosion.json
    ├── ParticleFire.json
    ├── ParticleSmoke.json
    └── manifest.json
```

## 📝 Bonnes pratiques

1. **Nommage clair** : Utilisez des noms descriptifs (`button_primary`, `enemy_goblin_walk`)
2. **Catégorisation** : Organisez vos symboles par dossiers
3. **Métadonnées** : Ajoutez description, auteur, version
4. **Versionnage** : Utilisez git pour versionner vos bibliothèques
5. **Partage** : Publiez vos bibliothèques sur npm ou GitHub

## 🔗 Intégration avec l'éditeur

### Depuis l'éditeur

```javascript
import { exportSymbolToSharedFormat } from './shared/exportSharedSymbol.js';
import { state } from '../state.js';

// Exporter le symbole sélectionné
const symbolId = state.selectedElementIds[0];
const symbol = state.doc.symbols[symbolId];
const sharedSymbol = exportSymbolToSharedFormat(symbol, {
  author: 'Votre Nom',
  version: '1.0'
});

// Télécharger
const jsonStr = JSON.stringify(sharedSymbol, null, 2);
const blob = new Blob([jsonStr], { type: 'application/json' });
const url = URL.createObjectURL(blob);
a.download(url, `${symbol.name || symbolId}.json`);
```

### Vers l'éditeur

```javascript
import { loadSharedSymbol } from './shared/SymbolRegistry.js';
import { createSymbol } from '../core/model.js';

// Charger un symbole partagé
const sharedSymbol = await loadSharedSymbol('./shared/Button.json');

// L'importer dans l'éditeur
const newSymbol = createSymbol(sharedSymbol.name, sharedSymbol.type);
// Copier les propriétés
newSymbol.frameRate = sharedSymbol.frameRate;
newSymbol.frameCount = sharedSymbol.frameCount;
newSymbol.layers = sharedSymbol.layers;
newSymbol.frameLabels = sharedSymbol.frameLabels;

// Ajouter au document
state.doc.symbols[newSymbol.id] = newSymbol;
```

## 📊 Comparaison avec .SWC

| Caractéristique | .SWC (Flash) | TweenJS Shared |
|----------------|-------------|----------------|
| Format | Binaire | JSON |
| Lisible | ❌ | ✅ |
| Éditable | ❌ | ✅ |
| Versionnable | ❌ | ✅ (git) |
| Partageable | Fichier | Fichier, npm, CDN |
| Compatible | Flash Player | Navigateur moderne |

## 🎨 Exemple : Créer un bouton interactif

```javascript
import { loadSharedSymbol, getSharedSymbol } from './SymbolRegistry.js';
import { createMovieClip } from '../export/tweenRuntime.js';

// Charger le symbole du bouton
await loadSharedSymbol('./shared/Button.json');

// Créer une instance
const button = createMovieClip(getSharedSymbol('button_standard').data, {
  x: 100,
  y: 100
});

// Ajouter l'interactivité
button._element = document.createElement('div');
button._element.style.position = 'absolute';
button._element.style.width = '150px';
button._element.style.height = '50px';
button._element.style.cursor = 'pointer';
document.body.appendChild(button._element);

// Gérer les événements souris
button._element.addEventListener('mouseenter', () => {
  button.gotoAndStop('over');
});

button._element.addEventListener('mouseleave', () => {
  button.gotoAndStop('up');
});

button._element.addEventListener('mousedown', () => {
  button.gotoAndStop('down');
});

button._element.addEventListener('mouseup', () => {
  button.gotoAndStop('over');
});
```

## 📚 Documentation complète

- [Documentation principale](../../docs/SHARED_SYMBOLS.md)
- [API Runtime](../../export/README.md)
- [Exemples d'utilisation](../../export/createjs-runtime-example.js)

## 🤝 Contribuer

Tu veux ajouter des fonctionnalités ?

- **Nouveaux types de symboles**
- **Optimisation du chargement**
- **Système de cache**
- **Intégration npm**

Ouvre une PR sur GitHub !

---

*Dernière mise à jour : 31 juillet 2026*
