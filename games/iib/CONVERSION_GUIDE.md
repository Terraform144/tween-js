# Guide de Conversion IIB.swf vers JavaScript

## Introduction

Ce guide explique comment convertir votre jeu Flash (IIB.swf) en JavaScript en utilisant le système de MovieClip de cette application.

## Structure du Projet

```
games/iib/
├── index.html          # Page HTML du jeu
├── main.js             # Code principal du jeu
├── tween-runtime.js    # Runtime MovieClip (adapté de src/export/tweenRuntime.js)
├── iib-data.js          # **Données du jeu à extraire du SWF**
└── CONVERSION_GUIDE.md # Ce guide
```

## Étapes de Conversion

### 1. Extraire les informations du SWF

Vous avez besoin d'extraire ces informations depuis IIB.swf :

#### A. Propriétés de la scène principale
- **Taille** (width, height) - Ex: 800x600
- **Frame rate** - Ex: 24 fps
- **Couleur de fond** - Ex: #000000
- **Nombre total de frames**
- **Labels de frames** (si présents)

#### B. Lister tous les symboles (MovieClip/Graphic)
Pour chaque symbole, notez :
- **Nom** (ex: player_mc, enemy_mc)
- **Type** (movieclip ou graphic)
- **Nombre de frames**
- **Labels de frames** dans le symbole

#### C. Structure des layers et keyframes
Pour chaque symbole et pour la scène principale :
- **Layers** avec leurs noms et visibilité
- **Keyframes** avec :
  - Index de la frame
  - Éléments présents (formes, instances)
  - Tweens entre les keyframes

#### D. Propriétés des éléments dans chaque keyframe
Pour chaque élément (forme ou instance) :
- **Type** (shape/instance)
- **ID unique**
- **Position** (x, y)
- **Transformation** (rotation, scaleX, scaleY, opacity)
- Pour les **shapes** :
  - Type de forme (rect, ellipse, line, path, text)
  - Dimensions (width, height)
  - Style (fill, stroke, strokeWidth)
  - Pour les paths : points de contrôle
  - Pour le text : contenu, font, taille
- Pour les **instances** :
  - Symbole référencé (symbolId)

### 2. Outils recommandés pour l'extraction

#### Option A: Utiliser l'éditeur TweenJS existant
1. Ouvrez l'éditeur (index.html dans la racine du projet)
2. Utilisez l'option "Importer SVG" ou créez manuellement les symboles
3. Une fois votre contenu créé, utilisez la fonction d'export dans `src/ui/MenuBar.js`
4. Exportez les symboles en tant que classes JS

#### Option B: Outils externes
- **FFDec (JPEXS Free Flash Decompiler)** - https://github.com/jindrapetrik/jpexs-decompiler
  - Ouvrez IIB.swf dans FFDec
  - Parcourez la structure des symboles
  - Exportez les images et les données

- **Adobe Animate** (si disponible)
  - Ouvrez le SWF
  - Exportez les assets

- **SWF to HTML5 converters** (en ligne)
  - Attention à la qualité et à la propriété intellectuelle

#### Option C: Extraction manuelle
Si vous n'avez pas accès à des outils, vous pouvez :
1. Ouvrir le SWF dans un navigateur avec un plugin Flash émulé (Ruffle)
2. Capturer des screenshots et noter les positions
3. Reconstruire manuellement dans l'éditeur TweenJS

### 3. Remplir iib-data.js

Éditez `iib-data.js` avec les données extraites. Voici un exemple partiel :

```javascript
export const gameData = {
  stage: {
    width: 800,        // Largeur de la scène
    height: 600,       // Hauteur de la scène
    frameRate: 24,     // Framerate du SWF
    backgroundColor: '#000000',
    frameCount: 100,   // Nombre total de frames
    frameLabels: {
      0: 'start',
      50: 'level2',
    },
  },

  symbols: {
    'player_mc': {
      type: 'movieclip',
      name: 'player_mc',
      frameCount: 10,
      frameLabels: { 0: 'idle', 5: 'run' },
      layers: [
        {
          id: 'layer1',
          name: 'Player Body',
          visible: true,
          locked: false,
          keyframes: [
            // Frame 0
            {
              index: 0,
              elements: [
                {
                  kind: 'shape',
                  id: 'player_body',
                  shapeType: 'rect',
                  x: 0, y: 0,
                  width: 40, height: 60,
                  fill: '#FF0000',
                  stroke: '#000000',
                  strokeWidth: 2,
                },
                // ... autres éléments
              ],
              tween: null,
            },
            // Frame 5
            {
              index: 5,
              elements: [
                // ... éléments de la frame 5
              ],
              tween: { easing: 'linear' },
            },
          ],
        },
      ],
    },
    // ... autres symboles
  },

  mainTimeline: {
    layers: [
      {
        id: 'bg_layer',
        name: 'Background',
        visible: true,
        locked: false,
        keyframes: [
          {
            index: 0,
            elements: [
              {
                kind: 'instance',
                id: 'bg_1',
                symbolId: 'background',
                x: 400, y: 300,
                rotation: 0,
                scaleX: 1, scaleY: 1,
                opacity: 1,
              },
            ],
            tween: null,
          },
        ],
      },
      {
        id: 'player_layer',
        name: 'Player',
        visible: true,
        locked: false,
        keyframes: [
          {
            index: 0,
            elements: [
              {
                kind: 'instance',
                id: 'player_instance',
                symbolId: 'player_mc',
                x: 400, y: 500,
                rotation: 0,
                scaleX: 1, scaleY: 1,
                opacity: 1,
              },
            ],
            tween: null,
          },
        ],
      },
    ],
  },
};
```

### 4. Tester le jeu

1. Ouvrez `games/iib/index.html` dans un navigateur
2. Vérifiez que tout s'affiche correctement
3. Testez les animations et les interactions

### 5. Adapter le code du jeu (main.js)

Modifiez `main.js` selon vos besoins :
- Adaptez les contrôles
- Modifiez la logique de jeu
- Ajoutez des fonctionnalités spécifiques

## Exemple de données complètes

Pour un jeu simple avec un joueur et des ennemis :

```javascript
// Dans iib-data.js

// Symbole du joueur avec animation
export const gameData = {
  stage: {
    width: 800,
    height: 600,
    frameRate: 24,
    backgroundColor: '#000000',
    frameCount: 1,
    frameLabels: {},
  },

  symbols: {
    // Joueur
    'player_mc': {
      type: 'movieclip',
      name: 'Player',
      frameCount: 12,
      frameLabels: {
        0: 'idle',
        4: 'run',
        8: 'jump'
      },
      layers: [
        {
          id: 'body_layer',
          name: 'Body',
          visible: true,
          locked: false,
          keyframes: [
            // Frame 0 - Idle
            {
              index: 0,
              elements: [
                {
                  kind: 'shape',
                  id: 'player_body',
                  shapeType: 'rect',
                  x: 0, y: 0,
                  width: 30, height: 50,
                  fill: '#FF3333',
                  stroke: '#CC0000',
                  strokeWidth: 2,
                },
                {
                  kind: 'shape',
                  id: 'player_head',
                  shapeType: 'ellipse',
                  x: 0, y: -25,
                  width: 25, height: 25,
                  fill: '#FFAA88',
                },
              ],
              tween: null,
            },
            // Frame 4 - Run
            {
              index: 4,
              elements: [
                {
                  kind: 'shape',
                  id: 'player_body',
                  shapeType: 'rect',
                  x: 2, y: 0,
                  width: 30, height: 50,
                  fill: '#FF3333',
                  stroke: '#CC0000',
                  strokeWidth: 2,
                },
                {
                  kind: 'shape',
                  id: 'player_head',
                  shapeType: 'ellipse',
                  x: 2, y: -23,
                  width: 25, height: 25,
                  fill: '#FFAA88',
                },
                // Ajouter une jambe
                {
                  kind: 'shape',
                  id: 'player_leg',
                  shapeType: 'rect',
                  x: -10, y: 25,
                  width: 8, height: 20,
                  fill: '#CC0000',
                },
              ],
              tween: { easing: 'linear' },
            },
          ],
        },
      ],
    },

    // Ennemi
    'enemy_mc': {
      type: 'movieclip',
      name: 'Enemy',
      frameCount: 6,
      frameLabels: { 0: 'fly' },
      layers: [
        {
          id: 'enemy_layer',
          name: 'Enemy',
          visible: true,
          locked: false,
          keyframes: [
            {
              index: 0,
              elements: [
                {
                  kind: 'shape',
                  id: 'enemy_body',
                  shapeType: 'ellipse',
                  x: 0, y: 0,
                  width: 40, height: 30,
                  fill: '#33FF33',
                  stroke: '#00CC00',
                  strokeWidth: 2,
                },
                {
                  kind: 'shape',
                  id: 'enemy_eye',
                  shapeType: 'ellipse',
                  x: 10, y: -5,
                  width: 8, height: 8,
                  fill: '#000000',
                },
              ],
              tween: null,
            },
          ],
        },
      ],
    },

    // Projectile
    'bullet_mc': {
      type: 'movieclip',
      name: 'Bullet',
      frameCount: 1,
      frameLabels: {},
      layers: [
        {
          id: 'bullet_layer',
          name: 'Bullet',
          visible: true,
          locked: false,
          keyframes: [
            {
              index: 0,
              elements: [
                {
                  kind: 'shape',
                  id: 'bullet',
                  shapeType: 'ellipse',
                  x: 0, y: 0,
                  width: 12, height: 12,
                  fill: '#FFFF00',
                  stroke: '#CCCC00',
                  strokeWidth: 2,
                },
              ],
              tween: null,
            },
          ],
        },
      ],
    },

    // Arrière-plan
    'background': {
      type: 'graphic',
      name: 'Background',
      frameCount: 1,
      frameLabels: {},
      layers: [
        {
          id: 'bg_layer',
          name: 'Background',
          visible: true,
          locked: false,
          keyframes: [
            {
              index: 0,
              elements: [
                {
                  kind: 'shape',
                  id: 'bg_rect',
                  shapeType: 'rect',
                  x: 0, y: 0,
                  width: 800, height: 600,
                  fill: '#111122',
                },
                // Ajouter des étoiles ou autres éléments
                {
                  kind: 'shape',
                  id: 'star_1',
                  shapeType: 'ellipse',
                  x: 100, y: 50,
                  width: 4, height: 4,
                  fill: '#FFFFFF',
                },
              ],
              tween: null,
            },
          ],
        },
      ],
    },
  },

  // Scène principale
  mainTimeline: {
    layers: [
      {
        id: 'bg_layer',
        name: 'Background',
        visible: true,
        locked: false,
        keyframes: [
          {
            index: 0,
            elements: [
              {
                kind: 'instance',
                id: 'bg_instance',
                symbolId: 'background',
                x: 400, y: 300,
                rotation: 0,
                scaleX: 1, scaleY: 1,
                opacity: 1,
              },
            ],
            tween: null,
          },
        ],
      },
      {
        id: 'player_layer',
        name: 'Player',
        visible: true,
        locked: false,
        keyframes: [
          {
            index: 0,
            elements: [
              {
                kind: 'instance',
                id: 'player_instance',
                symbolId: 'player_mc',
                x: 400, y: 500,
                rotation: 0,
                scaleX: 1, scaleY: 1,
                opacity: 1,
              },
            ],
            tween: null,
          },
        ],
      },
    ],
  },
};
```

## Types de formes supportés

- **rect** : Rectangle
  - `x, y` : Position du centre
  - `width, height` : Dimensions
  - `fill` : Couleur de remplissage
  - `stroke, strokeWidth` : Contour

- **ellipse** : Ellipse/Cercle
  - `x, y` : Position du centre
  - `width, height` : Diamètres (pas rayons)
  - `fill, stroke, strokeWidth`

- **line** : Ligne
  - `points` : Tableau de PathPoint
  - `stroke, strokeWidth`

- **path** : Chemin Bézier
  - `points` : Tableau de PathPoint avec contrôles
  - `closed` : Booléen pour chemin fermé
  - `fill, stroke, strokeWidth`

- **text** : Texte
  - `text` : Contenu textuel
  - `fontSize, fontFamily`
  - `fill` : Couleur

## PathPoint

```javascript
{
  x: 0, y: 0,        // Position
  cIn: { x: 0, y: 0 },  // Vecteur de contrôle d'entrée (null si non présent)
  cOut: { x: 0, y: 0 }, // Vecteur de contrôle de sortie (null si non présent)
  smooth: false        // Si vrai, cIn et cOut sont miroir
}
```

## Conseils

1. **Commencez simple** : Extrayez d'abord la scène principale et un ou deux symboles
2. **Testez souvent** : Vérifiez que chaque symbole s'affiche correctement
3. **Utilisez des labels** : Ajoutez des labels de frame pour faciliter le contrôle
4. **Optimisez** : Pour les jeux complexes, regroupez les éléments statiques dans des Graphics
5. **Backup** : Sauvegardez souvent vos progrès

## Fonctions utilitaires

Dans `iib-data.js`, vous trouverez des fonctions utiles :

```javascript
// Créer une nouvelle instance d'un symbole
createInstance(symbolId, props)

// Obtenir les données pour créer un MovieClip
getMovieClipData(symbolId)
```

## Personnalisation du jeu

Dans `main.js`, vous pouvez :

1. **Modifier les contrôles** : Changez la gestion des inputs
2. **Ajouter de la logique de jeu** : Modifiez updatePlaying()
3. **Créer de nouveaux types d'objets** : Ajoutez des classes pour les ennemis, bonus, etc.
4. **Gérer les collisions** : Améliorez checkCollisions()
5. **Ajouter des effets sonores** : Utilisez l'API Web Audio

## Prochaines étapes

1. [ ] Extraire les données de IIB.swf
2. [ ] Remplir iib-data.js avec vos données
3. [ ] Tester le rendu
4. [ ] Adapter main.js selon votre game design
5. [ ] Ajouter les fonctionnalités spécifiques du jeu

## Support

Si vous avez des questions ou des problèmes :
- Vérifiez la console du navigateur pour les erreurs
- Comparez avec le code de l'éditeur TweenJS original
- Consultez la documentation de Konva.js (utilisé par l'éditeur)

Bonne conversion !
