// Runtime d'exécution des scripts dans l'éditeur : expose une API Scene/Game
// permettant de piloter le document (dimensions, fps, lecture, ajout de
// formes/instances, boucle onEnterFrame, entrées clavier) depuis du code
// utilisateur exécuté avec `run()`.
import { createShape, createInstance, insertKeyframe, getContextLayers, getContextFrameCount, setContextFrameCount, getNamedElements, getKeyframeAt, getFrameLabels, invertFrameLabels } from '../core/model.js';
import { notify } from '../state.js';

// Bibliothèques tierces injectées dans les scripts comme variables directes.
// CreateJS (EaselJS + TweenJS + SoundJS + PreloadJS) est chargé depuis
// ./libs/createjs via des <script> UMD dans index.html : il s'installe sur la
// globale `createjs` et chaque exécution de script la reçoit en paramètre.
// Pour ajouter plus tard une autre bibliothèque : la charger (script tag ou
// autre), puis ajouter ici le nom de sa variable globale — RESERVED la
// masque automatiquement comme Nom d'instance.
const SCRIPT_LIBS = ['createjs'];

function scriptLibValues() {
  return SCRIPT_LIBS.map((name) => (typeof globalThis[name] === 'undefined' ? undefined : globalThis[name]));
}

// Mots clés JS / identifiants réservés : un Nom d'instance qui en fait partie
// ne peut pas être injecté comme variable directe (SyntaxError) — il reste
// accessible via la map `named` passée aux scripts (named['nom']).
export const RESERVED = new Set([
  'Scene', 'Game', 'console', 'named', ...SCRIPT_LIBS,
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

// ---------------------------------------------------------------------------
// API d'événements compatible EaselJS (createjs.EventDispatcher) sur les
// éléments nommés et sur Scene. Les handlers sont stockés hors des objets
// (WeakMap) et les méthodes en propriétés NON énumérables : la sérialisation
// du document (JSON) reste strictement identique.
// ---------------------------------------------------------------------------
const EVENT_HANDLERS = new WeakMap(); // objet -> Map(type -> Set({cb, scope, once, wrapped, owner}))

// Portée d'enregistrement courante : 'run' pendant l'exécution du bouton
// Exécuter, 'frame' pendant un script d'image, null en dehors. Un handler
// posé par Exécuter doit SURVIVRE aux scripts d'image (purges 'frame'), et
// réciproquement — cf. execCode().
let CURRENT_HANDLER_REG = null;

function handlerSet(obj, type, create) {
  let map = EVENT_HANDLERS.get(obj);
  if (!map) {
    if (!create) return null;
    map = new Map();
    EVENT_HANDLERS.set(obj, map);
  }
  let set = map.get(type);
  if (!set && create) {
    set = new Set();
    map.set(type, set);
  }
  return set || null;
}

function eventApiOn(type, cb, scope, once) {
  if (typeof type !== 'string' || typeof cb !== 'function') return null;
  const wrapped = function (event) {
    if (once) eventApiOff.call(this, type, wrapped);
    cb.call(scope || this, event);
  };
  handlerSet(this, type, true).add({ cb, scope, once, wrapped, owner: CURRENT_HANDLER_REG });
  return wrapped;
}

function eventApiOff(type, cb) {
  const set = handlerSet(this, type, false);
  if (!set) return;
  if (cb == null) { set.clear(); return; }
  for (const entry of set) {
    if (entry.cb === cb || entry.wrapped === cb) { set.delete(entry); return; }
  }
}

function eventApiDispatch(eventObj) {
  if (typeof eventObj === 'string') eventObj = { type: eventObj };
  if (!eventObj.target) eventObj.target = this;
  eventObj.currentTarget = this;
  if (eventObj.defaultPrevented == null) eventObj.defaultPrevented = false;
  if (typeof eventObj.preventDefault !== 'function') {
    eventObj.preventDefault = function () { this.defaultPrevented = true; };
  }
  const set = handlerSet(this, eventObj.type, false);
  if (set) for (const entry of [...set]) {
    try { entry.wrapped.call(this, eventObj); } catch (err) { console.error(err); }
  }
  return !eventObj.defaultPrevented;
}

function attachEventApi(obj) {
  if (obj.__hasEventApi) return obj;
  const methods = {
    on: eventApiOn,
    addEventListener: eventApiOn,
    off: eventApiOff,
    removeEventListener: eventApiOff,
    removeAllEventListeners(type) {
      const map = EVENT_HANDLERS.get(this);
      if (!map) return;
      if (type == null) map.clear(); else map.delete(type);
    },
    hasEventListener(type) {
      const set = handlerSet(this, type, false);
      return !!set && set.size > 0;
    },
    dispatchEvent: eventApiDispatch,
  };
  for (const name in methods) {
    Object.defineProperty(obj, name, { value: methods[name], enumerable: false, configurable: true, writable: true });
  }
  Object.defineProperty(obj, '__hasEventApi', { value: true, enumerable: false, configurable: true });
  return obj;
}

// Retire les handlers d'un objet. owner = null -> tout retirer (reset
// complet au run) ; sinon ne retirer que les handlers enregistrés sous cette
// portée — les handlers 'run' survivent aux purges 'frame' des scripts
// d'image.
function detachAllEvents(obj, owner) {
  const map = EVENT_HANDLERS.get(obj);
  if (!map) return;
  if (owner == null) { map.clear(); return; }
  for (const [type, set] of map) {
    for (const entry of [...set]) if (entry.owner === owner) set.delete(entry);
    if (!set.size) map.delete(type);
  }
}

// ---------------------------------------------------------------------------
// Hit-testing des éléments nommés (coord scène -> repère local de l'élément).
// ---------------------------------------------------------------------------
function elementBBox(el, doc, seen) {
  if (el.kind === 'instance') {
    const symbol = doc.symbols[el.symbolId];
    if (!symbol) return null;
    if (!seen) seen = new Set();
    if (seen.has(el.symbolId)) return null;
    seen.add(el.symbolId);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const layer of symbol.layers || []) {
      for (const kf of layer.keyframes || []) {
        for (const child of kf.elements) {
          const b = elementBBox(child, doc, seen);
          if (!b) continue;
          minX = Math.min(minX, b.minX + (child.x || 0));
          minY = Math.min(minY, b.minY + (child.y || 0));
          maxX = Math.max(maxX, b.maxX + (child.x || 0));
          maxY = Math.max(maxY, b.maxY + (child.y || 0));
        }
      }
    }
    return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }
  if (el.shapeType === 'line' || el.shapeType === 'path') {
    const pts = el.points || [];
    if (!pts.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
  }
  const w = el.width || 0, h = el.height || 0;
  return { minX: -w / 2, minY: -h / 2, maxX: w / 2, maxY: h / 2 };
}

// Test de clic sur un élément nommé, en coordonnées scène : ramène le point
// dans le repère local de l'élément (translation + rotation + échelle
// inversées) puis teste selon le type — disque pour l'ellipse, enveloppe
// pour ligne/chemin et instances (hull du symbole sur toutes ses images),
// boîte englobante pour le reste (rect, texte, bitmap).
function hitTestElement(el, px, py, doc) {
  const dx = px - (el.x || 0), dy = py - (el.y || 0);
  const rot = -(el.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const sx = el.scaleX == null ? 1 : el.scaleX;
  const sy = el.scaleY == null ? 1 : el.scaleY;
  if (el.shapeType === 'ellipse') {
    const rx = Math.abs((el.width || 0) * sx / 2), ry = Math.abs((el.height || 0) * sy / 2);
    return rx > 0 && ry > 0 && (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
  }
  const b = elementBBox(el, doc, null);
  if (!b) return false;
  return lx >= b.minX * sx && lx <= b.maxX * sx && ly >= b.minY * sy && ly <= b.maxY * sy;
}

export function createSceneRuntime({ state, onResize = () => {}, stageContainer = null, toScenePoint = null }) {
  const enterFrameCbs = new Set();
  const keyDownCbs = new Set();
  const keyUpCbs = new Set();
  const keys = {};
  // Clics enregistrés par Scene.onClick(). Map clé -> { name, cb } : clé
  // 'name:xxx' pour un clic sur l'instance nommée xxx, la fonction elle-même
  // pour un clic n'importe où — ré-enregistrer remplace l'ancien entry au
  // lieu de s'empiler.
  const clickCbs = new Map();

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

  // -------------------------------------------------------------------------
  // Pointeur sur la scène (souris/tactile via émulation click). Comme les
  // scripts d'image, les événements ne sont déclenchés qu'en lecture
  // (state.playing) : en édition, un clic sur la scène appartient aux outils.
  // Ne compte que la cible canvas Konva (les boutons d'action posés dans le
  // conteneur ne déclenchent pas le script).
  // -------------------------------------------------------------------------
  let pressTarget = null;  // élément nommé sous le mousedown, pour pressmove/pressup/click
  let hoverTarget = null;  // élément nommé survolé, pour mouseover/out/rollover/rollout

  function namedNow() {
    const named = getNamedElements(state.doc, state.editPath, state.currentFrame);
    for (const el of Object.values(named)) attachEventApi(el);
    return named;
  }

  function topHit(named, pt) {
    const els = Object.values(named);
    for (let i = els.length - 1; i >= 0; i--) {
      if (hitTestElement(els[i], pt.x, pt.y, state.doc)) return els[i];
    }
    return null;
  }

  function scenePoint(e) {
    if (!stageContainer || !toScenePoint || !state.playing) return null;
    if (!e.target || e.target.tagName !== 'CANVAS') return null;
    return toScenePoint(e.clientX, e.clientY);
  }

  function elEvent(type, el, pt, e) {
    return { type, stageX: pt.x, stageY: pt.y, rawX: e.clientX, rawY: e.clientY, target: el, nativeEvent: e };
  }
  function stageEvent(type, pt, e) {
    return { type, stageX: pt.x, stageY: pt.y, rawX: e.clientX, rawY: e.clientY, target: Scene, nativeEvent: e };
  }

  function onStageMouseDown(e) {
    const pt = scenePoint(e);
    if (!pt) return;
    const named = namedNow();
    const target = topHit(named, pt);
    pressTarget = target;
    if (target) target.dispatchEvent(elEvent('mousedown', target, pt, e));
    Scene.dispatchEvent(stageEvent('stagemousedown', pt, e));
  }

  function onStageMouseMove(e) {
    const pt = scenePoint(e);
    if (!pt) return;
    const named = namedNow();
    if (pressTarget) pressTarget.dispatchEvent(elEvent('pressmove', pressTarget, pt, e));
    const target = topHit(named, pt);
    if (target !== hoverTarget) {
      if (hoverTarget) {
        hoverTarget.dispatchEvent(elEvent('mouseout', hoverTarget, pt, e));
        hoverTarget.dispatchEvent(elEvent('rollout', hoverTarget, pt, e));
      }
      if (target) {
        target.dispatchEvent(elEvent('mouseover', target, pt, e));
        target.dispatchEvent(elEvent('rollover', target, pt, e));
      }
      hoverTarget = target;
    }
    Scene.dispatchEvent(stageEvent('stagemousemove', pt, e));
  }

  function onStageMouseUp(e) {
    const pt = scenePoint(e);
    if (!pt) return;
    const named = namedNow();
    const target = topHit(named, pt);
    if (target) target.dispatchEvent(elEvent('mouseup', target, pt, e));
    if (pressTarget) pressTarget.dispatchEvent(elEvent('pressup', pressTarget, pt, e));
    dispatchClick(target, pt, e, named);
    Scene.dispatchEvent(stageEvent('stagemouseup', pt, e));
    pressTarget = null;
  }

  function onStageDoubleClick(e) {
    const pt = scenePoint(e);
    if (!pt) return;
    const named = namedNow();
    const target = topHit(named, pt);
    if (target) target.dispatchEvent(elEvent('dblclick', target, pt, e));
  }

  // Clic complet : événement "click" EaselJS seulement si down et up ont eu
  // lieu sur le même élément nommé ; "stageclick" + Scene.onClick() pour
  // tout clic sur la scène (même dans le vide).
  function dispatchClick(target, pt, e, named) {
    if (target && target === pressTarget) target.dispatchEvent(elEvent('click', target, pt, e));
    Scene.dispatchEvent(stageEvent('stageclick', pt, e));
    if (clickCbs.size === 0) return;
    clickCbs.forEach((entry) => {
      try {
        if (entry.name) {
          const el = named[entry.name];
          if (!el || !hitTestElement(el, pt.x, pt.y, state.doc)) return;
          entry.cb(pt.x, pt.y, el);
        } else {
          entry.cb(pt.x, pt.y, null);
        }
      } catch (err) { console.error(err); }
    });
  }

  const POINTER_EVENTS = [
    ['mousedown', onStageMouseDown],
    ['mousemove', onStageMouseMove],
    ['mouseup', onStageMouseUp],
    ['dblclick', onStageDoubleClick],
  ];
  for (const [type, handler] of POINTER_EVENTS) {
    if (stageContainer) stageContainer.addEventListener(type, handler);
  }

  function activeLayer() {
    const layers = getContextLayers(state.doc, state.editPath);
    return layers.find((l) => l.id === state.selectedLayerId) || layers[layers.length - 1];
  }

  // Résout l'argument d'un goto : un nombre -> l'image, une chaîne -> le label
  // d'image du contexte d'édition (ex : gotoAndPlay("Entry")). Comportement
  // identique à l'export HTML (tweenRuntime) : label introuvable -> avertissement
  // console et aucun déplacement.
  function resolveFrameArg(v) {
    if (typeof v === 'string') {
      const labels = invertFrameLabels(getFrameLabels(state.doc, state.editPath));
      const idx = labels[v.trim()];
      if (idx == null) {
        console.warn('[Scene] label d\'image introuvable : "' + v + '"');
        return null;
      }
      return Math.max(0, idx | 0);
    }
    return Math.max(0, +v | 0);
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

  const Scene = attachEventApi({
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
    gotoAndPlay(frame) { const f = resolveFrameArg(frame); if (f == null) return; state.currentFrame = f; state.playing = true; notify(state); },
    gotoAndStop(frame) { const f = resolveFrameArg(frame); if (f == null) return; state.currentFrame = f; state.playing = false; notify(state); },

    // --- Création d'éléments ---
    addShape(type, props = {}) { return addToActiveKeyframe(createShape(type, props)); },
    addInstance(symbolId, props = {}) { return addToActiveKeyframe(createInstance(symbolId, props)); },

    // --- Boucle de jeu / entrées ---
    onEnterFrame(cb) { if (typeof cb === 'function') enterFrameCbs.add(cb); },
    onKeyDown(cb) { if (typeof cb === 'function') keyDownCbs.add(cb); },
    onKeyUp(cb) { if (typeof cb === 'function') keyUpCbs.add(cb); },
    // Clic sur la scène, pendant la lecture. Deux formes :
    //   Scene.onClick((x, y) => {...})          — tout clic sur la scène
    //   Scene.onClick('nom', (x, y) => {...})   — clic sur l'instance nommée
    // x/y sont en coordonnées scène ; la forme nommée reçoit aussi l'élément.
    onClick(cbOrName, cb) {
      const name = typeof cbOrName === 'string' ? cbOrName : null;
      const fn = typeof cbOrName === 'function' ? cbOrName : cb;
      if (typeof fn !== 'function') return;
      clickCbs.set(name ? 'name:' + name : fn, { name, cb: fn });
    },
    get keys() { return keys; },

    // --- Divers ---
    random(n) { return Math.floor(Math.random() * (n || 1)); },
    log(...args) { onConsole && onConsole('log', args); },
  });

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
  // d'instance de l'image courante injectés comme variables + les
  // bibliothèques tierces (SCRIPT_LIBS, ex. createjs). Partagé par run()
  // (bouton Exécuter, portée 'run') et runFrameScripts() (scripts d'image,
  // portée 'frame'). Avant l'exécution, seuls les handlers de la MÊME portée
  // sont retirés : un handler posé par Exécuter survit donc aux scripts
  // d'image (et un script d'image ne s'empile pas d'un passage à l'autre).
  // Les handlers se déclarent au niveau supérieur du script, pas dans
  // onEnterFrame (portée null : jamais purgés automatiquement).
  function execCode(code, reg = 'run') {
    const named = namedNow();
    detachAllEvents(Scene, reg);
    for (const el of Object.values(named)) detachAllEvents(el, reg);
    const prelude = namedVarNames(named)
      .map((n) => `var ${n} = named[${JSON.stringify(n)}];`)
      .join('\n');
    const fn = new Function('Scene', 'Game', 'console', 'named', ...SCRIPT_LIBS, '"use strict";\n' + prelude + '\n' + code);
    try {
      CURRENT_HANDLER_REG = reg;
      fn(Scene, Scene, proxyConsole, named, ...scriptLibValues());
    } finally {
      CURRENT_HANDLER_REG = null;
    }
  }

  function run(code, consoleCb = () => {}) {
    onConsole = consoleCb;
    enterFrameCbs.clear();
    keyDownCbs.clear();
    keyUpCbs.clear();
    clickCbs.clear();
    // Reset complet : tous les handlers, toutes portées + états de pointeur.
    const named = namedNow();
    detachAllEvents(Scene, null);
    for (const el of Object.values(named)) detachAllEvents(el, null);
    pressTarget = null;
    hoverTarget = null;
    execCode(code, 'run');
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
      try { execCode(kf.script, 'frame'); } catch (err) { console.error(err); }
    }
  }

  // Appelé à chaque avancée d'image pendant la lecture (voir main.js#loop).
  // Les éléments nommés et Scene reçoivent aussi un événement "tick"
  // (convention EaselJS : nom.on("tick", fn)).
  function onFrame(frame) {
    enterFrameCbs.forEach((cb) => { try { cb(frame); } catch (err) { console.error(err); } });
    const named = namedNow();
    for (const el of Object.values(named)) {
      if (el.hasEventListener('tick')) el.dispatchEvent({ type: 'tick', target: el, currentFrame: frame });
    }
    if (Scene.hasEventListener('tick')) Scene.dispatchEvent({ type: 'tick', target: Scene, currentFrame: frame });
  }

  // Exécute les scripts d'image d'un MovieClip enfant. Contrairement à
  // runFrameScripts (qui opère sur le contexte d'édition courant), celui-ci
  // reçoit directement le symbole et l'état du clip pour créer un `Scene`
  // scopé : `Scene.stop()` arrête CE clip, pas la scène racine.
  function runClipFrameScripts(symbol, frame, clipState) {
    // Résolution label d'image propre au clip (labels du symbole).
    function clipFrameArg(v) {
      if (typeof v === 'string') {
        const labels = invertFrameLabels(symbol.frameLabels);
        const idx = labels[v.trim()];
        if (idx == null) {
          console.warn('[Scene] label d\'image introuvable dans ce clip : "' + v + '"');
          return null;
        }
        return Math.max(0, idx | 0);
      }
      return Math.max(0, +v | 0);
    }
    const clipScene = {
      // --- Propriétés de la scène (lecture seule, deleguate to global) ---
      get width() { return state.doc.width; },
      get height() { return state.doc.height; },
      get frameRate() { return state.doc.frameRate; },
      get backgroundColor() { return state.doc.backgroundColor; },
      get name() { return state.doc.name; },
      get frameCount() { return symbol.frameCount; },
      // --- Lecture : scope au clip (labels du symbole honorés) ---
      get playing() { return clipState.isPlaying; },
      get currentFrame() { return clipState.currentFrame; },
      set currentFrame(f) { clipState.currentFrame = Math.max(0, +f | 0); clipState._lastScriptFrame = -1; },
      play() { clipState.isPlaying = true; },
      stop() { clipState.isPlaying = false; },
      gotoAndPlay(frame) { const f = clipFrameArg(frame); if (f == null) return; clipState.currentFrame = f; clipState.isPlaying = true; clipState._lastScriptFrame = -1; },
      gotoAndStop(frame) { const f = clipFrameArg(frame); if (f == null) return; clipState.currentFrame = f; clipState.isPlaying = false; clipState._lastScriptFrame = -1; },
      // --- Divers ---
      random(n) { return Math.floor(Math.random() * (n || 1)); },
      log(...args) { onConsole && onConsole('log', args); },
    };
    for (const layer of symbol.layers) {
      const kf = getKeyframeAt(layer, frame);
      if (!kf || !kf.script || !kf.script.trim()) continue;
      try {
        const fn = new Function('Scene', 'Game', 'console', 'named', ...SCRIPT_LIBS, '"use strict";\n' + kf.script);
        fn(clipScene, clipScene, proxyConsole, {}, ...scriptLibValues());
      } catch (err) { console.error(err); }
    }
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    if (stageContainer) for (const [type, handler] of POINTER_EVENTS) {
      stageContainer.removeEventListener(type, handler);
    }
  }

  return { Scene, run, runFrameScripts, runClipFrameScripts, onFrame, dispose };
}
