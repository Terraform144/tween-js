# Documentation TweenJS

> *Éditeur d'animation vectorielle inspiré d'Adobe Animate, en JavaScript vanilla*

## 📚 Structure de la documentation

```
docs/
├── README.md                    # Ce fichier - Vue d'ensemble
├── SHARED_SYMBOLS.md           # Symboles partagés (.SWC-like)
└── ...

src/export/
├── README.md                   # Runtime CreateJS-like API
├── tweenRuntime.js             # Code source du runtime
└── createjs-runtime-example.js # Exemples d'utilisation

src/shared/
├── README.md                   # Documentation du système de symboles partagés
├── SymbolRegistry.js           # Registre des symboles partagés
├── exportSharedSymbol.js       # Export de symboles depuis TweenJS
├── Button.json                 # Exemple de symbole partagé
└── manifest.json               # Exemple de manifeste
```

---

## 🎯 Documentation disponible

### 1. [Runtime CreateJS-like](export/README.md)

Le cœur du système - Une API JavaScript légère et autonome pour utiliser vos animations TweenJS dans vos jeux vidéo.

**API compatible CreateJS/EaselJS** :
- `MovieClip` avec `play()`, `stop()`, `gotoAndPlay()`, `gotoAndStop()`
- Gestion des `frameLabels`
- Événements `loop` et `complete`
- Symboles imbriqués automatiques

**✅ Pour :** Créer des jeux vidéo avec vos animations TweenJS

---

### 2. [Symboles Partagés (.SWC-like)](SHARED_SYMBOLS.md)

Système de bibliothèques de symboles réutilisables, inspiré des fichiers .SWC d'Adobe Flash/AnimateCC.

**Fonctionnalités :**
- Format JSON (lisible et versionnable)
- Manifeste de bibliothèques
- Catégorisation et tagging
- Chargement asynchrone
- Validation des symboles

**✅ Pour :** Partager des composants entre projets, travailler en équipe

---

## 🚀 Quick Start

### 1. Utiliser le runtime dans un jeu

```javascript
// Importer le runtime
import { createMovieClip } from './src/export/tweenRuntime.js';

// Importer vos données d'animation
import PLAYER_DATA from './Player.json';

// Créer un canvas
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

// Créer un MovieClip
const player = createMovieClip(PLAYER_DATA, {
  x: 400,
  y: 300,
  loop: true,
  isPlaying: true
});

// Boucle de jeu
let lastTime = performance.now();
function gameLoop(timestamp) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;
  
  player.update(dt);
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  player.draw(ctx);
  
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
```

### 2. Utiliser des symboles partagés

```javascript
import { loadSymbolManifest, getSharedSymbol } from './src/shared/SymbolRegistry.js';
import { createMovieClip } from './src/export/tweenRuntime.js';

// Charger une bibliothèque de symboles
await loadSymbolManifest('./shared/manifest.json');

// Créer une instance d'un symbole partagé
const button = createMovieClip(
  getSharedSymbol('button_standard').data,
  { x: 100, y: 100 }
);

// Dans la boucle de jeu
function gameLoop(dt) {
  button.update(dt);
  button.draw(ctx);
}
```

---

## 📁 Organisation des fichiers

```
tweenjs/
├── src/
│   ├── core/
│   │   └── model.js              # Modèle de données (Symboles, Layers, Keyframes)
│   │
│   ├── export/
│   │   ├── README.md             # Documentation du runtime ✨ NEW
│   │   ├── createjs-runtime-example.js # Exemples ✨ NEW
│   │   └── tweenRuntime.js       # Runtime MovieClip (existait déjà)
│   │
│   ├── shared/                  # NOUVEAU : Système de symboles partagés
│   │   ├── README.md
│   │   ├── SymbolRegistry.js    # Registre des symboles
│   │   ├── exportSharedSymbol.js # Export vers format partagé
│   │   ├── Button.json          # Exemple de symbole
│   │   └── manifest.json        # Exemple de manifeste
│   │
│   ├── stage/
│   │   └── Stage.js             # Gestion de la scène
│   │
│   ├── ui/                     # Interface utilisateur
│   │   ├── Panel.js
│   │   ├── LibraryPanel.js
│   │   └── ...
│   │
│   └── main.js                 # Point d'entrée
│
└── docs/                        # NOUVEAU : Documentation
    ├── README.md               # Index de la documentation
    └── SHARED_SYMBOLS.md       # Documentation détaillée des symboles partagés
```

---

## 🎨 Concepts clés

### 1. **Symbole**
Un symbole est un élément réutilisable dans TweenJS, similaire aux symboles Flash/AnimateCC.
- **MovieClip** : Animation avec sa propre timeline
- **Graphic** : Graphique synchronisé avec la timeline parente

### 2. **Runtime**
Le `tweenRuntime.js` permet d'exécuter vos animations exportées dans un environnement de jeu.
- Sans dépendance
- Léger (~300 lignes)
- API simple et intuitive

### 3. **Symboles Partagés**
Inspirés des .SWC, ce sont des symboles exportables et réutilisables entre projets.
- Format JSON
- Manifeste pour les bibliothèques
- Catégorisation et tagging

---

## 📊 Comparaison avec Flash/AnimateCC

| Concept | Flash/AnimateCC | TweenJS |
|---------|----------------|---------|
| **Symbole** | MovieClip, Graphic, Button | MovieClip, Graphic (dans model.js) |
| **Timeline** | Timeline globale | Timeline par symbole |
| **Fichier projet** | .fla (binaire) | JSON (texte) |
| **Export runtime** | .swf | tweenRuntime.js |
| **Bibliothèque partagée** | .swc (binaire) | .json (texte) + manifest |
| **Code Actions** | ActionScript | JavaScript (dans l'éditeur) |
| **Rendu** | Flash Player | Canvas 2D |

---

## 🛠 Outils complémentaires

### 1. **SymbolRegistry**
Gestion centralisée des symboles partagés.

```javascript
import { 
  loadSharedSymbol, 
  loadSymbolManifest,
  getSharedSymbol 
} from './src/shared/SymbolRegistry.js';
```

### 2. **exportSharedSymbol**
Export de symboles depuis l'éditeur.

```javascript
import { exportSymbolToSharedFormat } from './src/shared/exportSharedSymbol.js';
const sharedSymbol = exportSymbolToSharedFormat(symbol);
```

---

## 📖 Index complet de la documentation

### Runtime & API
- **[Runtime CreateJS-like](export/README.md)**
  - Installation et utilisation
  - API MovieClip complète
  - Exemples avec canvas
  - Gestion des événements
  - Symboles imbriqués

### Symboles Partagés
- **[Symboles Partagés (.SWC-like)](SHARED_SYMBOLS.md)**
  - Concept et avantages
  - Format des fichiers
  - Création de symboles
  - Utilisation dans un projet
  - API du SymbolRegistry
  - Manifestes de symboles
  - Exemples complets
  - Bonnes pratiques
  - Différences avec .SWC
  - Dépannage

---

## 🎓 Tutoriels

### Créer un jeu simple

1. **Créer vos assets** dans TweenJS
2. **Exporter comme symboles partagés**
3. **Importer dans votre jeu**
4. **Utiliser le runtime** pour les animer

### Exemple : Jeu de plateforme

```javascript
// Charger les symboles
await loadSymbolManifest('./shared/game/manifest.json');

// Créer le personnage
const player = createMovieClip(getSharedSymbol('player').data, {
  x: 100, y: 100
});

// Créer la plateforme
const platform = createMovieClip(getSharedSymbol('platform').data, {
  x: 100, y: 400
});

// Gestion des contrôles
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') {
    player.x += 5;
    player.gotoAndPlay('walk');
    player.scaleX = 1;
  }
  if (e.key === 'ArrowLeft') {
    player.x -= 5;
    player.gotoAndPlay('walk');
    player.scaleX = -1;
  }
  if (e.key === ' ') {
    player.gotoAndPlay('jump');
  }
});

// Boucle de jeu
function gameLoop(dt) {
  player.update(dt);
  platform.update(dt);
  
  // Dessiner
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  platform.draw(ctx);
  player.draw(ctx);
  
  requestAnimationFrame(gameLoop);
}
```

---

## 🤝 Contribuer

Les contributions sont les bienvenues !

- **Runtime** : Améliorations du `tweenRuntime.js`
- **Symboles Partagés** : Nouveaux formats, optimisations
- **Documentation** : Ajouts, corrections, traductions
- **Exemples** : Plus de démonstrations

---

## 📄 Licence

MIT - Voir le fichier [LICENSE](../LICENSE) pour plus de détails.

---

## 🎉 Conclusion

TweenJS combine le meilleur de deux mondes :
- **L'expérience familière** de Flash/AnimateCC
- **Les technologies modernes** du web (JavaScript, JSON, Canvas)

Avec :
- ✅ Un **éditeur complet** pour créer vos animations
- ✅ Un **runtime léger** pour les exécuter
- ✅ Un système de **symboles partagés** pour réutiliser vos assets
- ✅ Une **documentation complète** pour tout comprendre

Prêt à créer des jeux incroyables ? 🚀

---

## 📞 Support

- **Documentation** : Voir les fichiers dans `/docs`
- **Code source** : Explorer `/src/export` et `/src/shared`
- **Problèmes** : Ouvrir une issue sur GitHub
- **Questions** : Voir la section FAQ dans la documentation

---

*Documentation générée le 31 juillet 2026*
