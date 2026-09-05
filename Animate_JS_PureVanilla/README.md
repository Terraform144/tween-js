# TweenJS — version Pure Vanilla

Version **100 % statique** de l'éditeur d'animation TweenJS sans modules ES.
Cette version utilise un bundle IIFE (Immediately Invoked Function Expression)
qui peut être chargé avec une simple balise `<script>` et fonctionne même
avec le protocole `file://`.

> Note : Cette version charge Konva et CodeMirror depuis des CDNs externes.
> Les dépendances sont chargées avant le bundle principal.

## Structure

```
Animate_JS_PureVanilla/
├── index.html                    # point d'entrée
├── style.css                   # styles de l'application
├── tweenjs-bundle.js           # bundle IIFE de l'application (avec CodeMirror inclus)
├── mentions-legales.html       # mentions légales
└── README.md
```

## Utilisation

### Via HTTP (recommandé)

```bash
# depuis ce dossier, n'importe quel serveur statique :
npx serve .
# ou
python -m http.server 8080
# puis ouvrir http://localhost:8080
```

### Via file:// (fonctionne aussi !)

Ouvrir directement `index.html` dans un navigateur. Les dépendances externes
(Konva, CodeMirror) seront chargées depuis les CDNs.

## Build

Le bundle est généré depuis le projet source `Animate_JS_PRJ` avec Vite :

```bash
cd ../Animate_JS_PRJ
npm install
npm run build:vanilla
```

Puis copier manuellement le fichier généré :

```bash
cp dist/tweenjs-bundle.iife.js ../Animate_JS_PureVanilla/tweenjs-bundle.js
```

Ou en une seule commande :

```bash
cd ../Animate_JS_PRJ
npm run build:vanilla && cp dist/tweenjs-bundle.iife.js ../Animate_JS_PureVanilla/tweenjs-bundle.js
```

Sur Windows :

```cmd
cd ..\Animate_JS_PRJ
npm run build:vanilla && copy dist\tweenjs-bundle.iife.js ..\Animate_JS_PureVanilla\tweenjs-bundle.js
```

## Dépendances externes

- **Konva** : https://unpkg.com/konva@9.3.16/konva.min.js
- **CodeMirror** : https://cdn.jsdelivr.net/npm/codemirror@6.0.2/view.min.js
- **CodeMirror State** : https://cdn.jsdelivr.net/npm/codemirror@6.0.2/state.min.js
- **CodeMirror JavaScript Lang** : https://cdn.jsdelivr.net/npm/@codemirror/lang-javascript@6.2.5/index.min.js
- **CodeMirror One Dark Theme** : https://cdn.jsdelivr.net/npm/@codemirror/theme@6.1.3/one-dark.css

## Avantages

✅ **Pas de modules ES** - fonctionne avec `file://`
✅ **Pas de build requis** - prêt à l'emploi
✅ **Dépendances externes** - taille de bundle réduite
✅ **100% statique** - hébergement simple sur n'importe quel serveur

## Limitations

⚠️ **Requiert Internet** pour charger les dépendances externes
⚠️ **Version de développement** - pas minifiée (pour le debugging)
