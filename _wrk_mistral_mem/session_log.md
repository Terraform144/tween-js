# 📜 Historique des sessions de travail avec Mistral Vibe

*Dernière mise à jour : 24/07/2026*
*Projet : TweenJS (Éditeur d'animation vectorielle)*

---

## 📅 **Session 3 - 24/07/2026**
**Heure de début** : ~13:30 (heure locale)
**Contexte** : Suppression du rectangle rouge par défaut + Implémentation complète du responsive design.

### ✅ Actions réalisées
1. **Scène vide par défaut**
   - Modification de `src/main.js` :
     - Suppression des lignes qui ajoutaient un rectangle rouge au démarrage.
     - Maintenant `createDocument({ name: 'Sans titre' })` crée une scène vide.

2. **Implémentation complète du responsive design**
   - **Nouveau fichier** : `src/util/responsive.js`
     - Constantes : `OVERLAY_BREAKPOINT` (1024px), `PHONE_BREAKPOINT` (640px), `LARGE_SCREEN_BREAKPOINT` (1920px)
     - Fonctions : `isNarrowViewport()`, `isTouchLike()`, `isPhoneSize()`, `isLargeScreen()`
   - **Panneau latéral** : devient un tiroir overlay sur ≤1024px avec fond cliquable
   - **Barre d'outils** : boutons agrandis (48px sur mobile, 42px sur 4K)
   - **Scène** : utilise `stage.scale()` + `getRelativePointerPosition()` pour le zoom natif
   - **Timeline** : lignes plus hautes sur tactile (34px), repliée par défaut sur téléphone
   - **CSS** : media queries pour grands écrans (≥1920px, ≥2600px) et cibles tactiles
   - **Documentation** : section "Responsive" ajoutée dans README.md

3. **Bouton Delete dans la toolbar**
   - Ajout du bouton poubelle utilisant l'icône `trash` existante
   - Désactivé quand aucune sélection n'est active
   - Intégration avec `stage.deleteSelected()`

4. **Amélioration de prefs.js**
   - Ajout de `hasPref()` pour distinguer "jamais réglé" de "réglé à false"
   - Permet un comportement intelligent au premier chargement (ex. : replier la sidebar sur mobile)

5. **Mise à jour de README.md**
   - Correction : accent rouge-orange (pas bleu)
   - Section "Responsive" complète avec tous les seuils et comportements
   - Ajout de `responsive.js` dans la structure des fichiers

### 📝 Fichiers modifiés
| Fichier | Modifications |
|---------|--------------|
| `src/main.js` | Suppression rectangle rouge, import responsive, gestion sidebar overlay, toolbar width dynamique |
| `src/stage/Stage.js` | Passage à `getRelativePointerPosition()`, implémentation `resize()` avec fitScale |
| `src/style.css` | Media queries grands écrans, styles overlay, cibles tactiles agrandies |
| `src/ui/Timeline.js` | Import responsive, `rowHeight()` dynamique, repli par défaut sur phone |
| `src/ui/Toolbar.js` | Ajout bouton delete avec callback `onDelete` |
| `src/util/prefs.js` | Ajout fonction `hasPref()` |
| `src/util/responsive.js` | *Nouveau fichier* - utilitaires de détection responsive |
| `index.html` | Meta viewport amélioré (`maximum-scale=1.0, user-scalable=no`) |
| `README.md` | Documentation responsive complète + corrections |

---

## 📅 **Session 2 - 24/07/2026**
**Heure de début** : ~13:25 (heure locale)
**Contexte** : Ajout d'un bouton de suppression dans la toolbar.

### ✅ Actions réalisées
1. **Ajout du bouton Delete (poubelle) dans la toolbar**
   - Modification de `src/ui/Toolbar.js` :
     - Ajout d'un paramètre `onDelete` optionnel dans `mountToolbar`.
     - Création d'un bouton delete utilisant l'icône `trash` (déjà existante dans `icons.js`).
     - Bouton désactivé quand aucune sélection n'est active (`state.selectedElementIds.length === 0`).
   - Modification de `src/main.js` :
     - Réorganisation de l'ordre de création des contrôleurs pour que `stage` soit disponible avant `toolbar`.
     - Passage de `stage.deleteSelected` comme callback `onDelete` à la toolbar.

### 📝 Fichiers modifiés
| Fichier | Modifications |
|---------|--------------|
| `src/ui/Toolbar.js` | + bouton delete, + paramètre `onDelete`, + gestion de l'état disabled |
| `src/main.js` | Réorganisation de l'ordre d'initialisation des contrôleurs + suppression rectangle rouge |

### 📌 Notes techniques
- **Icône** : Utilisation de l'icône `trash` déjà définie dans `src/ui/icons.js` (ligne 21).
- **Fonction existante** : `stage.deleteSelected()` existait déjà et était liée au raccourci `Suppr`/`Backspace` (Stage.js:493).
- **Style** : Le bouton hérite automatiquement du style `.tool-btn` défini dans `style.css`.
- **UX** : Bouton désactivé (opacity: 0.35) quand aucune sélection n'est active.

---

## 📅 **Session 1 - 24/07/2026**
**Heure de début** : ~13:21 (heure locale)
**Contexte** : Première exploration du projet.

### ✅ Actions réalisées
1. **Exploration initiale**
   - Lecture de la structure du projet (`README.md`, `package.json`, `index.html`).
   - Compréhension de l'architecture :
     - **Modèle** : `src/core/model.js` (gestion des calques, images clés, formes, symboles).
     - **Vue** : `src/stage/Stage.js` (rendu Konva) + `src/ui/` (composants UI).
     - **Contrôleurs** : `src/state.js` (état central), `src/history.js` (undo/redo).
     - **Export** : `src/export/` (HTML autonome, symboles en JS).

2. **Création du répertoire de travail**
   - Répertoire `_wrk_mistral_mem/` créé à la racine pour centraliser les notes et l'historique.

### 📌 Notes importantes
- **Stack technique** : JavaScript vanilla (ES modules) + Konva.js (v9.3.16) + Vite (v5.4.10).
- **Fonctionnalités clés** :
  - Outils de dessin (Plume Bézier, Rectangle, Ellipse, Ligne, Texte).
  - Timeline avec calques et images clés (F6/F7).
  - Tweening (mouvement, morphing) et symboles (MovieClip/Graphic).
  - Export en HTML autonome ou en classe JS réutilisable.
  - UI responsive (TV/desktop/tablette/smartphone).
- **Limites** : Pas de zoom/pan, pas de dégradés, pas d'import d'images bitmap.

---

## 📅 **Session 4 - 24/07/2026**
**Heure de début** : ~14:30 (heure locale)
**Contexte** : Ajout de la fonctionnalité d'import SVG.

### ✅ Actions réalisées
1. **Nouveau module d'import SVG** (`src/util/importSvg.js`)
   - `parseSvg(svgText, options)` : parse le texte SVG et retourne des éléments TweenJS
   - Support des éléments : rect, circle, ellipse, line, path, text, polygon, polyline
   - Support des groupes (`<g>`) avec parsing récursif
   - Support des styles : fill, stroke, stroke-width, opacity, font-size, font-family
   - Parsing des paths SVG : commandes M, L, H, V, C (move, line, horizontal, vertical, cubic bezier)
   - Gestion des poignées de Bézier (cIn, cOut) pour les courbes

2. **Nouvelle icône** (`src/ui/icons.js`)
   - Ajout de l'icône `importSvg` pour le bouton d'import

3. **Intégration dans la barre de menu** (`src/ui/MenuBar.js`)
   - Ajout du bouton "Importer SVG" à côté de "Ouvrir…"
   - Input file caché avec accept=".svg,image/svg+xml"
   - Callback `onSvgImport` pour transmettre les éléments parsés

4. **Intégration dans main.js**
   - Passage du callback `onSvgImport` à mountMenuBar
   - Ajout des éléments importés à la keyframe courante du calque actif
   - Assignation des IDs uniques et layerId

5. **Mise à jour de la documentation** (`README.md`)
   - Ajout de l'import SVG dans la liste des fonctionnalités
   - Mise à jour des limites connues

### 📝 Fichiers modifiés
| Fichier | Modifications |
|---------|--------------|
| `src/util/importSvg.js` | *Nouveau fichier* - module complet d'import SVG |
| `src/ui/icons.js` | + icône `importSvg` |
| `src/ui/MenuBar.js` | + import parseSvg, + bouton Importer SVG, + input file, + paramètre onSvgImport |
| `src/main.js` | + imports, + callback onSvgImport |
| `README.md` | + documentation import SVG |

### 📌 Notes techniques
- **Gestion des groupes** : Les éléments `<g>` sont aplatis
- **Positionnement** : Centré sur le bounding box
- **Couleurs** : Normalisation #RGB → #RRGGBB
- **Paths complexes** : Commandes C converties en points avec cIn/cOut

---

### 🎯 Prochaines étapes (à valider avec l'utilisateur)
- [ ] Définir une tâche concrète (ex : ajouter une fonctionnalité, corriger un bug, optimiser un module).
- [ ] Prioriser les axes de travail (ex : amélioration UI, export, outils de dessin).

---

## 📂 Fichiers utiles dans `_wor_Mistral/`
- `session_log.md` → **Ce fichier** (historique global).
- *(À créer)* `notes_<date>.md` → Notes techniques par session.
- *(À créer)* `tasks.md` → Liste des tâches en cours/terminées.
- *(À créer)* `scratch/` → Fichiers temporaires (tests, prototypes).

---

## 🔗 Liens rapides
- [Documentation Konva.js](https://konvajs.org/docs/)
- [Repo Vite](https://github.com/vitejs/vite)
- [README du projet](../README.md)

---

*Format inspiré des conventions Markdown pour une lecture claire.*

---

## 📅 **Session 5 - 27/07/2026**
**Heure de début** : ~ (heure locale)
**Contexte** : Implémentation des fonctionnalités d'ossature avancées

### ✅ Actions réalisées

1. **Correction du bug des points de contrôle Bézier sur mobile**
   - Problème : Les points de contrôle des courbes de Bézier flottaient dans le premier quart de l'écran sur mobile
   - Cause : La fonction `onHandleDrag` dans Stage.js utilisait un calcul manuel incorrect pour convertir les coordonnées écran en coordonnées locales du node
   - Solution : Utilisation de `node.getAbsoluteTransform().copy().invert().point()` pour une conversion correcte, comme dans `onAnchorDrag`
   - Fichier modifié : `src/stage/Stage.js` (ligne 516-553)

2. **Boutons Valider/Annuler disparaissent après validation**
   - Problème : Après validation d'une chaîne d'ossature ou d'un tracé Bézier, les boutons de la toolbar restaient actifs
   - Solution : Réinitialisation de `state.currentTool` à 'select' dans `finishBoneChain()` et `finishPen()`
   - Bonus : Sélection automatique des bones créés après validation d'une chaîne
   - Fichiers modifiés : `src/stage/Stage.js`

3. **Hiérarchie parent/enfant entre bones améliorée**
   - Ajout de `getAllChildBones(kf, parentBoneId)` pour obtenir récursivement tous les descendants d'un bone
   - Mise à jour de `getChildBones` (récupère uniquement les enfants directs) pour garder la compatibilité
   - Fichier modifié : `src/core/model.js`

4. **Association de la chaîne complète d'ossature à un objet**
   - Problème : Seuls les enfants directs étaient considérés pour le skinning avec `boneId`
   - Solution : Utilisation de `getAllChildBones()` au lieu de `getChildBones()` pour inclure toute la hiérarchie
   - Impact : Tous les bones d'une chaîne (via parentBoneId) influencent maintenant les shapes assignées
   - Fichiers modifiés : `src/core/model.js`, `src/stage/Stage.js`

5. **IK (Inverse Kinematics) amélioré pour chaînes de 3-4 bones**
   - Remplacement de l'algorithme basique (2 bones max) par CCD (Cyclic Coordinate Descent)
   - Gère maintenant des chaînes de n'importe quelle longueur
   - Itérations configurables pour une meilleure précision
   - Fichier modifié : `src/core/model.js` (fonction solveIK)

6. **Améliorations mineures**
   - Import de `getAllChildBones` dans Stage.js
   - Mise à jour des commentaires pour refléter les nouvelles capacités

### 📝 Fichiers modifiés
| Fichier | Modifications |
|---------|--------------|
| `src/core/model.js` | + getAllChildBones(), solveIK amélioré avec CCD, export de getAllChildBones |
| `src/stage/Stage.js` | onHandleDrag corrigé, finishBoneChain/finishPen réinitialisent currentTool |

### 📌 Notes techniques
- **CCD Algorithm** : Cyclic Coordinate Descent pour l'IK. Itère alternativement de l'enfant vers le parent et du parent vers l'enfant pour converger vers la solution.
- **Coordinate Transform** : Toujours utiliser `getAbsoluteTransform().invert().point()` pour convertir les coordonnées écran vers les coordonnées locales d'un node Konva.
- **Skeleton Skinning** : L'influence des bones sur les points utilise `perpendicularDistance` avec un rayon d'influence configurable par bone.

### ⚠️ Problèmes connus / Limites
- Le push sur le serveur de production n'a pas pu être effectué (infos retirees du depot)
- GitHub a été mis à jour avec succès
- La déformation de mesh avec courbes de Bézier n'a pas été implémentée (demande spécifique de l'utilisateur non encore clarifiée)

### 🎯 Prochaines étapes
- [ ] ~~Accès SSH production~~ (obsolète : déploiement interdit, voir regle NOTES_SYNTHESE.md)
- [ ] Implémenter la déformation de mesh si l'utilisateur clarifie les besoins
- [ ] Tester l'IK CCD avec des chaînes de 3+ bones


---

## 📅 **Session 6 - 27/07/2026**
**Heure** : ~ (heure locale)
**Contexte** : Déploiement web (details sensibles retires du depot le 30/09/2026)

### ✅ Actions réalisées

1. **Déploiement web réussi**
   - (Identifiants, adresse et commande retirés du dépôt le 30/09/2026 pour raisons de sécurité — ne plus jamais stocker de secrets dans git.)

2. **Enregistrement des informations d'accès**
   - Création d'un fichier local d'infos SSH (hors git, ignore par *_ssh_info.txt)
   - Contient toutes les informations nécessaires pour les futurs déploiements

3. **Vérification du déploiement**
   - Fichiers copiés : index.html, assets/index-*.css, assets/index-*.js
   - Dates de modification mises à jour sur le serveur

### 📌 Notes techniques
- **Outils utilisés** : `plink` et `pscp` (versions PuTTY) sont disponibles dans le PATH
- **GitHub** : Déjà poussé sur https://github.com/Terraform144/tween-js.git
- **Serveur de prod** : Copie directe du dossier `dist` (pas un dépôt git)

### 🎯 Prochaines étapes
- [ ] Tester l'application en production
- [ ] Vérifier que les corrections (Bézier, boutons, skinning) fonctionnent sur mobile
- [ ] Continuer l'implémentation de la déformation de mesh si nécessaire


---

## 📅 **Session 9 - 30/09/2026**
**Contexte** : Correction mobile version principale, commits/push, puis purge sécurité Ionos

### ✅ Actions réalisées

1. **Correction version principale mobile (plume : deux points par tap)**
   - Le correctif existait déjà dans src/stage/Stage.js (Session 8) et le bundle vanilla avait été regénéré ; les artefacts de la version principale restaient périmés (assets web de l APK du 08/09, antérieurs au fix)
   - Rebuild : `npm run build` → `npx cap sync android` → `gradlew assembleDebug` (BUILD SUCCESSFUL 47s)
   - Correctif vérifié dans le JS embarqué de l APK ; copié dans dist/apk-debug.apk et public/apk-debug.apk
   - Note : le build régulier a vidé dist/tweenjs-bundle.iife.js (copie de référence intacte dans Animate_JS_PureVanilla)

2. **Commits + push GitHub (origin uniquement)**
   - Fix plume + APK regenere, puis doc regle anti-production

3. **Règle utilisateur (à respecter en permanence)**
   - NE JAMAIS pousser sur le serveur de production : ni git push, ni déploiement du dossier dist (pscp), sauf demande explicite de l utilisateur. Push git : uniquement vers origin (GitHub).

4. **Purge sécurité (identifiants Ionos committés par erreur)**
   - Mot de passe SSH + login root présents dans l historique GitHub → réécriture complète avec git-filter-repo (replace-text sur les contenus + replace-message sur les messages)
   - Retirés partout : mot de passe, login, IPs, domaines nip.io, commandes pscp, toute mention de l hébergeur
   - Force-push --force-with-lease des 3 branches ; vérification : 0 occurrence restante (contenus + messages, 87 commits)
   - Fichiers courants nettoyés : .env supprimé + ignoré, .gitignore (*_ssh_info.txt), sections déploiement réécrites, bloc hébergeur des mentions-legales neutralisé, remote de prod retiré
   - Backup pré-purge : F:/_SRC/__Debrouillard/AnimateJS-backup-avant-purge-ionos.bundle (contient les secrets : à supprimer une fois validé)

### 📌 Notes techniques
- git-filter-repo : installer via `pip install git-filter-repo`, lancer via `python -m git_filter_repo` ; --replace-text purifie les blobs, --replace-message purifie les messages de commit (les deux sont nécessaires)
- filter-repo demande confirmation si .git/filter-repo/already_ran existe → répondre Y (echo Y | ...)
- Après filter-repo : remotes supprimés → re-add origin, fetch, puis --force-with-lease
- Les fichiers du projet mélangent CRLF (ex. NOTES_SYNTHESE.md) et LF (ex. session_log.md, .gitignore, mentions-legales.html) : vérifier avant tout edit/replace textuel

### ⚠️ À faire côté utilisateur
- [ ] Changer le mot de passe du serveur (il a été public sur GitHub)
- [ ] Demander à GitHub un garbage collection (support) pour purger les anciens commits encore accessibles par SHA


---

## Session 10 - 01/10/2026
**Contexte** : Bug export HTML (menu Fichier) - page blanche dans le fichier exporte.

### Diagnostic
- Symptome (user) : le HTML exporte souvre sur une page vide ; scene avec symboles imbriques, scripts, images importees.
- Harnais headless Node (stubs DOM/canvas) sur le SRC : lexport fonctionne (formes, tween, movieclip imbriques, graphic, bitmap, scripts, labels) -> le bug netait pas dans le code dexport.
- Piste user : version vanilla uniquement. Confirme : le bundle Animate_JS_PureVanilla/tweenjs-bundle.js contenait runtimeSource = chaine morte (export default "// tween-runtime.js..." avec 
 litteraux, 10180 octets au lieu de 16337).
- Cause : plugin handle-raw-imports de vite.vanilla.config.js doublait la transformation ?raw deja geree nativement par Vite 8.

### Fix
- Suppression du plugin dans vite.vanilla.config.js (commentaire explicatif laisse en place).
- npm run build:vanilla + copie dist/tweenjs-bundle.iife.js vers Animate_JS_PureVanilla/tweenjs-bundle.js.
- Verifications : runtime inliné == fichier src (16337 octets) ; harnais headless end-to-end OK.
- Bonus repare : export dobjet de jeu (tween-runtime.js telecharge) etait aussi casse par le meme plugin.

### Livraison test
- Serveur statique local : http://127.0.0.1:8123/ (dossier Animate_JS_PureVanilla, bundle corrige).
- Aucun push production (regle utilisateur).

### Complement Session 10 (apres retour user)
- User a colle l erreur console d un export (IIB_v3_0.html) : TypeError "// tween-runtime.js..." is not a function + canvas non dimensionne = signature exacte de l ANCIEN bug (runtime = chaine morte appelee en fonction). Le fichier avait ete exporte par un bundle vanilla ANCIEN (version en ligne non mise a jour, ou onglet ouvert sur l ancienne version).
- Ajout marqueur de version dans les exports : meta name=generator "TweenJS export v2 (runtime code inline)" dans buildStandaloneHTML (src/export/exportHTML.js) pour identifier d un coup d oeil le pipeline producteur d un fichier exporte.
- Rebuild vanilla + copie Animate_JS_PureVanilla (625184 octets). Verifs re-jouees : runtime inliné == src, harnais headless OK, marqueur present dans le bundle servi et dans le HTML exporte.
- Le serveur statique local (127.0.0.1:8123) sert le bundle a jour (lecture disque par requete).

### Validation user (01/10/2026)
- User confirme : l export HTML depuis la version PureVanilla corrigee fonctionne (scene qui joue).
- Fix CLOS cote local. Reste a faire (user) : deployer Animate_JS_PureVanilla/tweenjs-bundle.js sur le serveur en ligne (regle anti-production : pas de push sans demande explicite) et committer les changements (vite.vanilla.config.js, src/export/exportHTML.js, bundle, memo).

## Session 11 - 02/10/2026 - Import images : 2e import ecrase le 1er

### Symptome
- Import 1 ok ; le 2e import affichait les pixels de la 1ere image (taille de la 2e), puis apres 1er correctif les DEUX bitmaps affichaient les pixels de la 2e image.

### Cause racine
- addAsset() appele par l UI (MenuBar.js:99 menu, main.js:249 drop) avec un objet sans id (createAsset jamais utilise) -> doc.assets['undefined'] ; chaque import ecrase le precedent.

### Fixes
- src/core/model.js : addAsset() attribue un id manquant ; compteur d ids monotone (bumpIdCounterPastDocument ne redescend plus).
- src/stage/Stage.js : cache d images decodees clee par dataUrl au lieu de assetId.
- Harnais regression : _wrk_mistral_mem/repro_import.mjs (6 scenarios, node repro_import.mjs).
- Bundle vanilla regenere + copie ; servi sur http://127.0.0.1:8123/.

### Validation user (02/10/2026)
- Confirme : les deux imports gardent leurs propres pixels.
- Aucun push production (regle). Deploy en ligne a faire par l utilisateur.

