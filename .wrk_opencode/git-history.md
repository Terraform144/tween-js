# Git — branches, historique, état

## Branches (au 02/10/2026)

```
* TweenJS_simpleV.0.2   ← branche courante (créée depuis 5d84922, poussée sur origin)
  TweenJS_simpleV.0.1   (poussée : fix import d'images 5d84922)
  TweenJS.V.0.1
  list
  master
  remotes/origin/*      (TweenJS_simpleV.0.2, TweenJS_simpleV.0.1, TweenJS.V.0.1, master)
```

Règle utilisateur (30/09/2026) : **ne jamais pousser sur le serveur de
production** — push git uniquement vers `origin` (GitHub), sur demande.

## Historique récent (10 derniers commits)

```
813294e revert: rollback onion skinning and related changes to ec39b98
05fce6f fix: F6 now updates existing keyframe with current active content (Animate behavior)
4dc4d2c fix: add fallback in selectedLayer() and editableLayer() to prevent null returns
47078bd fix: add ENABLE_BONES feature flag usage and fix undefined kf reference in renderInto
f5c692c fix: complete onion skinning implementation and fix missing onionLayer definition
9633fca feat: add onion skinning feature
ec39b98 feat: disable bones with ENABLE_BONES feature flag
b13ab43 chore: add production environment config
307baaa chore: ignore local SSH info file
19a8408 docs: add comprehensive Dungeon Crawler walls organization guide
```

Points notables :
- L'onion skinning (peau d'oignon) a été implémenté puis **reverté**
  (`813294e` → retour à `ec39b98`).
- Le flag `ENABLE_BONES` désactive les ossatures (`ec39b98`).
- Déploiement prod configuré (`b13ab43`), fichier local d'infos SSH ignoré
  (`307baaa`).

## État du dépôt (au 02/08/2026)

- Sur `TweenJS_simpleV.0.1`, rien de stagé.
- **Untracked** : `gameTest/` (contient `IIB_AS_HARMAN_TEST/` = SDK AIR
  HARMAN pour tests — volumineux, binaire, à ne pas committer sans décision).
- `Notes.txt`, `Nouveau Document texte.txt` sont **trackés** par git. `Notes.txt` est vide.
  `.env` est ignoré (30/09/2026) et ne doit jamais être committé (secrets).

## Fichiers non versionnés / données locales

- `node_modules/`, `dist/`, fichiers `*_ssh_info.txt` → ignorés (.gitignore).
- `_wrk_mistral_mem/session_log.md` : historique des sessions Mistral
  (responsive, import SVG, toolbar delete, …) — encodage cassé (mojibake),
  les accents sont illisibles.
- `gameTest/` : SDK AIR HARMAN (test d'intégration) — non tracké.
- `.env` : présent et tracké (contenu non lu volontairement).

## Notes diverses

- Fichier `Nouveau Document texte.txt` existe à la racine (contenu non
  vérifié) — probablement du brouillon utilisateur.
- `docs/` : documentation riche (README.md, SHARED_SYMBOLS.md,
  documentation.html, Animate-JS-Documentation.pdf).
- `dist/` : build Vite (index.html + assets).
