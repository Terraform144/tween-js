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
    name: doc.name || '',
    layers: doc.layers,
    frameLabels: invertFrameLabels(doc.frameLabels),
    assets: doc.assets || {},
    symbols,
  };
}

// Échappe `<` (évite que `</script>` ou `<!--` dans du code utilisateur ou
// des données brise le bloc <script> du fichier exporté).
function escapeForScript(str) {
  return JSON.stringify(str).replace(/</g, '\\u003c');
}

// Le bootstrap est concaténé derrière le runtime exporté (même module : il
// accède donc à `MovieClip`, `getActiveKeyframe`, … sans les redéclarer).
// Il réimplémente la surface minimale de l'API Scene/Game de l'éditeur
// (sceneRuntime.js) + l'injection des Noms d'instance comme variables de
// script — `nom.x += 1` fonctionne donc dans le HTML exporté, exactement
// comme dans l'éditeur.
function buildBootstrapScript(dataJson, scriptsJson) {
  return `${runtimeSource}
(function () {
  var DATA = ${dataJson};
  var SCRIPTS = ${scriptsJson};
  var canvas = document.getElementById('stage');
  canvas.width = DATA.width;
  canvas.height = DATA.height;
  var ctx = canvas.getContext('2d');

  // --- API Scene/Game pour les scripts exportés (même surface que l'éditeur) ---
  var enterFrameCbs = [];
  var keyDownCbs = [];
  var keyUpCbs = [];
  var keys = {};

  function isTyping(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  window.addEventListener('keydown', function (e) {
    if (isTyping(e.target)) return;
    keys[e.key] = true;
    for (var i = 0; i < keyDownCbs.length; i++) { try { keyDownCbs[i](e.key, e); } catch (err) { console.error(err); } }
  });
  window.addEventListener('keyup', function (e) {
    if (isTyping(e.target)) return;
    keys[e.key] = false;
    for (var i = 0; i < keyUpCbs.length; i++) { try { keyUpCbs[i](e.key, e); } catch (err) { console.error(err); } }
  });

  function resizeCanvas() { canvas.width = DATA.width; canvas.height = DATA.height; }

  function makeShape(type, props) {
    return Object.assign({
      kind: 'shape', shapeType: type, name: '', x: 0, y: 0, width: 100, height: 100,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, fill: '#cb4b16', stroke: '#073642',
      strokeWidth: 2, closed: false, text: '', fontSize: 24, fontFamily: 'Arial',
    }, props);
  }

  function makeInstance(symbolId, props) {
    return Object.assign({
      kind: 'instance', symbolId: symbolId, name: '', x: 0, y: 0,
      rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
    }, props);
  }

  function addToScene(el) {
    for (var i = DATA.layers.length - 1; i >= 0; i--) {
      var layer = DATA.layers[i];
      if (!layer.locked && layer.visible) {
        layer.keyframes[0].elements.push(el);
        return el;
      }
    }
    return null;
  }

  var Scene = {
    get width() { return DATA.width; },
    set width(v) { DATA.width = Math.max(1, +v || 1); resizeCanvas(); },
    get height() { return DATA.height; },
    set height(v) { DATA.height = Math.max(1, +v || 1); resizeCanvas(); },
    get frameRate() { return DATA.frameRate; },
    set frameRate(v) { DATA.frameRate = Math.max(1, Math.min(120, +v || 1)); },
    get backgroundColor() { return DATA.backgroundColor; },
    set backgroundColor(c) { DATA.backgroundColor = c || '#ffffff'; },
    get name() { return DATA.name; },
    set name(n) { DATA.name = String(n || ''); },
    get frameCount() { return DATA.frameCount; },
    set frameCount(v) { DATA.frameCount = Math.max(1, +v || 1); },
    get playing() { return root.isPlaying; },
    get currentFrame() { return root.currentFrame; },
    set currentFrame(f) { root._goto(f); },
    play: function () { root.play(); },
    stop: function () { root.stop(); },
    gotoAndPlay: function (f) { root.gotoAndPlay(f); },
    gotoAndStop: function (f) { root.gotoAndStop(f); },
    addShape: function (type, props) { return addToScene(makeShape(type, props || {})); },
    addInstance: function (symbolId, props) { return addToScene(makeInstance(symbolId, props || {})); },
    onEnterFrame: function (cb) { if (typeof cb === 'function') enterFrameCbs.push(cb); },
    onKeyDown: function (cb) { if (typeof cb === 'function') keyDownCbs.push(cb); },
    onKeyUp: function (cb) { if (typeof cb === 'function') keyUpCbs.push(cb); },
    get keys() { return keys; },
    random: function (n) { return Math.floor(Math.random() * (n || 1)); },
    log: function () { console.log.apply(console, arguments); },
  };

  // --- Noms d'instance (voir getNamedElements dans l'éditeur) ---
  // Chaque élément nommé de la scène est exposé comme variable directe : une
  // Proxy qui écrit les propriétés de transformation dans l'élément live
  // (c1.x += 1 déplace réellement le rendu) et délègue les méthodes de
  // timeline au MovieClip enfant si c'est une instance de symbole movieclip.
  var CHILD_METHODS = ['play', 'stop', 'gotoAndPlay', 'gotoAndStop', 'addEventListener', 'removeEventListener'];
  var CHILD_PROPS = ['currentFrame', 'frameCount', 'isPlaying', 'loop'];

  function resolveChild(el) {
    if (el.kind !== 'instance') return null;
    var sym = DATA.symbols[el.symbolId];
    if (!sym || sym.type !== 'movieclip') return null;
    return root._children.get(el.id) || null;
  }

  function exposeNamedElement(el) {
    return new Proxy(el, {
      get: function (target, prop) {
        var c = resolveChild(el);
        if (c) {
          if (CHILD_METHODS.indexOf(prop) !== -1) return c[prop].bind(c);
          if (CHILD_PROPS.indexOf(prop) !== -1) return c[prop];
        }
        return target[prop];
      },
      set: function (target, prop, value) { target[prop] = value; return true; },
    });
  }

  function collectNamed(layers, frameIndex) {
    var out = {};
    for (var li = 0; li < layers.length; li++) {
      var kf = getActiveKeyframe(layers[li], frameIndex);
      if (!kf) continue;
      for (var ei = 0; ei < kf.elements.length; ei++) {
        var el = kf.elements[ei];
        var name = (el.name || '').trim();
        if (name) out[name] = exposeNamedElement(el);
      }
    }
    return out;
  }

  var RESERVED = new Set([
    'Scene', 'Game', 'console', 'named', 'eval', 'arguments', 'undefined', 'NaN', 'Infinity',
    'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
    'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function',
    'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null',
    'package', 'private', 'protected', 'public', 'return', 'static', 'super', 'switch', 'this',
    'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  ]);

  function namedVarNames(named) {
    return Object.keys(named).filter(function (n) {
      return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n) && !RESERVED.has(n);
    });
  }

  // Scripts d'image (frame actions) : exécutés une fois par arrivée sur une
  // image de la timeline racine qui porte un kf.script non vide (voir le hook
  // onFrameScript de MovieClip.update() dans tween-runtime.js). Seule la
  // timeline racine est couverte pour l'instant, pas les symboles imbriqués.
  function runFrameScripts(frameIndex) {
    for (var li = 0; li < DATA.layers.length; li++) {
      var layer = DATA.layers[li];
      var kf = null;
      for (var ki = 0; ki < layer.keyframes.length; ki++) {
        if (layer.keyframes[ki].index === frameIndex) { kf = layer.keyframes[ki]; break; }
      }
      if (!kf || !kf.script || !kf.script.trim()) continue;
      try {
        var named2 = collectNamed(DATA.layers, frameIndex);
        var prelude2 = namedVarNames(named2).map(function (n) {
          return 'var ' + n + ' = named[' + JSON.stringify(n) + '];';
        }).join('\\n');
        var fn2 = new Function('Scene', 'Game', 'console', 'named', '"use strict";\\n' + prelude2 + '\\n' + kf.script);
        fn2(Scene, Scene, console, named2);
      } catch (err) { console.error(err); }
    }
  }

  var root = new MovieClip(DATA, { onFrameScript: runFrameScripts });

  // Les enfants movieclip nommés doivent exister avant l'exécution des scripts
  // (au premier appel à gotoAndPlay('label') depuis un onEnterFrame, la boucle
  // les aura de toute façon créés).
  root._syncChildren(DATA.layers, 0, 0, false);
  var named = collectNamed(DATA.layers, 0);

  for (var si = 0; si < SCRIPTS.length; si++) {
    try {
      var code = SCRIPTS[si] || '';
      var prelude = namedVarNames(named).map(function (n) {
        return 'var ' + n + ' = named[' + JSON.stringify(n) + '];';
      }).join('\\n');
      var fn = new Function('Scene', 'Game', 'console', 'named', '"use strict";\\n' + prelude + '\\n' + code);
      fn(Scene, Scene, console, named);
    } catch (err) { console.error(err); }
  }

  var lastTime = null;
  function loop(time) {
    requestAnimationFrame(loop);
    if (lastTime === null) lastTime = time;
    var dt = time - lastTime;
    lastTime = time;
    root.update(dt);
    for (var i = 0; i < enterFrameCbs.length; i++) {
      try { enterFrameCbs[i](root.currentFrame); } catch (err) { console.error(err); }
    }
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
  const dataJson = escapeForScript(buildFullDocData(doc));
  const scriptsJson = escapeForScript((doc.scripts || []).map((s) => s.code));
  const title = (doc.name || 'Animation').replace(/[<>]/g, '');
  const script = buildBootstrapScript(dataJson, scriptsJson);
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
