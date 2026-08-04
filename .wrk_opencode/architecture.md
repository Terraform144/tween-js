# Architecture

## Principe général

JS vanilla (ES modules), aucun framework UI. Konva.js est utilisé comme
moteur de rendu Canvas 2D de la scène. Tout le reste (état, timeline,
bibliothèque, propriétés, export) est écrit à la main.

Le flux est **centralisé sur un état mutable unique** :

```
action utilisateur (Stage / Timeline / Panel / Menu / Toolbar)
        │   modifie state + state.doc (modèle)
        ▼
   notify(state)   ← pub/sub (src/state.js)
        ▼
   renderAll() / subscribe()   ← chaque panneau se redessine
```

## Démarrage (`src/main.js`)

Ordre d'initialisation (important, des dépendances existent) :

1. `createDocument()` → document vide "Sans titre".
2. `createEditorState(doc)` → état central.
3. `createHistory(state)` → s'abonne immédiatement, DOIT voir chaque
   `notify()` avant le rendu pour que boutons undo/redo soient à jour.
4. `mountTimeline()` + `mountPropertiesPanel()` (référencés dans
   `onSelectionChange` du stage, donc montés avant).
5. `createStage()` → rendu Konva + outils + sélection ; `onSelectionChange`
   ne redessine QUE propriétés + timeline (jamais la scène).
6. `mountToolbar()` (avec `onDelete: stage.deleteSelected`).
7. Bannière d'édition de symbole (clic = retour à la scène).
8. `mountLibraryPanel()` (avec `addInstanceAt: stage.addInstanceAt`).
9. `mountMenuBar()` (undo/redo + `onStageResize`).
10. Sidebar : redimensionnement latéral, mode tiroir ≤1024px, persistance
    localStorage via `prefs.js`.
11. `renderAll()` + `stage.resize()`.
12. Boucle de lecture : `requestAnimationFrame(loop)` — avance
    `state.currentFrame` au `frameRate` du doc pendant `state.playing`.

## État central (`src/state.js`)

`createEditorState(doc)` retourne un objet mutable simple :

- `doc` — le document (remplacé en bloc par undo/redo).
- `editPath` — `[]` = scène racine, `[symbolId, ...]` = édition isolée.
- `currentFrame`, `selectedLayerId`, `selectedElementIds[]`,
  `selectedKeyframe`, `currentTool`, `playing`, `fillColor`,
  `strokeColor`, `strokeWidth`, `zoom`, `listeners` (Set).

Pub/sub minimal : `subscribe(state, fn)` / `notify(state)`.

## Annuler/rétablir (`src/history.js`)

- Snapshots **JSON de `state.doc`** uniquement (pas la sélection/l'outil/le
  scroll). 15 niveaux (`MAX_LEVELS`).
- N'abandonne d'entrée que si `state.doc` a vraiment changé (le pub/sub
  notifie aussi pour des mutations purement UI → filtrage par comparaison de
  la string JSON = plus besoin d'instrumenter chaque site de mutation).
- `restore()` : remplace `state.doc`, appelle `bumpIdCounterPastDocument()`
  (le compteur d'IDs globaux doit repasser au-dessus du doc restauré), purge
  les sélections/editPath obsolètes, re-notifie.
- `undo`/`redo` manipulent `undoStack`/`redoStack` ; la pile redo est vidée à
  chaque nouveau changement.

## Feature flags (`src/config.js`)

```js
export const ENABLE_BONES = false;  // squelettes/ossatures désactivés
```

Le code bones (Stage.js, model.js, PropertiesPanel.js) reste présent mais
inerte tant que le flag est `false`.

## Contexte d'édition (`editPath`)

`getContextLayers` / `getContextFrameCount` / `setContextFrameCount` /
`getFrameLabels` (dans `core/model.js`) résolvent la timeline active : celle
de la scène racine (`doc.layers`) ou celle du symbole courant
(`doc.symbols[dernierId].layers`). Toutes les mutations passent par ce
contexte pour rester dans le bon symbole.

## Persistance UI (`src/util/prefs.js`)

- Clés préfixées `tweenjs:` dans localStorage.
- `hasPref(key)` distingue "jamais réglé" de "réglé à false" → permet des
  défauts intelligents au premier chargement (ex. sidebar repliée sur
  mobile) qui ne priment plus dès que l'utilisateur a touché au réglage.
- `getPref`/`setPref` avec fallback et try/catch (navigation privée/quota).

## Responsive (`src/util/responsive.js`)

Seuils partagés JS/CSS (à garder synchronisés avec les media queries de
`style.css`) :

- `OVERLAY_BREAKPOINT = 1024` : la sidebar devient un tiroir overlay.
- `PHONE_BREAKPOINT = 640` : défauts au premier chargement (timeline repliée).
- `LARGE_SCREEN_BREAKPOINT = 1920` : TV/4K, contrôles agrandis.
- `isTouchLike()` = viewport étroit OU pointeur coarse (cibles tactiles).
