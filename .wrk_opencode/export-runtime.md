# Playback, exports et runtime

## Interpolation (`src/playback/interpolate.js`)

Fonctions pures, partagées par l'éditeur ET (sous forme de copie autonome)
par le runtime exporté.

- `lerp(a, b, t)` ; `applyEasing(t, easing)` (linear, easeIn t², easeOut
  1-(1-t)², easeInOut) ; `lerpColor` (hex → RGB → lerp → hex).
- `NUMERIC_PROPS = [x, y, rotation, scaleX, scaleY, opacity, width, height]` ;
  `COLOR_PROPS = [fill, stroke]` (interpolés par `lerpColor`, string hex).
- `interpolateElement(a, b, t)` : clone `a`, lerpe les props numériques +
  couleurs si `b` a un pendant, et **morphe point à point** les courbes
  uniquement si `a.points.length === b.points.length` (sinon la forme reste
  rigide : elle ne fait que bouger/tourner/redimensionner).

> ⚠️ `tweenRuntime.js` contient sa propre copie de ces fonctions. Toute
> modification de logique d'interpolation doit être répercutée dans les deux
> fichiers (principe "une seule source" violé délibérément pour rendre les
> exports autonomes).

## Résolution d'image (`src/playback/resolve.js`)

- `resolveLayersAtFrame(layers, frameIndex)` : éléments de chaque calque
  visible, calque inférieur d'abord (layers[0] = bottom), avec `layerId` ajouté.
- `resolveLayerAtFrame(layer, frameIndex)` : `getActiveKeyframe`, et si
  `kf.tween`, interpole vers la clé suivante (t = clamped, easing appliqué),
  en appariant par ID d'élément (`next.elements.find(e => e.id === el.id)`).

## Export HTML autonome (`src/export/exportHTML.js`)

- Importe `tweenRuntime.js?raw` (source injectée telle quelle) → **aucune
  duplication** de la logique de rendu entre l'éditeur et l'export HTML.
- `buildFullDocData(doc)` : doc complet + symboles (labels inversés) → DATA.
- Génère un HTML avec un `<canvas>`, un `MovieClip(DATA)` racine et une boucle
  `requestAnimationFrame` (update(dt) + draw(ctx) + fond). Aucune dépendance,
  pas de build.
- Échappe `<` en `\u003c` dans le JSON embarqué (évite le parsing
  `</script>`).

## Runtime MovieClip (`src/export/tweenRuntime.js`)

Runtime autonome, sans dépendance (~290 lignes), API type CreateJS/EaselJS.

- `class MovieClip` : `x, y, rotation, scaleX, scaleY, opacity, visible,
  currentFrame (getter), frameCount (getter), isPlaying, loop, name`.
  Méthodes : `play, stop, gotoAndPlay(frameOrLabel), gotoAndStop, _goto,
  addEventListener, removeEventListener, update(dt), draw(ctx)`.
- Événements : `'loop'` (retour à la frame 0) et `'complete'` (fin sans
  boucle, s'arrête).
- `_goto` : par label (`data.frameLabels[label]` inversé) ou par index (clampé).
- `update(dt)` : avance frame par frame au `frameRate`, émet loop/complete,
  puis `_syncChildren` (avance les enfants movieclip).
- `draw(ctx)` : garantit la création des enfants même si draw précède le 1er
  update, applique transform, puis `_renderLayers` (sauf `!visible`).
- **Enfants imbriqués** (`_syncChildren`) : instances de type `movieclip`
  présentes à l'image courante → crée un `MovieClip` enfant indexé par **id
  d'instance** (deux instances du même symbole ont un état indépendant) ;
  retire les enfants disparus. Instances `graphic` → synchronisées sur
  l'image du parent (childFrame = parentFrame % frameCount).
- `drawShape(ctx, el, data)` : translate/rotate/scale/alpha puis dessine selon
  `shapeType` (rect, ellipse, line/path via `tracePath`, text) ou `kind:
  'bitmap'` (`ctx.drawImage` via le cache `__imageCache` par dataUrl, chargée
  par `getImage`). `data` = document embarqué (ses `assets` alimentent les
  bitmaps — la signature a changé de `drawShape(ctx, el)` à
  `drawShape(ctx, el, data)`, les deux appels dans `_renderLayers` sont à jour).
- Exporte aussi `createMovieClip(data, props)` (helper).

## Export symbole comme objet de jeu (`src/export/exportSymbol.js`)

- Télécharge 2 fichiers : `tween-runtime.js` (le runtime partagé, importé via
  `?raw`) + `<NomDuSymbole>.js` (classe `extends MovieClip`).
- `collectSymbolClosure(doc, rootSymbolId)` : ne garde que les symboles
  réellement utilisés (racine incluse), en inversant les labels, **+ les
  assets référencés** (`{ collected, assets }`) → les bitmaps survivent à
  l'export de symbole (`buildSymbolExportData` expose `assets`).
- `buildSymbolExportData` / `buildSymbolClassSource` → classe nommée
  `<Name>Clip` (camelCase, préfixe `_` si commence par un chiffre), avec la
  liste des labels disponibles en commentaire.
- `downloadSymbolAsGameObject` : télécharge le runtime puis, après 150ms, le
  fichier de classe (deux `downloadTextFile` successifs — délai pour éviter le
  blocage de téléchargements multiples par le navigateur).

## Symboles partagés (`src/shared/` — .SWC-like)

Système de bibliothèques de symboles réutilisables entre projets, inspiré des
.SWC d'Adobe Flash.

- `SymbolRegistry.js` : registre central — `registerSharedSymbol`,
  `loadSharedSymbol(url)`, `loadSymbolManifest(url)`, `getSharedSymbol(id)`,
  `getAllSharedSymbols`, `unregisterSharedSymbol`, `hasSharedSymbol`,
  `addSearchPath`, `createSymbolManifest`, `getSymbolUrl`.
- `exportSharedSymbol.js` : `exportSymbolToSharedFormat` (ajoute `_shared`
  metadata), `exportSymbolsToManifest` (catégorisation + tags auto selon le
  nom), `createSharedSymbolPackage`, `validateSharedSymbol`.
- Exemples : `Button.json` (bouton 4 états up/over/down/disabled sur 12
  frames, 2 calques), `manifest.json`.

## Runtime éditeur `Scene` (`src/runtime/sceneRuntime.js`)

Runtime d'exécution des scripts écrits dans l'éditeur (différent du runtime
d'export `tweenRuntime.js` : il pilote le document live via `state`).

- `createSceneRuntime({ state, onResize })` → `{ Scene, run, onFrame, dispose }`.
- `Scene` (alias `Game`) : getters/setters `width`, `height`, `frameRate`,
  `backgroundColor`, `name`, `frameCount` ; `playing`, `currentFrame` ;
  `play()`, `stop()`, `gotoAndPlay(f)`, `gotoAndStop(f)` ;
  `addShape(type, props)`, `addInstance(symbolId, props)` (insertion dans le
  keyframe actif du calque actif) ; `onEnterFrame(cb)`, `onKeyDown(cb)`,
  `onKeyUp(cb)`, `keys` (état du clavier) ; `random(n)`, `log(...args)`.
- `run(code, onConsole)` : `new Function('Scene','Game','console','named',...)`,
  vide les callbacks frame/touches à chaque exécution, `console` proxifié →
  `onConsole(level, args)`.
- **Noms d'instance** : au `run`, `getNamedElements(doc, editPath, currentFrame)`
  récupère les éléments portant un `el.name` ; chaque nom qui est un identifiant
  JS valide (et non réservé) est injecté en préambule du script comme variable
  directe — `nom.x += 1` manipule l'élément live du document. Les noms
  invalides (espace, mot réservé…) restent accessibles via la map `named`
  passée en 4e argument (`named['mon perso'].x`). La préférence va à la
  variable directe (préambule `var nom = named["nom"];`), aucun risque de
  collision avec `Scene`/`Game`/`console`/`named` (exclus du préambule).
- `onFrame(frame)` appelée par la boucle playback de `main.js#loop` (avance
  d'image) ; `dispose()` retire les listeners clavier.
- Sortie console → panneau Scripts (`.script-console`), niveau error en rouge,
  warn en jaune.

## Panneau Scripts (`src/ui/ScriptsPanel.js`)

- Monté sur `#scripts-panel` via `createPanel` ; scripts stockés dans
  `state.doc.scripts` (tableau de `{ id, name, code }`, `createScript`).
- Éditeur CodeMirror 6 (`basicSetup` + `javascript()`) ; persistance du code
  dans `sc.code` à chaque changement ; onglets (ajout `+ Nouveau`, renommage
  par double-clic, suppression), boutons Exécuter / Arrêter, console.
- Autocomplétion : sources ajoutées via `javascriptLanguage.data.of({ autocomplete: [sources] })`
  (combine avec l'autocomplétion JS native — pas d'override) :
  - `Scene.`/`Game.` → API Scene ;
  - identifiant nu → **Noms d'instance** du contexte courant (variables) ;
  - `nom.` (un élément nommé suivi d'un point) → propriétés animables
    (`x, y, rotation, scaleX, scaleY, opacity, width, height, fill, …`).
  Raccourci Ctrl+Entrée pour exécuter.
- Sérialisation : `serializeDocument = JSON.stringify(doc)` → `doc.scripts`
  survit au round-trip JSON (export → ouvrir) sans code supplémentaire.

## Util (`src/util/`)

- `download.js` : `downloadTextFile(text, filename, mime)` (Blob + lien).
- `prefs.js` : localStorage préfixé (voir architecture.md).
- `responsive.js` : seuils (voir architecture.md).
- `dragScroll.js` : `enableDragScroll(el)` — cliquer-glisser horizontal pour
  les barres qui débordent (menubar, timeline) quand on a une souris mais pas
  de molette horizontale ; actif uniquement pointeur `mouse`, ne démarre pas
  sur un clic de contrôle interactif (`button, input, select, textarea, label`).
- `importSvg.js` : `parseSvg(svgText, {x, y})` → éléments TweenJS. Supporte
  rect, circle, ellipse, line, path (M/L/H/V/C), text, polygon, polyline,
  groupes `<g>` aplatis (récursifs), styles inline (fill, stroke,
  stroke-width, opacity, font-*). Limitations : pas de transformations
  complexes, paths complexes importés fermés/ouverts.
