# TODO — Idées et prochaines étapes TweenJS
*Ajouté le 29/10/2026 — propositions discutées en session, à prioriser avec l'utilisateur*

---

## 🎯 Top 5 (impact max)

- [x] **Onion skinning (peau d'oignon)** — ✅ livré 29/10 : fantômes bleus (passé) / rouges (futur), opacité dégressive, contrôles dans la timeline (bouton + nb passé/futur), persisté en prefs. Harnais 31/31 + E2E 17/17.
- [ ] **Dégradés (linéaire / radial)** — sélecteur de type de remplissage dans Propriétés + stops de couleur éditables. Suit dans le rendu Konva et l'export runtime. (Limite connue du README.)
- [x] **Masques de calque** — ✅ livré 29/10 : layer.mask / layer.masked, toggles dans la timeline, rendu éditeur (layer Konva dédié par bloc + destination-in) + runtime export (canvas offscreen), lecture et exports OK. Harnais 9/9 + E2E 12/12.
- [ ] **Motion guide** — trajectoire en courbe Bézier attachée à un tween de mouvement (l'objet suit la courbe au lieu d'une ligne droite).
- [ ] **Export vidéo WebM** — capturer la lecture (caméra, tweens, scripts) via MediaRecorder, télécharger un `.webm`.

## 🔧 Confort / précision

- [ ] Grille + aimants (snap) + règles dans la scène
- [ ] Shape hints pour le morphing (appariement guidé, pas seulement par index)
- [ ] Copier/coller entre les fenêtres-projets ouverts (presse-papiers multi-doc)
- [ ] Piste audio dans la timeline (SoundJS déjà embarqué, pas de timeline sonore)
- [ ] Thème sombre de l'interface (Solarized dark)

## 💡 Gros projets (continuité workflow VS Code)

- [ ] Autocomplétion de l'API du clip dans CodeMirror (Scene, createjs, instances nommées)
- [ ] Export "projet vers dossier" (File System Access API : JSON + assets + scripts .js liés éclatés)

## 📋 Validations côté utilisateur — ✅ TOUTES VALIDÉES le 29/10/2026

- [x] Validation visuelle du pivot déplaçable + outil Rotation (Q) + rotPin
- [x] Validation visuelle de l'outil Caméra (C) : cadre, pan/zoom/rotation, lecture, exports
- [x] Validation du script de symbole + workflow VS Code (bouton MovieClip, import/export .js, lien vivant Chrome)
- [x] Test mobile : retour arrière Android après la doc (version HTML dans l'APK)

## 📝 Idées v2 notées en session 18 (backlog)

- [ ] Piste caméra dans la Timeline (visibilité / drag des clés caméra)
- [ ] Easing du tween caméra (au-delà de l'interpolation linéaire)
- [ ] `Scene.camera` dans l'API scripts
- [ ] Parallaxe par profondeur de calque (Animate 2019)
- [ ] Édition À TRAVERS la caméra (aujourd'hui la caméra ne s'applique qu'en lecture)
- [ ] Lien vivant (FSA) aussi sur les scripts d'image (v1 = scène + symboles seulement)
- [ ] Watch par polling hors Chromium (nécessiterait un dev-server local)

## ⚙️ Améliorations pinceau (backlog historique)

- [ ] Plus de patterns (éclaboussures, texture)
- [ ] Sensibilité à la pression (tablettes)
- [ ] Texture bitmap dans le pinceau

---

*Règle rappel : développement ADDITIF par défaut. Déploiement production : JAMAIS par l'assistant — c'est l'utilisateur qui le fait lui-même. Push git : origin (GitHub) uniquement, sur demande explicite, 1x/branche/session.*
