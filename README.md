# TweenJS

Éditeur d'animation vectorielle image par image, inspiré d'Adobe Animate,
en JavaScript vanilla (ES modules, sans framework UI). Konva.js est utilisé
comme moteur de rendu Canvas 2D pour la scène ; le reste (état, timeline,
bibliothèque, panneau de propriétés, export) est écrit à la main.

Thème Solarisé clair (fond crème, texte quasi-noir adouci, un seul accent —
rouge-orange par défaut) ; toutes les icônes de l'interface sont des SVG au
trait dessinés à la main dans `src/ui/icons.js` (voir cette section plus
bas). Interface responsive : TV/desktop grand écran, tablette et
smartphone (voir section dédiée plus bas).

## Démarrer

```bash
npm install
npm run dev
```

Ouvrir l'URL affichée (http://localhost:5173).

## Fonctionnalités

- **Annuler / rétablir** (Ctrl+Z / Ctrl+Y) : 15 niveaux, boutons ↩/↪ dans la
  barre de menu. Ne suit que les changements du document (formes, calques,
  images clés, symboles...), pas la sélection ni le défilement.
- **Panneaux réductibles** : bouton ▾/▸ sur la timeline, la bibliothèque et
  le panneau propriétés pour les réduire à leur barre de titre. Le conteneur
  latéral entier (bibliothèque + propriétés + futurs panneaux) se replie
  aussi d'un clic sur le bouton ◂/▸ au milieu de la poignée de
  redimensionnement. Cette poignée permet aussi de glisser pour élargir/
  rétrécir toute la colonne (tous les panneaux empilés en partagent la
  largeur). Tous ces réglages sont mémorisés (localStorage) d'une session à
  l'autre.
- **Scène** : outils Sélection, Sous-sélection, Rectangle, Ellipse, Ligne,
  Plume, Texte. Déplacement / redimensionnement / rotation via poignées.
  Suppr pour effacer la sélection.
- **Couleurs transparentes** : bouton ∅ à côté de chaque sélecteur de couleur
  (barre d'outils et panneau Propriétés) pour poser `transparent` en
  remplissage ou en contour — ex. contour noir + remplissage transparent
  (forme en fil de fer). Le hit-test sur l'intérieur continue de marcher, les
  tweens de couleur fondent proprement vers/depuis transparent (interpolation
  du canal alpha), et les exports la gèrent nativement.
- **Dégradés (linéaire / radial)** : dans le panneau Propriétés de la forme
  (et uniquement là), ligne « Dégradé » : aucun / linéaire / radial,
  coordonnées en fraction de la boîte de l'objet, stops de couleur éditables
  (offset 0..1, couleur, ∅ = transparent, +/✕ pour ajouter/supprimer). Le
  dégradé prime sur la couleur de remplissage, s'interpole dans les tweens
  (couleurs + positions, fondu d'alpha inclus) et fonctionne dans tous les
  exports. Rendu identique éditeur (Konva) et runtime (canvas 2D).
- **Motion guide** : deux boutons dans chaque ligne de calque — "guide de
  mouvement" (ce calque fournit la courbe, tracée avec la plume) et "calque
  guidé" (son tween suit la courbe au lieu d'une ligne droite, par longueur
  d'arc, easing compris). Le guide est visible/editable en édition, mais ni
  lu ni exporté. Fonctionne aussi dans les exports (HTML, compilé, PNG, objet
  de jeu).
- **Masque de calque** : deux boutons dans chaque ligne de calque de la
  timeline — "ce calque est un masque" et "ce calque est masqué". Un calque
  masque rogne les calques masqués juste en dessous (silhouette du masque) ;
  tant que le calque masque est sélectionné, il est affiché normalement pour
  être édité. Fonctionne en édition, pendant la lecture et dans tous les
  exports (HTML, compilé, PNG, objet de jeu).
- **Peau d'oignon (onion skin)** : fantômes des images voisines de la tête de
  lecture, affichés sous la scène pendant l'édition — **bleus vers le passé,
  rouges vers l'avenir**, avec une opacité dégressive (la plus proche est la
  plus visible). Bouton 👁-oignon + deux champs (nb passé / nb futur) dans la
  barre de la timeline ; réglage mémorisé d'une session à l'autre. Aucun effet
  pendant la lecture ni dans les exports (outil d'édition uniquement).
- **Caméra (touche C)** : caméra virtuelle de scène façon Animate CC pour des
  cadrages cinématographiques. Cadre en liseré pointillé sur la scène :
  glisser l'intérieur = déplacer le cadre (pan), poignées d'angle ou molette
  = zoom (la molette zoome autour du pointeur et fonctionne même quand les
  poignées sont hors feuille), poignée au-dessus = rotation. Chaque geste
  pose une image clé caméra à l'image courante (Suppr = la supprimer) ; le
  mouvement est interpolé automatiquement entre les images clés et appliqué
  à TOUTE la scène pendant la lecture et dans les exports (le cadre caméra
  est toujours mappé sur la surface entière du canvas de sortie). Sans image
  clé caméra, le rendu est strictement identique au comportement historique.
- **Import SVG** : bouton "Importer SVG" dans la barre de menu pour importer des
  fichiers vectoriels (.svg) et les convertir en formes éditables (rectangles,
  ellipses, lignes, courbes, texte, polygones).
- **Plume Bézier** : clic = point anguleux, clic-glissé = point lisse
  (poignées symétriques), clic près du premier point = fermer le tracé,
  Entrée/double-clic = terminer un tracé ouvert, Échap = annuler.
- **Sous-sélection (touche A)** : sélectionner une courbe existante affiche
  ses points d'ancrage et leurs poignées, déplaçables individuellement pour
  retoucher la forme après coup.
- **Simplification de forme** : pour les formes de type ligne ou tracé (Plume),
  le panneau Propriétés propose un bouton "Simplifier la forme" et un champ
  "Tolérance" avec bouton "Simplifier avec" pour réduire le nombre de points
  tout en conservant la silhouette. Utilise l'algorithme Ramer-Douglas-Peucker
  (RDP) : les points dont la distance à la nouvelle ligne est inférieure à la
  tolérance sont supprimés. Idéal pour optimiser les tracés complexes importés.
- **Morphing** : si une image clé tweenée contient une courbe avec
  exactement le même nombre de points que sur l'image clé suivante, ses
  points sont interpolés un à un (la forme se déforme) ; sinon elle bouge
  comme un bloc rigide (position/rotation/échelle) comme les autres formes.
- **Timeline** : calques (ajout, suppression, visibilité, verrouillage,
  renommage), images clés (F6), images clés vides (F7), lecture/pause
  (Espace), défilement (scrub) en cliquant sur la règle ou une cellule.
- **Tween de mouvement** : bouton "⇄" sur une image clé pour interpoler
  vers la suivante (position, rotation, échelle, opacité, couleurs), avec
  4 courbes d'accélération choisies dans le panneau Propriétés.
- **Fenêtres-projets** : plusieurs projets ouverts simultanément, un onglet
  par fenêtre dans le bandeau sous le menu. Clique un onglet pour afficher la
  fenêtre, reclique-le pour la réduire ; chaque projet garde sa timeline, ses
  propriétés, sa bibliothèque, ses scripts, sa sélection et son propre
  historique annuler/rétablir. Bouton "+ Nouveau" ; "Nouveau", "Ouvrir…" et
  "Archives" ouvrent désormais dans une nouvelle fenêtre sans rien perdre.
  La lecture se met en pause automatiquement quand une fenêtre n'est plus
  active. **Copier/coller entre projets** : Ctrl+C / Ctrl+X / Ctrl+V avec un
  presse-papiers partagé entre toutes les fenêtres — les images (assets) et
  les symboles référencés sont importés automatiquement dans le projet cible.
- **Symboles / bibliothèque** : sélectionner des objets puis "Convertir en
  symbole" (F8) crée un symbole Graphic ou MovieClip réutilisable ; double-
  clic sur une instance (ou un élément de la bibliothèque) pour éditer le
  symbole en mode isolé.
- **Labels de frame** : champ "Étiquette" dans la timeline pour nommer une
  image (ex. "walk", "jump"), affichée sous forme de 🏷 sur la règle —
  utilisable avec `gotoAndPlay('walk')` une fois exporté.
- **Export "objet de jeu"** : bouton 🎮 sur un symbole dans la bibliothèque —
  télécharge `tween-runtime.js` (runtime `MovieClip` partagé, aucune
  dépendance) + `<NomDuSymbole>.js` (une classe `extends MovieClip` qui
  embarque les données du symbole et de ses dépendances). Utilisable dans
  n'importe quelle boucle de jeu :
  `import { MonPersoClip } from './MonPerso.js'; const c = new MonPersoClip();
  c.gotoAndPlay('walk'); /* boucle */ c.update(dt); c.draw(ctx);`
- **Export scène complète** : "Exporter HTML" génère un fichier HTML
  autonome (aucune dépendance, aucun build) qui rejoue toute l'animation
  avec un runtime Canvas 2D minimal embarqué. "Enregistrer JSON" / "Ouvrir…"
  permettent de sauvegarder et recharger le projet.
- **Export PNG (ZIP)** : "Exporter PNG (ZIP)" dans le menu Fichier rend TOUTES
  les images de l'animation en PNG (une par frame, à la taille du document)
  et télécharge l'ensemble dans un unique ZIP (`frame_0001.png`,
  `frame_0002.png`...). Le rendu est celui de la lecture : tweens, morphing,
  caméra de scène interpolée et MovieClips imbriqués (qui avancent d'une
  image par frame) inclus ; les scripts ne sont pas exécutés (animation
  "pure"). Idéal pour monter la séquence dans un logiciel de montage vidéo
  ou un moteur de jeu. L'archive ZIP est écrite à la main (format "stored",
  CRC32), sans aucune dépendance externe.
- **Scripts + CreateJS complet** : le panneau Scripts exécute du JavaScript
  avec l'API `Scene`/`Game` (play/stop/gotoAndPlay, onEnterFrame, onKeyDown,
  onClick...) et les instances nommées en variables directes. La bibliothèque
  CreateJS complète (EaselJS + TweenJS + SoundJS + PreloadJS 1.0.x, copie
  locale MIT dans `public/libs/createjs`) est injectée dans les scripts :
  `createjs.Tween.get(nom).to({x: 300}, 1000)`, `createjs.Sound`,
  `createjs.LoadQueue`, `createjs.Ticker`... Les instances nommées portent
  aussi les événements EaselJS (`nom.on("click", fn)`, mousedown, pressmove,
  rollover, tick...) pendant la lecture ; le Ticker CreateJS est mis en
  pause avec l'éditeur. L'export HTML inline automatiquement les libs
  CreateJS quand un script les utilise et offre la même API événements
  que l'éditeur (portées run/frame, pipeline pointeur, labels).
- **Script par MovieClip (classe AS3-like)** : chaque symbole MovieClip possède
  son propre script, exécuté UNE fois par instance au démarrage de la
  lecture (le constructeur), avant les scripts d'image de la première image.
  Dans le panneau Scripts, le bouton "MovieClip : ..." apparaît quand on
  édite un symbole. Le `Scene` y est scopé au clip : `Scene.stop()` arrête
  CE clip (pas la scène), `Scene.gotoAndPlay()` utilise les labels du
  symbole, et `Scene.onEnterFrame()` donne une boucle de jeu propre au clip
  (un clip arrêté ne tick pas, sémantique Animate). Même comportement dans
  l'export HTML autonome et l'export objet de jeu (le script est incrusté) ;
  en mode compilé (sans eval), les scripts de symbole sont ignorés.
- **Fichiers .js externes (workflow gros projets, façon Animate CC + AS3)** :
  chaque script (scène ou MovieClip) peut vivre dans un fichier .js édité
  dans un vrai éditeur de code. Dans le panneau Scripts : "Importer" copie le
  contenu d'un fichier .js dans le script (tous navigateurs), "Exporter" le
  télécharge, "VS Code" ouvre le fichier dans Visual Studio Code via le
  protocole `vscode://` (tous navigateurs, le dossier local est demandé une
  fois). Sur Chrome/Edge/Vivaldi, le bouton "Lier" va plus loin : le fichier
  est relu automatiquement au retour dans l'app (on sauvegarde dans VS Code,
  on revient, le code est à jour). Le contenu lié est toujours incrusté dans
  les exports : le HTML exporté reste 100% autonome.

## Structure

```
src/
  core/model.js           modèle de document (calques, images clés, formes, symboles, labels)
  playback/                interpolation + résolution d'une image (utilisé par l'éditeur)
  stage/Stage.js            rendu Konva + outils de dessin + sélection
  ui/                       Toolbar, Timeline, LibraryPanel, PropertiesPanel, MenuBar
  ui/Panel.js               enveloppe standard d'un panneau réductible (titre + corps) — à réutiliser pour tout nouveau panneau du conteneur latéral
  ui/icons.js               jeu d'icônes SVG au trait partagé (currentColor — suit automatiquement la couleur du bouton)
  export/exportHTML.js      export de toute la scène en HTML autonome (runtime Canvas 2D inline)
  export/tweenRuntime.js    runtime MovieClip partagé (play/stop/gotoAndPlay/update/draw)
  export/exportSymbol.js    export d'un symbole en classe JS réutilisable (objet de jeu)
  util/download.js          petit utilitaire de téléchargement de fichier texte
  util/prefs.js              petites préférences UI persistées (localStorage) : largeur/repli des panneaux
  util/responsive.js         seuils responsive partagés entre le CSS et le JS (voir section Responsive)
  util/importSvg.js          import de fichiers SVG (conversion en formes TweenJS)
  state.js                  état central + pub/sub
  history.js                 annuler/rétablir (15 niveaux)
  main.js                   assemblage de l'application
```

## Responsive (TV, desktop, tablette, smartphone)

- **Scène** : se met toujours à l'échelle de l'espace disponible via le
  zoom natif de Konva (`stage.scale()`, jamais un `transform` CSS — ça
  fausserait le calcul de position du pointeur). Ne grossit jamais au-delà
  de 100 % : sur un très grand écran, c'est le confort de lecture du reste
  de l'interface qui s'adapte, pas la taille de la scène elle-même.
- **≤ 1024px** (tablette/mobile, seuil `OVERLAY_BREAKPOINT` dans
  `util/responsive.js`) : le panneau latéral (bibliothèque + propriétés)
  devient un tiroir en survol de la scène (fond cliquable pour le
  refermer) au lieu de la pousser ; plus de glisser pour le redimensionner
  dans ce mode, juste le bouton pour l'ouvrir/fermer.
- **Doigt ou écran étroit** (`pointer: coarse` ou ≤ 1024px) : cibles
  tactiles agrandies partout (outils, boutons d'icônes, lignes de calque,
  champs), colonne d'outils élargie en conséquence.
- **Premier chargement** (aucune préférence enregistrée) : panneau latéral
  et timeline repliés par défaut sur mobile pour laisser la scène occuper
  l'écran — dès que l'utilisateur touche à ces réglages, son choix prime
  et reste mémorisé.
- **≥ 1920px** (moniteur 4K, TV) : texte, icônes d'outils et largeur par
  défaut du panneau latéral agrandis pour une lecture confortable à
  distance ("10 pieds"). Pensé pour une TV pilotée comme un desktop
  (souris/trackpad ou télécommande-pointeur type LG Magic Remote) — pas de
  navigation clavier directionnel (D-pad) à l'aveugle, hors de portée pour
  un outil qui repose sur le glisser-déposer précis (courbes Bézier,
  poignées de sélection).
- `touch-action: none` sur la scène : un doigt qui dessine ne déclenche
  jamais le défilement/zoom natif de la page.

## Limites connues (v1)

- Pas d'undo/redo.
- La rotation des rectangles/ellipses/texte pivote autour du centre ; les
  tracés (ligne/plume) pivotent autour de leur premier point.
- Pas de dégradés, pas d'import d'images bitmap (PNG/JPG).
- Import SVG : les fichiers SVG sont convertis en formes vectorielles (rect, ellipse, line, path, text, polygon).
- Le morphing apparie les points par index (1er avec 1er, 2e avec 2e, ...),
  pas de "shape hints" pour guider l'appariement comme dans Animate — deux
  courbes très différentes peuvent donc morpher de façon étrange.
- Pas moyen d'ajouter une poignée à un point anguleux existant depuis l'outil
  sous-sélection (seul le clic-glissé à la création en crée une).
- Le contenu imbriqué dans une instance n'est pas éditable directement sur
  la scène parente : il faut double-cliquer pour entrer dans le symbole.
- Pas de zoom/pan de la scène.

## Licence

Ce projet est publié sous licence [CC BY-NC 4.0](LICENSE) : copie,
usage, modification et redistribution autorisés à des fins
**non commerciales** uniquement, avec attribution de l'auteur. Les
bibliothèques CreateJS embarquées restent sous leur licence MIT
d'origine.
