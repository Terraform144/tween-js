// Runtime d'exécution des scripts dans l'éditeur : expose une API Scene/Game
// permettant de piloter le document (dimensions, fps, lecture, ajout de
// formes/instances, boucle onEnterFrame, entrées clavier) depuis du code
// utilisateur exécuté avec `run()`.
import { createShape, createInstance, insertKeyframe, getContextLayers, getContextFrameCount, setContextFrameCount, getNamedElements, getKeyframeAt } from '../core/model.js';
import { notify } from '../state.js';

// Mots clés JS / identifiants réservés : un Nom d'instance qui en fait partie
// ne peut pas être injecté comme variable directe (SyntaxError) — il reste
// accessible via la map `named` passée aux scripts (named['nom']).
const RESERVED = new Set([
  'Scene', 'Game', 'console', 'named',
  'eval', 'arguments', 'undefined', 'NaN', 'Infinity',
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false',
  'finally', 'for', 'function', 'if', 'implements', 'import', 'in', 'instanceof',
  'interface', 'let', 'new', 'null', 'package', 'private', 'protected', 'public',
  'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield',
]);

// Noms des propriétés animables d'un élément, pour l'info-bulle de
// complétion ; les éléments nommés supportent aussi width/height/points…
function namedVarNames(named) {
  return Object.keys(named)
    .filter((n) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n) && !RESERVED.has(n));
}

export function createSceneRuntime({ state, onResize = () => {} }) {
  const enterFrameCbs = new Set();
  const keyDownCbs = new Set();
  const keyUpCbs = new Set();
  const keys = {};

  const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

  function onKeyDown(e) {
    if (isTyping(e.target)) return;
    keys[e.key] = true;
    keyDownCbs.forEach((cb) => { try { cb(e.key, e); } catch (err) { console.error(err); } });
  }
  function onKeyUp(e) {
    if (isTyping(e.target)) return;
    keys[e.key] = false;
    keyUpCbs.forEach((cb) => { try { cb(e.key, e); } catch (err) { console.error(err); } });
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function activeLayer() {
    const layers = getContextLayers(state.doc, state.editPath);
    return layers.find((l) => l.id === state.selectedLayerId) || layers[layers.length - 1];
  }

  function addToActiveKeyframe(el) {
    const layer = activeLayer();
    if (!layer || layer.locked) return null;
    const kf = insertKeyframe(layer, state.currentFrame);
    el.layerId = layer.id;
    kf.elements.push(el);
    notify(state);
    return el.id;
  }

  const Scene = {
    // --- Propriétés de la scène ---
    get width() { return state.doc.width; },
    set width(v) { state.doc.width = Math.max(1, +v || 1); notify(state); onResize(); },
    get height() { return state.doc.height; },
    set height(v) { state.doc.height = Math.max(1, +v || 1); notify(state); onResize(); },
    get frameRate() { return state.doc.frameRate; },
    set frameRate(v) { state.doc.frameRate = Math.max(1, Math.min(120, +v || 1)); notify(state); },
    get backgroundColor() { return state.doc.backgroundColor; },
    set backgroundColor(c) { state.doc.backgroundColor = c || '#ffffff'; notify(state); },
    get name() { return state.doc.name; },
    set name(n) { state.doc.name = String(n || ''); notify(state); },
    get frameCount() { return getContextFrameCount(state.doc, state.editPath); },
    set frameCount(v) { setContextFrameCount(state.doc, state.editPath, Math.max(1, +v || 1)); notify(state); },

    // --- Lecture / lecture seule ---
    get playing() { return state.playing; },
    get currentFrame() { return state.currentFrame; },
    set currentFrame(f) { state.currentFrame = Math.max(0, +f | 0); notify(state); },
    play() { state.playing = true; notify(state); },
    stop() { state.playing = false; notify(state); },
    gotoAndPlay(frame) { state.currentFrame = Math.max(0, +frame | 0); state.playing = true; notify(state); },
    gotoAndStop(frame) { state.currentFrame = Math.max(0, +frame | 0); state.playing = false; notify(state); },

    // --- Création d'éléments ---
    addShape(type, props = {}) { return addToActiveKeyframe(createShape(type, props)); },
    addInstance(symbolId, props = {}) { return addToActiveKeyframe(createInstance(symbolId, props)); },

    // --- Boucle de jeu / entrées ---
    onEnterFrame(cb) { if (typeof cb === 'function') enterFrameCbs.add(cb); },
    onKeyDown(cb) { if (typeof cb === 'function') keyDownCbs.add(cb); },
    onKeyUp(cb) { if (typeof cb === 'function') keyUpCbs.add(cb); },
    get keys() { return keys; },

    // --- Divers ---
    random(n) { return Math.floor(Math.random() * (n || 1)); },
    log(...args) { onConsole && onConsole('log', args); },
  };

  // `run` exécute le code une fois. Les callbacks onEnterFrame/onKey* sont
  // vidés à chaque run pour éviter les accumulateurs d'un run à l'autre.
  // Les éléments portant un Nom d'instance (à l'image courante du contexte)
  // sont injectés comme variables directement utilisables : `nom.x += 1`.
  // Un nom non-identifiant valide (espace, mot réservé…) reste accessible
  // via la map `named` passée en 4e argument implicite.
  let onConsole = () => {};
  const proxyConsole = new Proxy(console, {
    get(target, prop) {
      if (['log', 'warn', 'error', 'info', 'debug'].includes(prop)) {
        return (...args) => {
          onConsole(prop, args);
          target[prop](...args);
        };
      }
      return target[prop];
    },
  });

  // Construit et exécute `code` avec accès à Scene/Game/console + les Noms
  // d'instance de l'image courante injectés comme variables. Partagé par
  // run() (bouton Exécuter, sur un script nommé) et runFrameScripts()
  // (déclenchement automatique d'un script d'image pendant la lecture).
  function execCode(code) {
    const named = getNamedElements(state.doc, state.editPath, state.currentFrame);
    const prelude = namedVarNames(named)
      .map((n) => `var ${n} = named[${JSON.stringify(n)}];`)
      .join('\n');
    const fn = new Function('Scene', 'Game', 'console', 'named', '"use strict";\n' + prelude + '\n' + code);
    fn(Scene, Scene, proxyConsole, named);
  }

  function run(code, consoleCb = () => {}) {
    onConsole = consoleCb;
    enterFrameCbs.clear();
    keyDownCbs.clear();
    keyUpCbs.clear();
    execCode(code);
    return Scene;
  }

  // Exécute les scripts d'image (frame actions) présents pile sur `frame`,
  // pour tous les calques du contexte d'édition courant — appelé à chaque
  // avancée d'image pendant la lecture (voir main.js#loop), jamais pendant un
  // simple scrub manuel de la timeline (comme dans Animate CC : les actions
  // ne s'exécutent qu'en lecture/test, pas en édition).
  function runFrameScripts(frame) {
    for (const layer of getContextLayers(state.doc, state.editPath)) {
      const kf = getKeyframeAt(layer, frame);
      if (!kf || !kf.script || !kf.script.trim()) continue;
      try { execCode(kf.script); } catch (err) { console.error(err); }
    }
  }

  // Appelé à chaque avancée d'image pendant la lecture (voir main.js#loop).
  function onFrame(frame) {
    enterFrameCbs.forEach((cb) => { try { cb(frame); } catch (err) { console.error(err); } });
  }

  // Exécute les scripts d'image d'un MovieClip enfant. Contrairement à
  // runFrameScripts (qui opère sur le contexte d'édition courant), celui-ci
  // reçoit directement le symbole et l'état du clip pour créer un `Scene`
  // scopé : `Scene.stop()` arrête CE clip, pas la scène racine.
  function runClipFrameScripts(symbol, frame, clipState) {
    const clipScene = {
      // --- Propriétés de la scène (lecture seule, deleguate to global) ---
      get width() { return state.doc.width; },
      get height() { return state.doc.height; },
      get frameRate() { return state.doc.frameRate; },
      get backgroundColor() { return state.doc.backgroundColor; },
      get name() { return state.doc.name; },
      get frameCount() { return symbol.frameCount; },
      // --- Lecture : scope au clip ---
      get playing() { return clipState.isPlaying; },
      get currentFrame() { return clipState.currentFrame; },
      set currentFrame(f) { clipState.currentFrame = Math.max(0, +f | 0); clipState._lastScriptFrame = -1; },
      play() { clipState.isPlaying = true; },
      stop() { clipState.isPlaying = false; },
      gotoAndPlay(frame) { clipState.currentFrame = Math.max(0, +frame | 0); clipState.isPlaying = true; clipState._lastScriptFrame = -1; },
      gotoAndStop(frame) { clipState.currentFrame = Math.max(0, +frame | 0); clipState.isPlaying = false; clipState._lastScriptFrame = -1; },
      // --- Divers ---
      random(n) { return Math.floor(Math.random() * (n || 1)); },
      log(...args) { onConsole && onConsole('log', args); },
    };
    for (const layer of symbol.layers) {
      const kf = getKeyframeAt(layer, frame);
      if (!kf || !kf.script || !kf.script.trim()) continue;
      try {
        const fn = new Function('Scene', 'Game', 'console', 'named', '"use strict";\n' + kf.script);
        fn(clipScene, clipScene, proxyConsole, {});
      } catch (err) { console.error(err); }
    }
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  }

  return { Scene, run, runFrameScripts, runClipFrameScripts, onFrame, dispose };
}
