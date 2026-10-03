// Harnais headless : valide l'injection de CreateJS dans les scripts + le
// système d'événements EaselJS sur les éléments nommés + le hit-testing
// (rect, ellipse, instance) + Scene.onClick + le pipeline pointer complet.
// Run : node _wrk_mistral_mem/repro_createjs.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// --- Shim DOM minimal (sceneRuntime touche window.addEventListener) ---
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const { createDocument, createShape, createInstance, createSymbol, resetIdCounter } = await import('../src/core/model.js');
const { createSceneRuntime } = await import('../src/runtime/sceneRuntime.js');
const { notify } = await import('../src/state.js');

// --- Chargement des vraies libs CreateJS (easeljs + tweenjs) dans un contexte vm ---
function loadCreateJsInVm() {
  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    window: { performance: { now: () => Date.now() } },
    document: { createElement: () => ({ getContext: () => null }) },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ['easeljs.min.js', 'tweenjs.min.js']) {
    vm.runInContext(readFileSync('public/libs/createjs/' + f, 'utf8'), sandbox, { filename: f });
  }
  return sandbox.createjs;
}
globalThis.createjs = loadCreateJsInVm();

// --- Document de test ---
resetIdCounter(1);
const doc = createDocument({ name: 'Test createjs', width: 550, height: 400 });
const layer = doc.layers[0];
layer.keyframes[0].elements.push(
  Object.assign(createShape('rect', { x: 100, y: 100, width: 50, height: 50 }), { name: 'tst' }),
  Object.assign(createShape('ellipse', { x: 300, y: 100, width: 60, height: 40 }), { name: 'circ' })
);
const sym = createSymbol('Cliquable', 'movieclip');
const symId = sym.id;
doc.symbols[symId] = sym;
sym.layers[0].keyframes[0].elements.push(createShape('rect', { x: 0, y: 0, width: 80, height: 40 }));
layer.keyframes[0].elements.push(Object.assign(createInstance(symId, { x: 200, y: 300 }), { name: 'inst' }));

const state = { doc, editPath: [], currentFrame: 0, playing: false, selectedLayerId: layer.id, listeners: [] };
const containerListeners = {};
const container = {
  addEventListener(type, fn) { containerListeners[type] = fn; },
  removeEventListener(type) { delete containerListeners[type]; },
};
const runtime = createSceneRuntime({
  state,
  stageContainer: container,
  toScenePoint: (cx, cy) => ({ x: cx, y: cy }),
});

// --- Outillage ---
let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { passed++; console.log('  OK  ' + label); }
  else { failed++; console.log('FAIL  ' + label); }
}
const CANVAS = { tagName: 'CANVAS' };
const fire = (type, x, y) => containerListeners[type]({ clientX: x, clientY: y, target: CANVAS });
const calls = [];
globalThis.calls = calls; // les scripts compilés par new Function vivent en portée globale
const userCode = `
  createjs.Tween.get(tst).to({ x: 300 }, 1000);
  tst.on("click", function (ev) { calls.push(["tst.click", ev.stageX, ev.stageY, ev.target === tst]); });
  tst.on("mousedown", function () { calls.push(["tst.mousedown"]); });
  tst.on("pressmove", function (ev) { calls.push(["tst.pressmove", ev.stageX]); });
  tst.on("rollover", function () { calls.push(["tst.rollover"]); });
  tst.on("rollout", function () { calls.push(["tst.rollout"]); });
  circ.on("click", function () { calls.push(["circ.click"]); });
  inst.on("click", function () { calls.push(["inst.click"]); });
  Scene.onClick(function (x, y) { calls.push(["Scene.onClick", x, y]); });
  Scene.onClick("tst", function (x, y) { calls.push(["Scene.onClick.tst", x, y]); });
  Scene.on("stagemousedown", function (ev) { calls.push(["stagemousedown"]); });
  Scene.on("tick", function (ev) { calls.push(["Scene.tick", ev.currentFrame]); });
  Scene.log("createjs:", typeof createjs, "Tween:", typeof createjs.Tween);
`;

console.log('--- 1. run() avec createjs réel ---');
try {
  runtime.run(userCode);
  check('script exécuté sans erreur avec createjs', true);
} catch (err) { check('script exécuté sans erreur avec createjs — ' + err.message, false); }

console.log('--- 2. Tween CreateJS sur un élément nommé (avance manuelle) ---');
const tweenedBefore = doc.layers[0].keyframes[0].elements.find((el) => el.name === 'tst').x;
globalThis.createjs.Tween.get(doc.layers[0].keyframes[0].elements.find((el) => el.name === 'tst')).to({ x: 500 }, 1000).setPosition(500);
const tweenedAfter = doc.layers[0].keyframes[0].elements.find((el) => el.name === 'tst').x;
check('tween 50% avance x de ' + tweenedBefore + ' a ' + tweenedAfter + ' (attendu ~400 pour 100->500)', tweenedAfter > 100 && tweenedAfter < 500);
// restaure x pour les tests de hit
doc.layers[0].keyframes[0].elements.find((el) => el.name === 'tst').x = 100;

console.log('--- 3. Événements pointer pendant la lecture ---');
state.playing = true;
fire('mousedown', 110, 110);
fire('mousemove', 120, 112);
fire('mouseup', 120, 112);
check('séquence down/move/up sur tst : mousedown', calls.some((c) => c[0] === 'tst.mousedown'));
check('pressmove avec stageX', calls.some((c) => c[0] === 'tst.pressmove' && c[1] === 120));
check('click EaselJS (down+up sur tst) avec stageX/stageY/target', calls.some((c) => c[0] === 'tst.click' && c[1] === 120 && c[2] === 112 && c[3] === true));
check('Scene.onClick global appelé', calls.some((c) => c[0] === 'Scene.onClick'));
check('Scene.onClick("tst") appelé', calls.some((c) => c[0] === 'Scene.onClick.tst'));
check('stagemousedown scene-level', calls.some((c) => c[0] === 'stagemousedown'));

console.log('--- 4. Clic dans le vide / hors éléments ---');
calls.length = 0;
fire('mousedown', 20, 20);
fire('mouseup', 20, 20);
check('pas de click EaselJS dans le vide', !calls.some((c) => c[0] === 'tst.click'));
check('Scene.onClick global fired dans le vide', calls.some((c) => c[0] === 'Scene.onClick'));
check('Scene.onClick("tst") PAS fire dans le vide', !calls.some((c) => c[0] === 'Scene.onClick.tst'));

console.log('--- 5. Hit-tests : ellipse et instance (hull du symbole) ---');
calls.length = 0;
fire('mousedown', 300, 100); fire('mouseup', 300, 100);
check('clic au centre de l\'ellipse -> circ.click', calls.some((c) => c[0] === 'circ.click'));
calls.length = 0;
fire('mousedown', 300, 70); fire('mouseup', 300, 70); // hors de l'ellipse (60x40 -> y=100±20)
check('clic au-dessus de l\'ellipse -> rien', !calls.some((c) => c[0] === 'circ.click'));
calls.length = 0;
fire('mousedown', 200, 300); fire('mouseup', 200, 300);
check('clic sur l\'instance nommée -> inst.click (hit via hull du symbole)', calls.some((c) => c[0] === 'inst.click'));

console.log('--- 6. rollover/rollout ---');
calls.length = 0;
fire('mousemove', 30, 30); // retour au vide d'abord (reset du survol)
calls.length = 0;
fire('mousemove', 110, 110);
check('rollover en entrant sur tst', calls.some((c) => c[0] === 'tst.rollover'));
calls.length = 0;
fire('mousemove', 30, 30);
check('rollout en quittant tst', calls.some((c) => c[0] === 'tst.rollout'));

console.log('--- 7. tick scène ---');
calls.length = 0;
runtime.onFrame(5);
check('Scene.on("tick") recu avec currentFrame=5', calls.some((c) => c[0] === 'Scene.tick' && c[1] === 5));

console.log('--- 8. Hors lecture : silence ---');
calls.length = 0;
state.playing = false;
fire('mousedown', 110, 110);
fire('mousemove', 111, 111);
fire('mouseup', 111, 111);
check('aucun événement hors lecture', calls.length === 0);

console.log('--- 9. Re-run : pas d\'empilement de handlers ---');
state.playing = true;
runtime.run(userCode);
runtime.run(userCode);
calls.length = 0;
fire('mousedown', 110, 110); fire('mouseup', 110, 110);
const clickCount = calls.filter((c) => c[0] === 'tst.click').length;
check('2 re-runs -> handler appelé 1 fois (pas 3)', clickCount === 1);

console.log('--- 10. off()/removeEventListener ---');
runtime.run(`
  tst.on("click", h1);
  const w = tst.on("click", h2);
  tst.off("click", h1);
  tst.removeEventListener("click", w);
  tst.on("click", h3);
  function h1() { calls.push(["h1"]); }
  function h2() { calls.push(["h2"]); }
  function h3() { calls.push(["h3"]); }
`);
calls.length = 0;
fire('mousedown', 110, 110); fire('mouseup', 110, 110);
check('off() par cb puis par wrapper : seul h3 reste', calls.length === 1 && calls[0][0] === 'h3');

console.log('--- 11. Sérialisation intacte (méthodes non-énumérables) ---');
const saved = JSON.stringify(doc);
const reparsed = JSON.parse(saved);
check('document re-sérialisable sans trace des méthodes événements', reparsed.layers[0].keyframes[0].elements.every((el) => typeof el.on !== 'function'));

console.log('--- 12. Labels d\'image : gotoAndPlay/gotoAndStop ---');
doc.frameLabels[7] = 'Entry';
state.playing = false;
runtime.Scene.gotoAndStop('Entry');
check('gotoAndStop("Entry") -> currentFrame 7', state.currentFrame === 7 && state.playing === false);
runtime.Scene.gotoAndPlay('Entry');
check('gotoAndPlay("Entry") -> frame 7 en lecture', state.currentFrame === 7 && state.playing === true);
const frameBefore = state.currentFrame;
runtime.Scene.gotoAndStop('LabelInconnu');
check('label introuvable -> avertissement + aucun deplacement', state.currentFrame === frameBefore);
runtime.Scene.gotoAndStop(3);
check('gotoAndStop(3) numerique toujours OK', state.currentFrame === 3);

console.log('--- 13. Scripts d\'image vs handlers run (bug IIB_v3) ---');
doc.layers[0].keyframes.push({ index: 3, elements: [], tween: null, script: 'Scene.log("script d image execute"); circ.on("click", function () { calls.push(["frame-clic"]); });' });
state.currentFrame = 0;
state.playing = true;
runtime.run('tst.on("click", function () { calls.push(["survivant"]); });');
calls.length = 0;
runtime.runFrameScripts(3);
runtime.runFrameScripts(3);
check('handler run survit a 2 executions de script d image', true); // verdict par le clic ci-dessous
fire('mousedown', 110, 110);
runtime.runFrameScripts(3); // un script d image pendant la pression ne doit pas casser le clic
fire('mouseup', 110, 110);
check('clic complet malgre un script d image pendant la pression', calls.filter((c) => c[0] === 'survivant').length === 1);
fire('mousedown', 300, 100); fire('mouseup', 300, 100);
check('handler pose PAR un script d image purge entre passages (pas d\'empilement)', calls.filter((c) => c[0] === 'frame-clic').length === 1);

console.log('');
console.log(failed === 0 ? 'TOUS LES CONTROLES OK (' + passed + ')' : 'ECHECS : ' + failed + ' / ' + (passed + failed));
process.exit(failed === 0 ? 0 : 1);
