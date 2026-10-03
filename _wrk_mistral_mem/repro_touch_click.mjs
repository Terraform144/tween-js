// Harnais : pipeline TACTILE du runtime de scène (correctif "clic muet sur
// mobile dans l'éditeur"). Stage.js preventDefault() tout touchstart, la
// séquence souris émulée n'arrive donc jamais — sceneRuntime doit écouter
// touchstart/touchmove/touchend/touchcancel directement.
// Run : node _wrk_mistral_mem/repro_touch_click.mjs
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const { createDocument, createShape, resetIdCounter } = await import('../src/core/model.js');
const { createSceneRuntime } = await import('../src/runtime/sceneRuntime.js');

// --- Document de test : rect nommé "tst" (100,100 -> 150,150) ---
resetIdCounter(1);
const doc = createDocument({ name: 'Test tactile', width: 550, height: 400 });
const layer = doc.layers[0];
layer.keyframes[0].elements.push(
  Object.assign(createShape('rect', { x: 100, y: 100, width: 50, height: 50 }), { name: 'tst' })
);

const state = { doc, editPath: [], currentFrame: 0, playing: true, selectedLayerId: layer.id, listeners: [] };
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

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { passed++; console.log('  OK  ' + label); }
  else { failed++; console.log('FAIL  ' + label); }
}

const CANVAS = { tagName: 'CANVAS' };
// Événement tactile synthétique (cf. Touch : touches au début/mouvement,
// changedTouches à la fin ; preventDefault espionné)
function touchEvent(type, x, y) {
  const ev = {
    type, cancelable: true, defaultPrevented: false,
    target: CANVAS,
    touches: [{ clientX: x, clientY: y }],
    changedTouches: [{ clientX: x, clientY: y }],
    preventDefault() { this.defaultPrevented = true; },
  };
  return ev;
}
const fire = (type, x, y) => {
  const ev = touchEvent(type, x, y);
  containerListeners[type](ev);
  return ev;
};
const calls = [];
globalThis.calls = calls;
runtime.run(`
  tst.on("mousedown", function () { calls.push("tst.mousedown"); });
  tst.on("pressmove", function () { calls.push("tst.pressmove"); });
  tst.on("mouseup", function () { calls.push("tst.mouseup"); });
  tst.on("click", function () { calls.push("tst.click"); });
  tst.on("dblclick", function () { calls.push("tst.dblclick"); });
  Scene.onClick(function (x, y) { calls.push("Scene.onClick:" + x); });
  Scene.on("stageclick", function () { calls.push("stageclick"); });
`);

console.log('--- 1. Tap simple sur tst pendant la lecture ---');
fire('touchstart', 120, 120);
fire('touchend', 125, 125);
check('mousedown émis (touchstart)', calls.includes('tst.mousedown'));
check('click émis (down+up sur le même élément)', calls.includes('tst.click'));
check('mouseup émis', calls.includes('tst.mouseup'));
check('stageclick émis', calls.includes('stageclick'));
check('Scene.onClick(x) émis', calls.some((c) => c === 'Scene.onClick:125'));

console.log('--- 2. preventDefault sur le tactile en lecture ---');
const ev = fire('touchstart', 120, 120);
fire('touchend', 125, 125);
check('preventDefault appelé sur touchstart (coupe l\'émulation souris)', ev.defaultPrevented === true);

console.log('--- 3. pressmove pendant un glissé tactile ---');
calls.length = 0;
fire('touchstart', 110, 110);
fire('touchmove', 115, 115);
fire('touchend', 120, 120);
check('pressmove émis (touchmove)', calls.includes('tst.pressmove'));
check('click émis après le glissé', calls.includes('tst.click'));

console.log('--- 4. Tap hors de l\'élément : pas de click élément ---');
calls.length = 0;
fire('touchstart', 400, 300);
fire('touchend', 400, 300);
check('pas de tst.click (tap dans le vide)', !calls.includes('tst.click'));
check('stageclick émis quand même (tap dans le vide)', calls.includes('stageclick'));

console.log('--- 5. Down sur tst, up ailleurs : pas de click ---');
calls.length = 0;
fire('touchstart', 120, 120);
fire('touchend', 400, 300);
check('pas de tst.click (down/up sur éléments différents)', !calls.includes('tst.click'));

console.log('--- 6. Double-tap -> dblclick ---');
calls.length = 0;
fire('touchend', 0, 0); // réinitialise l'éventuel historique de tap
fire('touchstart', 120, 120); fire('touchend', 120, 120);
fire('touchstart', 121, 121); fire('touchend', 121, 121);
check('dblclick émis sur double-tap', calls.includes('tst.dblclick'));

console.log('--- 7. touchcancel annule la pression (pas de click résiduel) ---');
calls.length = 0;
fire('touchstart', 120, 120);
containerListeners['touchcancel']({ type: 'touchcancel' });
fire('touchend', 120, 120);
check('pas de click après touchcancel', !calls.includes('tst.click'));

console.log('--- 8. Hors lecture (playing=false) : rien, pas de preventDefault ---');
calls.length = 0;
state.playing = false;
const ev2 = fire('touchstart', 120, 120);
fire('touchend', 120, 120);
check('aucun événement émis hors lecture', calls.length === 0);
check('pas de preventDefault hors lecture (les outils gardent leur flux)', ev2.defaultPrevented === false);

console.log('--- 9. dispose() retire les écouteurs tactiles ---');
state.playing = true;
runtime.dispose();
const touchTypes = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
check('les 4 écouteurs tactiles retirés', touchTypes.every((t) => !(t in containerListeners)));
check('les écouteurs souris retirés aussi', !('mousedown' in containerListeners));

console.log(failed === 0 ? `\nTOUS LES CONTROLES OK (${passed})` : `\nECHECS : ${failed}`);
process.exit(failed === 0 ? 0 : 1);
