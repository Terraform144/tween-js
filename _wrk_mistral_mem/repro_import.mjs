// Harnais de reproduction : import d'images via les vrais modules src.
// Simule MenuBar (addAsset + notify + onImageImport) et main.js (addBitmapAsset),
// plus le getImage de Stage.js (cache cle par dataUrl). Detecte tout bitmap
// dont les pixels affiches ne sont pas ceux de l'image importee d'origine.


const mod = await import('../src/core/model.js');
const { createEditorState, notify } = await import('../src/state.js');
const { createHistory } = await import('../src/history.js');

const {
  addAsset, createBitmap, insertKeyframe, getContextLayers,
} = mod;

function makeState() {
  const doc = mod.createDocument({ name: 'Test' });
  const state = createEditorState(doc);
  const history = createHistory(state);
  return { state, history };
}

// Cache "scene" : cle dataUrl, comme Stage.js (fix v2)
const sceneCache = new Map();
function getImage(state, assetId) {
  const asset = (state.doc.assets || {})[assetId];
  if (!asset || !asset.dataUrl) return null;
  if (sceneCache.has(asset.dataUrl)) return sceneCache.get(asset.dataUrl);
  sceneCache.set(asset.dataUrl, 'IMG(' + asset.dataUrl.slice(0, 24) + ')'); // decode synchrone pour le test
  return sceneCache.get(asset.dataUrl);
}

// Reproduit addBitmapAsset de main.js
function addBitmapAsset(state, asset, pos) {
  const layers = getContextLayers(state.doc, state.editPath);
  const layer = layers.find((l) => l.id === state.selectedLayerId) || layers[layers.length - 1];
  if (!layer || layer.locked) return null;
  const kf = insertKeyframe(layer, state.currentFrame);
  const el = createBitmap(asset.id, { x: pos.x, y: pos.y, width: asset.width, height: asset.height });
  kf.elements.push(el);
  state.selectedElementIds = [el.id];
  notify(state);
  return el;
}

// Reproduit le handler d'import de MenuBar.js
function importImage(state, dataUrl, w, h) {
  const asset = addAsset(state.doc, { name: 'img', type: 'image/png', dataUrl, width: w, height: h });
  notify(state);
  return { asset, el: addBitmapAsset(state, asset, { x: 0, y: 0 }) };
}

// Verifie chaque bitmap de la scene : les pixels rendus doivent correspondre
// a l'asset pointe, et l'asset pointe ne doit jamais avoir change de contenu.
function audit(label, state, placed) {
  const layers = getContextLayers(state.doc, state.editPath);
  const problems = [];
  for (const layer of layers) for (const kf of layer.keyframes) {
    for (const el of kf.elements) {
      if (el.kind !== 'bitmap') continue;
      const asset = (state.doc.assets || {})[el.assetId];
      if (!asset) { problems.push(`bitmap ${el.id}: asset ${el.assetId} ABSENT`); continue; }
      const pixels = getImage(state, el.assetId);
      const orig = placed.find(p => p.el && p.el.id === el.id);
      if (orig && asset.dataUrl !== orig.asset.dataUrl) {
        problems.push(`bitmap ${el.id} (asset ${el.assetId}): contenu ASSET modifie ! attendu=${orig.asset.dataUrl} obtenu=${asset.dataUrl}`);
      }
      if (orig && pixels !== 'IMG(' + orig.asset.dataUrl.slice(0, 24) + ')') {
        problems.push(`bitmap ${el.id}: PIXELS faux. rendu=${pixels} attendu=IMG(${orig.asset.dataUrl.slice(0, 24)})`);
      }
    }
  }
  console.log(problems.length ? `ECHEC [${label}]` : `OK    [${label}]`);
  for (const p of problems) console.log('   -> ' + p);
  return problems.length === 0;
}

const results = [];
function scenario(name, fn) {
  const ctx = makeState();
  const placed = [];
  try { fn(ctx, placed); results.push([name, audit(name, ctx.state, placed)]); }
  catch (e) { console.log(`ERREUR [${name}]`, e.message); results.push([name, false]); }
}

const A = 'data:image/png;base64,AAAA_imageA', B = 'data:image/png;base64,BBBB_imageB';

scenario('2 imports directs', ({ state }, placed) => {
  placed.push(importImage(state, A, 100, 100));
  placed.push(importImage(state, B, 200, 50));
});

scenario('import A, undo, import B', ({ state, history }, placed) => {
  placed.push(importImage(state, A, 100, 100));
  history.undo();
  placed.push(importImage(state, B, 200, 50));
});

scenario('import A, undo, import B, redo', ({ state, history }, placed) => {
  placed.push(importImage(state, A, 100, 100));
  history.undo();
  placed.push(importImage(state, B, 200, 50));
  history.redo();
});

scenario('import A, import B, undo, redo', ({ state, history }, placed) => {
  placed.push(importImage(state, A, 100, 100));
  placed.push(importImage(state, B, 200, 50));
  history.undo();
  history.redo();
});

scenario('import A, undo, redo, import B', ({ state, history }, placed) => {
  placed.push(importImage(state, A, 100, 100));
  history.undo();
  history.redo();
  placed.push(importImage(state, B, 200, 50));
});

scenario('undo x2 puis redo x2', ({ state, history }, placed) => {
  placed.push(importImage(state, A, 100, 100));
  placed.push(importImage(state, B, 200, 50));
  history.undo(); history.undo(); history.redo(); history.redo();
});

console.log('\n' + (results.every(r => r[1]) ? 'TOUT OK' : 'ECHECS DETECTES'));
