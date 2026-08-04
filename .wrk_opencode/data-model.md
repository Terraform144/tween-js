# Modèle de document (`src/core/model.js`)

Objets JSON simples (pas de classes) — facilement sérialisables et
partageables avec le runtime d'export. Toutes les fonctions sont pures (pas
de classe, des factories + helpers).

## IDs

- `nextId(prefix)` → `prefix + compteur global croissant` (ex. `shape12`,
  `layer3`, `sym4`, `inst5`, `bone6`, `doc1`).
- `resetIdCounter(value)` / `bumpIdCounterPastDocument(doc)` : après un
  undo/redo ou une ouverture de fichier, le compteur doit repasser au-dessus
  du plus grand ID trouvé dans le doc (sinon collisions d'IDs).

## Structure

```
Document
├── id, name, width (550), height (400), frameRate (24)
├── backgroundColor
├── frameCount (24)
├── layers: [ Layer, ... ]
├── symbols: { [symbolId]: Symbol }
├── assets: { [assetId]: Asset }   (bibliothèque d'images)
└── frameLabels: { [frameIndex]: 'label' }

Layer
├── id, name, visible, locked
└── keyframes: [ Keyframe, ... ]   (triés par index croissant)

Keyframe
├── index
├── elements: [ Element, ... ]
└── tween: { easing: 'linear'|'easeIn'|'easeOut'|'easeInOut' } | null

Symbol (== Document miniature)
├── id, name, type ('movieclip' | 'graphic')
├── frameCount, layers, frameLabels
```

## Éléments

**Shape** (`createShape(shapeType, props)`), `kind: 'shape'` :
- `shapeType`: 'rect' | 'ellipse' | 'line' | 'path' | 'text'
- Props communes : `x, y, width, height, rotation, scaleX, scaleY, opacity,
  fill, stroke, strokeWidth, closed`
- `points: []` pour line/path — points relatifs à (x,y)
- Text : `text, fontSize, fontFamily`
- Skinning : `skeletonId`, `boneId` (rétrocompat, `skeletonId` prioritaire)

**PathPoint** (`createPathPoint(x, y, {cIn, cOut, smooth})`) :
- `cIn`/`cOut` = vecteurs de poignée relatifs au point (pas des positions
  absolues), ou `null` pour un point anguleux.
- `smooth` → la sous-sélection déplace cIn/cOut en miroir.

**Instance** (`createInstance(symbolId, props)`), `kind: 'instance'` :
- `symbolId, name, x, y, rotation, scaleX, scaleY, opacity`

**Bitmap** (`createBitmap(assetId, props)`), `kind: 'bitmap'` :
- `assetId` → référence vers `doc.assets[assetId]` (une seule copie des
  pixels, plusieurs placements possibles — façon bibliothèque Animate).
- `x, y, width, height` (dimensions naturelles par défaut), `rotation,
  scaleX, scaleY, opacity`.

## Assets (`doc.assets`)

- `createAsset({ id, name, type, dataUrl, width, height })` /
  `addAsset(doc, asset)` / `getAsset(doc, id)`.
- `type`: 'image'. `dataUrl` = base64 → **sérialisable** (indispensable : les
  snapshots undo/redo et les exports reposent sur du JSON ; pas de références
  binaires).
- `bumpIdCounterPastDocument(doc)` scanne aussi `doc.assets` (les ids
  d'assets utilisent le même compteur global `nextId`).

**Bone** (`createBone(props)`), `kind: 'bone'` (inactif, flag `ENABLE_BONES`) :
- `x, y, length, width, height, rotation, parentBoneId, skeletonId, color,
  strokeWidth, influenceRadius`

## Helpers keyframe

- `sortKeyframes(layer)` : tri par index.
- `getActiveKeyframe(layer, frameIndex)` : la dernière clé dont `index <= frame`
  (résolution "image tenue"). Fondamental pour les boutons d'effacement.
- `getNextKeyframe` / `getKeyframeAt`.
- `insertKeyframe(layer, index)` : F6 — crée une vraie clé à `index`, clone le
  contenu de la clé active si elle précède (mêmes IDs d'éléments → les tweens
  continuent d'interpoler correctement).
- `insertBlankKeyframe(layer, index)` : F7 — clé vide (ou vide la clé existante).
- `removeKeyframe(layer, kf)` : refuse si le calque n'a qu'une clé.
- `moveKeyframe(layer, kf, targetIndex)` : glisser-déposer sur la timeline.
  Refuse de sauter PAR-DESSUS une clé voisine (index déjà occupé ou hors des
  bornes prev/next) car le tween n'est qu'un `kf.tween` + l'ordre du tableau :
  sauter une voisine casserait les tweens, rester entre deux voisines garde
  le tween intact (seule la durée change).
- `toggleTween(layer, kf)` : met/retire `tween` vers la clé suivante.

## Tweens

Pas de lien explicite "vers telle clé" : `kf.tween` + ordre du tableau
suffisent (`getNextKeyframe`). `easing`: linear | easeIn | easeOut | easeInOut.

## Contextes & labels

- `getContextLayers/getContextFrameCount/setContextFrameCount` : selon
  `editPath` (scène ou symbole).
- `getFrameLabels/getFrameLabel/setFrameLabel` : `{ [index]: label }` côté
  édition ; `invertFrameLabels` → `{ [label]: index }` pour le lookup O(1)
  `gotoAndPlay('label')` côté runtime.

## Lookup & garde-fous

- `findElementInLayers(layers, frameIndex, elementId)`.
- `symbolUsesSymbol(doc, host, candidate)` : détection de cycles de symboles
  imbriqués (parcours en profondeur du graphe d'instances). Empêche un
  symbole de se contenir lui-même.

## Fonctions bones (inertes)

- `getChildBones`, `getAllChildBones`, `getParentBone`,
  `getGlobalBoneTransform`, `solveIK` (CCD, chaînes de longueur quelconque),
  `perpendicularDistance`, `getSkeletonBones`,
  `calculateBoneWeightsForPoint` (falloff quadratique, normalisation),
  `applyBoneTransformToPoint`.

## Sérialisation

`serializeDocument` / `deserializeDocument` (avec `bumpIdCounterPastDocument`).
