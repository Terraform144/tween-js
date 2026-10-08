// Harnais pivot de transformation (registration point à la Animate CC).
// Valide :
//   1. les valeurs par défaut (aucun pivot explicite) — comportement
//      historique inchangé pour les documents existants ;
//   2. les offsets explicites par type (rect/ellipse/line/path/text/bitmap/
//      instance) + aller-retour coordonnées de boîte ;
//   3. la compensation x/y (rotation + échelle) : l'objet ne bouge pas ;
//   4. la PARITÉ DE RENDU éditeur (offsets Konva via core/pivot.js) vs
//      export (tweenRuntime.js drawShape/_renderInstance) avec un vrai
//      produit matriciel sur un contexte canvas factice ;
//   5. le hit-test éditeur de bout en bout (sceneRuntime + Scene.onClick)
//      sur un rect à pivot déporté + tourné, et sur une instance à pivot ;
//   6. l'interpolation du pivot (éditeur + tweenRuntime) ;
//   7. getSymbolContentBounds avec instance à pivot + round-trip JSON.
//   8. la rotation du Transformer autour du pivot (correctif rotPin dans
//      Stage.js) : Konva fait tourner autour du CENTRE de boîte
//      (rotateAroundCenter, source Transformer.js) et dérive le pivot ;
//      le pin x/y le maintient exactement en place.
// Run : node _wrk_mistral_mem/repro_pivot.mjs
import Konva from 'konva/lib/index.js';
import { resetIdCounter, createDocument, createShape, createInstance, createSymbol, getSymbolContentBounds } from '../src/core/model.js';
import { hasPivot, pivotNodeOffset, pivotBoxFromNode, defaultPivotBox, pivotMoveDelta, setElementPivot, setElementPivotField, resetElementPivot, pivotHitShift } from '../src/core/pivot.js';
import { interpolateElement } from '../src/playback/interpolate.js';
import { MovieClip } from '../src/export/tweenRuntime.js';
import { createSceneRuntime } from '../src/runtime/sceneRuntime.js';

globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.Image = class {
  constructor() { this.complete = true; this.naturalWidth = 10; this.naturalHeight = 10; }
  set src(v) { this._src = v; }
  get src() { return this._src; }
};

let passed = 0, failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log('  OK  ' + label); }
  else { failed++; console.log('FAIL  ' + label + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------- références
// Sémantique de référence : le point de boîte (ou de symbole) situé sur le
// pivot tombe exactement à (el.x, el.y). Le monde d'un point de boîte b est
// T(el.x,el.y)·R(rotation)·S(scale) appliqué à (b - pivotEffectif).
function pivotEffective(el, rH) {
  return hasPivot(el) ? { x: el.pivotX, y: el.pivotY } : defaultPivotBox(el, rH);
}
function boxOriginRef(el) {
  if (el.kind === 'instance') return { x: 0, y: 0 };
  if (el.shapeType === 'line' || el.shapeType === 'path') {
    const pts = el.points || [];
    if (!pts.length) return { x: 0, y: 0 };
    return { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) };
  }
  if (el.shapeType === 'ellipse') return { x: -(el.width || 0) / 2, y: -(el.height || 0) / 2 };
  return { x: 0, y: 0 };
}
// Monde d'un point de BOÎTE via la voie "éditeur" : offset Konva calculé par
// pivotNodeOffset (le code réel de Stage.js), transform standard Konva.
function editorWorldOfBox(el, box, rH = null) {
  const off = pivotNodeOffset(el, rH);
  const org = boxOriginRef(el);
  const local = { x: box.x + org.x - off.x, y: box.y + org.y - off.y };
  const r = (el.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const sx = el.scaleX == null ? 1 : el.scaleX, sy = el.scaleY == null ? 1 : el.scaleY;
  return {
    x: el.x + sx * local.x * cos - sy * local.y * sin,
    y: el.y + sx * local.x * sin + sy * local.y * cos,
  };
}

// Contexte canvas factice avec VRAI produit matriciel (convention DOMMatrix
// [a,b,c,d,e,f] : x' = a·x + c·y + e). Capture la matrice à chaque beginPath
// (drawShape) et drawImage (bitmap) : c'est la transform réellement
// appliquée au contenu par tweenRuntime.js.
function makeMockCtx() {
  const st = { m: [1, 0, 0, 1, 0, 0], stack: [], paths: [], drawImages: [], fillTexts: [], current: null };
  // Composition CANVAS : la nouvelle opération s'applique AVANT la courante
  // au point de vue des coordonnées (M' = M·A, convention colonne).
  const mul = (a, b, c, d, e, f) => {
    const m = st.m;
    st.m = [
      m[0] * a + m[2] * b, m[1] * a + m[3] * b,
      m[0] * c + m[2] * d, m[1] * c + m[3] * d,
      m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5],
    ];
  };
  const ctx = {
    save() { st.stack.push(st.m.slice()); },
    restore() { st.m = st.stack.pop(); },
    translate(x, y) { mul(1, 0, 0, 1, x, y); },
    rotate(t) { const c = Math.cos(t), s = Math.sin(t); mul(c, s, -s, c, 0, 0); },
    scale(x, y) { mul(x, 0, 0, y, 0, 0); },
    beginPath() { st.current = { m: st.m.slice(), kind: null }; st.paths.push(st.current); },
    rect(x, y, w, h) { if (st.current) Object.assign(st.current, { kind: 'rect', x, y, w, h }); },
    ellipse(x, y) { if (st.current) Object.assign(st.current, { kind: 'ellipse', cx: x, cy: y }); },
    moveTo() {}, lineTo() {}, bezierCurveTo() {}, closePath() {},
    fill() {}, stroke() {}, fillStrokeShape() {},
    drawImage(img, x, y, w, h) { st.drawImages.push({ m: st.m.slice(), x, y, w, h }); },
    fillText() { st.fillTexts.push({ m: st.m.slice(), args: [...arguments] }); },
    measureText(t) { return { width: String(t).length * 10 }; },
    font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
  };
  ctx.applyM = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
  ctx.st = st;
  return ctx;
}
// Point de boîte -> coordonnées de contenu du runtime exporté (drawShape
// dessine le rect/ellipse/texte/bitmap CENTRÉ, les points au coordonnées
// brutes, l'instance dans l'espace du symbole).
function exportContentOfBox(el, box) {
  if (el.kind === 'instance') return box; // espace du symbole
  if (el.shapeType === 'line' || el.shapeType === 'path') {
    const o = boxOriginRef(el);
    return { x: box.x + o.x, y: box.y + o.y };
  }
  return { x: box.x - (el.width || 0) / 2, y: box.y - (el.height || 0) / 2 };
}

function clipDataOf(doc, extra = {}) {
  return { frameRate: 24, frameCount: 2, layers: doc.layers, symbols: doc.symbols, assets: doc.assets || {}, ...extra };
}

console.log('--- 1. Défauts : aucun pivot explicite = comportement historique ---');
{
  const rect = createShape('rect', { x: 10, y: 20, width: 100, height: 50 });
  const ell = createShape('ellipse', { x: 0, y: 0, width: 60, height: 40 });
  const path = createShape('path', { x: 0, y: 0, points: [{ x: 5, y: 7 }, { x: 45, y: 27 }] });
  const inst = createInstance('sym1', { x: 0, y: 0 });
  check('hasPivot faux partout', !hasPivot(rect) && !hasPivot(ell) && !hasPivot(path) && !hasPivot(inst));
  const r = pivotNodeOffset(rect);
  check('rect : offset centre (50,25)', near(r.x, 50) && near(r.y, 25), r);
  const e = pivotNodeOffset(ell);
  check('ellipse : offset nul (déjà centrée)', e.x === 0 && e.y === 0, e);
  const p = pivotNodeOffset(path);
  check('path : offset nul (rotation autour du 1er point, historique)', p.x === 0 && p.y === 0, p);
  const i = pivotNodeOffset(inst);
  check('instance : offset nul (origine du symbole)', i.x === 0 && i.y === 0, i);
  const t = pivotNodeOffset(createShape('text', { width: 80, height: 30 }), 41.2);
  check('texte : offset (w/2, hauteur rendue/2)', near(t.x, 40) && near(t.y, 20.6), t);
  check('pivotHitShift nul sans pivot', pivotHitShift(rect).x === 0 && pivotHitShift(rect).y === 0);
  // Invariant historique : le point par défaut tombe sur (x, y)
  check('rect : le centre tombe sur (x,y)', (() => { const w = editorWorldOfBox(rect, defaultPivotBox(rect)); return near(w.x, 10) && near(w.y, 20); })());
  check('path : le 1er point tombe sur (x,y)', (() => { const w = editorWorldOfBox(path, defaultPivotBox(path)); return near(w.x, 0) && near(w.y, 0); })());
}

console.log('--- 2. Offsets explicites + aller-retour boîte ---');
{
  const rect = createShape('rect', { width: 100, height: 50, pivotX: 10, pivotY: 20 });
  const o1 = pivotNodeOffset(rect);
  check('rect pivot (10,20) -> offset (10,20)', o1.x === 10 && o1.y === 20, o1);
  const ell = createShape('ellipse', { width: 60, height: 40, pivotX: 10, pivotY: 20 });
  const o2 = pivotNodeOffset(ell);
  check('ellipse pivot (10,20) -> offset (-20,0)', o2.x === -20 && o2.y === 0, o2);
  const path = createShape('path', { points: [{ x: 5, y: 7 }, { x: 45, y: 27 }], pivotX: 10, pivotY: 10 });
  const o3 = pivotNodeOffset(path);
  check('path pivot (10,10) -> offset (15,17)', o3.x === 15 && o3.y === 17, o3);
  const inst = createInstance('sym1', { pivotX: 30, pivotY: 20 });
  const o4 = pivotNodeOffset(inst);
  check('instance pivot (30,20) -> offset (30,20)', o4.x === 30 && o4.y === 20, o4);
  const rt = pivotBoxFromNode(path, o3);
  check('pivotBoxFromNode aller-retour path', rt.x === 10 && rt.y === 10, rt);
  const rt2 = pivotBoxFromNode(ell, o2);
  check('pivotBoxFromNode aller-retour ellipse', rt2.x === 10 && rt2.y === 20, rt2);
  // Invariant : le pivot explicite tombe sur (x, y), quelle que soit la rotation
  const rot = createShape('rect', { x: 200, y: 100, width: 100, height: 50, rotation: 37, scaleX: 2, scaleY: 0.5, pivotX: 12, pivotY: 34 });
  const w = editorWorldOfBox(rot, { x: 12, y: 34 });
  check('pivot explicite -> (el.x, el.y) avec rotation 37° + échelle', near(w.x, 200) && near(w.y, 100), w);
}

console.log('--- 3. Compensation x/y (l\'objet ne bouge pas) ---');
{
  // Cas exact calculé à la main : rect 100x50, pivot centre -> (0,0),
  // rotation 90° : delta offset (-50,-25) => x += 25, y += -50.
  const el = createShape('rect', { x: 200, y: 100, width: 100, height: 50, rotation: 90 });
  setElementPivot(el, 0, 0);
  check('compensation exacte rot 90° : (225, 50)', near(el.x, 225) && near(el.y, 50), { x: el.x, y: el.y });
  // Invariance visuelle : les 4 coins de boîte restent au même endroit
  const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
  const before = corners.map((c) => editorWorldOfBox(el, c));
  const el2 = createShape('rect', { x: 200, y: 100, width: 100, height: 50, rotation: 37, scaleX: 2, scaleY: 0.5 });
  const before2 = corners.map((c) => editorWorldOfBox(el2, c));
  setElementPivot(el2, 80, 10);
  const after2 = corners.map((c) => editorWorldOfBox(el2, c));
  check('4 coins immobiles (rot 37°, échelle 2x0.5, pivot (80,10))',
    after2.every((p, i) => near(p.x, before2[i].x, 1e-9) && near(p.y, before2[i].y, 1e-9)), { before2, after2 });
  resetElementPivot(el2);
  const after3 = corners.map((c) => editorWorldOfBox(el2, c));
  check('resetElementPivot : 4 coins immobiles', after3.every((p, i) => near(p.x, before2[i].x, 1e-9) && near(p.y, before2[i].y, 1e-9)));
  check('reset supprime les champs pivot', el2.pivotX === undefined && el2.pivotY === undefined);
  // Champ unique (panneau de propriétés)
  const el3 = createShape('rect', { x: 50, y: 60, width: 40, height: 20 });
  const cornerBefore = editorWorldOfBox(el3, { x: 0, y: 0 });
  setElementPivotField(el3, 5, null);
  check('setElementPivotField X seul : Y prend le défaut', el3.pivotY === 10, el3);
  check('setElementPivotField : coin immobile', (() => { const p = editorWorldOfBox(el3, { x: 0, y: 0 }); return near(p.x, cornerBefore.x, 1e-9) && near(p.y, cornerBefore.y, 1e-9); })());
  // pivotMoveDelta : interface utilisée par le drag du réticule
  const d = pivotMoveDelta({ rotation: 0, scaleX: 1, scaleY: 1 }, { x: 0, y: 0 }, { x: 10, y: 5 });
  check('pivotMoveDelta identité', d.dx === 10 && d.dy === 5, d);
  void before;
}

console.log('--- 4. Parité de rendu éditeur vs export (tweenRuntime réel) ---');
function parityCase(label, el, rH = null, opts = {}) {
  const doc = createDocument({ name: 'Parité' });
  doc.layers[0].keyframes[0].elements = [el];
  if (opts.symbol) {
    doc.symbols[el.symbolId] = opts.symbol;
    el = JSON.parse(JSON.stringify(el));
  }
  const ctx = makeMockCtx();
  const clip = new MovieClip(clipDataOf(doc));
  clip.draw(ctx);
  const capture = ctx.st.paths[0] || ctx.st.drawImages[0] || ctx.st.fillTexts[0];
  if (!capture) { check(label + ' (aucun rendu capturé)', false); return; }
  const m = capture.m;
  const boxes = opts.boxes || [{ x: 0, y: 0 }, { x: el.width || 10, y: 0 }, { x: el.width || 10, y: el.height || 10 }, { x: 0, y: el.height || 10 }];
  let ok = true, detail = null;
  for (const b of boxes) {
    const worldExport = ctx.applyM(m, ...(opts.contentOf ? opts.contentOf(el, b) : (() => {
      const c = exportContentOfBox(el, b);
      return [c.x, c.y];
    })()));
    const worldEditor = editorWorldOfBox(el, b, rH);
    if (!near(worldExport.x, worldEditor.x, 1e-9) || !near(worldExport.y, worldEditor.y, 1e-9)) {
      ok = false; detail = { b, worldExport, worldEditor }; break;
    }
  }
  check(label, ok, detail);
}
{
  parityCase('rect pivot (0,0), rot 37°, échelle (2, 0.5)',
    createShape('rect', { x: 200, y: 100, width: 100, height: 50, rotation: 37, scaleX: 2, scaleY: 0.5, pivotX: 0, pivotY: 0 }));
  parityCase('ellipse pivot (10,20), rot 90°',
    createShape('ellipse', { x: 150, y: 80, width: 60, height: 40, rotation: 90, pivotX: 10, pivotY: 20 }));
  parityCase('path pivot (10,10), rot 37°',
    createShape('path', { x: 60, y: 40, rotation: 37, pivotX: 10, pivotY: 10, points: [{ x: 5, y: 7 }, { x: 45, y: 27 }] }),
    null, { boxes: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }] });
  parityCase('texte pivot (10,8) — 1 ligne rendue (transform au point fillText)',
    createShape('text', { x: 120, y: 90, width: 200, height: 28.8, rotation: 20, pivotX: 10, pivotY: 8, text: 'Salut', fontSize: 24 }),
    28.8, { boxes: [{ x: 100, y: 14.4 }] }); // (xPos=0 + w/2, y=0 + h/2) : le point passé à fillText
  // bitmap : même branche formelle que rect, validée via drawImage
  {
    const doc = createDocument({ name: 'Bmp' });
    const bmp = { kind: 'bitmap', id: 'b1', assetId: 'a1', x: 100, y: 70, width: 50, height: 30, rotation: 30, pivotX: 5, pivotY: 5, scaleX: 1, scaleY: 1, opacity: 1 };
    doc.assets = { a1: { id: 'a1', dataUrl: 'data:image/png;base64,x', width: 50, height: 30 } };
    doc.layers[0].keyframes[0].elements = [bmp];
    const ctx = makeMockCtx();
    new MovieClip(clipDataOf(doc)).draw(ctx);
    const cap = ctx.st.drawImages[0];
    const c = exportContentOfBox(bmp, { x: 0, y: 0 });
    const we = ctx.applyM(cap.m, c.x, c.y);
    const wed = editorWorldOfBox(bmp, { x: 0, y: 0 });
    check('bitmap pivot (5,5), rot 30°', near(we.x, wed.x, 1e-9) && near(we.y, wed.y, 1e-9), { we, wed });
  }
  // instance : imbriquée (graphic) avec pivot dans l'espace du symbole
  {
    const doc = createDocument({ name: 'Inst' });
    const sym = createSymbol('Bras', 'graphic');
    sym.layers[0].keyframes[0].elements = [createShape('rect', { x: 0, y: 0, width: 80, height: 40 })];
    doc.symbols[sym.id] = sym;
    const inst = createInstance(sym.id, { x: 200, y: 150, rotation: 90, pivotX: 0, pivotY: 0 });
    doc.layers[0].keyframes[0].elements = [inst];
    const ctx = makeMockCtx();
    new MovieClip(clipDataOf(doc)).draw(ctx);
    const cap = ctx.st.paths[0]; // rect enfant : contenu centré, child.x est DANS la matrice
    const child = sym.layers[0].keyframes[0].elements[0];
    const sEditorBox = { x: 0, y: 0 }; // coin haut-gauche de la boîte enfant
    // Export : coordonnée de contenu centrée du coin (sans child.x, déjà dans la matrice)
    const cCentered = { x: sEditorBox.x - child.width / 2, y: sEditorBox.y - child.height / 2 };
    const we = ctx.applyM(cap.m, cCentered.x, cCentered.y);
    // Éditeur : position du même coin dans l'espace du symbole, puis transform de l'instance
    const sSymbol = { x: child.x + cCentered.x, y: child.y + cCentered.y };
    const wed = editorWorldOfBox(inst, sSymbol);
    check('instance pivot (0,0), rot 90° — contenu enfant aligné', near(we.x, wed.x, 1e-9) && near(we.y, wed.y, 1e-9), { we, wed });
    // Pivot déporté (10,5) : le contenu doit glisser de (-10,-5) dans l'espace du symbole
    const inst2 = createInstance(sym.id, { x: 200, y: 150, rotation: 0, pivotX: 10, pivotY: 5 });
    doc.layers[0].keyframes[0].elements = [inst2];
    const ctx2 = makeMockCtx();
    new MovieClip(clipDataOf(doc)).draw(ctx2);
    const cap2 = ctx2.st.paths[0];
    const we2 = ctx2.applyM(cap2.m, cCentered.x, cCentered.y);
    const wed2 = editorWorldOfBox(inst2, sSymbol);
    check('instance pivot (10,5) — parité', near(we2.x, wed2.x, 1e-9) && near(we2.y, wed2.y, 1e-9), { we2, wed2 });
  }
}

console.log('--- 5. Hit-test éditeur (sceneRuntime + Scene.onClick, E2E) ---');
{
  resetIdCounter(1);
  const doc = createDocument({ name: 'Hit', width: 550, height: 400 });
  const layer = doc.layers[0];
  // Rect nommé, pivot en haut-gauche, tourné de 90° : le contenu occupe
  // x∈[150,200], y∈[100,200] (voir calcul pivotHitShift), échec attendu hors zone.
  const rect = Object.assign(createShape('rect', { x: 200, y: 100, width: 100, height: 50, rotation: 90, pivotX: 0, pivotY: 0 }), { name: 'ep' });
  layer.keyframes[0].elements.push(rect);
  const state = { doc, editPath: [], currentFrame: 0, playing: false, selectedLayerId: layer.id, listeners: [] };
  const listeners = {};
  const container = { addEventListener(t, f) { listeners[t] = f; }, removeEventListener(t) { delete listeners[t]; } };
  const runtime = createSceneRuntime({ state, stageContainer: container, toScenePoint: (x, y) => ({ x, y }) });
  globalThis.calls = [];
  runtime.run('Scene.onClick("ep", (x, y) => { calls.push(["ep", x, y]); });');
  const fire = (type, x, y) => listeners[type]({ clientX: x, clientY: y, target: { tagName: 'CANVAS' } });
  state.playing = true;
  fire('mousedown', 175, 150); fire('mouseup', 175, 150);
  check('clic au centre du rect pivoté -> touché', globalThis.calls.some((c) => c[0] === 'ep' && c[1] === 175 && c[2] === 150), globalThis.calls);
  globalThis.calls.length = 0;
  fire('mousedown', 210, 100); fire('mouseup', 210, 100);
  check('clic hors zone -> non touché', !globalThis.calls.some((c) => c[0] === 'ep'));
  globalThis.calls.length = 0;
  // Instance nommée avec pivot : le contenu du symbole est décalé de -pivot
  const sym = createSymbol('Pastille', 'movieclip');
  sym.layers[0].keyframes[0].elements.push(createShape('rect', { x: 0, y: 0, width: 40, height: 40 }));
  doc.symbols[sym.id] = sym;
  const inst = Object.assign(createInstance(sym.id, { x: 300, y: 200, pivotX: 20, pivotY: 20 }), { name: 'past' });
  layer.keyframes[0].elements.push(inst);
  runtime.run('Scene.onClick("past", (x, y) => { calls.push(["past", x, y]); });');
  // Sans pivot le contenu serait en [280,320]x[180,220] ; avec pivot (20,20)
  // il est décalé de (-20,-20) : [260,300]x[160,200].
  fire('mousedown', 280, 180); fire('mouseup', 280, 180);
  check('clic sur instance à pivot (zone décalée) -> touché', globalThis.calls.some((c) => c[0] === 'past'), globalThis.calls);
  globalThis.calls.length = 0;
  fire('mousedown', 310, 210); fire('mouseup', 310, 210);
  check('clic sur la zone NON décalée de l\'instance -> non touché', !globalThis.calls.some((c) => c[0] === 'past'));
}

console.log('--- 6. Interpolation du pivot (éditeur + tweenRuntime) ---');
{
  const a = createShape('rect', { x: 0, y: 0, width: 50, height: 50, pivotX: 25, pivotY: 25 });
  const b = createShape('rect', { x: 0, y: 0, width: 50, height: 50, pivotX: 0, pivotY: 0 });
  const mid = interpolateElement(a, b, 0.5);
  check('interpolateElement : pivot lerpé (12.5, 12.5)', near(mid.pivotX, 12.5) && near(mid.pivotY, 12.5), mid);
  const noPivotB = createShape('rect', { x: 0, y: 0, width: 50, height: 50 });
  const mid2 = interpolateElement(a, noPivotB, 0.5);
  check('pivot absent d\'un côté : conservé tel quel', mid2.pivotX === 25 && mid2.pivotY === 25, mid2);
  // tweenRuntime : resolveLayerAtFrame avec tween entre deux pivots
  const doc = createDocument({ name: 'Tween' });
  const layer = doc.layers[0];
  layer.keyframes[0].tween = { easing: 'linear' };
  layer.keyframes[0].elements = [createShape('rect', { id: 'same', x: 100, y: 100, width: 40, height: 40, pivotX: 20, pivotY: 20 })];
  layer.keyframes.push({ index: 1, tween: null, script: '', elements: [createShape('rect', { id: 'same', x: 100, y: 100, width: 40, height: 40, pivotX: 0, pivotY: 0 })] });
  const ctx = makeMockCtx();
  const clip = new MovieClip(clipDataOf(doc));
  clip.gotoAndStop(0); clip.draw(ctx);
  const m0 = ctx.st.paths[0].m.slice();
  ctx.st.paths.length = 0;
  clip.gotoAndStop(1); clip.draw(ctx);
  const m1 = ctx.st.paths[0].m.slice();
  // frame 0 : pivot centre -> translate identité ; frame 1 : pivot (0,0) -> +20,+20
  const p0 = { x: 0, y: 0 };
  const w0 = { x: m0[0] * p0.x + m0[2] * p0.y + m0[4], y: m0[1] * p0.x + m0[3] * p0.y + m0[5] };
  const w1 = { x: m1[0] * p0.x + m1[2] * p0.y + m1[4], y: m1[1] * p0.x + m1[3] * p0.y + m1[5] };
  check('tweenRuntime : pivot interpolé entre images (0 -> +20,+20)', near(w1.x - w0.x, 20) && near(w1.y - w0.y, 20), { w0, w1 });
}

console.log('--- 7. Bornes de symbole + sérialisation ---');
{
  resetIdCounter(1);
  const doc = createDocument({ name: 'Bounds' });
  const sym = createSymbol('S', 'graphic');
  sym.layers[0].keyframes[0].elements = [createShape('rect', { x: 0, y: 0, width: 20, height: 20 })];
  doc.symbols[sym.id] = sym;
  // sym2 contient une instance de sym avec un pivot : le contenu de
  // l'instance est décalé de -pivot dans l'espace de sym2.
  // bounds(sym) = {x:-10,y:-10,w:20,h:20} ; instance à (100,100), pivot
  // (10,10) -> acc(100-10-10, 100-10-10, 20, 20) = {x:80, y:80, w:20, h:20}
  const sym2 = createSymbol('S2', 'graphic');
  sym2.layers[0].keyframes[0].elements = [createInstance(sym.id, { x: 100, y: 100, pivotX: 10, pivotY: 10 })];
  doc.symbols[sym2.id] = sym2;
  const b = getSymbolContentBounds(doc, sym2.id);
  check('getSymbolContentBounds : instance à pivot décalée de -pivot',
    near(b.x, 80) && near(b.y, 80) && near(b.width, 20) && near(b.height, 20), b);
  // Sans pivot : bornes historiques intactes
  const sym3 = createSymbol('S3', 'graphic');
  sym3.layers[0].keyframes[0].elements = [createInstance(sym.id, { x: 100, y: 100 })];
  doc.symbols[sym3.id] = sym3;
  const b3 = getSymbolContentBounds(doc, sym3.id);
  check('getSymbolContentBounds : sans pivot, inchangé',
    near(b3.x, 90) && near(b3.y, 90) && near(b3.width, 20) && near(b3.height, 20), b3);
  const inst = sym2.layers[0].keyframes[0].elements[0];
  const back = JSON.parse(JSON.stringify(inst));
  check('round-trip JSON conserve le pivot', back.pivotX === 10 && back.pivotY === 10, back);
  check('pivotHitShift instance = (10,10)', pivotHitShift(inst).x === 10 && pivotHitShift(inst).y === 10);
}

// --------------------------------------------- 8. rotation Transformer + pivot
// Algorithme EXACT du Transformer Konva pour l'ancre de rotation : delta
// d'angle appliqué autour du CENTRE du getClientRect (rotateAroundCenter,
// node_modules/konva/lib/shapes/Transformer.js), puis compensation x/y du
// nœud. Le correctif Stage.js (rotPin) restaure x/y : l'offset du nœud
// (= pivot, dont x/y EST la position) reste alors fixe pendant la rotation.
{
  const mkNode = (el, rot) => {
    const off = pivotNodeOffset(el);
    const n = new Konva.Rect({ width: el.width, height: el.height, offsetX: off.x, offsetY: off.y });
    n.setAttrs({ x: el.x, y: el.y, rotation: rot, scaleX: el.scaleX == null ? 1 : el.scaleX, scaleY: el.scaleY == null ? 1 : el.scaleY });
    return n;
  };
  const pivotWorld = (n) => n.getAbsoluteTransform().point({ x: n.offsetX(), y: n.offsetY() });

  // Rect 100x50, pivot explicite au coin haut-gauche (0,0).
  const el = createShape('rect', { x: 200, y: 100, width: 100, height: 50, pivotX: 0, pivotY: 0 });

  // SANS correctif : le pivot dérive (le bug observé par l'utilisateur).
  const n1 = mkNode(el, 0);
  const r1 = n1.getClientRect();
  const C = { x: r1.x + r1.width / 2, y: r1.y + r1.height / 2 };
  const d = 90 * Math.PI / 180;
  n1.rotation(90);
  n1.x(C.x + (200 - C.x) * Math.cos(d) - (100 - C.y) * Math.sin(d));
  n1.y(C.y + (200 - C.x) * Math.sin(d) + (100 - C.y) * Math.cos(d));
  const p1 = pivotWorld(n1);
  check('sans correctif : le pivot dérive (Konva tourne autour du centre de boîte)',
    !near(p1.x, 200) || !near(p1.y, 100), p1);

  // AVEC correctif (pin x/y) : le pivot reste exactement en place.
  const n2 = mkNode(el, 0);
  n2.rotation(90);
  const p2 = pivotWorld(n2);
  check('avec correctif : rotation 90° autour du pivot, pivot fixe à (200,100)',
    near(p2.x, 200) && near(p2.y, 100), p2);
  const c2 = n2.getAbsoluteTransform().point({ x: 100, y: 50 });
  check('avec correctif : coin opposé projeté à (150,200)', near(c2.x, 150) && near(c2.y, 200), c2);

  // Généralisation : élément déjà tourné, pivot au milieu du bord gauche.
  const el3 = createShape('rect', { x: 300, y: 200, width: 80, height: 40, rotation: 20, pivotX: 0, pivotY: 20 });
  const n3 = mkNode(el3, 20);
  n3.rotation(20 + 37); // pin : x/y inchangés
  const p3 = pivotWorld(n3);
  check('généralisé : pivot (0,20) fixe sous rotation 20° -> 57°',
    near(p3.x, 300) && near(p3.y, 200), p3);
}

console.log(`\n${passed} OK, ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
