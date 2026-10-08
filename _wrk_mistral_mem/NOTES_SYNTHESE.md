# NOTES SYNTHESE - Projet TweenJS
*Mise à jour : 08/10/2026*
*Dernière session : pivot de transformation déplaçable (registration point à la Animate CC) sur tous les objets, éditeur + exports en parité*

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
### Session 13 - 02/10/2026 (nuit)
- Demande utilisateur : (1) que TOUTES les fonctions CreateJS soient utilisables dans les scripts, via la vraie librairie importee d'un ./libs local ; (2) a prevoir pour plus tard (NON implemente) : pouvoir charger n'importe quelle librairie dans les scripts.
- Libs : npm pack (curl direct bloque, proxy npm OK) -> easeljs 1.0.2, tweenjs 1.0.2, soundjs 1.0.1, preloadjs 1.0.1 (max dispo sur npm). Builds UMD minifies copieses dans public/libs/createjs/ (avec LICENSE-*.txt, MIT) + Animate_JS_PureVanilla/libs/createjs/. <script> UMD dans index.html (main, /libs/...) et Animate_JS_PureVanilla/index.html (libs/... relatif). Verifie : aucun </script ni <!-- dans les .min.js.
- sceneRuntime.js : constante SCRIPT_LIBS = ['createjs'] (mecanisme extensible pour la demande 2 : ajouter une lib = la charger + ajouter son nom global ici ; RESERVED la masque auto comme nom d'instance). execCode/runClipFrameScripts passent la globale en parametre supplementaire du new Function (globalThis.createjs, undefined-safe).
- API evenements compatible EaselJS (createjs.EventDispatcher) sur les elements nommes ET Scene : on/addEventListener, off/removeEventListener, removeAllEventListeners, hasEventListener, dispatchEvent ; handlers en WeakMap hors des objets + methodes NON enumerables -> serialisation JSON du doc strictement intacte. Pipeline pointer complet sur le conteneur du stage, actif UNIQUEMENT pendant la lecture : mousedown/mouseup/click (down+up sur le meme element, semantique EaselJS), dblclick, pressmove/pressup, mouseover/mouseout, rollover/rollout, tick (via onFrame) ; evenements scene-level stagemousedown/stagemousemove/stagemouseup/stageclick. Hit-test : ellipse precise (disque), lignes/chemins (boite des points), instances (hull du symbole sur toutes ses images, recursif), le reste boite englobante ; rotation/echelle de l'element inversees.
- Scene.onClick() (session precedente, conserve) : Scene.onClick((x,y)=>...) pour tout clic scene (y compris dans le vide) et Scene.onClick('nom', (x,y)=>...) pour l'instance nommee.
- main.js : createjs.Ticker.paused = !state.playing (les tweens CreateJS s'arretent avec l'editeur) ; rendu du stage a chaque rAF pendant la lecture (tweens fluides 60 fps independants du frameRate doc).
- exportHTML.js : buildStandaloneHTML devient async ; si un script utilisateur (scripts nommes + scripts d'image racine et symboles) contient /\bcreatejs\b/, les 4 libs sont fetchees depuis libs/createjs/ et inlinees en <script> avant le module (~280 Ko, seulement si utilisees ; fetchKO -> warning et createjs undefined dans l'export). new Function des scripts exportes : parametre createjs typeof-guard. tweenRuntime.js (_runChildFrameScript) : meme parametre.
- Gabarit du Script 1 (model.js) remis a neuf + exemples Scene.onClick et createjs.Tween. ATTENTION outil d'edition : l'outil edit passe le texte VERBATIM (backslashes non decodes) alors que write_file decode normalement -> toujours verifier les backslashes au tr/grep apres une edition qui en contient ; fix_template.mjs (construit les echappements par programme) a servi a reparer le gabarit casse par un double-echappement.
- Harnais _wrk_mistral_mem/repro_createjs.mjs : 21 controles OK — vraies libs chargees en sandbox node:vm (stubs window.performance/document), tween reel sur element nomme (setPosition 50% -> x 100->300), tous les evenements pointer, hit ellipse/instance-hull, Scene.onClick (cible/vide/hors-lecture), pas d'empilement aux re-runs, off() par cb et par wrapper, serialisation intacte.
- Bundle vanilla regenere et copie (Animate_JS_PureVanilla/tweenjs-bundle.js, 634 Ko, node --check OK). ScriptsPanel : completions Scene + onClick/log. README : puce Scripts + CreateJS.
- Reste a faire : validation visuelle dans l'editeur (servir http://127.0.0.1:5173 ou la version vanilla) ; pas de push production (regle). Ouvert : les evenements pointer nommes ne sont PAS encore branches dans le HTML exporte (le runtime exporte recoit createjs mais n'a pas de pipeline pointer) ; demande 2 (librairies arbitraires) : mecanisme SCRIPT_LIBS pret a etendre.
- Cours utilisateur : docs/cours-createjs-scripts.html (HTML autonome, sommaire colle, 12 parties + 4 exercices corriges en details repliables) expliquant toute l'integration CreateJS (new Function, prelude named, UMD, SCRIPT_LIBS, WeakMap/non-enumerable, pipeline pointer, Ticker, hit-test, export conditionnel) et la methode de travail. Genere sur demande (apprentissage de la programmation, niveau intermediaire). Balises verifiees equilibrees (176/176 code, 38/38 em) ; non rendu en navigateur.
- Fix 14 issues DevTools (rapport user, la derniere critique = stylesheet en echec) :
  1. CRITIQUE : le lien CodeMirror CSS (cdn.jsdelivr.net codemirror@6.0.2/dist/index.css) de Animate_JS_PureVanilla/index.html etait un 404 PERMANENT (le paquet npm codemirror ne contient AUCUN css, verifie par find) — supprime ; la version principale n'a jamais eu ce lien et rend correctement (style.css couvre .cm-*).
  2. Konva charge depuis unpkg par la version vanilla -> cassait hors ligne (machine user sans internet direct). Copie locale : node_modules/konva/konva.min.js (9.3.22, version reelle du package ^9.3.16) vers Animate_JS_PureVanilla/libs/konva.min.js ; script src relatif libs/konva.min.js. Plus AUCUN CDN dans l'app (verifie par grep, ne reste que la doc interne Gradle).
  3. Issues accessibilite/autofill (7 champs sans id/name + 5 labels non associes) : PropertiesPanel.js — helper linkLabelToField(l, field) (id+name uniques prop-field-N, l.htmlFor) appele dans les 7 constructeurs de lignes (numberRow, colorRow, textRow, textAreaRow, enumRow, selectRow, renderTweenSection). Les lignes lecture-seule (label+div Symbole/Squelette/Image) n'ont pas de champ : non concernees.
  Rebuilds : bundle vanilla regenere+copie, build main OK ; correctif verifie dans les deux bundles (chaine prop-field- presente). A valider visuellement par l'user (recharger la page vanilla servie et reverifier l'onglet Issues de DevTools : devrait tomber a 0).
- RESOLU (02/10 nuit) : Scene.gotoAndPlay/gotoAndStop de l'editeur honorent desormais les labels d'image (resolveFrameArg : string -> invertFrameLabels(getFrameLabels(doc, editPath)), label introuvable -> console.warn + no-op, comme dans l'export). Idem scope clip (runClipFrameScripts : clipFrameArg avec les labels du symbole). Harnais passe a 25 controles OK (section 12 : labels + label inconnu + numerique). Rebuild des deux versions fait et verifie ("label d" present dans les 2 bundles). REGLE utilisateur : a chaque modif, MAJ les DEUX versions (src -> build main + build:vanilla + copie bundle) ; deploy Ionos = user uniquement, il previendra.
- ENQUETE clic "But" — VERDICT E2E (02/10 nuit) : le mecanisme FONCTIONNE de bout en bout dans un vrai navigateur. Harnais E2E puppeteer-core + Chromium (ms-playwright/chromium-1234, machine user ; puppeteer-core installe hors repo dans /tmp/e2e) pilotant le build dist servi par vite preview :4173 : document JSON fabrique avec le VRAI model.js, charge via le vrai flux Ouvrir... (input[type=file][accept=".json"]), script tape dans le panneau via le document, Exécuter, clic souris reel. SUCCES sur les DEUX cas : forme nommee ET instance de movieclip nommee (title -> CLIQUE_OK ; console panel : createjs object, But typeof object). Pipeline DOM verifie au passage (mousedown/mouseup/click @CANVAS atteignent le conteneur). Lecons E2E : (1) page.keyboard.type n'entre rien dans CodeMirror 6 (le run executait le gabarit par defaut) -> contourner en chargeant le script via le document ; (2) ne JAMAIS nommer une constante URL (masque le constructeur global) ; (3) l'app est pilotable E2E : harnais reutilisable _wrk_mistral_mem/repro_e2e_click.mjs / repro_e2e_click_instance.mjs (necessite puppeteer-core + chemin chrome + serveur).
- DONNE A L'USER : _wrk_mistral_mem/test-but.json (projet complet : instance movieclip nommee But au centre + script de diagnostic integre) — Ouvrir... puis Exécuter puis cliquer le bouton pendant la lecture : si ça marche chez lui (attendu), son installation est saine et la cause est dans SA scene (nom exact/frame/clic hors lecture/element tweené) ; si ça ne marche pas, son environnement differe du build teste.
- BUG REEL TROUVE PAR LE DOCUMENT USER IIB_v3.test.json (03/10 nuit) — ROOT CAUSE du clic muet : son calque "action" porte un SCRIPT D'IMAGE (kf index 1 : gotoAndPlay("Logo")). Or execCode detachait TOUS les handlers avant chaque execution (anti-empilement) — y compris ceux poses par le bouton Executer : des l'arrivee a l'image 1 (~80 ms apres Scene.play()), But.on("click") etait EFFACE. Le harnais/E2E n'avaient pas de script d'image, donc passaient. FIX : registre a PORTEES — CURRENT_HANDLER_REG module-level ('run' pendant Executer, 'frame' pendant un script d'image, null sinon) ; les entries portent owner ; detachAllEvents(obj, owner) ne purge que sa portee (owner null = tout, au run) ; run() fait le reset complet (toutes portees + pressTarget/hoverTarget SORTIS de execCode — un script d'image pendant une pression ne doit pas tuer le clic). runFrameScripts -> execCode(kf.script, 'frame') : les handlers d'un script d'image restent purges entre passages (pas d'empilement), ceux d'Executer survivent. Harnais 28/28 (section 13 : survie run, clic traverse un script d'image pendant la pression, purge frame sans empilement).
- E2E FINAL AVEC LE DOCUMENT REEL : copie de IIB_v3.test.json (seul changement : alert() -> document.title marqueur) chargee via Ouvrir... dans Chromium headless -> Executer -> clic sur le bouton (scene 208,126) -> CLIQUE_OK_F2 : handler declenche ET gotoAndStop("Start") -> frame 2 (labels OK). Harnais archive : _wrk_mistral_mem/repro_e2e_iib.mjs.
- PIEGE OPERATIONNEL decouvert : npm run build:vanilla ecrit AUSSI dans dist/ et le VIDE (vite.vanilla.config sans outDir distinct, emptyOutDir par defaut) -> TOUJOURS builder le vanilla AVANT le main (ordre : build:vanilla -> cp bundle -> npm run build). Un main-avant-vanilla laisse dist sans index.html (vite preview -> 404 neterror). Notes : c'etait deja l'ordre historique ; ne pas inverser.
- PARITE EXPORT (03/10 nuit, demande user) : le HTML exporte ne repondait pas aux clics. Le bootstrap d'exportHTML.js a recu le PORT COMPLET du systeme de l'editeur : API evenements EaselJS (WeakMap + defineProperty non-enumerable, meme code, style ES5), portees run/frame (CURRENT_REG ; purge 'frame' avant chaque script d'image ; scripts du document 'run' executes une fois, jamais purges), Scene.onClick, hit-testing complet (ellipse disque, lignes boite des points, instances hull recursif du symbole), pipeline pointer sur le canvas (mousedown/mouseup/click down+up meme element/pressmove/pressup/rollover/rollout/dblclick + stagemousedown/stagemousemove/stagemouseup/stageclick), gate root.isPlaying, evenements tick dans la boucle. Specifique export : exposeNamedElement attache l'API a l'element BRUT + passthrough Proxy __rawElement (les handlers sont cles sur l'element brut, pas sur le proxy re-cre a chaque collectNamed). Verifie : backslashes du template litteral (##n -> \\n source -> \n genere).
- E2E EXPORT AVEC LE DOC REEL : export genere DEPUIS l'app (menu Exporter HTML), capture du blob via patch page de URL.createObjectURL (ASTUCE : revokeObjectURL immediat dans download.js annule le telechargement intercepte en headless — race ; capture blob cote page plutot que toucher l'app ; un revoke differe reste une option si un jour un vrai navigateur se plaint), fichier 328 Ko ouvert en file://, clic sur le bouton But (scene 208,126) -> CLIQUE_OK_F2 : handler + gotoAndStop("Start") -> frame 2. PARITE PROUVEE. Harnais archive _wrk_mistral_mem/repro_e2e_export.mjs.
- Cours v2 LIVRE : docs/cours-createjs-scripts-v2.html (v1 PRESERVEE intacte) — 11 parties : contrat du script, registre a portees, pipeline pointeur (5 etapes), hit-testing, parite editeur/export (Proxy + __rawElement), labels, etude de cas IIB_v3 (methode d'enquete), referentiel complet, recettes, 3 exercices corriges. Balises verifiees equilibrees (11/11 sections, 92/92 code, 6/6 em, 3/3 details).
- Doc user predates le fix Session 11 : assets cles litterale "undefined" + bitmap15 SANS assetId (renders OK, cache cle dataUrl ; export OK via assets["undefined"]) — migration optionnelle plus tard si besoin.
- NOUVELLE FONCTIONNALITE (03/10 nuit, demande user) : "Compiler un HTML" dans le menu Fichier — export COMPILÉ, jouable, SANS eval/new Function a l'execution. Architecture :
  * src/export/compiledPlayer.js (nouveau, embarque via ?raw) : player fixe — Scene, evenements EaselJS a portees, pipeline pointeur, hit-test, registres __tjsScripts/__tjsFrames/__tjsChild, tweenjsStart(). LECON : ne JAMAIS capturer window.__tjsX au chargement du player (registres assignes par des <script> ULTERIEURS -> reference figee vide ; acces paresseux au moment de l'appel).
  * src/export/exportCompiled.js (nouveau) : compilation — scripts utilisateur -> VRAIES fonctions dans de vraies balises <script> (signature identique au new Function historique : Scene, Game, console, named, createjs + prelude var Nom = named["Nom"] genere A LA COMPILATION via getNamedElements image par image) ; registres : scripts doc = array, frames racine = "layerId:frame", clips enfants = "symboleId:layerId:frame". Donnees en bloc JSON pur (escapeForScript-like : replace < par \u003c). SEULE protection : sequences d'enveloppe neutralisees par remplacements qui PRESERVENT LA VALEUR JS (</script -> <\/script, <!-- -> <\!--, --> -> --\>) — plus AUCUNE couche de backslashes. CSP meta embarquee SANS unsafe-eval : la page s'auto-prouve eval-free.
  * tweenRuntime.js : export -> liaisons globales pour <script> classique (strip ^export dans runtimeForClassicScript) ; hook clipScriptExecutor (function(symbolData, layerId, frame, clipScene)) avec repli new Function marque TJS_NOEVAL_START/END, RETIRE par le compile (marqueurs explicites, single source maintenue) ; repli conserve pour export classique + objet de jeu ; exportHTML.js : helpers partages exportes (buildFullDocData, collectAllScripts, loadCreateJsSources, escapeForScript) + id des symboles dans les donnees (cles de registre).
  * MenuBar : entree "Compiler un HTML" (icone exportHtml) -> downloadCompiledHTML -> Nom.compile.html.
  * E2E (repro_e2e_compiled.mjs) : IIB_v3 reel, compile DEPUIS l'app, fichier 328 Ko, verifie : 0 new Function, 0 eval, CSP sans unsafe-eval, fonctions reelles visibles, ouverture file://, clic sur But -> CLIQUE_OK_F2 (les 3 types de scripts du doc testes : document + frame racine gotoAndPlay("Logo") + script de clip enfant sym16:layer17:23). Deux bugs attrapes par l'E2E : (1) export illégaux en script classique -> MovieClip indefini ; (2) capture prematuree des registres. Les deux corriges + reproves.
  * EXPORT CLASSIQUE INCHANGE (exportHTML.js garde son new Function — comportement historique prouve ; le compile est une SECONDE voie, pas un remplacement).
- Mentions legales/RGPD dans la vanilla (03/10, demande user, simplifiee par lui apres une premiere approche E2E overkill — nettoye) : fichier deplace par git mv vers Animate_JS_PureVanilla/docs/mentions-legales.html (auto-suffisant, CSS embarque, identique a src/) ; marqueur window.__TJS_VANILLA__ pose dans l'index vanilla AVANT le bundle ; MenuBar "Mentions legales & RGPD" : lien relatif docs/mentions-legales.html en contexte vanilla, /src/mentions-legales.html sinon ; lien du cookie-bar vanilla mis a jour vers docs/. Lecon op : pas d'E2E navigateur pour un lien statique (grep + fichier present suffit) ; un serveur statique de test sous Windows exige resolve() pour la garde de chemin (join produit des backslashes) et require n'existe pas en ESM. Rebuild des deux versions fait.
- Documentation refaite (03/10, demande user) : ancien PDF renomme docs/Animate-JS-Documentation.old.pdf (git mv, historique conserve). Nouvelle doc ecrite en HTML print-optimise (docs/Animate-JS-Documentation.html) puis convertie par Chromium headless (--headless=new --no-pdf-header-footer --print-to-pdf) : docs/Animate-JS-Documentation.pdf, 21 pages A4, ~377 Ko. Contenu : demarrage, tour de l'interface complete (menus, outils+raccourcis, timeline, bibliotheque/symboles, proprietes, scripts), contrat des scripts (5 parametres, strict, quadri-diagnostic), exploitation CreateJS (Tween/Ease/Ticker/Sound/LoadQueue), evenements + hit-testing + labels, 8 recettes pretes a tester, les 4 formats d'export, chapitre integration MovieClip dans un jeu externe (API complete + exemple page HTML autonome requestAnimationFrame), depannage, annexes raccourcis/limites. Copie PDF+HTML dans Animate_JS_PureVanilla/docs/ ; lien menu "Documentation" rendu adaptatif comme les mentions (marqueur __TJS_VANILLA__ -> docs/Animate-JS-Documentation.pdf). Rebuild des deux versions fait. Lecon : generer un PDF = HTML avec @page A4 + chrome --print-to-pdf (pas d'outils externes requis) ; nombre de pages verifiable via /Count dans le PDF brut.
### Session 14 - 03/10/2026
- BUG (signalement user) : le clic sur elements/instances nommes FONCTIONNE sur desktop et dans les HTML exportes/compiles sur mobile, mais reste MUCTE dans la scene de l'editeur sur mobile.
- ROOT CAUSE : Stage.js fait preventDefault() sur TOUT touchstart (fix plume session 8, handler de scene ligne 672 + handler de noeud attachInteraction, permanents) -> le navigateur ne rejoue jamais la sequence souris emulee -> les ecouteurs mousedown/mouseup/dblclick du pipeline pointer de sceneRuntime.js ne recoivent RIEN sur tactile. Les exports n'ont pas ce preventDefault : l'emulation navigateur y fait le travail, d'ou la disparite.
- FIX (sceneRuntime.js, section fautive uniquement, ajout a cote du POINTER_EVENTS existant) : ecouteurs touchstart/touchmove/touchend/touchcancel sur le meme stageContainer, mappes sur les MEMES handlers (onStageMouseDown/Move/Up/DoubleClick) via touchSynth() qui extrait touches[0]/changedTouches[0] en evenement synthetique {clientX, clientY, target}. preventDefault si state.playing ET cancelable (hors lecture : rien, les outils gardent leur flux, deja gere par Stage.js). Double-tap -> dblclick (350 ms / 30 px) car l'emulation dblclick navigateur est coupee ; touchcancel reset pressTarget/hoverTarget/lastTap. dispose() retire aussi les TOUCH_EVENTS.
- Harnais _wrk_mistral_mem/repro_touch_click.mjs : 17 controles OK (tap->click/mousedown/mouseup/stageclick/Scene.onClick, preventDefault en lecture, pressmove glisse, tap dans le vide, down/up differents, double-tap->dblclick, touchcancel, hors lecture rien + pas de preventDefault, dispose retire tout). repro_createjs.mjs toujours 28/28 (aucune regression).
- Rebuild des DEUX versions (ordre regle : build:vanilla -> cp bundle -> build main). Correctif verifie present dans le bundle vanilla (0 occurrence "touchcancel" avant -> 1 apres ; contexte changedTouches confirme) et dans dist/assets (2 occurrences). node --check bundle OK.
- PIEGE : `copy` est cmd.exe, n'existe pas en Git Bash -> utiliser cp.
- Reste a faire : validation user sur un vrai mobile (servir vite dev ou la vanilla, charger test-but.json, Exécuter, taper le bouton pendant la lecture) ; APK android non regenere (faire npx cap sync android + gradlew assembleDebug si validation OK).

- FIX 2 (signalement user, meme session) : PAN (outil main) fige sur mobile en plein ecran de la feuille. L'outil main n'existe QU'en plein ecran (updateFsUi : btnHand.disabled hors fullscreen, tool reset en select) — d'ou le contexte precis du rapport.
- ROOT CAUSE pan : DEUX bouts lisaient clientX directement sur l'evenement natif. (a) branche hand du handler 'mousedown touchstart' (panStart) : e.evt est un TouchEvent SANS clientX (il est sur touches[0]) -> panStart.mouseX=undefined ; (b) handler 'mousemove touchmove' : l'implicite `event` (window.event) = TouchEvent sans clientX -> NaN -> translate invalide ignore. Souris desktop OK (MouseEvent a clientX), d'ou la disparite. FIX : les deux endroits passent par const src = (evt.touches && evt.touches[0]) || evt (Stage.js).
- E2E PROUVE (repro_e2e_touch_pan.mjs, puppeteer CDP Input.dispatchTouchEvent = vrai doigt sur Chromium) : plein ecran (natif ou repli CSS selon l'env) -> bouton .zoom-hand-btn -> glisse tactile -> transform du .stage-pan-layer bouge exactement (+40,+25) puis cumule (-30,-20) ; pan SOURIS intact (+25,+15). Toutes valeurs non-NaN.
- LECONS E2E : (1) l'outil main doit etre active APRES l'entree en plein ecran (bouton disabled sinon — premier harnais cliquait dans le vide) ; (2) Konva = 3 canvases superposes, instrumenter .konvajs-content pas le premier canvas ; (3) CDP Input.dispatchTouchEvent marche en headless pour simuler le tactile ; (4) un port 4173 deja pris = un vieux vite preview tourne encore — il sert dist a la demande, donc les builds frais sont servis tels quels.
- Rebuild des DEUX versions fait DANS l'ORDRE (vanilla -> cp -> main). Les DEUX correctifs (click scene + pan) verifies presents dans le bundle vanilla ET dist/assets (patterns touches[0]|| visibles aux 2 endroits).
- DEMANDE USER (meme session) : activer l'outil main/pan HORS plein ecran aussi (il ne souvenait plus de la raison de la restriction). Retire les 2 portes : (1) main.js updateFsUi ne fait plus ni btnHand.disabled=!fs, ni title conditionnel, ni reset hand->select a la sortie du fullscreen (il ne gere plus que la classe body.sheet-fullscreen) ; (2) Stage.js raccourci M : plus de porte isElementFullscreen(container), import reduit a { fullscreenElement }. L'outil survit a l'entree/sortie du plein ecran. L'info-bulle reste 'Main — deplacer la scene (M)'.
- E2E re-etendu (repro_e2e_touch_pan.mjs, 9 controles OK) : pan tactile HORS plein ecran (+35,-15), outil main activable hors fullscreen, outil conservé en entrant en fullscreen, pan tactile en plein ecran (+40,+25, cumul -30,-20), pan souris intact. NB constate au passage : le transform du pan est remis a 0 a l'entree du plein ecran (resize).
- Chaine 'disponible uniquement en plein ecran' absente des 2 bundles (verifie). Rebuild ordre reglementaire fait.
- DEMANDE USER 3 (meme session) : hors plein ecran, (a) le menu zoom/pan n'etait pas fixe et disparassait au pan (boutons ancres a la PAGE blanche, coin bas-gauche = hors ecran quand la page depasse le viewport mobile) ; (b) la page blanche ne suivait pas le pan (seul le canvas bougeait). REPONSE : ce n'etait pas un bug mais un choix de conception (pan sur panLayer uniquement) — revu au profit d'un pan "feuille entiere".
- CHANGEMENTS : (1) Stage.js applyPanTransform dual-mode : HORS plein ecran le transform va sur #stage-container (LA PAGE ENTIÈRE suit le pan ; panLayer a l'identite) ; EN plein ecran il reste sur panLayer (feuille UA : transform:none !important sur l'element fullscreen) et container est vide. (2) main.js updateFsUi RE-PARENT les boutons flottants (zoomControls + stageFullscreenBtn) selon le mode : hors plein ecran dans #stage-wrap (position absolute ancre au viewport de la zone scene, ne bougent pas au pan, TOUJOURS visibles) ; en plein ecran retour dans #stage-container (l'API native ne rend QUE le sous-arbre de l'element fullscreen ; body.sheet-fullscreen fixe deja le zoom en haut a gauche). Le CSS ne change pas : les regles absolues (.stage-zoom-controls bottom:8px/left:8px, .stage-fullscreen-btn top:8px/right:8px) se reancrerent seules via le parent positionne. (3) commentaires ajournes (Stage.js tete de panLayer, style.css .stage-pan-layer/.stage-zoom-controls).
- PIEGE CSS connu : position:fixed DANS un ancetre transforme (container panse) se cale sur cet ancetre, pas le viewport — d'ou le re-parentage plutot qu'un simple position:fixed dans le container.
- E2E etendu (repro_e2e_touch_pan.mjs, 18 controles OK) : hors plein ecran page entiere suit (+35,-15), panLayer immobile, controle zoom FIXE au pixel pres pendant le pan et visible dans le viewport, parent #stage-wrap ; plein ecran : retour parent #stage-container, panLayer porte le pan (+40,+25, cumul), container sans transform ; sortie plein ecran : re-parentage retour. LECON harnais : Échap ne sort que du plein ecran NATIF (UA) ; le repli CSS (headless) se quitte par le bouton toggle — tester la sortie par clic bouton.
- Non-regression : repro_createjs.mjs 28/28 ; E2E IIB_v3 complet OK (CLIQUE_OK_F2 : chargement, Exécuter, clic bouton). Rebuild des 2 versions fait dans l'ordre (parentElement!== present dans le bundle vanilla).
- Detail UX constate (pre-existant, non change) : en repli CSS plein ecran, Échap ne quitte pas (pas de handler clavier pour le fallback) — sortie par le bouton ou le menu ; sans gravite (le repli touche surtout les mobiles sans clavier).
- NOUVELLE FONCTIONNALITE PWA HORS LIGNE (03/10, demande user, VALIDEE user puis committee+poussee origin) :
  * Fichiers : public/manifest.webmanifest (name Animate JS, standalone, theme #073642, bg #fdf6e3, icons 192+512), public/sw.js (service worker), public/icons/ (icon-192/icon-512/apple-touch-icon generes par make_pwa_icons.mjs depuis l'icône launcher Android 192 — coherence APK/PWA ; upscale 512 via canvas puppeteer). Copies identiques dans Animate_JS_PureVanilla/ (manifest.webmanifest, sw.js, icons/) — la vanilla etant ce qui est deploie sur LWS.
  * index.html (main + vanilla) : links manifest/icon/apple-touch-icon/theme-color en tete + script inline d'enregistrement en fin de body. Chemins TOUS RELATIFS (la vanilla peut etre servie dans un sous-dossier ; scope SW = le dossier du sw.js).
  * sw.js strategies (GET same-origin uniquement) : navigation = network-first + repli cache (+ repli './') ; assets EMPREINTES (assets/nom-HASH.ext) = cache-first (immuables) ; le reste (bundle vanilla, libs, icones, manifeste) = network-first + repli cache — une mise a jour LWS s'applique IMMEDIATEMENT en ligne, jamais de contenu perime servi quand le serveur repond. install: skipWaiting + precache './' et './manifest.webmanifest' ; activate: purge des autres caches + clients.claim() (le SW controle la page des le premier chargement).
  * PIEGE SW (cree la solution) : au premier chargement, la page n'est PAS controlee par le SW (fetch handler muet pour elle) — un simple runtime-caching laisserait le bundle hors cache et le offline cassé APRES LA PREMIERE visite. Fix : le script inline, une fois navigator.serviceWorker.ready, postMessage {type:'CACHE_URLS', urls:[location.href + manifeste + icones + performance.getEntriesByType('resource')} -> le SW fetch+caches tout ce qui a servi (deja en cache HTTP -> gratuit). Offline complet DES la premiere visite.
  * E2E PROUVE (repro_e2e_pwa_offline.mjs + vanilla_server.mjs, 20 controles OK) : scenario REALISTE par version — chargement en ligne (SW active, 11 entrees dist / 12 vanilla, manifeste servi), rechargement (page controlee), KILL DU SERVEUR (coupeure reelle, pas d'emulation), rechargement -> app demarree depuis le cache (menubar + stage Konva presents, pas de neterror), manifeste + icone fetches hors ligne 200. Dist (vite preview 4174) ET vanilla (serveur statique node 4175, le dossier LWS).
  * APK : public/ contient desormais sw.js/manifest/icons -> copie inoffensive dans les assets Capacitor a la prochaine sync (registration dans le WebView avortee proprement via catch ; le APK n'a pas besoin de PWA, il est natif).
  * Reste a faire user : iOS Safari : PWA limite mais apple-touch-icon fourni ; l'app marche hors ligne apres ajout a l'ecran d'accueil. Dernier geste user de la session : couper sa carte Ethernet (Disable-NetAdapter) une fois le push fait — offline complet, tout est pousse.




### Session 15 - 08/10/2026
- NOUVELLE FONCTIONNALITE (demande user) : PIVOT DE TRANSFORMATION déplaçable dans l'objet, conformément à Animate CC (registration point) — pour animer un bras qui pivote à l'épaule, une épée qui pivote dans la main, etc. Portée : TOUT sauf les bones (l'IK dépend de la rotation autour de la tête). Deux interactions : réticule draggable sur la scène (outil sélection, sélection simple) + champs Pivot X/Y au panneau de propriétés (+ bouton « Recentrer le pivot » quand un pivot explicite est posé).
- SÉMANTIQUE : pivotX/pivotY OPTIONNELS sur l'élément. Formes/texte/bitmap : coordonnées de BOÎTE locale ((0,0) = coin haut-gauche, unités px) ; ligne/chemin : boîte = enveloppe des points ; INSTANCE : espace DU SYMBOLE (origine du symbole = (0,0)), exactement le registration point d'Animate. ABSENTS = comportement historique strict (centre pour rect/ellipse/texte/bitmap, origine du nœud = 1er point pour ligne/chemin, origine du symbole pour une instance) -> TOUS les documents existants rendent à l'identique, aucune migration. INVARIANT central : le point de l'objet situé sur le pivot tombe exactement à (el.x, el.y) ; el.x/el.y SONT la position du pivot.
- ARCHITECTURE : src/core/pivot.js (NOUVEAU) = helpers partagés éditeur/panneau (hasPivot, pivotNodeOffset [offset Konva par type, renderedHeight pour le défaut d'un texte], pivotBoxFromNode, pivotMoveDelta [compensation x/y avec R(rotation)·S(scale) appliquée au delta d'offset], setElementPivot, setElementPivotField [1 composante, l'autre prend son défaut], resetElementPivot, pivotHitShift, defaultPivotBox). COPIES AUTONOMES de la logique là où aucun import n'est possible (fichiers ?raw) : tweenRuntime.js (pivotDrawShift + hasPivot, appelé par drawShape après scale ; _renderInstance translate(-pivot) pour les instances ; NUMERIC_PROPS += pivotX/pivotY), exportHTML.js + compiledPlayer.js (pivotHitShift ES5 dans leur hit-test porté). sceneRuntime.js IMPORTE pivot.js (hitTestElement : le point cliqué est ramené dans le repère du pivot PAR DÉFAUT via pivotHitShift ; elementBBox des instances : union des enfants décalée du pivot de chaque enfant). Autres points touchés : Stage.js buildNode (node.offsetX/offsetY = pivotNodeOffset pour tout non-bone : le Transformer et les rotations s'alignent dessus automatiquement, Konva tourne autour de l'offset), playback/interpolate.js (NUMERIC_PROPS += pivotX/pivotY : un pivot qui bouge entre 2 images clés S'ANIME), model.js getSymbolContentBounds (contenu d'une instance à pivot décalé de -pivot dans l'espace parent), PropertiesPanel.js (lignes pivot + recenter).
- RÉTICULE (Stage.js) : groupe pivotGroup dans overlayLayer (SÉPARÉ de handleGroup que refreshPointHandles vide — sinon le réticule serait détruit à chaque render). Visible si outil sélection + sélection simple + non-bone + calque non verrouillé + hors lecture. Drag : le pointeur est converti en coordonnées nœud (transform absolu inversé) = nouvel offset ; x/y compensés EN CONTINU par pivotMoveDelta (rotation/échelle incluses) -> l'objet ne bouge pas d'un pixel pendant le drag ; commit au dragend uniquement (insertKeyframe + pivotX/pivotY en coordonnées de boîte + el.x/el.y). Même discipline que les poignées plume : JAMAIS notify()/render() pendant un drag. touchstart preventDefault + cancelBubble sur le réticule (leçon session 8) ; hitStrokeWidth 22 pour le tactile.
- HARNais _wrk_mistral_mem/repro_pivot.mjs : 41 CONTROLES OK — (1) défauts = historique exact ; (2) offsets explicites par type + aller-retour boîte ; (3) compensation x/y : cas exact calculé à la main (rot 90° : 200,100 + pivot (0,0) -> 225,50) + invariance des 4 coins sous rotation 37° et échelle (2,0.5), reset et champ unique ; (4) PARITÉ DE RENDU éditeur (offsets Konva) vs export (VRAI tweenRuntime.js drawShape/_renderInstance) via contexte canvas factice à vrai produit matriciel — rect/ellipse/path/texte/bitmap/instance, rotations et échelles ; (5) hit-test E2E sceneRuntime (Scene.onClick) : rect pivoté+tourné touché au bon endroit et refusé hors zone, instance à pivot (zone décalée de -pivot) ; (6) interpolation du pivot éditeur + tweenRuntime ; (7) getSymbolContentBounds avec/sans pivot + round-trip JSON. Non-régression : repro_createjs.mjs TOUJOURS 28/28.
- LECON HARNais : le mock ctx doit composer les matrices dans l'ORDRE CANVAS (M' = M·A, la nouvelle opération s'applique en PREMIER aux coordonnées) — un produit dans l'autre sens passe tous les cas translation-only et échoue dès qu'il y a rotation+échelle composées. Le texte ne fait pas de beginPath : capturer la matrice à fillText.
- Rebuild des DEUX versions fait DANS L'ORDRE (build:vanilla -> cp bundle -> build main) ; bundle vanilla 679,6 Ko node --check OK, « pivotX » présent dans le bundle vanilla ET dist/assets (main). Le compilé et l'export classique embarquent tweenRuntime/compiledPlayer par ?raw : parité automatique.
- Reste à faire : validation visuelle user (reticule, drag, rotation autour du pivot, tween du pivot, exports) ; APK android non regenere (regle : seulement apres validation user).

### Session 16 - 08/10/2026 (soir)
- ENQUETE divergence vanilla vs main (demande user) : le bundle vanilla datait de 03:42 alors que Stage.js avait ete modifie a 13:22 -> le dossier PureVanilla manquait les derniers correctifs pan/plein ecran.
- ROOT CAUSE de la derive : package.json portait la cle "build:pure-vanilla" en DOUBLE - la 2e entree (vite build seul) ecrasait la 1re en JSON, donc le bundle n etait JAMAIS copie vers Animate_JS_PureVanilla ; la 1re entree pointait en plus sur ..Animate_JS_PureVanilla (mauvais chemin relatif). Corrige : cle unique, chemin correct (npm run build:pure-vanilla rebuild ET copie desormais).
- Alignements : sw.js CACHE_NAME v3 partout (public/, dist/, vanilla) ; docs vanilla (PDF 03/10 + HTML, plus recents que le PDF de juillet) copies vers public/docs ; style.css vanilla resynchronise (ecart sur commentaires seulement).
- APK REGENERE sur demande user EXPLICITE (suspension assumee de la regle "seulement apres validation user" du pivot) : vite build -> npx cap sync android -> gradlew assembleDebug (BUILD SUCCESSFUL 38 s puis 11 s) -> copies identiques vers Animate_JS_PureVanilla/app-debug.apk, public/apk-debug.apk, dist/apk-debug.apk. 39 423 253 octets. Embarque le code du jour (pivot + pan dual-mode + portees), la PWA complete (manifeste, sw v3, icones) et les docs a jour.
- PIEGE constate (preexistant, a arbitrer) : public/apk-debug.apk se retrouve EMBARQUE dans le nouvel APK (l ancien APK de 35 Mo DANS l APK de 39 Mo, via la copie public -> dist -> cap sync). Sortir l APK de public/ ferait tomber l APK a ~5 Mo.
- Etat final conforme a la regle d ordre : build main en DERNIER (dist/ a index.html + assets ; le bundle vanilla ne vit que dans Animate_JS_PureVanilla apres le cp).
- FIX (signalement user, meme session) : LA ROTATION DU TRANSFORMER NE SE FAISAIT PAS SUR LE PIVOT. Root cause : le Transformer Konva tourne autour du CENTRE de la boite englobante (rotateAroundCenter, node_modules/konva/lib/shapes/Transformer.js ligne ~510), PAS autour de l offset du noeud qui porte le pivot -> le pivot derivait a l ecran des la premiere rotation. Le rendu/lecture/exports etaient corrects (offset Konva + pivotDrawShift), seul le geste Transformer etait faux.
- FIX Stage.js (additif) : rotPin — sur transformstart, si selection simple + hasPivot explicite (nouvel attr pose dans buildNode via pivotNodeOffset deja import) + non-bone, on memorise x/y/rotation/scale ; sur transform, si rotation pure (echelle inchangee), on RESTAURE x/y : l offset (= pivot, dont x/y EST la position) reste fixe et la rotation se fait autour de lui. Sans pivot explicite : comportement historique Konva conserve (regle additive — pin generalise aurait change l ancre de rotation des lignes/chemins sans pivot).
- Harnais repro_pivot.mjs passe a 45 CONTROLES OK (section 8 : derive du pivot sans correctif reproduite avec le VRAI Konva headless via konva/lib/index.js — l entree node exige canvas, absent ; + pivot fixe a 90 degre, coin oppose projete, cas generalise 20->57 degre). Non-regression repro_createjs.mjs 28/28. Rebuild des DEUX versions dans l ordre reglementaire (vanilla -> cp -> main) ; hasPivot present dans les 2 bundles, node --check OK.
- Lecon : Konva Transformer = rotation autour du centre de boite, TOUJOURS ; l offset du noeud ne change QUE la semantique de x/y. Toute rotation interactive autour d un point custom doit epingler x/y elle-meme.
- APK FINALEMENT REGENERE (23:30, 35,6 Mo, correctif rotPin inclus - verifie par unzip : hasPivot x8, libs createjs x4) malgre des VERROUS NOYAU apparus pendant la session : ENOTEMPTY/EPERM/Access denied sur android/app/src/main/assets/public/libs, app/build/intermediates/assets/** et capacitor-cordova-android-plugins/build/** (ni rm, ni rmdir, ni PowerShell Remove-Item, ni icacls ne passent ; daemon gradle arrete sans effet ; suspects : antivirus ou corruption NTFS - SEUL UN REDEMARRAGE les levera).
- CONTOURNEMENTS (tous REVERTES apres build, configs gradle revenues canoniques) : module cordova restaure depuis le template node_modules/@capacitor/cli/assets/capacitor-cordova-android-plugins.tar.gz + cordova.variables.gradle regenere a l identique (minVersion 24, zero plugin) ; assets paralleles android/app/src/main/assets2 (libs propres depuis dist/) + layout.buildDirectory -> build-new sur app et module cordova le temps du build.
- NETTOYAGE POST-REDEMARRAGE (a faire une fois les verrous leves) : supprimer android/app/src/main/assets/public/libs, android/app/build, android/app/build-new, android/app/src/main/assets2, android/capacitor-cordova-android-plugins/build et android/capacitor-cordova-android-plugins/build-new, puis cap sync + gradlew pour un build propre. NOTE : cap sync peut rechouer ENOTEMPTY tant que ces dossiers existent.
- NOUVELLE FONCTIONNALITE (demande user) : OUTIL ROTATION (Q) qui tourne autour du pivot, comme l outil rotation d Animate CC. Additif pur :
  * icons.js : icone rotate (arc + fleche, grammaire currentColor/1.7, point pivot au centre) ; Toolbar.js : entree apres sous-selection + raccourci Q (SHORTCUTS).
  * Stage.js : rotateGroup (overlay, listening:false) pour le retenu visuel ; rotateDrag { id, layerId, node, pivot, startPointerAngle, startRotation } ; mousedown outil rotate = remontee au noeud element (attr elKind) depuis la cible du hit, selection si besoin (selectElement), bones exclus (workflow IK), calques verrouilles exclus, lecture exclue ; mousemove = delta atan2(pointeur-pivot) depuis l angle de depart, Maj = pas de 15 degres, node.rotation() seulement (x/y jamais touches : el.x/el.y SONT le pivot, invariant) ; retenu = rayon pointille pivot->pointeur + etiquette angle en degres ; mouseup/relachement hors scene (window mouseup) = finishRotate -> commitTransform (insertKeyframe + ecriture modele, meme chemin que le Transformer) ; Echap = cancelRotate (restaure la rotation de depart) ; changement d outil en cours de drag = finalisation (meme discipline que pinceau/plume).
  * refreshPivotHandle accepte aussi l outil rotate : le reticule du pivot reste VISIBLE et draggable pendant la rotation (on voit autour de quoi on tourne, et on peut le deplacer a la volee).
  * Le Transformer reste affiche (comportement existant) : ses ancres tournent aussi autour du pivot (fix rotPin precedent) - les deux chemins sont coherents.
  * Non-regression : repro_pivot.mjs 45/45 (la math rotation-autour-de-l-offset = section 8), repro_createjs.mjs 28/28. Rebuild des DEUX versions dans l ordre reglementaire ; titre de l outil present dans les 2 bundles.
  * Reste a faire : validation visuelle user (drag, Maj-15 degres, reticule visible, rotation d une instance autour du registration point) ; APK non regenere (regle : apres validation).
  * VALIDE PAR L UTILISATEUR (meme session). APK REGENERE via le flux CANONIQUE : les verrous noyau avaient disparu (redemarrage probable ; les suppressions en attente ont abouti) ; nettoyage post-redemarrage applique (app/build, build-new, assets2, libs verrouille, module cordova/build) ; cap sync + gradlew assembleDebug OK apres un rm manuel des deux dossiers que la course Capacitor/Windows (ENOTEMPTY rmdir transitoire) n arrivait pas a vider seuls. APK 40,2 Mo, outil Rotation verifie dans le JS embarque (unzip), libs createjs x4 presentes ; deploye vers public/, Animate_JS_PureVanilla/ et dist/.
  * LECON supplementaire : l erreur ENOTEMPTY rmdir de cap sync peut etre une simple COURSE transitoire (rien a voir avec les verrous noyau precedents) -> rm -rf manuel du dossier en cause puis relancer cap sync suffit ; ne PAS conclure au verrou avant d avoir teste le rm manuel.


- LECON build APK : cap copy/sync peut echouer EPERM sur un dossier assets verrouille alors que tout le reste va bien - verifier avec ls le dossier cible avant de chercher cote gradle. Et NE JAMAIS rm -rf android/capacitor-cordova-android-plugins/src : le module vit du template tar.gz du CLI + fichiers regeneres par cap update (cordoova.variables.gradle, apply from dans build.gradle).

- Reste a faire : validation visuelle user du pivot (reticule, drag, rotation (fix rotPin a revalider en premier), tween, exports) ; rien de committe.

### Session 12 - 02/10/2026
- Nouvelle fonctionnalite : FENETRES-PROJETS multi-documents, demandee par l utilisateur (plusieurs scenes dans des fenetres minimisables, juste sous le menu).
- Choix utilisateur : onglets texte simple (pas de vignettes) ; une seule scene active plein cadre ; bouton + ET Archives/Ouvrir/Nouveau ouvrent une nouvelle fenetre ; pause auto des projets non actifs.
- Architecture (state = facade) : les champs par projet de l objet state (doc, editPath, currentFrame, selectedLayerId, selectedElementIds, selectedKeyframe, focusFrameScript, playing) pointent toujours sur la fenetre active ; panneaux/scene/runtime lisent la facade dynamiquement donc un seul montage d UI suffit. Chaque session = { history, minimized, saved } ; setCurrentSession() replie la facade dans l ancien projet, detach son historique, charge les saved du nouveau, attach, purge clipStates, playing=false, resize, notify.
- Modifications :
  * src/history.js : API attach()/detach() ; attach() reprend la baseline (lastSnapshot) du doc courant — seul l historique du projet ACTIF ecoute notify.
  * src/ui/ProjectTabs.js (nouveau) : bandeau d onglets, purement presentationnel ({id,name,active,minimized} + callbacks onActivate/onClose/onNew).
  * src/main.js : sessions, openProjectWindow (non destructif), activation/minimisation (clic onglet actif = reduire ; placeholder #stage-placeholder), fermeture (confirm ; derniere fenetre fermee -> nouveau projet vierge), facade undo/redo deleguee au projet courant, renderAll rafraichit les onglets.
  * src/ui/MenuBar.js : resetDocument NON destructif -> onDocReplaced(newDoc) (nouvelle fenetre) ; bouton Nouveau sans confirmation.
  * index.html + Animate_JS_PureVanilla/index.html : #project-tabs sous le menu + #stage-placeholder dans #stage-wrap ; #app passe a 4 rangees (auto auto 1fr auto).
  * src/style.css (+ copie PureVanilla) : styles .project-tab / .project-tab-close / .project-tab-new / #stage-placeholder / #stage-wrap.minimized.
- Verification : harnais Node _wrk_mistral_mem/repro_sessions.mjs — 12 controles OK (piles undo isolees par projet, restauration des champs facade, pause auto, undo pre/post-switch). Bundle vanilla regenere et copie ; servi sur http://127.0.0.1:8123/.
- Docs mises a jour : .wrk_opencode/architecture.md, .wrk_opencode/ui.md, README.md (section Fonctionnalites).
- Statut fin de journee : servie sur http://127.0.0.1:8123/, NON COMMITTEE. 3 tours de retours UI integres (flex row explicite, +New, plafond 4 fenetres, onglets bruns PASTEL CLAIRS compacts SANS nom (nom en info-bulle, 48px large / 60px coarse, [x] 12px aligne a droite), [x] liseret noir). Prochaine session : validation visuelle puis commit sur TweenJS_simpleV.0.2 (pas de push production - regle).
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

### REGLE DIRECTRICE (demande utilisateur 03/10/2026, preciser par lui) : developpement ADDITIF par defaut
- **PRIORITE HAUTE — Sauf demande EXPLICITE de refactor ou de modification de sections existantes de l'app, toute nouvelle fonctionnalite s'AJOUTE : nouveaux fichiers, nouvelles fonctions, nouvelles entrees, a cote de l'existant. On ne reecrit pas, ne deplace pas, ne restructure pas le code existant de son propre chef.**
- Le "new Function" du user signifie : ecrire de nouvelles fonctions (developpement en plus) — PAS le mecanisme d'execution eval/new Function, interpretation initiale corrigee le 03/10 sur sa demande. Le mode compile sans eval (exportCompiled.js) reste une option a la demande, ne remplace pas l'export classique.
- Corollaire accepte : un BUG signale par le user autorise a toucher la section fautive (correction minimale, pas de refact de fait divers) ; les tests/harnais s'ajoutent librement.
- Exemples conformes de cette regle en session 13 : Scene.onClick, evenements EaselJS, labels, "Compiler un HTML" = ajouts ; fix portees/handlers = correction de bug minimal sur signalement.

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
