// Harnais autocomplétion CodeMirror (src/ui/completions.js).
// Simule un contexte CodeMirror ({ matchBefore, state.sliceDoc }) et vérifie
// les sources : Scene racine vs scope clip, createjs.* + sous-API, noms
// d'instances et leurs propriétés. Valide aussi les listes createjs contre
// les VRAIES libs embarquées (chargées en sandbox node:vm).
// Usage : node _wrk_mistral_mem/repro_autocomplete.mjs   (depuis la racine du projet)
import { readFileSync } from 'fs';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  makeCompletionSources, SCENE_ROOT_COMPLETIONS, SCENE_CLIP_COMPLETIONS,
  INSTANCE_PROPS, CREATEJS_GLOBALS, CREATEJS_SUB, TWEEN_INSTANCE, LOADQUEUE_INSTANCE, EVENT_API,
} from '../src/ui/completions.js';
import { createDocument, createLayer, createKeyframe, createShape } from '../src/core/model.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  OK  ' + name); }
  else { failed++; console.log('  FAIL ' + name); }
}

// --- faux state avec un élément nommé "Logo" à la frame 0 ---
const doc = createDocument({ name: 'Test' });
const layer = createLayer('Calque 1');
doc.layers.push(layer);
const kf = createKeyframe(0, [createShape('rect', { x: 10, y: 20, name: 'Logo' })]);
layer.keyframes.push(kf);
const state = { doc, editPath: [], currentFrame: 0 };

// --- faux contexte CodeMirror ---
function ctxOf(code) {
  const pos = code.length;
  return {
    pos,
    matchBefore(re) {
      const m = re.exec(code.slice(0, pos));
      // matchBefore retourne le match qui TOUCHE la fin de la zone avant pos
      const tail = code.slice(0, pos).match(/[\w$]*$/);
      if (!tail) return null;
      return { from: pos - tail[0].length, to: pos, text: tail[0] };
    },
    state: { sliceDoc: (a, b) => code.slice(a, b) },
  };
}
function labelsOf(sources, code) {
  const ctx = ctxOf(code);
  for (const src of sources) {
    const r = src(ctx);
    if (r) return r.options.map((o) => o.label);
  }
  return null;
}

const sourcesRoot = makeCompletionSources(state, () => false);
const sourcesClip = makeCompletionSources(state, () => true);

console.log('== Scene racine ==');
let l = labelsOf(sourcesRoot, 'Scene.');
ok(l && SCENE_ROOT_COMPLETIONS.every((x) => l.includes(x)), 'Scene. propose toute la liste racine');
ok(l.includes('playSound') && l.includes('dispatchEvent') && l.includes('addInstance'), 'Scene. inclut playSound + API événements + addInstance');
l = labelsOf(sourcesRoot, 'Game.g');
ok(l && l.includes('gotoAndPlay'), 'Game. fonctionne aussi');

console.log('== Scene scopée clip (édition dans un symbole) ==');
l = labelsOf(sourcesClip, 'Scene.');
ok(l && SCENE_CLIP_COMPLETIONS.every((x) => l.includes(x)), 'Scene. (clip) propose toute la liste clip');
ok(l.includes('onEnterFrame') && l.includes('playSound') && !l.includes('addShape') && !l.includes('onClick'), 'clip : onEnterFrame/playSound oui, addShape/onClick non');
l = labelsOf(sourcesRoot, 'Scene.');
ok(!l.includes('addShape') === false, 'racine : addShape présent (pas le scope clip)');

console.log('== createjs ==');
l = labelsOf(sourcesRoot, 'createjs.');
ok(l && l.includes('Tween') && l.includes('Stage') && l.includes('Sound') && l.includes('LoadQueue'), 'createjs. -> globales (Tween, Stage, Sound, LoadQueue...)');
l = labelsOf(sourcesRoot, 'createjs.Ea');
ok(l && l.length > 0, 'createjs.Ea -> match partiel filtré par CodeMirror (from correct)');
l = labelsOf(sourcesRoot, 'createjs.Ease.');
ok(l && l.includes('quadInOut') && l.includes('bounceOut') && l.includes('linear'), 'createjs.Ease. -> easings');
l = labelsOf(sourcesRoot, 'createjs.Tween.');
ok(l && l.includes('get') && l.includes('removeAllTweens'), 'createjs.Tween. -> statiques');
l = labelsOf(sourcesRoot, 'createjs.Tween.get(logo).');
ok(l && l.includes('to') && l.includes('wait') && l.includes('call') && l.includes('set'), 'createjs.Tween.get(logo). -> méthodes d\'instance');
l = labelsOf(sourcesRoot, 'createjs.Sound.');
ok(l && l.includes('play') && l.includes('registerSound'), 'createjs.Sound. -> play, registerSound...');
l = labelsOf(sourcesRoot, 'createjs.Ticker.');
ok(l && l.includes('addEventListener') && l.includes('paused') && l.includes('framerate'), 'createjs.Ticker. -> props + événements');
l = labelsOf(sourcesRoot, 'new createjs.LoadQueue().');
ok(l && l.includes('loadFile') && l.includes('getResult') && l.includes('loadManifest'), 'new createjs.LoadQueue(). -> méthodes d\'instance');

console.log('== instances nommées ==');
l = labelsOf(sourcesRoot, 'Lo');
ok(l && l.includes('Logo'), 'mot seul -> noms d\'instances (Logo)');
l = labelsOf(sourcesRoot, 'Logo.');
ok(l && l.includes('x') && l.includes('rotation') && l.includes('on') && l.includes('dispatchEvent'), 'Logo. -> props + API événements');
l = labelsOf(sourcesRoot, 'Scene.on');
ok(l === null || !l.includes('Logo'), 'pas de noms d\'instance après un point (Scene.on)');
l = labelsOf(sourcesRoot, 'named[Lo');
ok(l === null || !l.includes('Logo'), 'pas de noms d\'instance après un crochet');
l = labelsOf(sourcesRoot, 'x + Lo');
ok(l && l.includes('Logo'), 'nom d\'instance après un opérateur');

console.log('== listes createjs vs VRAIES libs embarquées ==');
const sandbox = {
  window: {}, document: { createElement: () => ({ getContext: () => null, style: {} }), documentElement: { style: {} } },
  navigator: { userAgent: 'node' }, console, performance: { now: () => Date.now() },
  setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: () => 0,
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['easeljs.min.js', 'tweenjs.min.js', 'soundjs.min.js', 'preloadjs.min.js']) {
  vm.runInContext(readFileSync(join(root, 'public/libs/createjs', f), 'utf8'), sandbox, { filename: f });
}
const c = sandbox.createjs;
ok(!!c, 'createjs chargé depuis public/libs/createjs');
const missingGlobals = CREATEJS_GLOBALS.filter((k) => !(k in c));
ok(missingGlobals.length === 0, 'CREATEJS_GLOBALS tous présents dans la vraie lib' + (missingGlobals.length ? ' (manquants: ' + missingGlobals.join(',') + ')' : ''));
for (const [k, list] of Object.entries(CREATEJS_SUB)) {
  const missing = list.filter((p) => !(p in c[k]));
  ok(missing.length === 0, `CREATEJS_SUB.${k} tous présents` + (missing.length ? ' (manquants: ' + missing.join(',') + ')' : ''));
}
const tw = c.Tween.get({});
const protoMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(tw));
const missingTw = TWEEN_INSTANCE.filter((p) => !protoMethods.includes(p));
ok(missingTw.length === 0, 'TWEEN_INSTANCE tous sur le prototype AbstractTween' + (missingTw.length ? ' (manquants: ' + missingTw.join(',') + ')' : ''));
const q = new c.LoadQueue();
const qMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(q));
const missingQ = LOADQUEUE_INSTANCE.filter((p) => !qMethods.includes(p));
ok(missingQ.length === 0, 'LOADQUEUE_INSTANCE tous sur le prototype LoadQueue' + (missingQ.length ? ' (manquants: ' + missingQ.join(',') + ')' : ''));
ok(EVENT_API.every((m) => typeof c.EventDispatcher.prototype[m] === 'function' || m in c.EventDispatcher.prototype), 'EVENT_API cohérent avec EventDispatcher');

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
