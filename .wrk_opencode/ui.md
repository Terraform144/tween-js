# Interface utilisateur (`src/ui/`)

Tous les panneaux sont montés dans des conteneurs du `index.html` par
`main.js` et exposent une méthode `update()` appelée à chaque `notify()`.

## Layout (index.html)

```
#app
├── #menubar        (barre de menu)
├── #main           (grille)
│   ├── #toolbar    (colonne d'outils)
│   ├── #stage-wrap (contient #stage-container + bannière d'édition)
│   ├── #sidebar-resizer (poignée de redimensionnement + bouton replier)
│   └── #sidebar    (piles : #library-panel + #properties-panel)
└── #timeline
```

`#sidebar-backdrop` (fond cliquable du mode tiroir) est ajouté au body dans
`main.js`.

## Panel.js — enveloppe standard

`createPanel(container, {key, label, actions})` : barre de titre + bouton
replier/déplier + corps scrollable (`.panel-body`). Repli persistant en
localStorage (clé `key`). À réutiliser pour tout nouveau panneau du conteneur
latéral.

## Toolbar.js

- Boutons d'outils : Sélection(V), Sous-sélection(A), Rectangle(R),
  Ellipse(O), Ligne(L), Plume(P), Texte(T) + bouton Supprimer (poubelle,
  désactivé sans sélection) + 2 color pickers (remplissage/contour).
- Raccourcis clavier via `SHORTCUTS` (inclut `b` bone, `c` boneChain).

## Timeline.js

Structure : toolbar (boutons) + body (colonne calques à gauche + pistes
scrollables à droite + règle + tête de lecture).

- Boutons : +calque, -calque, F6 (insérer clé), F7 (clé vide), tween ⇄,
  x (supprimer clé), lecture/pause, champ étiquette (label), info frame,
  replier.
- Cellules de frame : `has-content`, `tweened` (avec `tween-arrow-end`),
  `keyframe` / `blank-keyframe`, `selected`, `draggable-key`.
- **Glisser-déposer de clés** (`startKeyDrag`/`onKeyDragMove`/`onKeyDragEnd`) :
  suit les bornes `minIndex`/`maxIndex` (entre les voisines) et affiche
  drop-target/drop-invalid ; le drop appelle `moveKeyframe`.
- Raccourcis : F6, F7, Espace (lecture/pause).
- `rowHeight()` = 34px tactile / 24px souris — **doit rester synchronisé
  avec `.tl-layer-row`/`.tl-track-row` dans style.css**.
- `CELL_W = 16`.
- Le bouton "x" utilise `getActiveKeyframe()` (et non `getKeyframeAt()`) pour
  effacer aussi les images "tenues" (fantômes entre deux clés).

## LibraryPanel.js

- Boutons : "+ Nouveau symbole (Ctrl+F8)" (crée un symbole vide puis entre en
  édition isolée) et "Convertir en symbole (F8)".
- `convertSelectionToSymbol` : lit le contenu sélectionné depuis la keyframe
  qui le possède RÉELLEMENT (`getActiveKeyframe` — pas de nouvelle clé pour ne
  pas scinder un tween). Un même id d'instance par forme convertie est
  réutilisé dans TOUTES les clés du calque (les tweens continuent
  d'interpoler après conversion).
- Liste des symboles : icône (movieclip/graphic), nom, boutons +instance
  (centre de scène, garde anti-cycle), renommer, exporter objet de jeu,
  supprimer. Double-clic = édition isolée.
- Bouton « + » : centre le CONTENU du symbole sur la feuille via
  `getSymbolContentBounds` (compense un contenu dessiné loin de son origine —
  sinon l'instance apparaîtrait hors feuille) ; symbole vide → origine au
  centre.

## PropertiesPanel.js

- Rendu conditionnel : section tween (easing) si la clé courante est tweenée
  + astuce morphing ; sinon propriétés de l'élément sélectionné (Nom
  d'instance en tête pour TOUS les objets — forme, instance, bitmap — puis
  X/Y, W/H, rotation, échelle, opacité, remplissage/contour, épaisseur, texte,
  police) + sélecteur squelette (bones) ; instance → nom + symbole ; bone →
  longueur, couleur, parent, influence.
- `mutateSelectedElement(fn)` : insère une clé au besoin puis mute l'élément.
- Bouton "Supprimer l'objet".

## MenuBar.js

- Brand "TweenJS", undo/redo (Ctrl+Z / Ctrl+Y), Nouveau, menu **Fichier** ▾
  (Ouvrir… JSON, Importer SVG, Importer image…, Enregistrer JSON, Exporter
  HTML), Plein écran.
- Le panneau du menu Fichier est monté dans `document.body` en `fixed`
  (#menubar a un `overflow-x:auto` qui clipperait un dropdown absolu) ;
  coordonnées = `getBoundingClientRect()` du bouton, fermeture au clic
  extérieur / Échap / scroll / resize.
- Champs du document : nom, L (largeur), H (hauteur), i/s (frameRate),
  images (frameCount), fond (couleur).
- `resetDocument` : remplace `state.doc` (utilisé par Nouveau/Ouvrir).
- L'import SVG appelle `parseSvg(text)` puis le callback `onSvgImport`
  (implémenté dans main.js : insère dans la keyframe courante du calque actif).

## icons.js

Jeu d'icônes SVG au trait dessinées à la main : `currentColor`, épaisseur 1.7,
extrémités arrondies, viewBox 24. `ICONS` (objet de strings SVG) +
`setIcon(el, name)`. Les icônes suivent automatiquement la couleur du texte
du bouton via CSS (`:hover`, `.active`).

## style.css

Thème Solarisé clair (fond crème, texte quasi-noir, accent rouge-orange
`#cb4b16`). Media queries synchronisées avec `util/responsive.js` :
`(pointer: coarse), (max-width: 1024px)` (tactile/overlay),
`(min-width: 1920px)` et `(min-width: 2600px)` (TV/4K "10 pieds").
`touch-action: none` sur la scène (un doigt qui dessine ne déclenche jamais
le scroll/zoom natif de la page).
