// exportCompiled.js — « Compiler un HTML » : génère un fichier HTML JOUABLE
// où les scripts utilisateur sont de VRAIES fonctions dans de vraies
// balises <script> — aucun eval, aucun new Function à l'exécution (prouvé
// par la balise CSP embarquée, qui interdit unsafe-eval). Les données du
// document vivent dans un bloc JSON pur ; le code utilisateur est inséré
// VERBATIM (plus de couches d'échappement de backslashes : seules les
// séquences dangereuses pour l'enveloppe <script> sont neutralisées, par
// des remplacements qui préservent la valeur en JS : </script -> <\/script,
// <!-- -> <\!--, --> -> --\>).
//
// Structure du fichier produit :
//   <script type="application/json" id="tweenjs-doc">…données…</script>
//   [libs CreateJS si un script les mentionne]
//   <script>…tweenRuntime.js (MovieClip)…</script>
//   <script>…compiledPlayer.js (Scene, événements, pointeur, registres)…</script>
//   <script>window.__tjsScripts = [ fonctions des scripts du document ]</script>
//   <script>window.__tjsFrames = { "layerId:frame": fonctions des scripts d'image }</script>
//   <script>window.__tjsChild = { "symboleId:layerId:frame": fonctions des scripts de clips }</script>
//   <script>tweenjsStart();</script>
import runtimeSource from './tweenRuntime.js?raw';
import playerSource from './compiledPlayer.js?raw';
import { invertFrameLabels, getNamedElements } from '../core/model.js';
import { RESERVED } from '../runtime/sceneRuntime.js';
import { buildFullDocData, collectAllScripts, loadCreateJsSources } from './exportHTML.js';
import { downloadTextFile } from '../util/download.js';

// Neutralise les séquences qui casseraient l'enveloppe <script> du fichier
// HTML. Ces remplacements sont SÛRS et PRÉSERVENT LA VALEUR : dans une
// chaîne JS, '\!' '\>' '\/' s'évaluent en '!' '>' '/' ; dans une regex,
// idem ; dans un commentaire, sans effet. La seule exigence est que le code
// compilé soit du JS valide (séquence impossible ailleurs qu'en
// chaîne/regex/commentaire).
function sanitizeForScriptTag(code) {
  return String(code || '')
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--')
    .replace(/-->/g, '--\\>');
}

// Prélude des variables nommées : `var But = named["But"];` — généré à la
// COMPILATION (image par image), identique à ce que l'éditeur fait à
// l'exécution. Les noms non-identifiants ou réservés restent accessibles
// via la map `named` passée en paramètre.
function namedPrelude(doc, frameIndex) {
  const named = getNamedElements(doc, [], frameIndex);
  return Object.keys(named)
    .filter((n) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n) && !RESERVED.has(n))
    .map((n) => 'var ' + n + ' = named[' + JSON.stringify(n) + '];')
    .join('\n');
}

// Compile un script utilisateur en FONCTION RÉELLE. Signature identique à
// celle du new Function historique : le contrat ne change pas.
function compileFunction(prelude, code) {
  return 'function(Scene, Game, console, named, createjs) {\n'
    + '"use strict";\n'
    + (prelude ? prelude + '\n' : '')
    + sanitizeForScriptTag(code)
    + '\n}';
}

function scriptBlock(content) {
  return '<script>\n' + content + '\n</script>\n';
}

// Le runtime partagé embarqué en <script> CLASSIQUE : ses `export` sont
// illégaux hors module (on les retire — les déclarations deviennent des
// liaisons globales, accessibles au player du script suivant), et le repli
// new Function (marqué TJS_NOEVAL_*) est retiré : le fichier compilé ne
// contient NI eval NI new Function, sous CSP stricte.
function runtimeForClassicScript() {
  return runtimeSource
    .replace(/^export (class|function|const|let|var)\b/gm, '$1')
    .replace(/\/\* TJS_NOEVAL_START[^*]*\*\/[\s\S]*?\/\* TJS_NOEVAL_END \*\//g, '');
}

export async function buildCompiledHTML(doc) {
  const dataJson = JSON.stringify(buildFullDocData(doc)).replace(/</g, '\\u003c');

  // Scripts du document (portée 'run' — exécutés une fois au démarrage).
  const docFns = (doc.scripts || [])
    .map((s) => compileFunction(namedPrelude(doc, 0), s.code || ''));

  // Scripts d'image de la timeline racine — registre "layerId:frame".
  const frameEntries = [];
  for (const layer of doc.layers || []) {
    for (const kf of layer.keyframes || []) {
      if (!kf.script || !kf.script.trim()) continue;
      frameEntries.push(
        JSON.stringify(layer.id + ':' + kf.index) + ': '
        + compileFunction(namedPrelude(doc, kf.index), kf.script)
      );
    }
  }

  // Scripts d'image des clips enfants — registre "symboleId:layerId:frame".
  const childEntries = [];
  for (const id in doc.symbols || {}) {
    const sym = doc.symbols[id];
    for (const layer of sym.layers || []) {
      for (const kf of layer.keyframes || []) {
        if (!kf.script || !kf.script.trim()) continue;
        childEntries.push(
          JSON.stringify(id + ':' + layer.id + ':' + kf.index) + ': '
          + compileFunction('', kf.script)
        );
      }
    }
  }

  // CreateJS inliné si un script l'utilise (même règle que l'export HTML).
  let libScripts = '';
  if (collectAllScripts(doc).some((code) => /\bcreatejs\b/.test(code))) {
    libScripts = (await loadCreateJsSources())
      .map((src) => scriptBlock(src))
      .join('');
  }

  const title = (doc.name || 'Animation').replace(/[<>]/g, '');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="generator" content="TweenJS compile (scripts reels, sans eval)" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:" />
<title>${title} — compile TweenJS</title>
<style>
  html, body { margin: 0; height: 100%; background: #111318; display: flex; align-items: center; justify-content: center; }
  canvas { background: #ffffff; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
</style>
</head>
<body>
<canvas id="stage"></canvas>
<script type="application/json" id="tweenjs-doc">${dataJson}</script>
${libScripts}<script>
${runtimeForClassicScript()}</script>
<script>
${playerSource}</script>
<script>
window.__tjsScripts = [
${docFns.join(',\n')},
];
</script>
<script>
window.__tjsFrames = {
${frameEntries.join(',\n')},
};
</script>
<script>
window.__tjsChild = {
${childEntries.join(',\n')},
};
</script>
<script>tweenjsStart();</script>
</body>
</html>
`;
}

export async function downloadCompiledHTML(doc) {
  downloadTextFile(await buildCompiledHTML(doc), (doc.name || 'animation').replace(/[^a-z0-9_\-]+/gi, '_') + '.compile.html', 'text/html');
}
