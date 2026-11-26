# TODO — Idées et prochaines étapes TweenJS
*Mis à jour le 18/11/2026 — colonne des calques escamotable + infobulle nom de calque livrées (session 39, non committée) ; avant : scrollbars + piste caméra timeline v2 + Scene.camera pushées sur origin/TweenJS_workflow.V.0.1*

---

## ✅ Livré le 29/10/2026 (commits 510572f..392e26d, pushés)

- [x] **Onion skinning** — fantômes bleus (passé) / rouges (futur), opacité dégressive, contrôles timeline, persisté. Harnais 31/31 + E2E 17/17.
- [x] **Couleurs transparentes** — `transparent` pour fill/stroke, bouton ∅ UNIQUEMENT dans les propriétés de la forme (demande user), tween fondu alpha (éditeur + runtime). Harnais 14/14 + E2E 11/11.
- [x] **Masque de calque** — layer.mask/masked, toggles timeline, layer Konva dédié par bloc + destination-in, fantôme gris 15% des parties rognées en édition seule, runtime offscreen. Harnais 9/9 + E2E 14/14.
- [x] **Motion guide** — layer.guide/guided, trajectoire Bézier par longueur d'arc, tween guidé partout, guide non rendu en lecture/export. Harnais 17/17 + E2E 8/8.

## 🎯 Prochaines priorités

- [x] **Dégradés (linéaire / radial)** — ✅ livré 29/10 : uniquement dans les propriétés de la forme (demande user), stops éditables avec ∅ transparent, tween interpolé, éditeur + tous les exports. Harnais 21/21 + E2E 13/13 (pixels éditeur + export).
- [x] **Export vidéo WebM** — ✅ livré 31/10 : menu Fichier > « Exporter vidéo WebM… », `src/export/videoExport.js` (MediaRecorder vp9>vp8>webm sur canvas 2D alimenté par `stage.konvaStage.toCanvas()` à chaque changement de frame, une passe frame 0→frameCount-1 pilotée par la boucle de lecture réelle, état restauré après, `<nom>.webm` téléchargé). Harnais 16/16 + E2E navigateur 8/8 (blob EBML valide). v2 : piste audio muxée, boucle N passes, choix résolution/bitrate.

## 🔧 Confort / précision

- [x] **Grille + aimants (snap) + règles** — ✅ livré 29/10 : grille overlay (espacement réglable), snap des déplacements/créations, règles graduées haut/gauche + guides tirés depuis les règles (persistés doc.guides, clic droit supprime), persistés en prefs. Harnais 16/16 + E2E 7/7.
- [x] **Shape hints pour le morphing** — ✅ livré 31/10 : `core/shapeHints.js` (pur) — `el.shapeHints = [{id, pointIndex}]`, paires par même id des deux côtés (éléments appariés par id entre kf) ; `computePointMatch` = bijection par ordre circulaire global depuis le 1er hint (null si pas de hints communs → appariement par index historique). Branché dans `interpolateElement` (éditeur) + copie autonome dans tweenRuntime.js (runtime exporté). UI : section « Shape hints » du panneau Propriétés (formes à points). Harnais 16/16 (incl. copie runtime extraite du vrai source).
- [x] **Copier/coller entre les fenêtres-projets** — ✅ livré 29/10 : presse-papiers global partagé (Ctrl+C/X/V), assets (bitmaps) et symboles importés automatiquement dans le projet cible au collage. E2E 9/9 (rect + instance/symbole + bitmap cross-projets, Ctrl+X).
- [x] **Piste audio dans la timeline** — ✅ livré 29/10 (c9e9634) : import audio (menu Fichier), piste Audio dans la timeline (select + bouton +, dblclic cellule, clic droit supprime), son joué à la frame atteinte en lecture éditeur + exports. Harnais 12/12 + E2E 8/8 (espion Audio.play).
- [x] **Sons dans les scripts** — ✅ testé 29/10 : createjs.Sound embarqué mais AUCUN plugin ne s'active dans ce navigateur (activePlugin null, play -> playFailed) -> on ne s'appuie pas dessus. Remplacé par **`Scene.playSound(idOuNomOuUrl)`** (sceneRuntime + Scenes exportés) via Audio natif : vérifié éditeur (Exécuter) + export HTML (au chargement), espion Audio.play. Harnais repro_soundjs.mjs 4/4.
- [x] **Thème sombre Solarized dark** — ✅ livré 31/10 : le CSS était déjà en variables → bloc `[data-theme="dark"]` (bg-0 #002b36, text #839496, accents inchangés) + nouvelles vars `--ruler-bg`/`--stage-shadow` ; la feuille #stage-container reste blanche (c'est le document). Bascule Fichier > « Thème sombre » (icône lune), persistée pref `tweenjs:theme`, appliquée au chargement. style.css vanilla synchronisé. Harnais 6/6 (cohérence des vars) + E2E 11/11 (bascule, computed #002b36/#839496, pref, reload, feuille blanche, 0 pageerror).

## 💡 Gros projets (continuité workflow VS Code)

- [x] **Autocomplétion de l'API du clip dans CodeMirror** — ✅ livré 31/10 : module pur `src/ui/completions.js` (Scene racine vs scope clip selon la cible éditée, `createjs.` + sous-API Tween/Ease/Ticker/Sound + `Tween.get(...).`/`new LoadQueue().`, noms d'instances + props + API événements). Harnais 28/28 + probe CM6 (vrai CompletionContext) + E2E navigateur 7/7. Bug pré-existant corrigé au passage : les sources étaient passées en un seul array à `data.of` (completeFromList → crash FuzzyMatcher) — une extension `data.of` PAR source maintenant.
- [x] **Export "projet vers dossier"** — ✅ livré 31/10 : `src/export/projectExport.js`, menu Fichier > « Exporter projet vers dossier… ». Arborescence `projet.json` (tjsFormat=folder-project v1, metas scriptFile retirées, assets en `src: "assets/<fichier>"` sans dataUrl) + `assets/*` (binaires décodés, extensions depuis le type MIME, collisions gérées) + `scripts/*.js` (scripts nommés, `<sym>_class.js`, `<sym>_f<n>_<calque>.js`, `scene_f<n>_*.js`). Dossier FSA via showDirectoryPicker (Chromium), ZIP via makeZip en fallback. Harnais 18/18 + E2E navigateur 9/9 (faux handle FSA, arborescence vérifiée octet par octet).
- [x] **v2 « Ouvrir un dossier… »** — ✅ livré 31/10 : `loadProjectFromDirectory()` (readDirRecursive via handle.entries(), projet.json + assets relus en dataUrl + scripts/*.js réinjectés par `applyScriptFiles` — le .js écrase le code inline, match par convention de nommage de l'export ; fallback : code inline du JSON si .js absent). Ouvert dans une nouvelle fenêtre-projet. Harnais round-trip 9/9 + E2E 7/7 (export → modif .js « VS Code » → réouverture → v2 prioritaire, asset = octets exacts).

## 📖 PoC livre interactif

- [x] **Livre dont tu es le héros — la PoC** (12/11 soir) : `_wrk_mistral_mem/LIVRE_POC.test.json` (générateur : `gen_livre_poc.mjs`) — 7 pages labellisées p1..p7, boutons nommés cliquables (`Scene.onClick` + `gotoAndPlay`), 4 pages illustrées en vectoriel, page p4 avec `Scene.camera.set({zoom:1.25})`. Navigation épinglée via `onEnterFrame` (la timeline boucle en lecture). E2E `repro_e2e_livre_poc.mjs` 16/16 : éditeur (2 chemins complets, illustrations, zoom caméra 1.25 puis reset) + export HTML autonome (navigation OK, 0 pageerror). Chargeable via Ouvrir... dans l'app.

## 📋 Validations côté utilisateur — ✅ TOUTES VALIDÉES le 29/10/2026

- [x] Pivot déplaçable + Rotation (Q) + rotPin · Caméra (C) · script symbole + VS Code · retour arrière doc APK

## 📝 Backlog v2 (noté en session 18)

- [x] **Piste caméra dans la Timeline** — ✅ livré 12/11 : piste TOUJOURS visible en scène racine (même sans clé — c'est elle qui pose la 1re clé), bouton + = clé à l'image courante, double-clic image vide = poser / double-clic sur clé = supprimer, glisser = déplacer (contraintes de voisines), clic droit = cycle d'easing avec pastille colorée (easing-easeIn/Out/InOut), readout du zoom résolu à l'image courante dans la ligne. E2E `repro_e2e_camera_track.mjs` (v1, doc avec clés) toujours vert + `repro_e2e_camera_track2.mjs` 12/12 (doc SANS caméra) ; régressions mask 14/14 (sélecteurs positionnels corrigés), grid/onion/theme/guidesnap/scrollbars/touch_pan/projectopen/videoexport/guide OK.
- [x] **`Scene.camera` dans l'API scripts** — ✅ livré 12/11 : `Scene.camera` (x/y/zoom/rotation en lecture = état résolu à l'image courante, `hasKeyframes`, `set({...})` = pose une clé caméra à l'image courante, `remove()`) dans le runtime éditeur (sceneRuntime.js, scène racine) ET dans le bootstrap exporté (exportHTML.js, écrit DATA.camera, rendu via resolveCameraAtFrame/applyCameraToContext). Autocomplétion CodeMirror + référentiel docs v2 à jour. E2E `repro_e2e_scene_camera.mjs` 12/12 (éditeur : lecture f0/f10, set+read-after-write, remove, rendu scaleX=zoom en lecture ; export HTML : set+read EXPCAM2.5, 0 pageerror).
- [ ] Reste caméra : parallaxe par calque · édition à travers la caméra · lien vivant (FSA) sur les scripts d'image · watch par polling hors Chromium
- [x] **v2 masque : masques imbriqués + masque animé** — ✅ livré 21/11 (session 48, branche TweenJS_workflow.V.0.2) : computeMaskChain (chaîne externe->interne, un calque peut être mask+masked), rendu éditeur par groupe de chaîne (un dest-in par masque), runtime canvas offscreen en cascade, un calque mask+masked rendu en silhouette seule (sauf sélectionné). Masque animé = tween sur le calque masque, suivi frame par frame (éditeur + lecture). Harnais 9/9 + E2E v2 7/7 + non-régression E2E mask 14/14. · reste v2 guide : orientation selon la tangente, plusieurs objets par guide

## ⚙️ Améliorations pinceau

- [x] **5 nouveaux patterns de pinceau** — ✅ livré 09/11 : crayon, marqueur, aérographe, pinceau sec, craie (lignée Animate CC / Sketchbook), géométrie déterministe (grain par index, jamais Math.random). Harnais 63/63 + E2E 20/20 (dist + vanilla).
- [x] **Sensibilité à la pression du stylet** — ✅ livré 09/11 : toggle « Pression (stylet) » + sensibilité 0–100 % dans le panneau Pinceau, lu via PointerEvent.pressure (listener pointer sur le conteneur, Konva 9 émettant un MouseEvent sans pressure). Harnais 19/19 + E2E 7/7 (dist + vanilla, touch CDP avec force).
- [x] **Archives en ligne (./Archives, clé `?adm=4321`)** — ✅ livré 10/11 : section « En ligne » dans le menu Archives visible uniquement avec la clé (bouton « Sauvegarder en ligne » + liste/ouvrir/supprimer), endpoints `/api/archives` dans dev-server.py protégés par la clé (403 sinon, anti path-traversal), proxy Vite `/api` → dev-server.py, fallback téléchargement si hébergement statique. E2E 14/14 + curl (403/CRUD/traversal) + fallback vérifié.
- [x] **Texture bitmap + éclaboussures (spatter)** — ✅ livré 21/11 (session 47, branche TweenJS_workflow.V.0.2) : texture = asset image en mosaïque (fillPatternImage éditeur Konva, createPattern runtime canvas), éclaboussures = spatterDots() déterministe le long du core, aperçu live, panneau Pinceau (select Texture + checkbox/intensité). Harnais 9/9 + E2E 10/10, régressions pinceau 63/63 + 19/19.

## 🖱️ Zone de travail

- [x] **Colonne des calques escamotable + infobulle du nom** — ✅ livré 18/11 (session 39) : bouton `panelLeft` en tête de la toolbar timeline → classe `layers-hidden` sur `#timeline` (header + options masqués, `.tl-body` en `0px 1fr`, pistes pleine largeur), pref `timelineLayersHidden` persistée (repliée par défaut sur téléphone) ; `title` du `.layer-name` = nom complet + « double-clic pour renommer ». E2E `repro_e2e_layers_col.mjs` 15/15 ; régressions scrollbars 22/22, mask 14/14, camera_track2 OK.

- [x] **Scrollbars H/V quand la scène déborde** — ✅ livré 12/11 : `#stage-container` est lui-même le scroller (`overflow:auto`, `max-width/height:100%` dans `#stage-wrap`, centrage « sûr » par `margin:auto` — avec l'ancien `justify-content:center`, le débordement haut/gauche était coupé et inatteignable). Scrollbars natives dès que la feuille dépasse (zoom ou fenêtre étroite), plein écran compris (natif + repli CSS). Le pan (outil main) passe par le scroll natif (plus de transform CSS) : les scrollbars reflètent toujours la vue. Règles épinglées dans `#stage-wrap` (hors du scroller), graduations re-tracées à chaque scroll. Zoom (molette Ctrl / boutons) ancré au curseur / au centre via `applyZoom(anchor)`. E2E 22/22 (`repro_e2e_scrollbars.mjs`) + `repro_e2e_touch_pan.mjs` TOUS OK (pan tactile+souris, hors plein écran et en plein écran CSS) ; régressions grid/theme/guidesnap/onion/mask/projectopen/videoexport/camera_track/click OK. NB : repro_e2e_warp échoue P2/P3/P4 AUSSI sans ces changements (préexistant sur ce poste Linux).

---

*Règles : développement ADDITIF par défaut · AVANT chaque commit+push : synchroniser Animate_JS_PureVanilla (build:vanilla → cp bundle → cp style.css/README/docs/index.html) · builds dans l'ordre (vanilla → main) · déploiement production = JAMAIS par l'assistant (c'est l'utilisateur qui le fait) · push git = origin (GitHub) sur demande explicite · APK régénéré seulement sur demande explicite.*
