# NOTES SYNTHESE - Projet TweenJS
*Mise à jour : 30/09/2026*
*Dernière session : Correction double point de Plume sur mobile (souris émulée après touchstart)*

---

## APERCU GLOBAL

**TweenJS** est un éditeur d'animation vectorielle image par image, inspiré d'Adobe Animate/Flash.
- JavaScript vanilla (ES modules)
- Konva.js v9.3.16 (moteur Canvas 2D)
- Vite v8.2.1 (bundler)
- Licence MIT

---

## ARCHITECTURE TECHNIQUE

### Structure du Projet
```
tweenjs/
├── src/
│   ├── core/model.js              # Modèle de données
│   ├── stage/Stage.js             # Rendu Konva + outils
│   ├── ui/Toolbar.js             # Barre d'outils
│   ├── ui/icons.js               # Icônes SVG
│   ├── export/tweenRuntime.js    # Runtime MovieClip
│   ├── state.js                  # État central
│   └── style.css                # Styles
├── docs/                        # Documentation
└── _wrk_mistral_mem/            # Notes de travail
```

---

## FONCTIONNALITES IMPLEMENTEES

### Éditeur
- Outils : Sélection, Sous-sélection, Rectangle, Ellipse, Ligne, Plume Bézier, Texte, **Pinceau**
- Timeline : calques, images clés, lecture/pause
- Tweening : interpolation mouvement
- Morphing : déformation de courbes Bézier
- Symboles : Graphic et MovieClip
- Ossature : chaînes d'ossature avec IK (CCD)
- Import SVG
- Responsive design

### Export
- Objet de jeu : classe JS + runtime
- Scène complète : HTML autonome
- JSON : sauvegarde/chargement

### Runtime API
API CreateJS-like avec MovieClip, play/stop, gotoAndPlay, événements loop/complete

---

## OUTIL PINCEAU - IMPLEMENTATION SIMPLIFIEE

### Date : 04/09/2026

#### Fichiers modifiés
1. **src/ui/Toolbar.js**
   - Ajout outil brush avec icône 'pencil' et raccourci B
   - Mise à jour fonction update()

2. **src/state.js**
   - Ajout brushSize: 5

3. **src/stage/Stage.js**
   - Ajout constante BRUSH_MIN_DISTANCE = 2
   - Ajout fonctions :
     * startOrContinueBrush(p)
     * finishBrush()
   - Intégration dans handlers : mousedown, mousemove, mouseup, keydown, render

4. **src/style.css**
   - Styles existants suffisants

#### Pattern implémenté
- **Rond** (round) : Trait lisse, extrémités arrondies, pattern par défaut

#### Propriétés du pinceau
- brushSize: 1-50 (défaut: 5)
- strokeColor: héritée de l'état global
- lineCap: 'round' (fixé)
- lineJoin: 'round' (fixé)
- tension: 0.8 (lissage temps réel)

#### Optimisation des points
- **Tension** : Konva.Line utilise tension: 0.8 pour un aperçu lisse
- **Simplification** : Algorithme Ramer-Douglas-Peucker (epsilon: 2.0) pour réduire les points
- **Lissage Bézier** : Conversion en courbe Bézier avec tension 0.6 pour un trait fluide
- **Résultat** : Réduction significative du nombre de points, trait professionnel et lisse

#### Comportement
- Clic et glisser : dessine un trait avec tension pour un aperçu lisse
- Relâcher bouton : applique simplification + lissage Bézier et finalise le trait
- Échap : annule le trait en cours
- Changer d'outil : finalise automatiquement

---

## HISTORIQUE DES SESSIONS

### Session 1 - 24/07/2026
- Exploration initiale du projet
- Compréhension architecture complète

### Session 2 - 24/07/2026
- Ajout bouton Delete dans toolbar
- Modification main.js et Toolbar.js

### Session 3 - 24/07/2026
- Implémentation responsive design complet
- Création responsive.js
- Modifications : main.js, Stage.js, style.css, Timeline.js, prefs.js

### Session 4 - 24/07/2026
- Implémentation import SVG
- Création importSvg.js
- Modifications : icons.js, MenuBar.js, main.js, README.md

### Session 5 - 27/07/2026
- Corrections ossature et IK
- Correction bug Bézier sur mobile
- Algorithme CCD pour IK multi-bones
- Modifications : model.js, Stage.js

### Session 6 - 27/07/2026
- Déploiement sur [REDACTÉ] ([REDACTÉ])

### Session 7 - 04/09/2026
- Implémentation outil Pinceau simplifié
- 1 pattern : round (trait lisse avec extrémités arrondies)
- Optimisation points : solution complète avec Ramer-Douglas-Peucker + lissage Bézier
- Modifications : Toolbar.js, state.js, Stage.js, tweenRuntime.js

---

### Session 8 - 30/09/2026
- Correction bug mobile : l'outil Plume plaçait deux points par tap
- Cause : après un touchstart, le navigateur rejoue une séquence souris émulée (mousedown/mouseup/click) ; le handler Konva `mousedown touchstart` s'exécutait donc deux fois (un point par événement)
- Fix : preventDefault() sur touchstart dans Stage.js, à deux endroits :
  1. Handler de scène konvaStage.on('mousedown touchstart') — corrige plume, pinceau, formes, texte
  2. attachInteraction() (handler de nœud) — les taps sur les formes avec select/subselect font cancelBubble et contournaient le fix de scène ; sans lui, un double-tap déclenchait dbltap ET dblclick émulé (editPath poussé deux fois à l'entrée d'un symbole)
- Sans effet de bord : le conteneur de scène est déjà en touch-action: none (style.css)
- Bundle vanilla regénéré et copié dans Animate_JS_PureVanilla/tweenjs-bundle.js
- Modifications : src/stage/Stage.js
## ETAT ACTUEL

### Fonctionnalités opérationnelles
- Outil Pinceau : OUI (pattern round uniquement)
- Export runtime : OUI
- UI intégrée : OUI

### Limites connues
- Un seul pattern disponible (round)
- Pas de sensibilité à la pression (tablettes)
- Pas de texture bitmap

### Tests à effectuer
1. Dessiner avec pinceau dans éditeur
2. Vérifier rendu visuel du trait
3. Exporter un symbole avec trait de pinceau
4. Tester l'affichage dans le runtime

---

## CONFIGURATION DEPLOIEMENT

### [REDACTÉ]
- Serveur : [REDACTÉ]:22
- Utilisateur : [REDACTÉ]
- Mot de passe : [REDACTÉ]
- Destination : /var/www/AnimateJS
- Commande : pscp -P 22 -l [REDACTÉ] -pw [REDACTÉ] -r dist/* [REDACTÉ]:/var/www/AnimateJS/

### GitHub
- Repository : https://github.com/Terraform144/tween-js.git
- Branch actuelle : TweenJS_simpleV.0.1
- Branch main : master

---

## PROCHAINES ETAPES POSSIBLES

- Amélioration pinceau : lissage Bézier
- Ajout pattern : éclaboussures, texture
- Sensibilité pression pour tablettes
- Système de textures bitmap
- Optimisation performances

---

## REFERENCES

- Documentation Konva.js : https://konvajs.org/docs/
- Documentation Vite : https://vitejs.dev/
- README projet : ../README.md
- Documentation runtime : ../src/export/README.md
