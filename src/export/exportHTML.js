// Génère un fichier HTML autonome (aucune dépendance externe, pas de build)
// qui rejoue tout le document avec le runtime MovieClip partagé (voir
// tweenRuntime.js — importé tel quel via ?raw pour ne jamais dupliquer la
// logique de rendu/interpolation : un seul fichier source pour l'éditeur ET
// les deux formes d'export, cf. la mémoire projet à ce sujet).
import runtimeSource from './tweenRuntime.js?raw';
import { invertFrameLabels } from '../core/model.js';
import { downloadTextFile } from '../util/download.js';

function buildFullDocData(doc) {
  const symbols = {};
  for (const id in doc.symbols) {
    const sym = doc.symbols[id];
    symbols[id] = {
      type: sym.type,
      frameCount: sym.frameCount,
      layers: sym.layers,
      frameLabels: invertFrameLabels(sym.frameLabels),
    };
  }
  return {
    width: doc.width,
    height: doc.height,
    backgroundColor: doc.backgroundColor,
    frameRate: doc.frameRate,
    frameCount: doc.frameCount,
    layers: doc.layers,
    frameLabels: invertFrameLabels(doc.frameLabels),
    symbols,
  };
}

function buildBootstrapScript(dataJson) {
  return `${runtimeSource}
(function () {
  var DATA = ${dataJson};
  var canvas = document.getElementById('stage');
  canvas.width = DATA.width;
  canvas.height = DATA.height;
  var ctx = canvas.getContext('2d');
  var root = new MovieClip(DATA, {});
  var lastTime = null;

  function loop(time) {
    requestAnimationFrame(loop);
    if (lastTime === null) lastTime = time;
    var dt = time - lastTime;
    lastTime = time;
    root.update(dt);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = DATA.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    root.draw(ctx);
  }
  requestAnimationFrame(loop);
})();
`;
}

export function buildStandaloneHTML(doc) {
  const dataJson = JSON.stringify(buildFullDocData(doc)).replace(/</g, '\\u003c');
  const title = (doc.name || 'Animation').replace(/[<>]/g, '');
  const script = buildBootstrapScript(dataJson);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${title} — export TweenJS</title>
<style>
  html, body { margin: 0; height: 100%; background: #111318; display: flex; align-items: center; justify-content: center; }
  canvas { background: #ffffff; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
</style>
</head>
<body>
<canvas id="stage"></canvas>
<script type="module">${script}</script>
</body>
</html>
`;
}

export function downloadStandaloneHTML(doc) {
  downloadTextFile(buildStandaloneHTML(doc), (doc.name || 'animation').replace(/[^a-z0-9_\-]+/gi, '_') + '.html', 'text/html');
}
