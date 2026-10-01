# NOTES SYNTHESE - Projet TweenJS
*Mise à jour : 02/10/2026*
*Dernière session : Fix import d'images — le 2e import écrasait le 1er (assets stockés sous la clé 'undefined')*

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
- Déploiement web (details retires du depot)

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
### Session 9 - 30/09/2026
- Correction version principale mobile (double point plume) : le src etait deja corrige (Session 8), ce qui trainait etait les artefacts perimes de la version principale (assets APK du 08/09 anterieurs au fix). Rebuild complet : npm run build, npx cap sync android, gradlew assembleDebug ; fix verifie dans le JS embarque de l APK ; APK copie dans dist/ et public/.
- Commits + push GitHub (origin uniquement) : fix plume + APK regenere, puis regle anti-production.
- REGLE utilisateur : ne jamais pousser sur le serveur de production (ni git, ni SCP), sauf demande explicite.
- Purge securite : le mot de passe SSH/root avait ete commite et pousse sur GitHub. Reecriture complete de l historique via git-filter-repo (replace-text + replace-message) : mot de passe, login root, IPs 212.227.x, nip.io, commandes pscp et toutes mentions de l hebergeur retires des 87 commits et des messages. Force-push (--force-with-lease) des 3 branches (TweenJS_simpleV.0.1, TweenJS.V.0.1, master). Verification finale : 0 occurrence.
- Nettoyage fichiers courants : .env supprime (et ajoute au .gitignore), .gitignore passe sur *_ssh_info.txt, sections deploiement reecrites ("Production - INTERDIT"), bloc hebergeur des mentions-legales.html remplace par une mention neutre, remote de prod retire de la config git locale.
- Backup pre-purge : F:/_SRC/__Debrouillard/AnimateJS-backup-avant-purge-ionos.bundle (contient encore les secrets - a garder hors de tout depot, a supprimer quand le resultat est valide).
- Avertissements donnes a l utilisateur : changer le mot de passe serveur (il a ete public), demander a GitHub un garbage collection pour purger les commits anciens encore accessibles par SHA.
### Session 11 - 02/10/2026
- Fix bug import images : le 2e import remplacait les pixels du 1er bitmap pose sur la scene.
- Cause racine : l UI n appelle jamais createAsset() (seul generateur d id) ; MenuBar.js (menu Importer image) et main.js (glisser-deposer) passaient a addAsset() un objet SANS id -> stocke sous la cle litterale 'undefined' -> chaque nouvel import ecrasait l entree precedente ; les bitmaps deja poses (assetId 'undefined') pointaient alors vers la nouvelle image.
- Diagnostic eprouve par harnais headless (_wrk_mistral_mem/repro_import.mjs, Node + vrais modules model/history/state) reproduisant le flux exact MenuBar -> addBitmapAsset : echec sur 2 imports directs, OK apres fix sur 6 scenarios (imports directs + undo/redo croises).
- Fixes (src/core/model.js) :
  1. addAsset() attribue un id manquant (if (!asset.id) asset.id = nextId('asset')) — LE fix du bug.
  2. bumpIdCounterPastDocument() ne fait plus redescendre le compteur global (monotonic) : undo/redo restaure un doc aux ids plus petits, mais les caches hors document restent indexes par id — reemettre un id leur ferait servir un contenu perime.
- Fix (src/stage/Stage.js) : cache d images decodees clee par dataUrl (contenu) au lieu de assetId — deux images differentes ne peuvent plus jamais partager une entree de cache.
- Bundle vanilla regenere et copie (Animate_JS_PureVanilla/tweenjs-bundle.js, 625212 octets) ; les 3 fixes verifies presents dans le bundle minifie.
- Servi en local pour test : http://127.0.0.1:8123/. Validation user OK (02/10/2026).
- Reste a faire (user) : deployer le bundle corrige sur le serveur en ligne (regle anti-production : pas de push sans demande explicite).

### Session 10 - 01/10/2026
- Correction bug export HTML en version PureVanilla : le fichier exporte etait une page blanche (MovieClip indefini).
- Cause racine : le plugin maison handle-raw-imports de vite.vanilla.config.js re-transformait le module ?raw DEJA transformé par Vite 8 (qui gere ?raw nativement) -> double emballage : la chaine runtimeSource inlinée dans le bundle etait un texte mort export default "..." avec 
 littéraux. Le HTML exporté depuis la version vanilla embarquait donc le runtime comme chaine inerte -> ReferenceError -> page blanche. La version principale (vite.config.js, sans ce plugin) etait saine - bug vanilla uniquement.
- Meme cause cassait lexport dobjet de jeu (le tween-runtime.js telecharge contenait la chaine morte) : repare par le meme fix.
- Fix : suppression du plugin dans vite.vanilla.config.js ; rebuild npm run build:vanilla ; copie dist/tweenjs-bundle.iife.js -> Animate_JS_PureVanilla/tweenjs-bundle.js.
- Verification : runtime inliné du nouveau bundle IDENTIQUE au fichier src (16337 octets, comparaison exacte) ; harnais headless (Node, stubs DOM/canvas) valide lend-to-end de lexport : formes, tween, movieclip 2 niveaux, symbole graphic, bitmap, texte, label dimage, script dimage, script de document + named instances - aucune erreur.
- Fichiers modifiés : vite.vanilla.config.js, Animate_JS_PureVanilla/tweenjs-bundle.js (regenere). dist/ regenere (gitignore).
- Servi en local pour test : http://127.0.0.1:8123/ (serveur statique temporaire sur Animate_JS_PureVanilla). Pas de push production (regle).

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

### Production — INTERDIT sans demande explicite
- **REGLE (demande utilisateur 30/09/2026) : NE JAMAIS POUSSER EN PRODUCTION** - ni git push vers un remote de prod, ni redeploiement du dossier `dist` sur le serveur, sauf demande explicite de l utilisateur. Push git : uniquement vers `origin` (GitHub).
- Securite (30/09/2026) : tous les identifiants, adresses et mots de passe du serveur ont ete retires du depot et de son historique. Ne plus jamais les committer.

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
