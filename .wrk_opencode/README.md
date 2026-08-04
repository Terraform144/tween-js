# Notes de travail — TweenJS (Animate_JS_PRJ)

Notes prises le 02/08/2026 sur l'application **TweenJS**, un éditeur
d'animation vectorielle image par image inspiré d'Adobe Animate.

## Sommaire

- [README.md](README.md) — ce fichier, vue d'ensemble
- [architecture.md](architecture.md) — architecture générale, flux de données
- [data-model.md](data-model.md) — modèle de document (doc/layer/keyframe/éléments)
- [stage-rendering.md](stage-rendering.md) — scène Konva, outils de dessin, résolution d'image
- [ui.md](ui.md) — composants d'interface (toolbar, timeline, panneaux, menu)
- [export-runtime.md](export-runtime.md) — exports (HTML, symbole JS) et runtime MovieClip
- [git-history.md](git-history.md) — branches, historique récent, état du dépôt

## En bref

- **Quoi** : éditeur d'animation vectorielle façon Adobe Animate, en
  JavaScript vanilla (ES modules, pas de framework UI), rendu Canvas 2D via
  **Konva.js**. Version 0.1.0.
- **Stack** : Vite 5.4 (build/dev), Konva 9.3 (seule dépendance runtime).
- **Code** : ~5800 lignes JS/CSS/HTML dans `src/`, gros morceaux :
  `stage/Stage.js` (~940 l.), `util/importSvg.js` (~600 l.),
  `core/model.js` (~540 l.), `ui/Timeline.js` (~360 l.),
  `export/tweenRuntime.js` (~290 l.).
- **Entrée** : `src/main.js` assemble un document + un état global + tous les
  panneaux + une boucle de lecture.
- **Modèle de données** : objets JSON simples (pas de classes) pour être
  sérialisables/partageables avec le runtime exporté.
- **État** : `state.js` = objet mutable + pub/sub `subscribe`/`notify`.
- **Annuler/rétablir** : snapshots JSON de `state.doc`, 15 niveaux, ne suit
  QUE le document (pas la sélection/UI).

## Fonctionnalités clés

- Outils : Sélection, Sous-sélection, Rectangle, Ellipse, Ligne, Plume
  Bézier, Texte. Raccourcis V/A/R/O/L/B/C/P/T.
- Timeline : calques, keyframes F6/F7, lecture Espace, scrub, glisser-déposer
  de clés, tween de mouvement avec 4 easings, labels de frame.
- Symboles MovieClip/Graphic, édition isolée (editPath), double-clic pour
  entrer, garde anti-boucle infinie (`symbolUsesSymbol`).
- Import SVG (rect/circle/ellipse/line/path/text/polygon, groupes aplatis,
  styles inline).
- Import bitmap (PNG/JPG/GIF/WebP) : menu Importer image… ou drag & drop sur
  la scène → `doc.assets` (une copie, réutilisable) + éléments `kind:'bitmap'`.
- Dégradés de couleur (remplissage/contour) : linéaire (angle) et radial,
  arrêts de couleur, interpolables entre keyframes.
- Export : HTML autonome, classe JS réutilisable (`extends MovieClip`) +
  runtime partagé sans dépendance, API type CreateJS/EaselJS.
- Morphing : courbe à même nombre de points sur la clé suivante → morphing
  point à point, sinon bloc rigide.
- Responsive : TV/4K (≥1920px), tablette/mobile (≤1024px overlay),
  cibles tactiles, `stage.scale()` jamais de transform CSS.
- Squelettes/os (bones) : désactivé par feature flag `ENABLE_BONES = false`
  dans `src/config.js` ; code présent mais inerte.

## Limites connues (d'après README + code)

- Pas de zoom/pan de scène.
- Contour en dégradé **radial** non supporté côté éditeur (Konva ne lit que
  `strokeLinearGradientColorStops`) — le runtime export (canvas brut) le gère.
- Morphing sans "shape hints" (appariement par index).
- Rotation des tracés autour du 1er point ; rect/ellipse/texte autour du centre.
- Pas d'ajout de poignée sur un point anguleux existant.
- Import SVG : transformations complexes non gérées.

## Conventions & pièges mémorisés

- Tout commit d'édition passe par le modèle, puis `notify(state)` → re-rendu
  partout (timeline, bibliothèque, propriétés, menu).
- La sélection NE doit JAMAIS reconstruire la scène (Konva perdrait la
  référence du drag en cours) — voir Stage.js `selectElement`.
- Ne jamais utiliser `getPointerPosition()`, toujours
  `getRelativePointerPosition()` (sinon bug "quart haut-gauche" sur mobile).
- Les snapshots undo bloquent le compteur d'IDs → `bumpIdCounterPastDocument`.
- Les runtimes d'export sont des copies autonomes de l'interpolation
  (`interpolate.js` / `tweenRuntime.js`) : toute modif de logique
  d'interpolation doit être répercutée aux deux endroits.
- `tracePath`/`traceSegment` sont partagés entre Stage et export mais le
  runtime a sa propre copie.
- Konva ne dessine les dégradés radiaux qu'en remplissage : un contour radial
  est donc neutralisé côté éditeur (couleur du dernier arrêt) alors que le
  runtime canvas brut le gère — ne pas "corriger" l'un sans l'autre.
- Fichiers de travail locaux : `_wrk_mistral_mem/session_log.md` (historique
  Mistral), `gameTest/` (AIR SDK HARMAN — non tracké), `dist/` (build).
- `.env` est tracké par git (attention aux secrets).
