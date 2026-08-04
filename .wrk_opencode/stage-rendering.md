# Scène, rendu et outils (`src/stage/Stage.js`)

Wrappe un `Konva.Stage` pour en faire un canvas façon Animate : rend le modèle
au frame/contexte courant et implémente les outils de dessin/sélection. Toutes
les modifications committées passent par le modèle puis `notify(state)`.

## Calques Konva

- `bgLayer` (rect de fond, non interactif)
- `contentLayer` (formes du document — reconstruit à chaque `render()`)
- `overlayLayer` (Transformer de sélection + poignées + aperçus de dessin +
  marquee)

## Résolution d'une image

`renderInto(parent, layers, frameIndex, tick, depth=0)` :
- appelle `resolveLayersAtFrame(layers, frameIndex)` (voir playback/resolve.js)
  → éléments interpolés visibles, calque inférieur d'abord.
- `depth 0` = contenu éditable du contexte courant ; `depth > 0` (contenu
  d'instances imbriquées) = visible mais non interactif (il faut
  double-cliquer pour entrer dans le symbole).
- Pour chaque `kind: 'instance'` : rend récursivement le symbole référencé.
  - `graphic` → synchronisé sur l'image du parent (`frameIndex % frameCount`).
  - `movieclip` → avance sur son propre `tick` (compteur global de lecture).
- Si un élément path/line a un `skeletonId`/`boneId` (flag bones), les points
  sont déformés par les poids des bones (code inactif par défaut).

`buildNode(el)` : construit le nœud Konva (Rect, Ellipse, Shape générique
pour line/path avec `sceneFunc` + `tracePath`, Text, Group pour instance/bone).
Les `line`/`path` utilisent un clone indépendant `elData` des points pour
pouvoir muter librement pendant un drag sans toucher au modèle avant le
`commitPoints()`. `getSelfRect` est recalculé depuis les vrais points
(le Shape générique ne connaît pas width/height).

## Bitmaps (rendu)

- **Bitmaps** : `imageCache`/`imagePending` par `assetId` ; un
  `Konva.Image` (branch `kind:'bitmap'`) est créé avec un placeholder rect
  dashed si l'image n'est pas encore décodée, puis `onload` →
  `render(currentTick)` (pour ne pas faire sauter les MovieClips imbriqués,
  `currentTick` est mémorisé dans `render`).
- **⚠️ Transformer & `getSelfRect`** : le cadre de sélection se base sur
  `getClientRect()` = `getSelfRect()` + transform, et la transform applique
  déjà `offsetX/offsetY` (le nœud est centré avec `offsetX: width/2`).
  Il ne faut donc PAS override `getSelfRect` avec un rect centré (`-w/2`)
  sur un nœud offseté : le décalage serait appliqué deux fois et le
  Transformer glisserait en haut-gauche de l'image. Le défaut Konva
  (`{x:0, y:0, width, height}`) est correct — c'est la version actuelle
  (bug corrigé après un premier commit qui surdécalait la boîte).

## Sélection

**Règle d'or** (commentaires en tête de `selectElement`) : sélectionner ne
modifie PAS le document → on ne reconstruit JAMAIS la scène pour ça. Le
handler tourne pendant le `mousedown` qui arme aussi le drag Konva sur ce
nœud ; détruire/recréer le nœud pendant que le bouton reste enfoncé ferait
perdre à Konva la référence du geste et le drag s'arrêterait net. On
rafraîchit donc uniquement les poignées du Transformer + `onSelectionChange`.

- `state.selectedElementIds` + `selectedLayerId`.
- Clic = sélection simple, Shift = additif (toggle).
- Clic sur le vide = marquee (sélection rectangulaire liseret pointillé) ;
  clic simple sans glissé ≤ 3px = vide la sélection.
- Suppr/Backspace = `deleteSelected()` (filtre la keyframe active).
- Pendant `state.playing`, le Transformer est vidé (pas de sélection).

## Transformation

- Drag direct (nœud draggable) et Transformer (redimensionner/rotater).
- `commitTransform(id, layerId, node)` : réécrit x/y/rotation/scale dans la
  keyframe active (en insérant une clé au besoin), propage aux bones enfants
  si bone (code inactif), puis `notify`.
- `transformer.on('transformend')` → `commitTransform` pour chaque nœud.

## Outils de dessin

- **Position pointeur** : `stagePointer()` = `getRelativePointerPosition()`
  (l'inverse de la transform absolue du stage). `getPointerPosition()` brut
  ignore `stage.scale()` → sur mobile avec fitScale < 1, tous les tracés
  étaient confinés au quart haut-gauche. **Ne jamais revenir à
  getPointerPosition().**
- **rect/ellipse/line** : aperçu dashé dans overlayLayer, commit sur mouseup
  (`finishDrag`), taille min 2px.
- **pen (plume Bézier)** : clic = point anguleux ; clic-glissé > 3px =
  point lisse symétrique (cIn/cOut miroir) ; clic près du 1er point ≤ 8px =
  fermer ; Entrée/double-clic = terminer ; Échap = annuler. Boutons flottants
  Valider/Annuler (indispensables sur mobile sans clavier). `finishPen` stocke
  les points relatifs à l'origine (x,y) du tracé.
- **text** : crée un texte "Texte" au point cliqué, passe en sélection.
- **bone / boneChain** : outils ossatures (flag `ENABLE_BONES=false`,
  inactifs mais présents) — bone = drag simple, boneChain = chaîne avec
  skeletonId partagé.

## Sous-sélection (touche A)

- Sélectionner un path/line affiche ses ancres et poignées (`pointRefs`).
- Drag d'ancre → position du point ; drag de poignée → `cIn`/`cOut` ;
  `smooth` = miroir de l'autre poignée.
- Commit uniquement au `dragend` (`commitPoints`) → jamais de notify pendant
  un drag.

## Resize (responsive)

`resize()` : `fitScale = min(1, availW/doc.width, availH/doc.height)`, puis
`konvaStage.scale({x, y})` (zoom natif Konva, jamais de transform CSS).
Ne grossit jamais au-delà de 100%. Appelé au mount, au resize de fenêtre, au
resize de la sidebar, et après undo/redo (la taille du doc peut avoir changé).

## API exposée

`{ konvaStage, render, resize, addInstanceAt, deleteSelected, pointFromClient }`

- `pointFromClient(clientX, clientY)` : inverse la transform absolue du stage
  (utilisé par le drop d'image pour placer l'asset au pointeur, même zoomé).
