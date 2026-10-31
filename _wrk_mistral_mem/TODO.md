# TODO — Idées et prochaines étapes TweenJS
*Mis à jour le 29/10/2026 (soir) — 4 features livrées et pushées sur origin/TweenJS_workflow.V.0.1*

---

## ✅ Livré le 29/10/2026 (commits 510572f..392e26d, pushés)

- [x] **Onion skinning** — fantômes bleus (passé) / rouges (futur), opacité dégressive, contrôles timeline, persisté. Harnais 31/31 + E2E 17/17.
- [x] **Couleurs transparentes** — `transparent` pour fill/stroke, bouton ∅ UNIQUEMENT dans les propriétés de la forme (demande user), tween fondu alpha (éditeur + runtime). Harnais 14/14 + E2E 11/11.
- [x] **Masque de calque** — layer.mask/masked, toggles timeline, layer Konva dédié par bloc + destination-in, fantôme gris 15% des parties rognées en édition seule, runtime offscreen. Harnais 9/9 + E2E 14/14.
- [x] **Motion guide** — layer.guide/guided, trajectoire Bézier par longueur d'arc, tween guidé partout, guide non rendu en lecture/export. Harnais 17/17 + E2E 8/8.

## 🎯 Prochaines priorités

- [ ] **Dégradés (linéaire / radial)** — sélecteur de type de remplissage dans Propriétés + stops de couleur éditables (avec alpha, cf. transparent). Rendu Konva (createLinearGradient/createRadialGradient) + runtime export (copie autonome) + interpolation des tweens. **Prochaine feature prévue.**
- [ ] **Export vidéo WebM** — capturer la lecture (caméra, tweens, scripts) via MediaRecorder, télécharger un `.webm`.

## 🔧 Confort / précision

- [ ] Grille + aimants (snap) + règles dans la scène
- [ ] Shape hints pour le morphing (appariement guidé, pas seulement par index)
- [x] **Copier/coller entre les fenêtres-projets** — ✅ livré 29/10 : presse-papiers global partagé (Ctrl+C/X/V), assets (bitmaps) et symboles importés automatiquement dans le projet cible au collage. E2E 9/9 (rect + instance/symbole + bitmap cross-projets, Ctrl+X).
- [ ] Piste audio dans la timeline (SoundJS déjà embarqué, pas de timeline sonore)
- [ ] Thème sombre de l'interface (Solarized dark)

## 💡 Gros projets (continuité workflow VS Code)

- [ ] Autocomplétion de l'API du clip dans CodeMirror (Scene, createjs, instances nommées)
- [ ] Export "projet vers dossier" (File System Access API : JSON + assets + scripts .js liés éclatés)

## 📋 Validations côté utilisateur — ✅ TOUTES VALIDÉES le 29/10/2026

- [x] Pivot déplaçable + Rotation (Q) + rotPin · Caméra (C) · script symbole + VS Code · retour arrière doc APK

## 📝 Backlog v2 (noté en session 18)

- [ ] Piste caméra dans la Timeline · easing du tween caméra · `Scene.camera` dans l'API scripts · parallaxe par calque · édition à travers la caméra · lien vivant (FSA) sur les scripts d'image · watch par polling hors Chromium
- [ ] v2 masque : masques imbriqués, masque animé (tween sur le calque masque) · v2 guide : orientation selon la tangente, plusieurs objets par guide

## ⚙️ Améliorations pinceau

- [ ] Plus de patterns (éclaboussures, texture) · sensibilité pression (tablettes) · texture bitmap

---

*Règles : développement ADDITIF par défaut · déploiement production = JAMAIS par l'assistant (c'est l'utilisateur qui le fait) · push git = origin (GitHub) uniquement, sur demande explicite, 1x/branche/session · rebuild des 2 versions dans l'ordre (build:vanilla → cp → build) · APK régénéré seulement après validation user.*
