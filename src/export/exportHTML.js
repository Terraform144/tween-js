// Génère un fichier HTML autonome (aucune dépendance externe, pas de build)
// qui rejoue tout le document avec le runtime MovieClip partagé (voir
// tweenRuntime.js — importé tel quel via ?raw pour ne jamais dupliquer la
// logique de rendu/interpolation : un seul fichier source pour l'éditeur ET
// les deux formes d'export, cf. la mémoire projet à ce sujet).
import runtimeSource from './tweenRuntime.js?raw';
import { invertFrameLabels } from '../core/model.js';
import { downloadTextFile } from '../util/download.js';

export function buildFullDocData(doc) {
  const symbols = {};
  for (const id in doc.symbols) {
    const sym = doc.symbols[id];
    symbols[id] = {
      id: sym.id,
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
export function escapeForScript(str) {
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

  // --- Événements compatibles EaselJS (port du système de l'éditeur) ------
  // Registre à PORTÉES (même logique que sceneRuntime.js) : les handlers
  // 'run' (scripts du document, exécutés une fois) survivent aux scripts
  // d'image ; les handlers 'frame' sont purgés avant chaque exécution d'un
  // script d'image (pas d'empilement d'un passage à l'autre). WeakMap hors
  // des éléments + méthodes non énumérables : les données restent JSON-safe.
  var EVENT_HANDLERS = new WeakMap();
  var CURRENT_REG = null;

  function regSelf(obj) { return obj && obj.__rawElement ? obj.__rawElement : obj; }

  function handlerSet(obj, type, create) {
    var map = EVENT_HANDLERS.get(obj);
    if (!map) {
      if (!create) return null;
      map = new Map();
      EVENT_HANDLERS.set(obj, map);
    }
    var set = map.get(type);
    if (!set && create) {
      set = new Set();
      map.set(type, set);
    }
    return set || null;
  }

  function eventApiOn(type, cb, scope, once) {
    if (typeof type !== 'string' || typeof cb !== 'function') return null;
    var self = regSelf(this);
    var wrapped = function (event) {
      if (once) eventApiOff.call(self, type, wrapped);
      cb.call(scope || this, event);
    };
    handlerSet(self, type, true).add({ cb: cb, scope: scope, once: once, wrapped: wrapped, owner: CURRENT_REG });
    return wrapped;
  }

  function eventApiOff(type, cb) {
    var self = regSelf(this);
    var set = handlerSet(self, type, false);
    if (!set) return;
    if (cb == null) { set.clear(); return; }
    var list = [];
    set.forEach(function (entry) { if (entry.cb === cb || entry.wrapped === cb) list.push(entry); });
    for (var i = 0; i < list.length; i++) set.delete(list[i]);
  }

  function eventApiDispatch(eventObj) {
    var self = regSelf(this);
    if (typeof eventObj === 'string') eventObj = { type: eventObj };
    if (!eventObj.target) eventObj.target = self;
    eventObj.currentTarget = self;
    if (eventObj.defaultPrevented == null) eventObj.defaultPrevented = false;
    if (typeof eventObj.preventDefault !== 'function') {
      eventObj.preventDefault = function () { this.defaultPrevented = true; };
    }
    var set = handlerSet(self, eventObj.type, false);
    if (set) {
      var list = [];
      set.forEach(function (entry) { list.push(entry); });
      for (var i = 0; i < list.length; i++) {
        try { list[i].wrapped.call(self, eventObj); } catch (err) { console.error(err); }
      }
    }
    return !eventObj.defaultPrevented;
  }

  function attachEventApi(obj) {
    if (obj.__hasEventApi) return obj;
    var methods = {
      on: eventApiOn, addEventListener: eventApiOn,
      off: eventApiOff, removeEventListener: eventApiOff,
      removeAllEventListeners: function (type) {
        var map = EVENT_HANDLERS.get(regSelf(this));
        if (!map) return;
        if (type == null) map.clear(); else map.delete(type);
      },
      hasEventListener: function (type) {
        var set = handlerSet(regSelf(this), type, false);
        return !!set && set.size > 0;
      },
      dispatchEvent: eventApiDispatch,
    };
    for (var name in methods) {
      Object.defineProperty(obj, name, { value: methods[name], enumerable: false, configurable: true, writable: true });
    }
    Object.defineProperty(obj, '__hasEventApi', { value: true, enumerable: false, configurable: true });
    return obj;
  }

  function detachAllEvents(obj, owner) {
    var map = EVENT_HANDLERS.get(regSelf(obj));
    if (!map) return;
    if (owner == null) { map.clear(); return; }
    map.forEach(function (set, type) {
      var list = [];
      set.forEach(function (entry) { if (entry.owner === owner) list.push(entry); });
      for (var i = 0; i < list.length; i++) set.delete(list[i]);
      if (!set.size) map.delete(type);
    });
  }

  attachEventApi(Scene);
  // Scene.onClick : tout clic sur la scène (cb) ou clic sur l'instance
  // nommée ('nom', cb) — pendant la lecture, comme dans l'éditeur.
  var clickCbs = new Map();
  Scene.onClick = function (cbOrName, cb) {
    var name = typeof cbOrName === 'string' ? cbOrName : null;
    var fn = typeof cbOrName === 'function' ? cbOrName : cb;
    if (typeof fn !== 'function') return;
    clickCbs.set(name ? 'name:' + name : fn, { name: name, cb: fn });
  };

  // --- Hit-testing (port de sceneRuntime.js) -------------------------------
  // Pivot de transformation (port de src/core/pivot.js) : décalage entre le
  // pivot explicite et le pivot par défaut, pour ramener un point cliqué
  // dans le repère du cadre de contenu. Nul sans pivot explicite.
  function hasPivot(el) {
    return el.kind !== 'bone' && el.pivotX != null && el.pivotY != null;
  }
  function pivotHitShift(el) {
    if (!hasPivot(el)) return { x: 0, y: 0 };
    if (el.kind === 'instance') return { x: el.pivotX, y: el.pivotY };
    if (el.shapeType === 'line' || el.shapeType === 'path') {
      var pts = el.points || [];
      var minX = 0, minY = 0;
      for (var pi0 = 0; pi0 < pts.length; pi0++) {
        if (pi0 === 0 || pts[pi0].x < minX) minX = pts[pi0].x;
        if (pi0 === 0 || pts[pi0].y < minY) minY = pts[pi0].y;
      }
      return { x: minX + el.pivotX, y: minY + el.pivotY };
    }
    var w0 = el.width || 0, h0 = el.height || 0;
    return { x: el.pivotX - w0 / 2, y: el.pivotY - h0 / 2 };
  }
  function elementBBox(el, seen) {
    if (el.kind === 'instance') {
      var symbol = DATA.symbols[el.symbolId];
      if (!symbol) return null;
      if (!seen) seen = {};
      if (seen[el.symbolId]) return null;
      seen[el.symbolId] = 1;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var li = 0; li < symbol.layers.length; li++) {
        var layer = symbol.layers[li];
        for (var ki = 0; ki < layer.keyframes.length; ki++) {
          var els = layer.keyframes[ki].elements;
          for (var ei = 0; ei < els.length; ei++) {
            var child = els[ei];
            var b = elementBBox(child, seen);
            if (!b) continue;
            // Pivot explicite de l'enfant : son contenu est décalé de son
            // pivot dans l'espace du symbole parent (origine = pivot).
            var csh = pivotHitShift(child);
            minX = Math.min(minX, b.minX + (child.x || 0) - csh.x);
            minY = Math.min(minY, b.minY + (child.y || 0) - csh.y);
            maxX = Math.max(maxX, b.maxX + (child.x || 0) - csh.x);
            maxY = Math.max(maxY, b.maxY + (child.y || 0) - csh.y);
          }
        }
      }
      return isFinite(minX) ? { minX: minX, minY: minY, maxX: maxX, maxY: maxY } : null;
    }
    if (el.shapeType === 'line' || el.shapeType === 'path') {
      var pts = el.points || [];
      if (!pts.length) return null;
      var minX2 = Infinity, minY2 = Infinity, maxX2 = -Infinity, maxY2 = -Infinity;
      for (var pi = 0; pi < pts.length; pi++) {
        minX2 = Math.min(minX2, pts[pi].x); maxX2 = Math.max(maxX2, pts[pi].x);
        minY2 = Math.min(minY2, pts[pi].y); maxY2 = Math.max(maxY2, pts[pi].y);
      }
      return { minX: minX2, minY: minY2, maxX: maxX2, maxY: maxY2 };
    }
    var w = el.width || 0, h = el.height || 0;
    return { minX: -w / 2, minY: -h / 2, maxX: w / 2, maxY: h / 2 };
  }

  function hitTestElement(el, px, py) {
    var dx = px - (el.x || 0), dy = py - (el.y || 0);
    var rot = -(el.rotation || 0) * Math.PI / 180;
    var cos = Math.cos(rot), sin = Math.sin(rot);
    var lx = dx * cos - dy * sin;
    var ly = dx * sin + dy * cos;
    // Pivot explicite : origine de l'élément = pivot ; le cadre du contenu
    // est exprimé dans le repère du pivot par défaut, on y ramène le point.
    var sh = pivotHitShift(el);
    lx += sh.x;
    ly += sh.y;
    var sx = el.scaleX == null ? 1 : el.scaleX;
    var sy = el.scaleY == null ? 1 : el.scaleY;
    if (el.shapeType === 'ellipse') {
      var rx = Math.abs((el.width || 0) * sx / 2), ry = Math.abs((el.height || 0) * sy / 2);
      return rx > 0 && ry > 0 && (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
    }
    var b = elementBBox(el, null);
    if (!b) return false;
    return lx >= b.minX * sx && lx <= b.maxX * sx && ly >= b.minY * sy && ly <= b.maxY * sy;
  }

  // --- Pipeline pointeur : événements EaselJS sur les nommés, en lecture ---
  var pressTarget = null;
  var hoverTarget = null;

  function rawNamed(frameIndex) {
    var out = [];
    for (var li = 0; li < DATA.layers.length; li++) {
      var kf = getActiveKeyframe(DATA.layers[li], frameIndex);
      if (!kf) continue;
      for (var ei = 0; ei < kf.elements.length; ei++) {
        var el = kf.elements[ei];
        if ((el.name || '').trim()) {
          attachEventApi(el);
          out.push(el);
        }
      }
    }
    return out;
  }

  function topHit(els, pt) {
    for (var i = els.length - 1; i >= 0; i--) {
      if (hitTestElement(els[i], pt.x, pt.y)) return els[i];
    }
    return null;
  }

  function scenePoint(e) {
    if (!root || !root.isPlaying) return null;
    if (e.target !== canvas) return null;
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / (r.width || 1)),
      y: (e.clientY - r.top) * (canvas.height / (r.height || 1)),
    };
  }

  function elEvent(type, el, pt, e) {
    return { type: type, stageX: pt.x, stageY: pt.y, rawX: e.clientX, rawY: e.clientY, target: el, nativeEvent: e };
  }
  function stageEvent(type, pt, e) {
    return { type: type, stageX: pt.x, stageY: pt.y, rawX: e.clientX, rawY: e.clientY, target: Scene, nativeEvent: e };
  }

  function dispatchClick(target, pt, e, els) {
    if (target && target === pressTarget) target.dispatchEvent(elEvent('click', target, pt, e));
    Scene.dispatchEvent(stageEvent('stageclick', pt, e));
    if (clickCbs.size === 0) return;
    clickCbs.forEach(function (entry) {
      try {
        if (entry.name) {
          var hit = null;
          for (var i = 0; i < els.length; i++) {
            if (els[i].name && els[i].name.trim() === entry.name) { hit = els[i]; break; }
          }
          if (!hit || !hitTestElement(hit, pt.x, pt.y)) return;
          entry.cb(pt.x, pt.y, hit);
        } else {
          entry.cb(pt.x, pt.y, null);
        }
      } catch (err) { console.error(err); }
    });
  }

  canvas.addEventListener('mousedown', function (e) {
    var pt = scenePoint(e);
    if (!pt) return;
    var els = rawNamed(root.currentFrame);
    var target = topHit(els, pt);
    pressTarget = target;
    if (target) target.dispatchEvent(elEvent('mousedown', target, pt, e));
    Scene.dispatchEvent(stageEvent('stagemousedown', pt, e));
  });

  canvas.addEventListener('mousemove', function (e) {
    var pt = scenePoint(e);
    if (!pt) return;
    var els = rawNamed(root.currentFrame);
    if (pressTarget) pressTarget.dispatchEvent(elEvent('pressmove', pressTarget, pt, e));
    var target = topHit(els, pt);
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
  });

  canvas.addEventListener('mouseup', function (e) {
    var pt = scenePoint(e);
    if (!pt) return;
    var els = rawNamed(root.currentFrame);
    var target = topHit(els, pt);
    if (target) target.dispatchEvent(elEvent('mouseup', target, pt, e));
    if (pressTarget) pressTarget.dispatchEvent(elEvent('pressup', pressTarget, pt, e));
    dispatchClick(target, pt, e, els);
    Scene.dispatchEvent(stageEvent('stagemouseup', pt, e));
    pressTarget = null;
  });

  canvas.addEventListener('dblclick', function (e) {
    var pt = scenePoint(e);
    if (!pt) return;
    var target = topHit(rawNamed(root.currentFrame), pt);
    if (target) target.dispatchEvent(elEvent('dblclick', target, pt, e));
  });

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
    attachEventApi(el);
    return new Proxy(el, {
      get: function (target, prop) {
        if (prop === '__rawElement') return target;
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
  // onFrameScript de MovieClip.update() dans tween-runtime.js). Les clips
  // enfants movieclip exécutent aussi leurs propres scripts d'image via
  // _runChildFrameScript (timeline indépendante, comportement Animate CC).
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
        // Portée 'frame' : purge uniquement les handlers posés par un
        // script d'image (pas d'empilement) — ceux des scripts du
        // document ('run') survivent (bug éditeur, porté ici par parité).
        detachAllEvents(Scene, 'frame');
        var names2 = Object.keys(named2);
        for (var ni = 0; ni < names2.length; ni++) detachAllEvents(named2[names2[ni]], 'frame');
        var prelude2 = namedVarNames(named2).map(function (n) {
          return 'var ' + n + ' = named[' + JSON.stringify(n) + '];';
        }).join('\\n');
        var fn2 = new Function('Scene', 'Game', 'console', 'named', 'createjs', '"use strict";\\n' + prelude2 + '\\n' + kf.script);
        CURRENT_REG = 'frame';
        fn2(Scene, Scene, console, named2, (typeof createjs !== 'undefined' ? createjs : undefined));
      } catch (err) { console.error(err); } finally { CURRENT_REG = null; }
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
      var fn = new Function('Scene', 'Game', 'console', 'named', 'createjs', '"use strict";\\n' + prelude + '\\n' + code);
      CURRENT_REG = 'run';
      fn(Scene, Scene, console, named, (typeof createjs !== 'undefined' ? createjs : undefined));
    } catch (err) { console.error(err); } finally { CURRENT_REG = null; }
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
    // Événement "tick" sur les nommés de l'image courante et sur Scene
    // (convention EaselJS : nom.on("tick", fn) — parité avec l'éditeur).
    var namedTick = rawNamed(root.currentFrame);
    for (var ti = 0; ti < namedTick.length; ti++) {
      if (namedTick[ti].hasEventListener('tick')) {
        namedTick[ti].dispatchEvent({ type: 'tick', target: namedTick[ti], currentFrame: root.currentFrame });
      }
    }
    if (Scene.hasEventListener('tick')) {
      Scene.dispatchEvent({ type: 'tick', target: Scene, currentFrame: root.currentFrame });
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

// --- Bibliothèque CreateJS dans les exports ---------------------------------
// Si au moins un script utilisateur (scripts nommés, scripts d'image de la
// timeline racine ou des symboles) référence `createjs`, les sources des 4
// libs (copie locale public/libs/createjs, licence MIT) sont inlinées dans le
// HTML exporté pour qu'il reste 100% autonome. Vérifié : aucun des .min.js
// ne contient "</script" ni "<!--", l'inlining direct est sûr.
const CREATEJS_FILES = ['easeljs.min.js', 'tweenjs.min.js', 'soundjs.min.js', 'preloadjs.min.js'];

export function collectAllScripts(doc) {
  const out = [];
  for (const s of doc.scripts || []) out.push(s.code || '');
  const visit = (layers) => {
    for (const layer of layers || []) {
      for (const kf of layer.keyframes || []) out.push(kf.script || '');
    }
  };
  visit(doc.layers);
  for (const id in doc.symbols) visit(doc.symbols[id].layers);
  return out;
}

export async function loadCreateJsSources() {
  const sources = [];
  for (const file of CREATEJS_FILES) {
    try {
      const res = await fetch('libs/createjs/' + file);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      sources.push(await res.text());
    } catch (err) {
      console.warn('[export HTML] libs/createjs/' + file + ' introuvable (' + err.message + ') — createjs sera undefined dans l\'export');
    }
  }
  return sources;
}

export async function buildStandaloneHTML(doc) {
  const dataJson = escapeForScript(buildFullDocData(doc));
  const scriptsJson = escapeForScript((doc.scripts || []).map((s) => s.code));
  const title = (doc.name || 'Animation').replace(/[<>]/g, '');
  const script = buildBootstrapScript(dataJson, scriptsJson);
  // createjs inliné seulement si un script l'utilise (sinon ~280 Ko de JS
  // mort dans chaque export).
  let libScripts = '';
  if (collectAllScripts(doc).some((code) => /\bcreatejs\b/.test(code))) {
    libScripts = (await loadCreateJsSources())
      .map((src) => '<script>\n' + src + '\n</script>\n')
      .join('');
  }
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="generator" content="TweenJS export v2 (runtime code inline)" />
<title>${title} — export TweenJS</title>
<style>
  html, body { margin: 0; height: 100%; background: #111318; display: flex; align-items: center; justify-content: center; }
  canvas { background: #ffffff; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
</style>
</head>
<body>
<canvas id="stage"></canvas>
${libScripts}<script type="module">${script}</script>
</body>
</html>
`;
}

export async function downloadStandaloneHTML(doc) {
  downloadTextFile(await buildStandaloneHTML(doc), (doc.name || 'animation').replace(/[^a-z0-9_\-]+/gi, '_') + '.html', 'text/html');
}
