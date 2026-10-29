// Harnais « script de symbole » (classe AS3-like par MovieClip) + workflow
// fichiers externes (phase 1 : la partie runtime/model/export).
// Valide :
//   1. model : createSymbol expose script:'' + scriptFile:null (additif) ;
//   2. runtime exporté (tweenRuntime.js) : le script de symbole s'exécute
//      UNE fois par instance à la création, AVANT les scripts d'image de la
//      première image, avec un Scene scopé au clip (Scene.stop() arrête CE
//      clip seulement) ;
//   3. onEnterFrame posé par le script de symbole : boucle propre au clip,
//      appelée à chaque update avec l'image courante du clip ;
//   4. deux instances du même symbole : 2 exécutions, états indépendants ;
//   5. symbole imbriqué : le script du clip enfant s'exécute aussi ;
//   6. données sans script (documents existants) : aucun effet, aucune
//      erreur ;
//   7. exportHTML buildFullDocData + exportSymbol buildSymbolExportData
//      embarquent sym.script ;
//   8. mode compilé : le stripper TJS_NOEVAL retire bien le nouveau bloc
//      d'exécution dynamique (les scripts de symbole y sont ignorés).
// Run : node _wrk_mistral_mem/repro_symbolscript.mjs
import { createDocument, createSymbol, createInstance } from '../src/core/model.js';
import { createMovieClip } from '../src/export/tweenRuntime.js';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log('  OK  ' + label); }
  else { failed++; console.log('FAIL  ' + label + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}

// ---------------------------------------------------------------------------
console.log('--- 1. modèle : champ script/scriptFile sur le symbole ---');
{
  const sym = createSymbol('Balle', 'movieclip');
  check('createSymbol expose script vide', sym.script === '');
  check('createSymbol expose scriptFile null', sym.scriptFile === null);
}

// ---------------------------------------------------------------------------
console.log('--- 2/3/4/5/6. runtime exporté : exécution, scope, ordre ---');
// NB : les scripts de symbole s'exécutent via new Function (portée globale
// stricte) — les variables d'observation vivent sur globalThis.
{
  globalThis.events = [];
  const events = globalThis.events;
  // A. Constructeur qui stoppe le clip : ordre ctor -> script d'image, et
  //    un clip arrêté ne tick plus (sémantique Animate).
  const symData = {
    id: 'sym1', type: 'movieclip', frameCount: 4, frameLabels: {},
    script: 'events.push("ctor:" + Scene.currentFrame); Scene.stop();',
    layers: [{
      id: 'L1', name: 'Calque 1', visible: true,
      keyframes: [{
        index: 0, elements: [], tween: null,
        script: 'events.push("frame:" + Scene.currentFrame + ":playing=" + Scene.playing);',
      }],
    }],
    width: 100, height: 100, frameRate: 24,
  };
  const rootData = {
    width: 200, height: 200, frameRate: 24, frameCount: 4, frameLabels: {}, assets: {},
    layers: [{
      id: 'LR', name: 'Calque 1', visible: true,
      keyframes: [{ index: 0, elements: [createInstance('sym1', { id: 'inst1', x: 10, y: 10 })], tween: null }],
    }],
    symbols: { sym1: symData },
  };

  const root = createMovieClip(rootData);
  root.update(1000 / 24); // avance d'une image : crée l'enfant + exécute tout

  check('script de symbole exécuté une fois', events.filter((e) => e.startsWith('ctor:')).length === 1, events);
  check('script de symbole AVANT le script d\'image', events[0] === 'ctor:0' && events[1] === 'frame:0:playing=false', events);
  check('Scene.stop() scopé : le clip est arrêté', events[1] === 'frame:0:playing=false', events);
  check('script d\'image joué une seule fois (clip arrêté)', events.filter((e) => e.startsWith('frame:')).length === 1, events);

  // Poursuite : le clip étant stoppé, rien ne bouge
  root.update(1000 / 24);
  check('clip stoppé : aucun événement supplémentaire', events.length === 2, events);

  // B. Clip en lecture : onEnterFrame propre au clip, à chaque image
  globalThis.events2 = [];
  const symData2 = {
    id: 'sym2', type: 'movieclip', frameCount: 4, frameLabels: {},
    script: 'Scene.onEnterFrame(function (f) { events2.push("ef:" + f); });',
    layers: [{ id: 'L1', name: 'Calque 1', visible: true, keyframes: [{ index: 0, elements: [], tween: null }] }],
    width: 100, height: 100, frameRate: 24,
  };
  const rootData2 = {
    width: 200, height: 200, frameRate: 24, frameCount: 4, frameLabels: {}, assets: {},
    layers: [{
      id: 'LR', name: 'Calque 1', visible: true,
      keyframes: [{ index: 0, elements: [createInstance('sym2', { id: 'inst2', x: 0, y: 0 })], tween: null }],
    }],
    symbols: { sym2: symData2 },
  };
  const root2 = createMovieClip(rootData2);
  root2.update(1000 / 24);
  root2.update(1000 / 24);
  check('onEnterFrame du clip appelé à chaque image avancée', globalThis.events2.join(',') === 'ef:1,ef:2', globalThis.events2);
  // Reprise après stop : les callbacks repartent
  const child2 = root2._children.get('inst2');
  child2.stop();
  root2.update(1000 / 24);
  check('clip stoppé : onEnterFrame suspendu', globalThis.events2.join(',') === 'ef:1,ef:2', globalThis.events2);
  child2.play();
  root2.update(1000 / 24);
  check('clip relancé : onEnterFrame repart', globalThis.events2.length === 3, globalThis.events2);
}

// Deux instances du même symbole : 2 constructeurs, états indépendants
{
  globalThis.ctorCount = { n: 0 };
  const ctorCount = globalThis.ctorCount;
  const symData = {
    id: 'symA', type: 'movieclip', frameCount: 4, frameLabels: {},
    script: 'ctorCount.n++; if (ctorCount.n === 1) Scene.stop();',
    layers: [{ id: 'L1', name: 'C1', visible: true, keyframes: [{ index: 0, elements: [], tween: null }] }],
    width: 10, height: 10, frameRate: 24,
  };
  const inst = (id) => createInstance('symA', { id, x: 0, y: 0 });
  const rootData = {
    width: 100, height: 100, frameRate: 24, frameCount: 4, frameLabels: {}, assets: {},
    layers: [{ id: 'LR', name: 'C', visible: true, keyframes: [{ index: 0, elements: [inst('a'), inst('b')], tween: null }] }],
    symbols: { symA: symData },
  };
  const root = createMovieClip(rootData);
  root.draw({ save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, beginPath() {}, fill() {} }); // premier rendu : crée les 2 enfants
  check('2 instances = 2 exécutions du script de symbole', ctorCount.n === 2, ctorCount);
  const a = root._children.get('a'), b = root._children.get('b');
  check('états indépendants (a stoppé par le 1er ctor, b en lecture)', a.isPlaying === false && b.isPlaying === true);
}

// Symbole imbriqué : le script du petit-fils s'exécute aussi
{
  globalThis.ran = [];
  const ran = globalThis.ran;
  const inner = {
    id: 'symInner', type: 'movieclip', frameCount: 2, frameLabels: {},
    script: 'ran.push("inner");',
    layers: [{ id: 'LI', name: 'C', visible: true, keyframes: [{ index: 0, elements: [], tween: null }] }],
    width: 5, height: 5, frameRate: 24,
  };
  const outer = {
    id: 'symOuter', type: 'movieclip', frameCount: 2, frameLabels: {},
    script: 'ran.push("outer");',
    layers: [{
      id: 'LO', name: 'C', visible: true,
      keyframes: [{ index: 0, elements: [createInstance('symInner', { id: 'innerInst', x: 0, y: 0 })], tween: null }],
    }],
    width: 20, height: 20, frameRate: 24,
  };
  const rootData = {
    width: 100, height: 100, frameRate: 24, frameCount: 2, frameLabels: {}, assets: {},
    layers: [{
      id: 'LR', name: 'C', visible: true,
      keyframes: [{ index: 0, elements: [createInstance('symOuter', { id: 'outerInst', x: 0, y: 0 })], tween: null }],
    }],
    symbols: { symOuter: outer, symInner: inner },
  };
  const root = createMovieClip(rootData);
  root.update(1000 / 24);
  check('scripts de symbole imbriqués exécutés (outer puis inner)', ran.includes('outer') && ran.includes('inner'), ran);
}

// Données sans script (documents existants) : aucun effet
{
  const symData = {
    id: 'symNo', type: 'movieclip', frameCount: 2, frameLabels: {},
    layers: [{ id: 'L1', name: 'C', visible: true, keyframes: [{ index: 0, elements: [], tween: null }] }],
    width: 10, height: 10, frameRate: 24,
  };
  const rootData = {
    width: 50, height: 50, frameRate: 24, frameCount: 2, frameLabels: {}, assets: {},
    layers: [{ id: 'LR', name: 'C', visible: true, keyframes: [{ index: 0, elements: [createInstance('symNo', { id: 'x', x: 0, y: 0 })], tween: null }] }],
    symbols: { symNo: symData },
  };
  let threw = false;
  try {
    const root = createMovieClip(rootData);
    root.update(1000 / 24);
    root.draw({ save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, beginPath() {}, fill() {} });
  } catch (err) { threw = true; console.log('    err:', err && err.message); }
  check('symbole sans champ script : aucune erreur', threw === false);
}

// ---------------------------------------------------------------------------
console.log('--- 7. exports : sym.script embarqué (vérification source) ---');
// exportHTML.js et exportSymbol.js importent tweenRuntime via ?raw
// (spécifique Vite, non importable sous Node) : on vérifie le source, comme
// repro_camera.mjs le fait pour camera.
{
  const doc = createDocument({ name: 'Test' });
  const sym = createSymbol('Hero', 'movieclip');
  sym.script = 'Scene.stop();';
  doc.symbols[sym.id] = sym;
  const layer = doc.layers[0];
  layer.keyframes[0].elements.push(createInstance(sym.id, { x: 0, y: 0 }));
  check('document de test : sym.script persiste dans le modèle', doc.symbols[sym.id].script === 'Scene.stop();');

  const srcExportHTML = readFileSync(new URL('../src/export/exportHTML.js', import.meta.url), 'utf8');
  check('buildFullDocData embarque script du symbole', srcExportHTML.includes('script: sym.script || \'\''));
  check('buildFullDocData n\'embarque PAS scriptFile (meta interne)', !srcExportHTML.includes('scriptFile: sym'));

  const srcExportSymbol = readFileSync(new URL('../src/export/exportSymbol.js', import.meta.url), 'utf8');
  check('buildSymbolExportData embarque le script racine', srcExportSymbol.includes('script: root.script || \'\''));
  check('collectSymbolClosure embarque le script des symboles référencés', srcExportSymbol.includes('script: sym.script || \'\''));
}

// ---------------------------------------------------------------------------
console.log('--- 8. mode compilé : le stripper retire le bloc dynamique ---');
{
  const src = readFileSync(new URL('../src/export/tweenRuntime.js', import.meta.url), 'utf8');
  const stripped = src.replace(/\/\* TJS_NOEVAL_START[^*]*\*\/[\s\S]*?\/\* TJS_NOEVAL_END \*\//g, '');
  const hasNewBlock = src.includes('var fn = new Function(\'Scene\', \'Game\', \'console\', \'named\', \'createjs\', \'"use strict";\\n\' + this.data.script);');
  check('bloc dynamique du script de symbole présent dans la source', hasNewBlock);
  check('stripper exportCompiled retire ce bloc (mode compilé : ignoré)', !stripped.includes('this.data.script);'));
}

console.log('\n' + passed + ' OK, ' + failed + ' échec(s)');
process.exit(failed ? 1 : 0);
